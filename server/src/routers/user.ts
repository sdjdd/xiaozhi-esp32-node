import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '@/container';
import { userJwt } from '@/middlewares/user-jwt';
import { InvalidCredentialsError } from '@/services/user';

/** 与 auth 的 credentialsSchema 密码约束（8-128）对齐 */
const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
});

/** 账号侧端点；设备域见 routers/devices.ts */
const app = new Hono<AppEnv>()
  .use(userJwt)
  .get('/me', async (c) => {
    const user = await c.var.di.get('userService').describe(c.var.uid);
    // token 有效但账号已不存在：视同未认证
    if (!user) {
      throw new HTTPException(401, { message: '凭证无效' });
    }
    return c.json({
      uid: c.var.uid,
      username: user.username,
      role: user.role,
    });
  })
  .post('/password', zValidator('json', changePasswordSchema), async (c) => {
    const { currentPassword, newPassword } = c.req.valid('json');
    try {
      await c.var.di
        .get('userService')
        .changePassword(c.var.uid, currentPassword, newPassword);
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        // 已认证场景下的业务校验失败，用 400 而非 401（避免前端误判登录过期）
        throw new HTTPException(400, { message: '当前密码不正确' });
      }
      throw err;
    }
    return c.json({ ok: true });
  });

export default app;
