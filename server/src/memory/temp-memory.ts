import { and, desc, eq } from 'drizzle-orm';
import { Memory } from '@/agent/memory';
import type { ChatMessage } from '@/agent/messages';
import { db, messages } from '@/database';

const HISTORY_WINDOW = 10;

/**
 * 按设备 + 会话作用域隔离的对话历史。
 * deviceId 是 devices.id（内部身份），sessionId 是 gateway 生成的会话 uuid。
 * 存储的是自有 ChatMessage 格式（与 AI SDK 解耦），交互边界在 agent 层转换
 */
export class TempMemory implements Memory {
  private messages?: ChatMessage[];

  constructor(
    private readonly deviceId: number,
    private readonly sessionId: string,
  ) {}

  async getMessages() {
    if (!this.messages) {
      const rows = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.device_id, this.deviceId),
            eq(messages.session_id, this.sessionId),
          ),
        )
        .orderBy(desc(messages.id))
        .limit(HISTORY_WINDOW);
      rows.reverse();
      this.messages = rows.map((row) => row.message as ChatMessage);
    }
    return this.messages;
  }

  async appendMessages(newMessages: ChatMessage[]) {
    const createdAt = new Date();
    await db.insert(messages).values(
      newMessages.map((m) => ({
        device_id: this.deviceId,
        session_id: this.sessionId,
        message: m,
        created_at: createdAt,
      })),
    );
    this.messages = [...(this.messages || []), ...newMessages].slice(
      -HISTORY_WINDOW,
    );
  }
}
