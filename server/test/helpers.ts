/** E2E 公共封装：只走 HTTP，不碰数据库（造设备走 OTA 握手） */
import { randomUUID } from 'node:crypto';

/** E2E server 固定端口（global-setup 经 PORT env 注入，index.ts 读取） */
export const E2E_PORT = 3100;

export const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

/** 组装 JSON 请求的 RequestInit（默认 POST，init 可覆盖 method） */
export function json(body: unknown, init: RequestInit = {}): RequestInit {
  return {
    method: 'POST',
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
    body: JSON.stringify(body),
  };
}

/** 附加 Bearer 凭证 */
export function withToken(token: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${token}` },
  };
}

/** 调 E2E server 的接口（path 以 / 开头） */
export function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, init);
}

/** 注册一个随机账号并登录，返回凭证 */
export async function newUser(): Promise<{ token: string }> {
  const username = `e2e_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const password = 'p4ssw0rd-e2e';
  const reg = await api('/api/auth/register', json({ username, password }));
  if (reg.status !== 201) throw new Error(`register ${reg.status}`);
  return loginAs(username, password);
}

/** 管理员账号：首个注册用户即管理员，e2e_admin 已由 global-setup 注册占住顺位 */
export async function newAdmin(): Promise<{ token: string }> {
  const username = 'e2e_admin';
  const password = 'p4ssw0rd-e2e-admin';
  const reg = await api('/api/auth/register', json({ username, password }));
  // 同一轮 E2E 里可能已注册过：409 视作已存在，直接登录
  if (reg.status !== 201 && reg.status !== 409) {
    throw new Error(`register ${reg.status}`);
  }
  return loginAs(username, password);
}

async function loginAs(
  username: string,
  password: string,
): Promise<{ token: string }> {
  const login = await api('/api/auth/login', json({ username, password }));
  if (login.status !== 200) throw new Error(`login ${login.status}`);
  return { token: ((await login.json()) as { token: string }).token };
}
