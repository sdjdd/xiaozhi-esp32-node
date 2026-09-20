import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { TOKEN_KEY } from '@/api/client';

/**
 * 设备域 layout：统一登录守卫，子路由经 Outlet 挂载——
 * /devices 列表（devices.index.tsx）与 /devices/$deviceId/meet 见面页。
 * 不渲染任何布局内容，见面页才有独立的全屏舞台
 */
export const Route = createFileRoute('/devices')({
  /** 无凭证直达控制台 → 登录页 */
  beforeLoad: () => {
    if (localStorage.getItem(TOKEN_KEY) === null) {
      throw redirect({ to: '/login' });
    }
  },
  component: Outlet,
});
