import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { logger } from '@/utils/logger';
import { verifyUserToken } from '@/utils/jwt';

/** 用户 JWT 门禁（账号 API 用），与设备凭证同策略：失败统一 401 */
export const userJwt = createMiddleware<{
  Variables: {
    uid: number;
  };
}>(async (c, next) => {
  const auth = c.req.header('authorization');
  const match = auth && /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) {
    throw new HTTPException(401, { message: '缺少凭证' });
  }

  let uid: number;
  try {
    const payload = await verifyUserToken(match[1]);
    uid = payload.uid;
  } catch (err) {
    logger.warn({ err }, 'user jwt rejected');
    // 过期/签名问题一律 401，不暴露具体原因
    throw new HTTPException(401, { message: '凭证无效' });
  }

  c.set('uid', uid);
  await next();
});
