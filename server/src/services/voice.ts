import { asc, eq, max } from 'drizzle-orm';
import { db, voices } from '@/database';
import { isDupEntry } from '@/utils/mysql';

/** 预置音色（globalSetup 种子与 E2E 共用的单一事实源）；
 * 音色代码以火山控制台为准，管理员可通过管理端点增删改；
 * 清单 sort 首条即设备认领时的默认伙伴音色 */
export const VOICE_PRESETS = [
  {
    name: '小何',
    voice: 'zh_female_xiaohe_uranus_bigtts',
    previewUrl: 'https://cdn.example.com/voices/xiaohe.mp3',
    sort: 1,
  },
  {
    name: '灿灿',
    voice: 'zh_female_cancan_mars_bigtts',
    previewUrl: 'https://cdn.example.com/voices/cancan.mp3',
    sort: 2,
  },
  {
    name: '淳厚',
    voice: 'zh_male_chunhou_mars_bigtts',
    previewUrl: 'https://cdn.example.com/voices/chunhou.mp3',
    sort: 3,
  },
] as const;

/** 音色视图（用户侧） */
export interface VoiceView {
  id: number;
  name: string;
  voice: string;
  /** 试听音频 CDN 地址；null = 未配置 */
  previewUrl: string | null;
}

export class VoiceNameTakenError extends Error {
  constructor(name: string) {
    super(`voice name taken: ${name}`);
  }
}

export class VoiceCodeTakenError extends Error {
  constructor(voice: string) {
    super(`voice code taken: ${voice}`);
  }
}

/** 音色清单：列表对所有登录用户开放（改伙伴声音的选项），增删改仅管理员 */
export class VoiceService {
  async list(): Promise<VoiceView[]> {
    return db
      .select({
        id: voices.id,
        name: voices.name,
        voice: voices.voice,
        previewUrl: voices.preview_url,
      })
      .from(voices)
      .orderBy(asc(voices.sort), asc(voices.id));
  }

  /** 音色代码是否在清单里（改伙伴声音时校验） */
  async exists(voice: string): Promise<boolean> {
    const [row] = await db
      .select({ id: voices.id })
      .from(voices)
      .where(eq(voices.voice, voice))
      .limit(1);
    return !!row;
  }

  /** 创建音色：sort 缺省排到末尾；撞名/撞代码分别抛对应错误 */
  async create(input: {
    name: string;
    voice: string;
    previewUrl?: string | null;
    sort?: number;
  }): Promise<VoiceView> {
    const sort = input.sort ?? (await this.nextSort());
    const previewUrl = input.previewUrl ?? null;
    try {
      const inserted = await db.insert(voices).values({
        name: input.name,
        voice: input.voice,
        preview_url: previewUrl,
        sort,
      });
      return {
        id: inserted[0].insertId,
        name: input.name,
        voice: input.voice,
        previewUrl,
      };
    } catch (err) {
      if (isDupEntry(err)) {
        throw await this.dupKind(err, input.name, input.voice);
      }
      throw err;
    }
  }

  /** 改展示名/代码/试听地址/排序；试听地址传 null 即清除；撞名/撞代码抛对应错误 */
  async update(
    id: number,
    patch: {
      name?: string;
      voice?: string;
      previewUrl?: string | null;
      sort?: number;
    },
  ): Promise<boolean> {
    const set = {
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.voice !== undefined && { voice: patch.voice }),
      ...(patch.previewUrl !== undefined && { preview_url: patch.previewUrl }),
      ...(patch.sort !== undefined && { sort: patch.sort }),
    };
    try {
      const result = await db.update(voices).set(set).where(eq(voices.id, id));
      return result[0].affectedRows > 0;
    } catch (err) {
      if (isDupEntry(err)) {
        throw await this.dupKind(err, patch.name, patch.voice);
      }
      throw err;
    }
  }

  /** 删除音色：存量伙伴存的是代码快照，不受影响 */
  async remove(id: number): Promise<boolean> {
    const result = await db.delete(voices).where(eq(voices.id, id));
    return result[0].affectedRows > 0;
  }

  /** unique 冲突定位：回查冲突来源（代码是主事实源，优先判代码） */
  private async dupKind(
    _err: unknown,
    name?: string,
    voice?: string,
  ): Promise<VoiceNameTakenError | VoiceCodeTakenError> {
    if (voice && (await this.exists(voice))) {
      return new VoiceCodeTakenError(voice);
    }
    return new VoiceNameTakenError(name ?? '');
  }

  /** 末尾排序值：空表返回 0，首个音色 sort=1 */
  private async nextSort(): Promise<number> {
    const [row] = await db.select({ max: max(voices.sort) }).from(voices);
    return (row?.max ?? 0) + 1;
  }
}
