import dotenv from 'dotenv';

/**
 * 加载 server/.env：不覆盖已有环境变量（E2E 注入优先），并静默 dotenv 启动日志。
 * 作为副作用模块放在入口首行导入，确保先于其它模块读到 env
 */
dotenv.config({ quiet: true });
