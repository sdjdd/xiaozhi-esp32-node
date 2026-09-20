import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '@/container';
import { bindDeviceRateLimit } from '@/middlewares/rate-limit';
import { userJwt } from '@/middlewares/user-jwt';

const bindSchema = z.object({
  /** 设备屏幕展示的 6 位数字激活码 */
  code: z.string().regex(/^\d{6}$/),
});

/** 改伙伴名/性格/音色：见面页与设备页编辑共用，均可选；全缺省视为空操作 */
const companionPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(20),
    systemPrompt: z.string().trim().min(1).max(2000),
    voice: z.string().trim().min(1).max(64),
  })
  .partial();

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** 设备域端点（设备即助手：名字与性格来自 1:1 伙伴） */
const app = new Hono<AppEnv>()
  .use(userJwt)
  .get('/', async (c) => {
    const di = c.var.di;
    const presence = di.get('presenceService');
    const devices = await di.get('deviceService').listByUser(c.var.uid);
    return c.json(
      devices.map(({ clientId, ...view }) => ({
        ...view,
        online: presence.isOnline(clientId),
      })),
    );
  })
  .get('/:id', zValidator('param', idParam), async (c) => {
    const di = c.var.di;
    const device = await di
      .get('deviceService')
      .getByUser(c.var.uid, c.req.valid('param').id);
    if (!device) {
      // 非本人设备与不存在同响应，不泄露设备存在性
      throw new HTTPException(404, { message: '设备不存在' });
    }
    const { clientId, ...view } = device;
    return c.json({
      ...view,
      online: di.get('presenceService').isOnline(clientId),
    });
  })
  .post('/', bindDeviceRateLimit, zValidator('json', bindSchema), async (c) => {
    const di = c.var.di;
    const result = await di
      .get('deviceService')
      .bindByCode(c.var.uid, c.req.valid('json').code);
    if (!result.ok) {
      // 无效/过期与被他人抢先分别提示；都不泄露设备信息
      throw new HTTPException(result.reason === 'taken' ? 409 : 400, {
        message:
          result.reason === 'taken'
            ? '设备已被其他用户绑定'
            : '激活码无效或已过期',
      });
    }
    const { clientId, ...view } = result.device;
    return c.json(
      {
        ...view,
        online: di.get('presenceService').isOnline(clientId),
      },
      201,
    );
  })
  .patch(
    '/:id',
    zValidator('param', idParam),
    zValidator('json', companionPatchSchema),
    async (c) => {
      const di = c.var.di;
      const patch = c.req.valid('json');
      // 无修改项：空操作成功（幂等，不落库）
      if (Object.keys(patch).length === 0) {
        return c.json({ ok: true });
      }
      if (patch.voice && !(await di.get('voiceService').exists(patch.voice))) {
        // 音色不在清单里（voices 表）即拒绝，防止乱填导致 TTS 会话失败
        throw new HTTPException(400, { message: '未知音色' });
      }
      const ok = await di
        .get('deviceService')
        .updateCompanionByUser(c.var.uid, c.req.valid('param').id, patch);
      if (!ok) {
        // 非本人设备与不存在同响应，不泄露设备存在性
        throw new HTTPException(404, { message: '设备不存在' });
      }
      return c.json({ ok: true });
    },
  )
  .delete('/:id', zValidator('param', idParam), async (c) => {
    const deviceService = c.var.di.get('deviceService');
    const ok = await deviceService.unbindByUser(
      c.var.uid,
      c.req.valid('param').id,
    );
    if (!ok) {
      // 非本人设备与不存在同响应，不泄露设备存在性
      throw new HTTPException(404, { message: '设备不存在' });
    }
    return c.json({ ok: true });
  });

export default app;
