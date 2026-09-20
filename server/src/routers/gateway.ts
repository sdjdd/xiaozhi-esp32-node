import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { upgradeWebSocket } from '@hono/node-server';
import type { WebSocket } from 'ws';
import { AppEnv } from '@/container';
import { Gateway } from '@/gateway/gateway';
import { logger } from '@/utils/logger';
import { verifyDeviceToken } from '@/utils/jwt';

/**
 * JWT 门禁：在头校验之上核验设备凭证，
 * 并要求 token 的 cid 与请求头一致——身份以凭证为准，头仅作绑定校验
 */
const deviceJwt = createMiddleware<{
  Variables: {
    clientId: string;
    deviceId: string;
    /** devices.id，来自 token 载荷 */
    did: number;
  };
}>(async (c, next) => {
  const clientId = c.req.header('client-id');
  if (!clientId) {
    throw new HTTPException(400, { message: '缺少 client-id' });
  }
  const deviceId = c.req.header('device-id');
  if (!deviceId) {
    throw new HTTPException(400, { message: '缺少 device-id' });
  }

  const auth = c.req.header('authorization');
  const match = auth && /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) {
    throw new HTTPException(401, { message: '缺少凭证' });
  }

  let did: number;
  try {
    const payload = await verifyDeviceToken(match[1]);
    if (payload.cid !== clientId) {
      throw new Error('client-id mismatch');
    }
    did = payload.did;
  } catch (err) {
    logger.warn({ err }, 'device jwt rejected');
    // 过期/签名/不匹配一律 401，不暴露具体原因，收窄探测面
    throw new HTTPException(401, { message: '凭证无效' });
  }

  c.set('clientId', clientId);
  c.set('deviceId', deviceId);
  c.set('did', did);
  await next();
});

const app = new Hono<AppEnv>().use(deviceJwt).get(
  '/',
  upgradeWebSocket(async (c) => {
    const gateway: Gateway = await c.var.di.getAsync('gateway');
    const deviceId: string = c.var.deviceId;
    const clientId: string = c.var.clientId;
    return {
      onOpen: (_, ws) => {
        gateway.handleConnect(ws.raw as WebSocket, clientId, deviceId);
      },
    };
  }),
);

export default app;
