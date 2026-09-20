/** 认证域 HTTP E2E（迁移自手写探针 user-api.ts） */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { api, json, withToken } from './helpers';

const PASSWORD = 'p4ssw0rd-basic';

describe('auth', () => {
  it('注册 → 重复 409 → 错误密码 401 → 登录 → /me → 无凭证 401', async () => {
    const username = `e2e_${randomUUID().replaceAll('-', '').slice(0, 16)}`;

    const reg = await api(
      '/api/auth/register',
      json({ username, password: PASSWORD }),
    );
    expect(reg.status).toBe(201);

    const dup = await api(
      '/api/auth/register',
      json({ username, password: PASSWORD }),
    );
    expect(dup.status).toBe(409);

    const wrong = await api(
      '/api/auth/login',
      json({ username, password: 'wrong-password' }),
    );
    expect(wrong.status).toBe(401);

    const login = await api(
      '/api/auth/login',
      json({ username, password: PASSWORD }),
    );
    expect(login.status).toBe(200);
    const { token } = (await login.json()) as { token: string };
    expect(token.split('.')).toHaveLength(3); // JWS 三段

    const me = await api('/api/user/me', withToken(token));
    expect(me.status).toBe(200);
    expect(((await me.json()) as { uid: unknown }).uid).toEqual(
      expect.any(Number),
    );

    expect((await api('/api/user/me')).status).toBe(401);
  });

  it('同一账号连续登录失败触发 429（key 含用户名，与其它用例隔离）', async () => {
    const username = `e2e_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
    const reg = await api(
      '/api/auth/register',
      json({ username, password: PASSWORD }),
    );
    expect(reg.status).toBe(201);

    // 限流窗口 max=20：前 20 次仍按业务返回 401，第 21 次被拦
    for (let i = 0; i < 20; i++) {
      const res = await api(
        '/api/auth/login',
        json({ username, password: 'wrong-password' }),
      );
      expect(res.status).toBe(401);
    }
    const limited = await api(
      '/api/auth/login',
      json({ username, password: 'wrong-password' }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/);
  });

  it('非法用户名 / 过短密码 400', async () => {
    const badName = await api(
      '/api/auth/register',
      json({ username: 'x', password: PASSWORD }),
    );
    expect(badName.status).toBe(400);

    const short = await api(
      '/api/auth/register',
      json({
        username: `e2e_${randomUUID().slice(0, 8)}`,
        password: 'short',
      }),
    );
    expect(short.status).toBe(400);
  });

  it('改密码：无凭证 401、当前密码错误 400，成功后旧密码失效新密码可登录', async () => {
    const username = `e2e_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
    const NEXT = 'p4ssw0rd-next';
    const reg = await api(
      '/api/auth/register',
      json({ username, password: PASSWORD }),
    );
    expect(reg.status).toBe(201);

    const login = await api(
      '/api/auth/login',
      json({ username, password: PASSWORD }),
    );
    const { token } = (await login.json()) as { token: string };

    const anonymous = await api(
      '/api/user/password',
      json({ currentPassword: PASSWORD, newPassword: NEXT }),
    );
    expect(anonymous.status).toBe(401);

    const wrong = await api(
      '/api/user/password',
      json(
        { currentPassword: 'wrong-password', newPassword: NEXT },
        withToken(token),
      ),
    );
    expect(wrong.status).toBe(400);

    const ok = await api(
      '/api/user/password',
      json({ currentPassword: PASSWORD, newPassword: NEXT }, withToken(token)),
    );
    expect(ok.status).toBe(200);

    const oldLogin = await api(
      '/api/auth/login',
      json({ username, password: PASSWORD }),
    );
    expect(oldLogin.status).toBe(401);
    const newLogin = await api(
      '/api/auth/login',
      json({ username, password: NEXT }),
    );
    expect(newLogin.status).toBe(200);
  });
});
