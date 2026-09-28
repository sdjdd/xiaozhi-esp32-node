# xiaozhi-esp32-node

小智（xiaozhi）服务端的 Node.js 实现。

## 环境要求

- Node.js ≥ 22（运行依赖 `--env-file`）
- pnpm（仓库锁定 12.6.0，建议用 Corepack：`corepack enable`）
- MySQL 8
- 安装 `onnxruntime-node` 需放行构建脚本，仓库已在根
  `pnpm-workspace.yaml` 的 `allowBuilds` 中声明

## 安装依赖

```bash
corepack enable
pnpm install --frozen-lockfile
```

## 配置

在 `server/` 下创建 `.env`（不入库，启动时由 dotenv 自动加载）：

| 变量                                   | 必填 | 说明                                                               |
| -------------------------------------- | ---- | ------------------------------------------------------------------ |
| `DATABASE_URL`                         | 是   | mysql2 连接池与 drizzle-kit 共用，`mysql://user:pass@host:port/db` |
| `VOLC_API_KEY`                         | 是   | 火山引擎三个 provider 共用的 `X-Api-Key`                           |
| `VOLC_BASE_URL` / `VOLC_MODEL`         | 是   | LLM（OpenAI 兼容）                                                 |
| `VOLC_STT_BASE_URL` / `VOLC_STT_MODEL` | 是   | 流式识别，`resourceId` 形如 `volc.seedasr.sauc.duration`           |
| `VOLC_TTS_BASE_URL` / `VOLC_TTS_MODEL` | 是   | 流式合成，`resourceId` 形如 `seed-tts-2.0`                         |
| `JWT_SECRET`                           | 是   | HS256 密钥，`openssl rand -hex 32` 生成                            |
| `PORT`                                 | 否   | 服务端口，默认 `3000`                                              |
| `LOG_LEVEL`                            | 否   | 日志级别，默认 `info`                                              |

## 初始化数据库

表定义在 `src/database/schemas.ts`（无迁移文件，直接 push），库名须与
`.env` 的 `MYSQL_DATABASE` / `DATABASE_URL` 一致：

```bash
mysql -e 'CREATE DATABASE xiaozhi_esp32_node CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
cd server
pnpm exec drizzle-kit push
```

## 编译

```bash
pnpm --filter server build   # tsc → server/dist，再由 tsc-alias 重写 @/* 并补 .js
pnpm --filter web build      # tsc -b && vite build → web/dist
```

`server/dist` 已把 `@/*` 别名与无扩展名导入处理为可直接被 `node` 加载，
**无需 tsx**。注意 VAD 模型在 `server/models/`，按 `process.cwd()` 解析，
所以运行时 cwd 必须是 `server/`。

## 部署

服务端两种跑法，二选一（都要求 cwd 为 `server/`，且 `dist/`、`models/`、
`node_modules/` 齐备）：

```bash
cd server

# 方式一：编译产物（推荐，生产只需 node）
node dist/index.js

# 方式二：直接跑源码（需 tsx 依赖）
pnpm exec tsx src/index.ts
```

`GET /` 返回 `Hello world!`，可作就绪探针。

前端 `web/dist` 是纯静态产物，交给 Nginx/CDN；同源反代 `/api` 与
`/gateway` 到服务端即可（TLS 由反代终止）：

```nginx
server {
    listen 443 ssl;
    server_name your.domain;

    root /srv/xiaozhi-esp32-node/web/dist;
    index index.html;

    # 控制台（TanStack Router）SPA 回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # HTTP API 与设备 OTA
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 设备长连接（WebSocket 升级）
    location /gateway/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }
}
```

`X-Forwarded-Proto` 必须透传：OTA 据此决定下发 `ws://` 还是 `wss://`。

## 设备接入

设备走小智 OTA 协议握手 `/api/ota`：未绑定设备返回 6 位激活码，
在控制台添加设备并绑定后，再次握手返回 `websocket.url/token`，
连接 `/gateway/` 即开始全双工对话。

## 运维要点

- 单进程内存态：设备在线表、限流计数都在进程内，多实例部署需外置。
- `JWT_SECRET` 泄露等于全部设备/用户凭证失守，勿入库、勿日志。
- 音频规格固定（上行 16k Opus、TTS 下行 24kHz PCM），勿随意改动。

## 本地开发

```bash
pnpm --filter server dev    # tsx watch，:3000
pnpm --filter web dev       # Vite，:5173（/api 代理到 :3000）
pnpm --filter server test   # Vitest HTTP E2E（需 MySQL，:3100）
```

## 许可证

[MIT](LICENSE)
