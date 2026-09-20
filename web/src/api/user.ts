import { api } from './client';

export interface UserInfo {
  uid: number;
  username: string;
  role: 'user' | 'admin';
}

export const userApi = {
  me: () => api.get('user/me').json<UserInfo>(),
  /** 本人改密码；当前密码错误服务端回 400（不触发 401 登出） */
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.post('user/password', { json: body }).json<{ ok: true }>(),
};
