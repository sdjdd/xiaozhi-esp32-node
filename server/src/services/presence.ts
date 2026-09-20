import type { WebSocket } from 'ws';

/**
 * 设备连接在册表：clientId 维度的在线状态。
 * gateway 在连接建立/断开时维护，HTTP 侧（user 路由）只读查询
 */
export class PresenceService {
  /** ws → clientId（断开时反查归属） */
  private sockets = new Map<WebSocket, string>();

  /** clientId → 存活连接数；同设备重复连接以任一存活为准 */
  private refCounts = new Map<string, number>();

  arrive(ws: WebSocket, clientId: string) {
    this.sockets.set(ws, clientId);
    this.refCounts.set(clientId, (this.refCounts.get(clientId) ?? 0) + 1);
  }

  /** 幂等：未在册的 ws 是 no-op */
  depart(ws: WebSocket) {
    const clientId = this.sockets.get(ws);
    if (clientId === undefined) return;
    this.sockets.delete(ws);
    const n = this.refCounts.get(clientId) ?? 0;
    if (n <= 1) {
      this.refCounts.delete(clientId);
    } else {
      this.refCounts.set(clientId, n - 1);
    }
  }

  isOnline(clientId: string): boolean {
    return this.refCounts.has(clientId);
  }

  /** 当前在线设备数（clientId 维度） */
  onlineCount(): number {
    return this.refCounts.size;
  }
}
