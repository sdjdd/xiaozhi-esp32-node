export interface VolcengineTTSConfig {
  /** 新版控制台鉴权：X-Api-Key（必填） */
  apiKey: string;
  /** WebSocket 接口地址（必填） */
  baseURL: string;
  /** X-Api-Resource-Id（必填），Agent Plan 内 TTS 为 seed-tts-2.0 */
  resourceId: string;
  /**
   * 连接空闲回收时长（ms）：session 结束后连接保留复用，
   * 超时无新合成则断开。默认 DEFAULT_TTS_IDLE_TIMEOUT_MS
   */
  idleTimeoutMs?: number;
}

/** StartSession / TaskRequest 共用的请求模板 */
export interface TTSFullRequestPayload {
  req_params: {
    speaker: string;
    audio_params: {
      /** 输出契约钉死 pcm */
      format: 'pcm';
      /** 输出契约钉死 24000 */
      sample_rate: 24000;
      /**
       * 开启字幕事件（TTSSubtitle，每次一整句，含字级时间戳）。
       * 仅 TTS2.0 / ICL2.0 生效——Agent Plan 只有 2.0
       */
      enable_subtitle: true;
    };
    /** 本次增量文本，仅 TaskRequest 携带 */
    text?: string;
    additions: string;
  };
  event?: number;
}

/**
 * TTSSentenceEnd 负载（enable_timestamp: true 时，TTS1.0/ICL1.0）。
 * startTime / endTime 为秒（浮点），相对整个 session 的音频时间线
 */
export interface TTSSentencePayload {
  text?: string;
  phonemes?: unknown[];
  words?: {
    word: string;
    /** 秒 */
    startTime: number;
    /** 秒 */
    endTime: number;
    confidence?: number;
  }[];
  [key: string]: unknown;
}
