import { HTTPError } from 'ky';

/** 凭证失效（401）：路由守卫只拦无凭证，过期/无效凭证需在此兜底处理 */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof HTTPError && err.response.status === 401;
}

/**
 * 服务端状态码 → 用户可读文案（不解析响应体，按状态分类即可）。
 * overrides 用于个别端点覆盖默认措辞（如登录页区分 401/409）
 */
export function errorText(
  err: unknown,
  overrides: Partial<Record<number, string>> = {},
): string {
  const status = err instanceof HTTPError ? err.response.status : 0;
  const override = overrides[status];
  if (override) return override;
  if (status === 400) return '输入格式不正确';
  if (status === 401) return '登录已过期，请重新登录';
  if (status === 403) return '没有权限执行此操作';
  if (status === 404) return '目标不存在或已被删除';
  if (status === 409) return '内容已被占用';
  if (status === 429) return '操作过于频繁，请稍后再试';
  return '网络错误，请稍后重试';
}
