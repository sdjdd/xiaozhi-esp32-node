import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '@/container';
import { requireAdmin } from '@/middlewares/admin';
import { userJwt } from '@/middlewares/user-jwt';
import { PersonaNameTakenError } from '@/services/persona';

const createSchema = z.object({
  name: z.string().trim().min(1).max(64),
  systemPrompt: z.string().trim().min(1).max(2000),
  /** 展示顺序（小的在前）；缺省排到末尾 */
  sort: z.number().int().min(0).optional(),
});

/** 改名/性格/排序：均可选；全缺省视为空操作（PATCH 幂等） */
const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(64),
    systemPrompt: z.string().trim().min(1).max(2000),
    sort: z.number().int().min(0),
  })
  .partial();

const idParam = z.object({ id: z.coerce.number().int().positive() });

/**
 * 内置预设角色：列表对所有登录用户开放（添加设备时的选项），
 * 增删改仅管理员；名称即唯一事实源，撞名 409
 */
const app = new Hono<AppEnv>()
  .use(userJwt)
  .get('/', async (c) => {
    return c.json(await c.var.di.get('personaService').list());
  })
  .post('/', requireAdmin, zValidator('json', createSchema), async (c) => {
    try {
      const persona = await c.var.di
        .get('personaService')
        .create(c.req.valid('json'));
      return c.json(persona, 201);
    } catch (err) {
      if (err instanceof PersonaNameTakenError) {
        throw new HTTPException(409, { message: 'persona name taken' });
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
          .get('personaService')
          .update(c.req.valid('param').id, patch);
        if (!ok) {
          throw new HTTPException(404, { message: '预设不存在' });
        }
        return c.json({ ok: true });
      } catch (err) {
        if (err instanceof PersonaNameTakenError) {
          throw new HTTPException(409, { message: '预设名称已被占用' });
        }
        throw err;
      }
    },
  )
  .delete('/:id', requireAdmin, zValidator('param', idParam), async (c) => {
    const ok = await c.var.di
      .get('personaService')
      .remove(c.req.valid('param').id);
    if (!ok) {
      throw new HTTPException(404, { message: '预设不存在' });
    }
    return c.json({ ok: true });
  });

export default app;
