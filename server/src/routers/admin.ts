import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '@/container';
import { requireAdmin } from '@/middlewares/admin';
import { userJwt } from '@/middlewares/user-jwt';

const roleSchema = z.object({ role: z.enum(['user', 'admin']) });

/** 分页参数：q 非空时按用户名模糊搜；order 为注册顺位（id）排序方向 */
const usersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().max(32).optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

/**
 * 管理后台端点：整体挂 userJwt + requireAdmin。
 * - GET /stats   跨域只读统计（在线设备数随连接实时变化）
 * - GET /users   分页账号清单（附归属设备数，支持用户名模糊搜与注册时间排序）
 * - PATCH /users/:id/role  改角色；改角色即时生效（requireAdmin 每请求查库），
 *   不允许改自己（防止自锁失去管理权后无人可恢复）
 */
const app = new Hono<AppEnv>()
  .use(userJwt)
  .use(requireAdmin)
  .get('/stats', async (c) => {
    const [stats, onlineDevices] = await Promise.all([
      c.var.di.get('adminService').stats(),
      Promise.resolve(c.var.di.get('presenceService').onlineCount()),
    ]);
    return c.json({ ...stats, onlineDevices });
  })
  .get('/users', zValidator('query', usersQuery), async (c) => {
    const { page, pageSize, q, order } = c.req.valid('query');
    return c.json(
      await c.var.di.get('userService').listPage({ page, pageSize, q, order }),
    );
  })
  .patch(
    '/users/:id/role',
    zValidator('param', idParam),
    zValidator('json', roleSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      if (id === c.var.uid) {
        throw new HTTPException(400, { message: '不能修改自己的角色' });
      }
      const ok = await c.var.di
        .get('userService')
        .setRole(id, c.req.valid('json').role);
      if (!ok) {
        throw new HTTPException(404, { message: '用户不存在' });
      }
      return c.json({ ok: true });
    },
  );

export default app;
