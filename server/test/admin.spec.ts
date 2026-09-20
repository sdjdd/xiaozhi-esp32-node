/** 管理后台域 HTTP E2E：整体 requireAdmin 门禁，改角色即时生效且不许自改 */
import { describe, expect, it } from 'vitest';
import { api, json, newAdmin, newUser, withToken } from './helpers';

interface AdminStats {
  users: number;
  devices: number;
  boundDevices: number;
  onlineDevices: number;
  personas: number;
  voices: number;
  messages: number;
}

interface AdminUser {
  id: number;
  username: string;
  role: 'user' | 'admin';
  deviceCount: number;
}

describe('admin', () => {
  it('无凭证 401，普通用户 403（stats 与 users 同门禁）', async () => {
    expect((await api('/api/admin/stats')).status).toBe(401);
    expect((await api('/api/admin/users')).status).toBe(401);

    const { token } = await newUser();
    expect((await api('/api/admin/stats', withToken(token))).status).toBe(403);
    expect((await api('/api/admin/users', withToken(token))).status).toBe(403);
  });

  it('stats 返回全部计数字段且数值非负', async () => {
    const { token } = await newAdmin();
    const res = await api('/api/admin/stats', withToken(token));
    expect(res.status).toBe(200);

    const stats = (await res.json()) as AdminStats;
    for (const n of Object.values(stats)) {
      expect(n).toBeTypeOf('number');
      expect(n).toBeGreaterThanOrEqual(0);
    }
    // globalSetup 预置角色与音色保证了下限
    expect(stats.personas).toBeGreaterThanOrEqual(6);
    expect(stats.voices).toBeGreaterThanOrEqual(3);
  });

  it('users 清单含管理员本人与普通用户', async () => {
    const { token } = await newAdmin();
    const { token: userToken } = await newUser();

    const res = await api(
      '/api/admin/users?page=1&pageSize=100',
      withToken(token),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: AdminUser[]; total: number };
    expect(body.total).toBeGreaterThanOrEqual(body.items.length);

    const admin = body.items.find((u) => u.username === 'e2e_admin');
    expect(admin?.role).toBe('admin');

    // 普通用户能用 /me 拿到自己的 uid，据此在清单里核对角色与设备数
    const me = (await (
      await api('/api/user/me', withToken(userToken))
    ).json()) as { uid: number; role: string };
    expect(me.role).toBe('user');
    const self = body.items.find((u) => u.id === me.uid);
    expect(self?.role).toBe('user');
    expect(self?.deviceCount).toBe(0);
  });

  it('users 分页切片、用户名搜索与注册时间排序', async () => {
    const { token } = await newAdmin();

    const all = await api(
      '/api/admin/users?page=1&pageSize=100',
      withToken(token),
    );
    const { total } = (await all.json()) as { total: number };
    expect(total).toBeGreaterThanOrEqual(1);

    // 每页一条：第 1、2 页各取到不同用户，total 与全量一致
    const p1 = (await (
      await api('/api/admin/users?page=1&pageSize=1', withToken(token))
    ).json()) as { items: AdminUser[]; total: number };
    expect(p1.items).toHaveLength(1);
    expect(p1.total).toBe(total);
    if (total > 1) {
      const p2 = (await (
        await api('/api/admin/users?page=2&pageSize=1', withToken(token))
      ).json()) as { items: AdminUser[] };
      expect(p2.items[0].id).not.toBe(p1.items[0].id);
    }

    // 搜索精确命中唯一管理员
    const search = await api('/api/admin/users?q=e2e_admin', withToken(token));
    const s = (await search.json()) as { items: AdminUser[]; total: number };
    expect(s.total).toBe(1);
    expect(s.items[0].username).toBe('e2e_admin');

    // 排序只认 id（注册顺位）：asc 首条是最早注册的 e2e_admin（globalSetup 占位），
    // 两个方向互为镜像——desc 尾条 = asc 首条、desc 首条 = asc 尾条
    const asc = (await (
      await api(
        '/api/admin/users?order=asc&page=1&pageSize=100',
        withToken(token),
      )
    ).json()) as { items: AdminUser[] };
    const desc = (await (
      await api(
        '/api/admin/users?order=desc&page=1&pageSize=100',
        withToken(token),
      )
    ).json()) as { items: AdminUser[] };
    expect(asc.items[0].username).toBe('e2e_admin');
    expect(desc.items[desc.items.length - 1].id).toBe(asc.items[0].id);
    expect(desc.items[0].id).toBe(asc.items[asc.items.length - 1].id);

    // 非法 order 参数 400
    expect(
      (await api('/api/admin/users?order=sideways', withToken(token))).status,
    ).toBe(400);
  });

  it('改角色：升 admin 即刻生效 /me 可见；目标不存在 404；改自己 400', async () => {
    const { token } = await newAdmin();
    const { token: userToken } = await newUser();
    const me = (await (
      await api('/api/user/me', withToken(userToken))
    ).json()) as { uid: number };

    const promote = await api(
      `/api/admin/users/${me.uid}/role`,
      json({ role: 'admin' }, { method: 'PATCH', ...withToken(token) }),
    );
    expect(promote.status).toBe(200);

    // 改角色即时生效，不依赖 JWT 重签：原 token 的 /me 立即是 admin
    const meAfter = (await (
      await api('/api/user/me', withToken(userToken))
    ).json()) as { role: string };
    expect(meAfter.role).toBe('admin');

    const adminMe = (await (
      await api('/api/user/me', withToken(token))
    ).json()) as { uid: number };
    const selfPatch = await api(
      `/api/admin/users/${adminMe.uid}/role`,
      json({ role: 'user' }, { method: 'PATCH', ...withToken(token) }),
    );
    expect(selfPatch.status).toBe(400);

    const missing = await api(
      '/api/admin/users/99999999/role',
      json({ role: 'user' }, { method: 'PATCH', ...withToken(token) }),
    );
    expect(missing.status).toBe(404);
  });

  it('普通用户无权改他人角色', async () => {
    const { token: userToken } = await newUser();
    const res = await api(
      '/api/admin/users/1/role',
      json({ role: 'user' }, { method: 'PATCH', ...withToken(userToken) }),
    );
    expect(res.status).toBe(403);
  });
});
