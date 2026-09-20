/**
 * 管理后台 API——跨域统计与账号管理，服务端整体 requireAdmin 门禁。
 *
 * 端点契约（与 server/src/routers/admin.ts 对齐）：
 * - GET  /api/admin/stats          计数总览（在线设备随连接实时变化）
 * - GET  /api/admin/users          分页账号清单（page/pageSize/q 模糊搜 + order 注册时间排序）
 * - PATCH /api/admin/users/:id/role 改角色（不能改自己；改角色即时生效）
 */

import { api } from './client';

export interface AdminStats {
  users: number;
  devices: number;
  boundDevices: number;
  onlineDevices: number;
  personas: number;
  voices: number;
  messages: number;
}

export interface AdminUser {
  id: number;
  username: string;
  role: 'user' | 'admin';
  createdAt: string | null;
  deviceCount: number;
}

export interface AdminUserPage {
  items: AdminUser[];
  total: number;
}

export const adminApi = {
  stats: () => api.get('admin/stats').json<AdminStats>(),

  users: (params: {
    page: number;
    pageSize: number;
    q?: string;
    order: 'asc' | 'desc';
  }) =>
    api
      .get('admin/users', {
        searchParams: {
          page: params.page,
          pageSize: params.pageSize,
          order: params.order,
          ...(params.q ? { q: params.q } : {}),
        },
      })
      .json<AdminUserPage>(),

  setRole: (id: number, role: 'user' | 'admin') =>
    api
      .patch(`admin/users/${id}/role`, { json: { role } })
      .json<{ ok: true }>(),
};
