import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '@/container';
import { loginRateLimit, registerRateLimit } from '@/middlewares/rate-limit';
import { InvalidCredentialsError, UsernameTakenError } from '@/services/user';

const credentialsSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_-]{3,32}$/),
  password: z.string().min(8).max(128),
});

const app = new Hono<AppEnv>()
  .post(
    '/register',
    registerRateLimit,
    zValidator('json', credentialsSchema),
    async (c) => {
      const { username, password } = c.req.valid('json');
      try {
        await c.var.di.get('userService').register(username, password);
      } catch (err) {
        if (err instanceof UsernameTakenError) {
          throw new HTTPException(409, { message: '用户名已被占用' });
        }
        throw err;
      }
      return c.json({ ok: true }, 201);
    },
  )
  .post(
    '/login',
    loginRateLimit,
    zValidator('json', credentialsSchema),
    async (c) => {
      const { username, password } = c.req.valid('json');
      try {
        const token = await c.var.di
          .get('userService')
          .login(username, password);
        return c.json({ token });
      } catch (err) {
        if (err instanceof InvalidCredentialsError) {
          // 用户名不存在与密码错误同响应，避免账号枚举
          throw new HTTPException(401, { message: '用户名或密码错误' });
        }
        throw err;
      }
    },
  );

export default app;
