import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { TOKEN_KEY } from '@/api/client';
import { isUnauthorized } from '@/api/errors';

/**
 * token 过期兜底：路由守卫只拦无凭证，过期凭证会到这里拿到 401，
 * 清掉凭证与查询缓存后回登录页。挂到页面用到的鉴权 query/mutation error 上
 */
export function use401Redirect(error: unknown) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (isUnauthorized(error)) {
      localStorage.removeItem(TOKEN_KEY);
      queryClient.clear();
      void navigate({ to: '/login' });
    }
  }, [error, navigate, queryClient]);
}
