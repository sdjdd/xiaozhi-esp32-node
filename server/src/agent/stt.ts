/** 消费方空闲判停后取消 input 时携带的 reason，生产方据此区分取消原因 */
export class TranscribeIdleTimeout extends Error {
  constructor(readonly idleTimeoutMs: number) {
    super(`no audio for ${idleTimeoutMs}ms`);
    this.name = 'TranscribeIdleTimeout';
  }
}

export interface TranscribeOptions {
  /** 连续无新音频的判停超时（ms），超时视为语音结束。默认 1000 */
  idleTimeoutMs?: number;
}

export interface STT {
  /**
   * 转写一段语音，resolve 为完整文本。
   *
   * 音频约定：16kHz 单声道 16bit 小端 PCM（pcm16le），由调用方归一化。
   *
   * 结束条件（先到者生效）：
   * - input 关闭
   * - 连续 idleTimeoutMs 未收到新音频，
   *   此时消费方以 TranscribeIdleTimeout 为 reason 取消 input，
   *   生产方经 cancel 回调 / pipeTo reject / write reject 感知
   *
   * 中止：input 被 error（controller.error / writer.abort）视为调用方中止，
   * transcribe 以该原因 reject 并断开识别连接。
   *
   * 识别失败时 reject
   */
  transcribe: (
    input: ReadableStream<Uint8Array>,
    options?: TranscribeOptions,
  ) => Promise<string>;
}
