import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import WebSocket from 'ws';
import { logger } from '@/utils/logger';
import {
  buildAudioOnlyRequest,
  buildFullClientRequest,
  parseResponse,
  type AsrProtocolResponse,
} from './protocol';
import {
  type AsrAudioParams,
  type AsrFullRequestPayload,
  type AsrResponsePayload,
  type AsrResult,
  type AsrUtterance,
  type VolcengineAsrConfig,
} from './types';

/** Volcengine 语音服务通用的成功状态码（0 也表示成功） */
export const ASR_SUCCESS_CODE = 20000000;

const DEFAULT_PAYLOAD: AsrFullRequestPayload = {
  audio: {
    format: 'pcm',
    codec: 'raw',
    rate: 16000,
    bits: 16,
    channel: 1,
  },
  request: {
    model_name: 'bigmodel',
    enable_itn: true,
    enable_punc: true,
    enable_ddc: false,
    show_utterances: true,
    enable_nonstream: false,
  },
};

export class AsrServerError extends Error {
  constructor(
    public code: number,
    public payloadMsg?: unknown,
  ) {
    super(`volcengine asr server error, code: ${code}`);
    this.name = 'AsrServerError';
  }
}

export interface VolcengineAsrEvents {
  result: [AsrResult, AsrProtocolResponse];
  utterance: [AsrUtterance];
  error: [Error];
  close: [];
}

/**
 * 双向流式语音识别客户端
 * https://docs.volcengine.com/docs/DoubaoVoice/bidirectional-streaming-automatic-speech-recognition-websocket
 */
export class VolcengineAsrClient extends EventEmitter<VolcengineAsrEvents> {
  private seq = 1;
  private ws?: WebSocket;
  private finished = false;
  private closed = false;
  private sawLastResponse = false;
  /** 服务端报错后连接不可再用，阻止后续发送 */
  private fatalError?: Error;
  /** 握手响应头中的 X-Tt-Logid，用于向火山排查问题 */
  logId?: string;

  constructor(private config: VolcengineAsrConfig) {
    super();
  }

  private buildAuthHeaders(): Record<string, string> {
    const { apiKey, resourceId } = this.config;
    if (!apiKey) {
      throw new Error('volcengine asr auth required: apiKey');
    }
    return {
      'X-Api-Key': apiKey,
      'X-Api-Resource-Id': resourceId,
      'X-Api-Request-Id': randomUUID(),
      'X-Api-Connect-Id': randomUUID(),
      'X-Api-Sequence': '-1',
    };
  }

  /** 建连并发送 FullClientRequest，等待服务端 ack 后 resolve */
  async start(audio?: Partial<AsrAudioParams>): Promise<void> {
    if (this.ws) throw new Error('volcengine asr client already started');

    const ws = new WebSocket(this.config.baseURL, {
      headers: this.buildAuthHeaders(),
      // 服务端帧不严格满足 UTF-8 校验，与 TTS 一致关闭
      skipUTF8Validation: true,
    });
    this.ws = ws;

    // 记录握手响应头中的 logid，用于排错
    ws.on('upgrade', (res) => {
      this.logId = res.headers['x-tt-logid'] as string | undefined;
      logger.debug({ logId: this.logId }, 'volcengine asr handshake');
    });
    ws.on('error', (err) => this.emit('error', err));

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        ws.off('open', onOpen);
        ws.off('error', onError);
        ws.off('unexpected-response', onUnexpectedResponse);
        ws.off('close', onClose);
      };
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onUnexpectedResponse = (_req: unknown, res: IncomingMessage) => {
        onError(
          new Error(`volcengine asr handshake failed: HTTP ${res.statusCode}`),
        );
      };
      const onClose = () => {
        cleanup();
        reject(new Error('volcengine asr connection closed before ready'));
      };
      ws.once('open', onOpen);
      ws.once('error', onError);
      ws.once('unexpected-response', onUnexpectedResponse);
      ws.once('close', onClose);
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        this.handleMessage(data as WebSocket.RawData);
      } else {
        // 文本帧视为错误，避免静默丢失服务端报错
        this.emit(
          'error',
          new Error(
            `volcengine asr unexpected text frame: ${String(data).slice(0, 200)}`,
          ),
        );
      }
    });
    ws.on('close', (code, reason) => {
      this.closed = true;
      logger.debug({ code }, `volcengine asr connection closed: ${reason}`);
      this.emit('close');
    });

    ws.send(
      buildFullClientRequest(this.seq++, {
        ...DEFAULT_PAYLOAD,
        audio: { ...DEFAULT_PAYLOAD.audio, ...audio },
      }),
    );

    // 等待服务端对 FullClientRequest 的 ack（第一条响应），尽早暴露鉴权/参数错误
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.off('error', onError);
        this.off('close', onClose);
        this.off('result', onFirstResult);
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onClose = () => {
        cleanup();
        reject(new Error('volcengine asr connection closed before ready'));
      };
      const onFirstResult = () => {
        cleanup();
        resolve();
      };
      this.once('error', onError);
      this.once('close', onClose);
      this.once('result', onFirstResult);
    });
  }

  private handleMessage(data: WebSocket.RawData) {
    const raw = Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.isBuffer(data)
        ? data
        : Buffer.from(data as ArrayBuffer);

    let response: AsrProtocolResponse;
    try {
      response = parseResponse(raw);
    } catch (err) {
      this.emit('error', new Error(`failed to parse asr response: ${err}`));
      return;
    }
    if (response.isLast) this.sawLastResponse = true;

    const payloadMsg = response.payloadMsg as AsrResponsePayload | undefined;
    const result = payloadMsg?.result;
    if (result) {
      this.emit('result', result, response);
      for (const utterance of result.utterances ?? []) {
        this.emit('utterance', utterance);
      }
    }

    if (response.errorCode !== 0) {
      this.fatalError = new AsrServerError(
        response.errorCode,
        response.payloadMsg,
      );
      this.emit('error', this.fatalError);
      return;
    }

    // payload_msg.code：0 或 20000000 表示成功
    const code = (payloadMsg as { code?: number } | undefined)?.code;
    if (typeof code === 'number' && code !== 0 && code !== ASR_SUCCESS_CODE) {
      this.fatalError = new AsrServerError(code, payloadMsg);
      this.emit('error', this.fatalError);
    }
  }

  /** 流式发送音频分片，pcm 16k 16bit mono 等由 payload.audio 声明 */
  sendAudio(chunk: Buffer): void {
    if (this.fatalError) throw this.fatalError;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('volcengine asr client is not connected');
    }
    if (this.finished) throw new Error('audio stream is already finished');

    this.ws.send(buildAudioOnlyRequest(this.seq++, chunk));
  }

  /** 发送最后一个音频包（负 sequence），并等待服务端返回最终结果后关闭 */
  async finish(remainingAudio?: Buffer): Promise<void> {
    if (this.fatalError) throw this.fatalError;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('volcengine asr client is not connected');
    }
    if (!this.finished) {
      this.finished = true;
      this.ws.send(
        buildAudioOnlyRequest(
          this.seq,
          remainingAudio ?? Buffer.alloc(0),
          true,
        ),
      );
    }
    if (this.closed || this.sawLastResponse) return;

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.off('close', onClose);
        this.off('error', onError);
      };
      const onClose = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      this.once('close', onClose);
      this.once('error', onError);
    });
  }

  close(): void {
    this.ws?.close();
  }
}
