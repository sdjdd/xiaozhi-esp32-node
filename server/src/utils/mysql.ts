/** drizzle/mysql2 把 ER_DUP_ENTRY 包在 DrizzleQueryError.cause 里 */
export function isDupEntry(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === 'ER_DUP_ENTRY' || e.cause?.code === 'ER_DUP_ENTRY';
}
