import { randomBytes } from 'node:crypto';
import { logger } from '@/utils/logger';
import { signDeviceToken } from '@/utils/jwt';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '@/container';

const otaSchema = z.object({
  application: z.object({
    version: z.string(),
    elf_sha256: z.string(),
  }),
  board: z.object({
    type: z.string(),
    name: z.string(),
  }),
});

/**
 * 头校验：client-id（xiaozhi 固件的 UUID v4）是身份锚点；
 * device-id（MAC）可伪造，仅作展示/关联透传。固件两者必发，缺失即拒绝
 */
const deviceAuth = createMiddleware<{
  Variables: {
    clientId: string;
    deviceId: string;
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
  c.set('clientId', clientId);
  c.set('deviceId', deviceId);
  await next();
});

const app = new Hono<AppEnv>()
  .use(deviceAuth)
  .post('/', zValidator('json', otaSchema), async (c) => {
    const { clientId, deviceId, di } = c.var;
    const deviceService = di.get('deviceService');

    logger.debug({ clientId, deviceId }, 'OTA');

    const device = await deviceService.ensureDevice(clientId, deviceId);

    const url = new URL(c.req.url);
    // 反代终止 TLS 时与 Node 的连接是明文，凭 X-Forwarded-Proto 还原原始协议
    // （取首个值；未知值回退到连接本身是否加密）
    const forwardedProto = c.req
      .header('x-forwarded-proto')
      ?.split(',')[0]
      ?.trim()
      .toLowerCase();
    const secure =
      forwardedProto === 'https'
        ? true
        : forwardedProto === 'http'
          ? false
          : url.protocol === 'https:';
    const wsProtocol = secure ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${url.host}/gateway/`;

    const base = {
      server_time: {
        timestamp: Date.now(),
        timezone: 'Asia/Shanghai',
        timezone_offset: -480,
      },
      firmware: {
        version: c.req.valid('json').application.version,
      },
    };

    // 未激活设备：下发激活码 + 挑战值（无 websocket），固件展示并轮询
    // /api/ota/activate；用户在控制台绑定后，下一次轮询即拿到 websocket 凭证。
    // 激活码为 10 分钟有效的临时凭证，跨轮询稳定，绑定后失效。
    // challenge 仅为驱动固件进入 /activate 轮询，服务端不做 HMAC 校验
    if (device.userId === null) {
      const code = await deviceService.ensureActivationCode(device.id);
      return c.json({
        ...base,
        activation: {
          code,
          challenge: randomBytes(16).toString('hex'),
          message: `请在控制台输入${code}绑定设备`,
        },
      });
    }

    const token = await signDeviceToken({ did: device.id, cid: clientId });
    return c.json({
      ...base,
      websocket: {
        url: wsUrl,
        token,
      },
    });
  })
  .post('/activate', async (c) => {
    const deviceService = c.var.di.get('deviceService');
    const device = await deviceService.ensureDevice(
      c.var.clientId,
      c.var.deviceId,
    );
    return c.json({}, device.userId === null ? 202 : 200);
  });

export default app;
