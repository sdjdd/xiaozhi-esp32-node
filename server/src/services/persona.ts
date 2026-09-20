import { asc, eq, max } from 'drizzle-orm';
import { db, personas } from '@/database';
import { isDupEntry } from '@/utils/mysql';

/** 内置预设角色（seed 脚本与 E2E 共用的单一事实源） */
export const PRESET_PERSONAS = [
  {
    name: '通用助手',
    system_prompt: '友善自然的语音伙伴，说话简洁口语、不啰嗦。',
    sort: 1,
  },
  {
    name: '生活管家',
    system_prompt: '温柔可靠的生活管家，说话简短，偶尔关心用户的作息。',
    sort: 2,
  },
  {
    name: '英语老师',
    system_prompt: '温柔耐心的英语老师，喜欢用生活里的比喻来讲解。',
    sort: 3,
  },
  {
    name: '睡前故事',
    system_prompt: '擅长讲睡前故事的故事大王，声音温柔，故事简短温馨。',
    sort: 4,
  },
  {
    name: '健身教练',
    system_prompt: '元气满满的健身教练，爱鼓励人，督促用户坚持运动和作息。',
    sort: 5,
  },
  {
    name: '毒舌损友',
    system_prompt: '嘴上不饶人但心软的损友，爱吐槽调侃，玩笑有分寸不伤人。',
    sort: 6,
  },
] as const;

/** 预设角色视图 */
export interface PersonaPreset {
  id: number;
  name: string;
  systemPrompt: string;
}

export class PersonaNameTakenError extends Error {
  constructor(name: string) {
    super(`persona name taken: ${name}`);
  }
}

/** 内置预设角色服务：列表对所有登录用户开放，增删改仅管理员（admin 端点） */
export class PersonaService {
  async list(): Promise<PersonaPreset[]> {
    return db
      .select({
        id: personas.id,
        name: personas.name,
        systemPrompt: personas.system_prompt,
      })
      .from(personas)
      .orderBy(asc(personas.sort), asc(personas.id));
  }

  /**
   * 创建预设：sort 缺省排到末尾（当前最大值 + 1）。
   * 名称即唯一事实源，撞名抛 PersonaNameTakenError
   */
  async create(input: {
    name: string;
    systemPrompt: string;
    sort?: number;
  }): Promise<PersonaPreset> {
    const sort = input.sort ?? (await this.nextSort());
    try {
      const inserted = await db.insert(personas).values({
        name: input.name,
        system_prompt: input.systemPrompt,
        sort,
      });
      return {
        id: inserted[0].insertId,
        name: input.name,
        systemPrompt: input.systemPrompt,
      };
    } catch (err) {
      if (isDupEntry(err)) {
        throw new PersonaNameTakenError(input.name);
      }
      throw err;
    }
  }

  /** 改名/性格/排序：至少一项（路由层校验）；改名撞名抛 PersonaNameTakenError */
  async update(
    id: number,
    patch: { name?: string; systemPrompt?: string; sort?: number },
  ): Promise<boolean> {
    const set = {
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.systemPrompt !== undefined && {
        system_prompt: patch.systemPrompt,
      }),
      ...(patch.sort !== undefined && { sort: patch.sort }),
    };
    try {
      const result = await db
        .update(personas)
        .set(set)
        .where(eq(personas.id, id));
      return result[0].affectedRows > 0;
    } catch (err) {
      if (isDupEntry(err) && patch.name !== undefined) {
        throw new PersonaNameTakenError(patch.name);
      }
      throw err;
    }
  }

  /** 删除预设；已认领设备的伙伴存的是 system_prompt 快照，不受影响 */
  async remove(id: number): Promise<boolean> {
    const result = await db.delete(personas).where(eq(personas.id, id));
    return result[0].affectedRows > 0;
  }

  /** 末尾排序值：空表返回 0，首个预设 sort=1 */
  private async nextSort(): Promise<number> {
    const [row] = await db.select({ max: max(personas.sort) }).from(personas);
    return (row?.max ?? 0) + 1;
  }
}
