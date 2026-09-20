import type { ChatMessage } from './messages';

export interface Memory {
  getMessages(): ChatMessage[] | Promise<ChatMessage[]>;
  appendMessages(messages: ChatMessage[]): void | Promise<void>;
}
