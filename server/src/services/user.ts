import { asc, count, desc, eq, like } from 'drizzle-orm';
import { db, devices, users } from '@/database';
import { signUserToken } from '@/utils/jwt';
import { isDupEntry } from '@/utils/mysql';
import { hashPassword, verifyPassword } from '@/utils/password';

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`username taken: ${username}`);
  }
}

export class InvalidCredentialsError extends Error {}

/** 用户账号服务：注册与登录（账号密码） */
export class UserService {
  async register(username: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    try {
      await db.insert(users).values({
        username,
        password_hash: passwordHash,
        // 首个注册用户即管理员（自用产品的管理员引导；并发首注竞态可忽略）
        ...((await this.isFirstUser()) && { role: 'admin' }),
      });
    } catch (err) {
      if (isDupEntry(err)) {
        throw new UsernameTakenError(username);
      }
      throw err;
    }
  }

  /** 登录成功返回用户 JWT */
  async login(username: string, password: string): Promise<string> {
    const [row] = await db
      .select({ id: users.id, password_hash: users.password_hash })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!row) {
      throw new InvalidCredentialsError();
    }
    if (!(await verifyPassword(password, row.password_hash))) {
      throw new InvalidCredentialsError();
    }
    return signUserToken({ uid: row.id });
  }

  /**
   * 本人改密码：先校验当前密码（防越权改他人/被盗后锁定），
   * 通过后写新散列。当前密码错误或账号已删抛 InvalidCredentialsError。
   * 旧 JWT 不吊销（无服务端会话态），改动只影响新登录校验
   */
  async changePassword(
    uid: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const [row] = await db
      .select({ password_hash: users.password_hash })
      .from(users)
      .where(eq(users.id, uid))
      .limit(1);
    if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
      throw new InvalidCredentialsError();
    }
    await db
      .update(users)
      .set({ password_hash: await hashPassword(newPassword) })
      .where(eq(users.id, uid));
  }

  /** 取用户公开信息（/me 用）；uid 失效（账号被删）返回 undefined */
  async describe(
    uid: number,
  ): Promise<
    { id: number; username: string; role: 'user' | 'admin' } | undefined
  > {
    const [row] = await db
      .select({ id: users.id, username: users.username, role: users.role })
      .from(users)
      .where(eq(users.id, uid))
      .limit(1);
    return row;
  }

  /**
   * 管理后台分页账号清单，附归属设备数（未绑定设备不计）。
   * q 非空时按用户名模糊匹配（LIKE 通配符转义，避免用户输入当通配符）；
   * 排序只认 id（单调对应注册顺位），order: asc/desc
   */
  async listPage(opts: {
    page: number;
    pageSize: number;
    q?: string;
    order: 'asc' | 'desc';
  }): Promise<{
    items: {
      id: number;
      username: string;
      role: 'user' | 'admin';
      createdAt: Date | null;
      deviceCount: number;
    }[];
    total: number;
  }> {
    const where = opts.q
      ? like(users.username, `%${opts.q.replace(/[\\%_]/g, '\\$&')}%`)
      : undefined;
    const [countRows, items] = await Promise.all([
      db.select({ n: count() }).from(users).where(where),
      db
        .select({
          id: users.id,
          username: users.username,
          role: users.role,
          createdAt: users.created_at,
          deviceCount: count(devices.id),
        })
        .from(users)
        .leftJoin(devices, eq(devices.user_id, users.id))
        .where(where)
        .groupBy(users.id)
        .orderBy(opts.order === 'desc' ? desc(users.id) : asc(users.id))
        .limit(opts.pageSize)
        .offset((opts.page - 1) * opts.pageSize),
    ]);
    return { items, total: countRows[0].n };
  }

  /**
   * 改用户角色（管理后台用；改角色即时生效，不进 JWT）。
   * 目标不存在返回 false
   */
  async setRole(id: number, role: 'user' | 'admin'): Promise<boolean> {
    const result = await db.update(users).set({ role }).where(eq(users.id, id));
    return result[0].affectedRows > 0;
  }

  /** 取用户角色；uid 失效返回 undefined（视作非管理员） */
  async roleOf(uid: number): Promise<'user' | 'admin' | undefined> {
    const [row] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, uid))
      .limit(1);
    return row?.role;
  }

  /** 表空即本次注册为首个用户（limit 1 无行即空表）；并发首注的竞态窗口可忽略 */
  private async isFirstUser(): Promise<boolean> {
    const [row] = await db.select({ id: users.id }).from(users).limit(1);
    return !row;
  }
}
