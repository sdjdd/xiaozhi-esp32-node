import { streamText } from 'ai';
import { LanguageModelV4 } from '@ai-sdk/provider';
import { logger } from '@/utils/logger';
import { Memory } from './memory';
import {
  type ChatMessage,
  fromModelMessages,
  toModelMessages,
} from './messages';
import { STT, TranscribeOptions } from './stt';
import { TTS, SpeakOptions } from './tts';

export class Agent {
  private model: LanguageModelV4;

  private instructions: string;

  private memory: Memory;

  private stt: STT;

  private tts: TTS;

  /** 伙伴音色（火山 TTS 代码）：会话建立时定值，改配置下一轮会话生效 */
  readonly voice: string;

  constructor({
    model,
    instructions,
    memory,
    stt,
    tts,
    voice,
  }: {
    model: LanguageModelV4;
    instructions: string;
    memory: Memory;
    stt: STT;
    tts: TTS;
    voice: string;
  }) {
    this.model = model;
    this.instructions = instructions;
    this.memory = memory;
    this.stt = stt;
    this.tts = tts;
    this.voice = voice;
  }

  async generate(
    input: string,
    {
      abortSignal,
    }: {
      abortSignal?: AbortSignal;
    } = {},
  ) {
    const history = await this.memory.getMessages();

    const userMessage: ChatMessage = { role: 'user', content: input };

    Promise.resolve(this.memory.appendMessages([userMessage])).catch(
      (err: unknown) => logger.warn({ err }, 'append user message failed'),
    );

    const result = streamText({
      model: this.model,
      instructions: this.instructions,
      messages: toModelMessages([...history, userMessage]),
      reasoning: 'none',
      abortSignal,
    });

    Promise.resolve(result.responseMessages).then(
      (responseMessages) => {
        if (abortSignal?.aborted) return;
        return Promise.resolve(
          this.memory.appendMessages(fromModelMessages(responseMessages)),
        ).catch((err: unknown) =>
          logger.warn({ err }, 'append response messages failed'),
        );
      },
      () => {
        // responseMessages 自身拒绝：abort 是预期取消；
        // 流失败已由 textStream 路径在 runRound 报 'round failed'，不重复
      },
    );

    return {
      textStream: result.textStream,
    };
  }

  transcribe(input: ReadableStream<Uint8Array>, options?: TranscribeOptions) {
    return this.stt.transcribe(input, options);
  }

  speak(options: SpeakOptions) {
    return this.tts.speak(options);
  }
}
