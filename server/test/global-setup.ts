/**
 * E2E 全局装配（vitest globalSetup，跑在主进程、不执行 setupFiles，
 * 需自行加载 .env）：
 * 1. 重建 xiaozhi_esp32_node_e2e 库（DROP + CREATE，每轮全新）
 * 2. drizzle-kit push 建表（DATABASE_URL 显式指向 e2e 库；空库无交互提示）
 * 3. 预置内置角色（PRESET_PERSONAS 单一事实源）
 * 4. 起真实 server（PORT=3100 / DATABASE_URL 指向 e2e 库），GET / 200 即就绪
 * 5. HTTP 注册 e2e_admin 占住「首个注册用户即管理员」的第一顺位
 * teardown 走 SIGTERM，由 index.ts 的优雅关停收尾（关连接池、停定时任务）
 */
import '@/config/env';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { PRESET_PERSONAS } from '@/services/persona';
import { VOICE_PRESETS } from '@/services/voice';
import { BASE_URL, E2E_PORT } from './helpers';

const E2E_DB = 'xiaozhi_esp32_node_e2e';
const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));

/** DATABASE_URL 中除库名外的连接信息；传 database 则指向指定库 */
function dbConfig(database?: string) {
  const url = new URL(process.env.DATABASE_URL!);
  return {
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ...(database ? { database } : {}),
  };
}

/** 把 DATABASE_URL 的库名换成 e2e 库 */
function e2eDatabaseUrl(): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${E2E_DB}`;
  return url.toString();
}

let server: ChildProcess | undefined;

export async function setup(): Promise<void> {
  await rebuildDatabase();
  await seedPersonas();
  await seedVoices();
  await startServer();
  await seedAdmin();
}

export async function teardown(): Promise<void> {
  if (!server) return;
  const child = server;
  server = undefined;
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function rebuildDatabase(): Promise<void> {
  const conn = await mysql.createConnection(dbConfig());
  await conn.query(`DROP DATABASE IF EXISTS \`${E2E_DB}\``);
  await conn.query(
    `CREATE DATABASE \`${E2E_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await conn.end();

  // drizzle.config 自带的 dotenv 不覆盖已有环境变量，
  // spawn 时显式传 DATABASE_URL 即可把 push 改向 e2e 库
  await run('pnpm', ['exec', 'drizzle-kit', 'push'], {
    ...process.env,
    DATABASE_URL: e2eDatabaseUrl(),
  });
}

async function seedPersonas(): Promise<void> {
  const conn = await mysql.createConnection(dbConfig(E2E_DB));
  for (const p of PRESET_PERSONAS) {
    await conn.execute(
      'INSERT INTO personas (name, system_prompt, sort) VALUES (?, ?, ?)',
      [p.name, p.system_prompt, p.sort],
    );
  }
  await conn.end();
}

async function seedVoices(): Promise<void> {
  const conn = await mysql.createConnection(dbConfig(E2E_DB));
  for (const v of VOICE_PRESETS) {
    await conn.execute(
      'INSERT INTO voices (name, voice, preview_url, sort) VALUES (?, ?, ?, ?)',
      [v.name, v.voice, v.previewUrl, v.sort],
    );
  }
  await conn.end();
}

/** 首个注册用户即管理员：起服后立刻注册占住第一顺位（用户名与 helpers.newAdmin 一致） */
async function seedAdmin(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'e2e_admin',
      password: 'p4ssw0rd-e2e-admin',
    }),
  });
  if (res.status !== 201) {
    throw new Error(`seed admin failed: HTTP ${res.status}`);
  }
}

async function startServer(): Promise<void> {
  // 端口已被占用（如遗留进程）就立刻失败：绝不复用陌生 server，避免测错目标
  if (await ready()) {
    throw new Error(
      `端口 ${E2E_PORT} 已被占用，请先释放再跑 E2E（lsof -i :${E2E_PORT}）`,
    );
  }
  // 不经 tsx bin 直启 node：SIGTERM 可直达 server 进程走优雅关停
  server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(E2E_PORT),
      DATABASE_URL: e2eDatabaseUrl(),
      LOG_LEVEL: 'warn',
    },
    // LOG_LEVEL=warn 时基本静默；起不来/报错时日志直接可见
    stdio: 'inherit',
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `server 进程提前退出（exit ${server.exitCode}），见上方日志`,
      );
    }
    if (await ready()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server 20s 内未就绪');
}

async function ready(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.status === 200;
  } catch {
    return false; // 连接拒绝即未就绪，属轮询预期
  }
}

function run(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: SERVER_DIR, env, stdio: 'inherit' });
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} 失败（exit ${code}）`));
    });
  });
}
