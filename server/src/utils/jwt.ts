import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'xiaozhi-esp32-node';

/** 凭证有效期：设备凭证当作长期凭证而非会话 token——固件断线重连
 * 用的是 NVS 里的旧 token，不保证先重跑 OTA，短 TTL 会让设备失联。
 * 用户 token 与其保持一致 */
const TOKEN_TTL = '30d';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}
const key = new TextEncoder().encode(process.env.JWT_SECRET);

export interface DeviceTokenPayload {
  /** devices.id（内部身份，供排查用） */
  did: number;
  /** client-id，身份锚点，升级时须与请求头一致 */
  cid: string;
}

export async function signDeviceToken({
  did,
  cid,
}: DeviceTokenPayload): Promise<string> {
  return new SignJWT({ did, cid })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(key);
}

export async function verifyDeviceToken(
  token: string,
): Promise<DeviceTokenPayload> {
  const { payload } = await jwtVerify(token, key, {
    issuer: ISSUER,
    algorithms: ['HS256'],
  });
  if (typeof payload.did !== 'number' || typeof payload.cid !== 'string') {
    throw new Error('invalid device token payload');
  }
  return payload as unknown as DeviceTokenPayload;
}

export interface UserTokenPayload {
  uid: number;
}

export async function signUserToken({
  uid,
}: UserTokenPayload): Promise<string> {
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(key);
}

export async function verifyUserToken(
  token: string,
): Promise<UserTokenPayload> {
  const { payload } = await jwtVerify(token, key, {
    issuer: ISSUER,
    algorithms: ['HS256'],
  });
  if (typeof payload.uid !== 'number') {
    throw new Error('invalid user token payload');
  }
  return payload as unknown as UserTokenPayload;
}
