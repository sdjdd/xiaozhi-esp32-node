import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '@/container';
import { requireAdmin } from '@/middlewares/admin';
import { userJwt } from '@/middlewares/user-jwt';
import { VoiceCodeTakenError, VoiceNameTakenError } from '@/services/voice';

const createSchema = z.object({
  /** 展示名（如「小何」） */
  name: z.string().trim().min(1).max(64),
  /** 火山 TTS 音色代码 */
  voice: z.string().trim().min(1).max(64),
  /** 试听音频 CDN 地址（http/https）；缺省即未配置 */
  previewUrl: z.url().max(512).nullish(),
  /** 展示顺序（小的在前）；缺省排到末尾 */
  sort: z.number().int().min(0).optional(),
});

/** 改展示名/代码/试听地址/排序：均可选；试听地址传 null 清除；全缺省视为空操作 */
const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(64),
    voice: z.string().trim().min(1).max(64),
    previewUrl: z.url().max(512).nullable(),
    sort: z.number().int().min(0),
  })
  .partial();

const idParam = z.object({ id: z.coerce.number().int().positive() });

/**
 * 音色清单：列表对所有登录用户开放（改伙伴声音的选项），
 * 增删改仅管理员；展示名与音色代码均唯一，撞名/撞代码 409
 */
const app = new Hono<AppEnv>()
  .use(userJwt)
  .get('/', async (c) => {
    return c.json(await c.var.di.get('voiceService').list());
  })
  .post('/', requireAdmin, zValidator('json', createSchema), async (c) => {
    try {
      const voice = await c.var.di
        .get('voiceService')
        .create(c.req.valid('json'));
      return c.json(voice, 201);
    } catch (err) {
      if (err instanceof VoiceNameTakenError) {
        throw new HTTPException(409, { message: '音色名称已被占用' });
      }
      if (err instanceof VoiceCodeTakenError) {
        throw new HTTPException(409, { message: '音色代码已被占用' });
      }
      throw err;
    }
  })
  .patch(
    '/:id',
    requireAdmin,
    zValidator('param', idParam),
    zValidator('json', patchSchema),
    async (c) => {
      const patch = c.req.valid('json');
      // 无修改项：空操作成功（幂等，不落库）
      if (Object.keys(patch).length === 0) {
        return c.json({ ok: true });
      }
      try {
        const ok = await c.var.di
          .get('voiceService')
          .update(c.req.valid('param').id, patch);
        if (!ok) {
          throw new HTTPException(404, { message: '音色不存在' });
        }
        return c.json({ ok: true });
      } catch (err) {
        if (err instanceof VoiceNameTakenError) {
          throw new HTTPException(409, { message: '音色名称已被占用' });
        }
        if (err instanceof VoiceCodeTakenError) {
          throw new HTTPException(409, { message: '音色代码已被占用' });
        }
        throw err;
      }
    },
  )
  .delete('/:id', requireAdmin, zValidator('param', idParam), async (c) => {
    const ok = await c.var.di
      .get('voiceService')
      .remove(c.req.valid('param').id);
    if (!ok) {
      throw new HTTPException(404, { message: '音色不存在' });
    }
    return c.json({ ok: true });
  });

export default app;
