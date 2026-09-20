/**
 * 设备域 API——「设备即助手」产品模型：一台设备就是一个有名字、有性格的伙伴。
 *
 * 端点契约（与 server/src/services/device.ts、routers/user.ts 对齐）：
 * - GET    /api/devices        设备视图列表（含在线状态）
 * - GET    /api/devices/:id    单个设备视图（见面页 loader 用）
 * - POST   /api/devices        激活码添加；400 码无效/过期、409 被他人抢先
 * - PATCH  /api/devices/:id    改伙伴名/性格
 * - DELETE /api/devices/:id    解绑（伙伴随之销毁）
 *
 * 预设角色见 api/persona.ts（server personas 表）
 */

import { HTTPError } from 'ky';
import { api } from './client';

export interface DeviceInfo {
  id: number;
  /** 伙伴名字（非唤醒词，唤醒词由设备内置固定） */
  name: string;
  /** 在线状态（ws 连接在册） */
  online: boolean;
  /** 性格描述：作为系统提示词喂给对话 */
  systemPrompt: string;
  /** 伙伴音色（音色清单见 api/voice.ts，server voices 表） */
  voice: string;
  /** 完整 MAC，仅展示用 */
  mac: string | null;
  /** 添加时间（ISO 8601） */
  createdAt: string | null;
}

export type AddResult =
  | { ok: true; device: DeviceInfo }
  | { ok: false; reason: 'invalid' | 'taken' };

export const deviceApi = {
  list: () => api.get('devices').json<DeviceInfo[]>(),

  /** 见面页 loader 用：404 视为设备不存在（如刷新后已解绑），返回 null */
  async get(id: number): Promise<DeviceInfo | null> {
    try {
      return await api.get(`devices/${id}`).json<DeviceInfo>();
    } catch (err) {
      if (err instanceof HTTPError && err.response.status === 404) {
        return null;
      }
      throw err;
    }
  },

  /** 激活码添加：400/409 映射为结果对象，其余错误原样上抛 */
  async add(code: string): Promise<AddResult> {
    try {
      const device = await api
        .post('devices', { json: { code } })
        .json<DeviceInfo>();
      return { ok: true, device };
    } catch (err) {
      if (err instanceof HTTPError) {
        const status = err.response.status;
        if (status === 409) return { ok: false, reason: 'taken' };
        if (status === 400) return { ok: false, reason: 'invalid' };
      }
      throw err;
    }
  },

  /** 改伙伴名/性格/音色；404（非本人/不存在）返回 false */
  async update(
    id: number,
    patch: { name?: string; systemPrompt?: string; voice?: string },
  ): Promise<boolean> {
    try {
      await api.patch(`devices/${id}`, { json: patch }).json();
      return true;
    } catch (err) {
      if (err instanceof HTTPError && err.response.status === 404) {
        return false;
      }
      throw err;
    }
  },

  /** 解绑：设备回到未激活态，可被重新添加；404 返回 false */
  async unbind(id: number): Promise<boolean> {
    try {
      await api.delete(`devices/${id}`).json();
      return true;
    } catch (err) {
      if (err instanceof HTTPError && err.response.status === 404) {
        return false;
      }
      throw err;
    }
  },
};
