export interface VolcengineAsrConfig {
  /** 新版控制台鉴权：X-Api-Key（必填，Agent Plan 专属 API Key 也走此字段） */
  apiKey: string;
  /** WebSocket 接口地址（必填） */
  baseURL: string;
  /**
   * X-Api-Resource-Id（必填），Agent Plan 套餐版为 volc.seedasr.sauc.duration。
   * 按量版 1.0 为 volc.bigasr.sauc.duration
   */
  resourceId: string;
}

export interface AsrAudioParams {
  /** 音频格式：pcm / wav 等 */
  format: string;
  /** 音频编码，raw 即 pcm */
  codec: 'raw';
  /** 采样率，目前仅支持 16000 */
  rate: number;
  /** 采样位数，目前仅支持 16 */
  bits: number;
  /** 声道数：1(mono) / 2(stereo) */
  channel: number;
}

export interface AsrFullRequestPayload {
  audio: AsrAudioParams;
  request: {
    model_name: string;
    enable_itn: boolean;
    enable_punc: boolean;
    enable_ddc: boolean;
    show_utterances: boolean;
    enable_nonstream: boolean;
  };
}

export interface AsrWord {
  text: string;
  start_time: number;
  end_time: number;
}

export interface AsrUtterance {
  /** 是否为最终结果（语音后端点确定后的结果） */
  definite: boolean;
  start_time: number;
  end_time: number;
  text: string;
  words?: AsrWord[];
}

export interface AsrResult {
  text?: string;
  utterances?: AsrUtterance[];
  additions?: Record<string, unknown>;
}

/** 服务端完整响应的 payload_msg */
export interface AsrResponsePayload {
  audio_info?: { duration: number };
  result?: AsrResult;
  code?: number;
}
