import { count, isNotNull } from 'drizzle-orm';
import { db, devices, messages, personas, users, voices } from '@/database';

/** 管理后台统计视图 */
export interface AdminStats {
  users: number;
  devices: number;
  /** 已绑定用户的设备数（agents 与设备 1:1，即伙伴数） */
  boundDevices: number;
  personas: number;
  voices: number;
  messages: number;
}

/** 管理后台跨域只读统计；在线设备走 presenceService（随连接实时变化，不入库） */
export class AdminService {
  async stats(): Promise<AdminStats> {
    const [
      userRows,
      deviceRows,
      boundRows,
      personaRows,
      voiceRows,
      messageRows,
    ] = await Promise.all([
      db.select({ n: count() }).from(users),
      db.select({ n: count() }).from(devices),
      db.select({ n: count() }).from(devices).where(isNotNull(devices.user_id)),
      db.select({ n: count() }).from(personas),
      db.select({ n: count() }).from(voices),
      db.select({ n: count() }).from(messages),
    ]);
    return {
      users: userRows[0].n,
      devices: deviceRows[0].n,
      boundDevices: boundRows[0].n,
      personas: personaRows[0].n,
      voices: voiceRows[0].n,
      messages: messageRows[0].n,
    };
  }
}
