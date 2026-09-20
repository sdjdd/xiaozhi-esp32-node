import './config/env';
import { Hono } from 'hono';
import { WebSocketServer } from 'ws';
import { serve } from '@hono/node-server';
import { inferdiHono } from '@inferdi/hono';
import { logger } from './utils/logger';
import { poolConnection } from './database';
import { root } from './container';
import ota from './routers/ota';
import gateway from './routers/gateway';
import auth from './routers/auth';
import user from './routers/user';
import devices from './routers/devices';
import personas from './routers/personas';
import voices from './routers/voices';
import admin from './routers/admin';

root.get('deviceService').startSweepExpiredCodesJob();

const app = new Hono({ strict: false })
  .use(
    inferdiHono({
      container: root,
    }),
  )
  .get('/', (c) => c.text('Hello world!'))
  .route('/api/ota', ota)
  .route('/api/auth', auth)
  .route('/api/user', user)
  .route('/api/devices', devices)
  .route('/api/personas', personas)
  .route('/api/voices', voices)
  .route('/api/admin', admin)
  .route('/gateway', gateway);

const wss = new WebSocketServer({ noServer: true });
const server = serve(
  {
    fetch: app.fetch,
    websocket: { server: wss },
    // E2E 用 PORT 注入独立端口（如 3100），避免与 dev server 抢 3000
    port: Number(process.env.PORT) || 3000,
  },
  (addr) => logger.info(addr, `HTTP server started`),
);

let isShuttingDown = false;
const shutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info('shutting down...');
  server.close();
  void root.dispose();
  poolConnection.end();
};

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
