import { randomInt } from 'node:crypto';
import { Cron } from 'croner';
import { and, asc, eq, gt, isNull, lt } from 'drizzle-orm';
import { db, agents, devices, voices } from '@/database';
import { logger } from '@/utils/logger';
import { isDupEntry } from '@/utils/mysql';

/** 激活码有效期：设备屏幕展示后用户需时间打开控制台输入 */
const ACTIVATION_CODE_TTL_MS = 10 * 60 * 1000;

/** 生成唯一码的重试上限（唯一约束撞码时重试） */
const ACTIVATION_CODE_RETRIES = 5;

/** 每 5 分钟一轮：激活码 TTL 10 分钟，过期残留窗口 ≤15 分钟 */
const SWEEP_PATTERN = '*/5 * * * *';

/** 伙伴默认名与默认性格：添加设备时自动创建，与 web 端 api/device.ts 保持一致 */
const COMPANION_DEFAULT_NAME = '新伙伴';
const COMPANION_DEFAULT_PROMPT = '友善自然的语音伙伴，说话简洁口语、不啰嗦。';

export interface DeviceRow {
  id: number;
  /** 归属用户（users.id），null = 未激活未绑定 */
  userId: number | null;
}

/** 用户侧设备视图（「设备即助手」：名字、性格与音色来自 1:1 伙伴） */
export interface DeviceView {
  id: number;
  /** client-id 供路由判断在线状态，不出网 */
  clientId: string;
  /** 伙伴名字（非唤醒词，唤醒词由固件内置） */
  name: string;
  /** 性格描述（伙伴 system_prompt） */
  systemPrompt: string;
  /** 伙伴音色（voices.voice 代码快照） */
  voice: string;
  /** 完整 MAC，仅展示用；客户端自行截尾号 */
  mac: string | null;
  /** 认领时间（ISO 8601）；即 devices.created_at（首次 OTA 握手入库） */
  createdAt: string | null;
}

/** 组装视图的行来源：伙伴字段来自 innerJoin，认领即建伙伴、必在 */
interface DeviceViewSource {
  id: number;
  client_id: string;
  device_id: string | null;
  created_at: Date | null;
  name: string;
  system_prompt: string;
  voice: string;
}

function toView(row: DeviceViewSource): DeviceView {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    systemPrompt: row.system_prompt,
    voice: row.voice,
    mac: row.device_id,
    createdAt: row.created_at?.toISOString() ?? null,
  };
}

export type BindResult =
  | { ok: true; device: DeviceView }
  | { ok: false; reason: 'invalid' | 'taken' };

/**
 * 设备台账服务：client-id ↔ 内部身份 devices.id 的登记与解析、
 * 激活码生命周期与用户绑定
 */
export class DeviceService {
  private sweepJob?: Cron;

  startSweepExpiredCodesJob() {
    this.sweepJob ??= new Cron(SWEEP_PATTERN, () => {
      void this.sweepExpiredCodes().catch((err) => {
        logger.warn({ err }, 'activation code sweep failed');
      });
    });
  }

  /** 清理过期激活码，返回清空的行数（NULL expires_at 行不参与 lt 比较） */
  async sweepExpiredCodes(): Promise<number> {
    const result = await db
      .update(devices)
      .set({ activation_code: null, activation_expires_at: null })
      .where(lt(devices.activation_expires_at, new Date()));
    const cleared = result[0].affectedRows;
    if (cleared > 0) {
      logger.debug({ cleared }, 'expired activation codes swept');
    }
    return cleared;
  }

  [Symbol.dispose]() {
    this.sweepJob?.stop();
    delete this.sweepJob;
  }

  /**
   * 按 client-id 登记设备（存在则复用），返回内部身份。
   *
   * client-id 是 xiaozhi 固件自带的 UUID v4（存 NVS，重启不变）：
   * 随机不可枚举、不出现在空口广播里，是当前固件约束下最强身份锚点；
   * MAC 可伪造且空口可见，仅作关联展示字段随登记刷新
   */
  async ensureDevice(clientId: string, deviceId: string): Promise<DeviceRow> {
    await db
      .insert(devices)
      .values({ client_id: clientId, device_id: deviceId })
      .onDuplicateKeyUpdate({
        // MAC 展示字段随登记刷新
        set: { device_id: deviceId },
      });

    const [row] = await db
      .select({ id: devices.id, user_id: devices.user_id })
      .from(devices)
      .where(eq(devices.client_id, clientId))
      .limit(1);

    if (!row) {
      throw new Error(`device row missing after upsert: ${clientId}`);
    }
    return { id: row.id, userId: row.user_id };
  }

  /**
   * 取设备当前有效激活码；无码或已过期则生成新的（同一设备跨轮询保持稳定，
   * 直到绑定或过期）。活跃期间全局唯一，撞码（他设备占用同一随机码）重试
   */
  async ensureActivationCode(did: number): Promise<string> {
    const [row] = await db
      .select({
        code: devices.activation_code,
        expires_at: devices.activation_expires_at,
      })
      .from(devices)
      .where(eq(devices.id, did))
      .limit(1);

    if (row?.code && row.expires_at && row.expires_at > new Date()) {
      return row.code;
    }

    for (let i = 0; i < ACTIVATION_CODE_RETRIES; i++) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      try {
        await db
          .update(devices)
          .set({
            activation_code: code,
            activation_expires_at: new Date(
              Date.now() + ACTIVATION_CODE_TTL_MS,
            ),
          })
          .where(eq(devices.id, did));
        return code;
      } catch (err) {
        if (!isDupEntry(err)) {
          throw err;
        }
        // 该随机码被其他活跃设备占用，换一个再试
      }
    }
    throw new Error(`failed to allocate activation code for device ${did}`);
  }

  /**
   * 用户凭激活码添加设备。条件更新原子完成占坑：
   * 码无效/过期 → invalid；已被其他用户抢先绑定 → taken。
   * 绑定成功即删除临时激活码，并在同一事务里创建设备的 1:1 伙伴
   * （默认名 + 默认性格 + 音色清单首条）——设备即助手，认领后马上能聊
   */
  async bindByCode(uid: number, code: string): Promise<BindResult> {
    const [row] = await db
      .select({ id: devices.id })
      .from(devices)
      .where(
        and(
          eq(devices.activation_code, code),
          gt(devices.activation_expires_at, new Date()),
          isNull(devices.user_id),
        ),
      )
      .limit(1);

    if (!row) {
      // 无未绑定设备持此有效码：区分已被绑定与码无效/过期
      const [any] = await db
        .select({ id: devices.id })
        .from(devices)
        .where(
          and(
            eq(devices.activation_code, code),
            gt(devices.activation_expires_at, new Date()),
          ),
        )
        .limit(1);
      return { ok: false, reason: any ? 'taken' : 'invalid' };
    }

    const bound = await db.transaction(async (tx) => {
      // 条件更新保证并发下只有一次绑定生效
      const result = await tx
        .update(devices)
        .set({
          user_id: uid,
          activation_code: null,
          activation_expires_at: null,
        })
        .where(and(eq(devices.id, row.id), isNull(devices.user_id)));
      if (result[0].affectedRows === 0) {
        return false;
      }

      const inserted = await tx.insert(agents).values({
        user_id: uid,
        name: COMPANION_DEFAULT_NAME,
        system_prompt: COMPANION_DEFAULT_PROMPT,
        voice: await this.firstVoiceCode(),
      });
      await tx
        .update(devices)
        .set({ agent_id: inserted[0].insertId })
        .where(eq(devices.id, row.id));
      return true;
    });

    if (!bound) {
      return { ok: false, reason: 'taken' };
    }
    const device = await this.getByUser(uid, row.id);
    if (!device) {
      // 事务已提交，视图缺失只可能是数据异常，fail-fast
      throw new Error(`device view missing after bind: ${row.id}`);
    }
    return { ok: true, device };
  }

  /** 默认伙伴音色：音色清单 sort 首条；清单为空属数据异常，fail-fast */
  private async firstVoiceCode(): Promise<string> {
    const [row] = await db
      .select({ voice: voices.voice })
      .from(voices)
      .orderBy(asc(voices.sort), asc(voices.id))
      .limit(1);
    if (!row) {
      throw new Error('voices 表为空，无法创建伙伴（需先维护音色清单）');
    }
    return row.voice;
  }

  /**
   * 解绑：设备回到未激活态，下次 OTA 握手重新进入激活流程。
   * 绑定时激活码已清空，此处无需处理残留；伙伴 1:1 随设备生灭，解绑即销毁
   */
  async unbindByUser(uid: number, did: number): Promise<boolean> {
    const [device] = await db
      .select({ agent_id: devices.agent_id })
      .from(devices)
      .where(and(eq(devices.id, did), eq(devices.user_id, uid)))
      .limit(1);
    if (!device) {
      return false;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(devices)
        .set({ user_id: null, agent_id: null })
        .where(and(eq(devices.id, did), eq(devices.user_id, uid)));
      if (device.agent_id !== null) {
        // user_id 条件兜底归属，防止异常数据误删他人伙伴
        await tx
          .delete(agents)
          .where(and(eq(agents.id, device.agent_id), eq(agents.user_id, uid)));
      }
    });
    return true;
  }

  /** 改伙伴名/性格/音色：见面页与设备页编辑共用，至少一项生效 */
  async updateCompanionByUser(
    uid: number,
    did: number,
    patch: { name?: string; systemPrompt?: string; voice?: string },
  ): Promise<boolean> {
    const [device] = await db
      .select({ agent_id: devices.agent_id })
      .from(devices)
      .where(and(eq(devices.id, did), eq(devices.user_id, uid)))
      .limit(1);
    if (!device?.agent_id) {
      // 认领即建伙伴，无伙伴属数据异常，不编辑
      return false;
    }

    await db
      .update(agents)
      .set({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.systemPrompt !== undefined && {
          system_prompt: patch.systemPrompt,
        }),
        ...(patch.voice !== undefined && { voice: patch.voice }),
      })
      .where(and(eq(agents.id, device.agent_id), eq(agents.user_id, uid)));
    return true;
  }

  /** 列出用户名下全部设备（含伙伴名字/性格/音色；在线状态由路由按 presence 补齐） */
  async listByUser(uid: number): Promise<DeviceView[]> {
    const rows = await db
      .select({
        id: devices.id,
        client_id: devices.client_id,
        device_id: devices.device_id,
        created_at: devices.created_at,
        name: agents.name,
        system_prompt: agents.system_prompt,
        voice: agents.voice,
      })
      .from(devices)
      .innerJoin(agents, eq(devices.agent_id, agents.id))
      .where(eq(devices.user_id, uid));
    return rows.map(toView);
  }

  /** 单个设备视图（归属校验），不存在/非本人返回 null */
  async getByUser(uid: number, did: number): Promise<DeviceView | null> {
    const [row] = await db
      .select({
        id: devices.id,
        client_id: devices.client_id,
        device_id: devices.device_id,
        created_at: devices.created_at,
        name: agents.name,
        system_prompt: agents.system_prompt,
        voice: agents.voice,
      })
      .from(devices)
      .innerJoin(agents, eq(devices.agent_id, agents.id))
      .where(and(eq(devices.id, did), eq(devices.user_id, uid)))
      .limit(1);
    return row ? toView(row) : null;
  }
}
