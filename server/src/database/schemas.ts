import * as t from 'drizzle-orm/mysql-core';

/** 设备台账：以 client-id（xiaozhi 固件的 UUID v4）为身份锚点 */
export const devices = t.mysqlTable(
  'devices',
  {
    id: t.int({ unsigned: true }).primaryKey().autoincrement(),
    client_id: t.varchar({ length: 64 }).notNull().unique(),
    /** MAC 地址，仅展示/关联用，不可作身份 */
    device_id: t.varchar({ length: 32 }),
    /** 归属用户（users.id），null = 未激活未绑定 */
    user_id: t.int({ unsigned: true }),
    /** 绑定的智能体（agents.id），null = 未绑定 */
    agent_id: t.int({ unsigned: true }),
    /** 6 位数字激活码，临时凭证：10 分钟有效，过期重新生成，绑定即清空。
     * 活跃期间全局唯一，生成时撞码重试 */
    activation_code: t.varchar({ length: 6 }).unique(),
    activation_expires_at: t.datetime(),
    created_at: t.datetime().defaultNow(),
  },
  (table) => [t.index('devices_agent_id_idx').on(table.agent_id)],
);

/** 智能体：设备的 1:1 伙伴（名字 + 性格提示词），随设备认领而生、解绑而灭 */
export const agents = t.mysqlTable('agents', {
  id: t.int({ unsigned: true }).primaryKey().autoincrement(),
  /** 归属用户（users.id） */
  user_id: t.int({ unsigned: true }).notNull(),
  /** 伙伴名字（对话内自称 + 控制台展示，非唤醒词） */
  name: t.varchar({ length: 64 }).notNull(),
  /** 性格描述：作为系统提示词拼进对话（语音硬约束不在此列） */
  system_prompt: t.text().notNull(),
  /** 伙伴音色（voices.voice 代码快照）；认领与补建时显式写入默认值 */
  voice: t.varchar({ length: 64 }).notNull(),
  created_at: t.datetime().defaultNow(),
  updated_at: t.datetime().defaultNow().onUpdateNow(),
});

/** 音色清单：伙伴声音的候选项（管理员维护），voice 代码即唯一事实源 */
export const voices = t.mysqlTable('voices', {
  id: t.int({ unsigned: true }).primaryKey().autoincrement(),
  /** 展示名（如「小何」） */
  name: t.varchar({ length: 64 }).notNull().unique(),
  /** 火山 TTS 音色代码（如 zh_female_xiaohe_uranus_bigtts） */
  voice: t.varchar({ length: 64 }).notNull().unique(),
  /** 试听音频 CDN 地址（http/https）；null = 未配置 */
  preview_url: t.varchar({ length: 512 }),
  /** 展示顺序（小的在前） */
  sort: t.int({ unsigned: true }).notNull().default(0),
  created_at: t.datetime().defaultNow(),
});

/** 用户账号：多租户归属层 */
export const users = t.mysqlTable('users', {
  id: t.int({ unsigned: true }).primaryKey().autoincrement(),
  username: t.varchar({ length: 32 }).notNull().unique(),
  /** argon2id 散列（PHC 格式字符串） */
  password_hash: t.varchar({ length: 255 }).notNull(),
  /** 角色：admin 可管理全局预设（首个注册用户自动成为 admin） */
  role: t.mysqlEnum('role', ['user', 'admin']).notNull().default('user'),
  created_at: t.datetime().defaultNow(),
});

/** 内置预设角色：新用户添加设备时的默认选择项；名称即唯一事实源（管理端点维护） */
export const personas = t.mysqlTable('personas', {
  id: t.int({ unsigned: true }).primaryKey().autoincrement(),
  name: t.varchar({ length: 64 }).notNull().unique(),
  system_prompt: t.text().notNull(),
  /** 展示顺序（小的在前） */
  sort: t.int({ unsigned: true }).notNull().default(0),
  created_at: t.datetime().defaultNow(),
});

export const messages = t.mysqlTable(
  'messages',
  {
    id: t.int({ unsigned: true }).primaryKey().autoincrement(),
    /** 引用 devices.id */
    device_id: t.int({ unsigned: true }),
    /** gateway 生成的会话 uuid */
    session_id: t.varchar({ length: 64 }),
    message: t.json(),
    created_at: t.datetime().defaultNow(),
  },
  (table) => [
    t
      .index('messages_device_session_id_idx')
      .on(table.device_id, table.session_id, table.id),
  ],
);
