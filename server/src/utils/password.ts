import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id 散列，PHC 格式字符串（自描述，含算法/参数/盐/校验和）。
 * 库默认参数即 OWASP 推荐：m=19456, t=2, p=1
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    // 散列格式非法（历史脏数据）视为校验失败，而非让登录 500
    return false;
  }
}
