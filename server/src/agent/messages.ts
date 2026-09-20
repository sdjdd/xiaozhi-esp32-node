import type {
  AssistantModelMessage,
  ModelMessage,
  TextPart,
  UserModelMessage,
} from 'ai';

/**
 * 会话消息的存储格式（messages.message 列的 JSON 形状）——从 AI SDK 的
 * text 消息类型 port 而来（去掉 providerOptions 等实现细节），与 SDK 解耦：
 * 升级或替换 SDK 不动历史数据，交互边界经 toModelMessages / fromModelMessages
 * 单向转换。该格式只含 text 消息，工具调用消息（role: 'tool'）不在其列
 */

/** port 自 SDK 的 TextPart（去掉 providerOptions） */
export type ChatTextPart = { type: 'text'; text: string };

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ChatTextPart[] }
  | { role: 'assistant'; content: string | ChatTextPart[] };

/** 存储格式 → AI SDK。形状是 SDK text 消息的子集，结构兼容直接透传 */
export function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map((message) => {
    switch (message.role) {
      case 'system':
        return { role: 'system', content: message.content };
      case 'user':
        return { role: 'user', content: message.content };
      case 'assistant':
        return { role: 'assistant', content: message.content };
    }
  });
}

/** AI SDK 消息 → 存储格式；role: 'tool' 不在存储格式内，遇到即跳过 */
export function fromModelMessages(messages: ModelMessage[]): ChatMessage[] {
  return messages.flatMap((message): ChatMessage[] => {
    switch (message.role) {
      case 'system':
        return [{ role: 'system', content: message.content }];
      case 'user':
        return [{ role: 'user', content: fromModelContent(message.content) }];
      case 'assistant':
        return [
          { role: 'assistant', content: fromModelContent(message.content) },
        ];
      default:
        return [];
    }
  });
}

function fromModelContent(
  content: UserModelMessage['content'] | AssistantModelMessage['content'],
): string | ChatTextPart[] {
  if (typeof content === 'string') return content;
  const parts = content.filter(
    (part): part is TextPart => part.type === 'text',
  );
  // 单条 text part 压平成 string，存储更紧凑；多条保持数组不合并
  if (parts.length === 1) return parts[0].text;
  return parts.map((part) => ({ type: 'text', text: part.text }));
}
