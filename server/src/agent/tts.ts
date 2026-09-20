/**
 * speak 输出契约（钉死）：24kHz / 16bit / mono，小端原始 PCM 字节。
 *
 * input 可以是 token 级碎文本块，由实现自行缓冲；
 * abortSignal 中止或返回流被消费方 cancel 时，实现必须停止消费 input
 * 并断开上游合成连接（barge-in 路径）
 */
export interface SpeakOptions {
  input: AsyncIterable<string>;
  voice: string;
  format: 'pcm';
  sampleRate: 24000;
  abortSignal?: AbortSignal;
}

export type TTSChunk =
  | {
      type: 'audio';
      /** 24kHz / 16bit / mono 的一小段 PCM LE 字节 */
      data: Uint8Array;
    }
  | {
      type: 'subtitle';
      text: string;
      /** 相对首个 audio 块起点的毫秒数 */
      startTimeMs: number;
      endTimeMs: number;
    };

export interface TTS {
  speak(options: SpeakOptions): ReadableStream<TTSChunk>;
  destroy?(): void;
}
