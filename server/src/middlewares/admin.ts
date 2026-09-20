import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '@/container';

/**
 * 管理员门禁：跟在 userJwt 之后使用，按库内 role 判定（改角色即时生效，
 * 不写进 30 天 JWT）；非 admin 统一 403，不区分账号失效与无权限。
 * uid 由 userJwt 注入（不在 AppEnv Variables 里，类型上需显式合并）
 */
export const requireAdmin = createMiddleware<
  AppEnv & { Variables: { uid: number } }
>(async (c, next) => {
  const role = await c.var.di.get('userService').roleOf(c.var.uid);
  if (role !== 'admin') {
    throw new HTTPException(403, { message: '需要管理员权限' });
  }
  await next();
});
