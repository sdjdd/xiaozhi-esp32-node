import { api } from './client';

/** 内置预设角色（server personas 表；列出全员开放，增删改仅管理员） */
export interface PersonaPreset {
  id: number;
  name: string;
  systemPrompt: string;
}

export const personasApi = {
  list: () => api.get('personas').json<PersonaPreset[]>(),

  /** 管理端：sort 缺省排到末尾（服务端约定） */
  create: (body: { name: string; systemPrompt: string }) =>
    api.post('personas', { json: body }).json<PersonaPreset>(),

  update: (id: number, body: Partial<{ name: string; systemPrompt: string }>) =>
    api.patch(`personas/${id}`, { json: body }).json<{ ok: true }>(),

  remove: (id: number) => api.delete(`personas/${id}`).json<{ ok: true }>(),
};
