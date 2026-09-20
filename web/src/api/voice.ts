/**
 * 音色域 API——伙伴声音的候选项清单，管理员在服务端维护。
 *
 * 端点契约（与 server/src/routers/voices.ts 对齐）：
 * - GET /api/voices  音色视图列表（对全体登录用户开放）
 */

import { api } from './client';

/** 音色视图（server voices 表；voice 是火山音色代码） */
export interface VoiceInfo {
  id: number;
  name: string;
  voice: string;
  /** 试听音频 CDN 地址；null = 未配置 */
  previewUrl: string | null;
}

export const voicesApi = {
  list: () => api.get('voices').json<VoiceInfo[]>(),

  /** 管理端：previewUrl 缺省即未配置；sort 缺省排到末尾（服务端约定） */
  create: (body: { name: string; voice: string; previewUrl?: string | null }) =>
    api.post('voices', { json: body }).json<VoiceInfo>(),

  update: (
    id: number,
    body: Partial<{ name: string; voice: string; previewUrl: string | null }>,
  ) => api.patch(`voices/${id}`, { json: body }).json<{ ok: true }>(),

  remove: (id: number) => api.delete(`voices/${id}`).json<{ ok: true }>(),
};
