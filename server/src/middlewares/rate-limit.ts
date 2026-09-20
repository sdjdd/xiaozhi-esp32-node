import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { rateLimiter } from 'hono-rate-limiter';
import type { AppEnv } from '@/container';

/** 请求来源 IP（node-server 直连地址；前置可信代理时需另行解析 XFF） */
export function clientIp(c: Context<AppEnv>): string {
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** 登录限流 key：来源 + 用户名。body 预读由 Hono 缓存，zValidator 复用 */
async function loginKey(c: Context<AppEnv>): Promise<string> {
  const body = await c.req.json().catch(() => undefined);
  const username =
    typeof (body as { username?: unknown } | undefined)?.username === 'string'
      ? (body as { username: string }).username
      : '?';
  return `${clientIp(c)}:${username}`;
}

const TOO_MANY = '请求过于频繁，请稍后再试';

/**
 * 进程内限流：hono-rate-limiter 默认 MemoryStore，纯内存、无外部依赖，
 * 内存由内部 current/previous 双表 + unref 定时器回收。多实例部署时各进程
 * 独立计数，精确限流需换 Redis 等外置 store
 */

/** 登录：同来源+用户名 5 分钟内 20 次失败即拒（成功不计），防密码爆破 */
export const loginRateLimit = rateLimiter<AppEnv>({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  keyGenerator: loginKey,
  skipSuccessfulRequests: true,
  message: TOO_MANY,
});

/** 注册：同来源 1 小时内 100 次，防批量注册 */
export const registerRateLimit = rateLimiter<AppEnv>({
  windowMs: 60 * 60 * 1000,
  limit: 100,
  keyGenerator: (c) => clientIp(c),
  message: TOO_MANY,
});

/** 激活码绑定：同来源 1 分钟内 20 次，防 6 位码枚举 */
export const bindDeviceRateLimit = rateLimiter<AppEnv>({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: (c) => clientIp(c),
  message: TOO_MANY,
});
