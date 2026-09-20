import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { IncomingMessage } from 'node:http';
import WebSocket from 'ws';
import { logger } from '@/utils/logger';
import {
  decodeServerMessage,
  encodeFullClientRequest,
  TTSEventType,
  TTSMessageType,
  type TTSServerMessage,
} from './protocol';
import {
  type TTSFullRequestPayload,
  type TTSSentencePayload,
  type VolcengineTTSConfig,
} from './types';

/** 与 STT 服务一致的通用成功码（SessionFinished 等负载中的 status_code） */
export const TTS_SUCCESS_CODE = 20000000;

export class TTSServerError extends Error {
  constructor(
    public code: number,
    public payloadMsg?: unknown,
  ) {
    super(`volcengine tts server error, code: ${code}`);
    this.name = 'TTSServerError';
  }
}

export interface VolcengineTTSEvents {
  /** 一段合成音频（pcm 24k 16bit mono LE） */
  audio: [Buffer];
  sentenceStart: [TTSSentencePayload];
  sentenceEnd: [TTSSentencePayload];
  /** 一整句字幕（含字级时间戳，秒），enable_subtitle 时产出 */
  subtitle: [TTSSentencePayload];
  error: [Error];
  close: [];
}

interface Waiter {
  event: TTSEventType;
  resolve: () => void;
  reject: (err: Error) => void;
}

/**
 * 双向流式语音合成客户端（连接级对象，支持跨 session 复用）。
 *
 * 生命周期（文档推荐的连接复用模式）：
 * - ensureConnection()：建连 + StartConnection，已建则跳过
 * - startSession(speaker) → sendText()* → finishSession() 为一轮 session，
 *   结束后连接保留，可再次 startSession
 * - abort()：CancelSession 取消当前 session，连接仍可复用，
 *   取消异常时弃连接
 * - close()：FinishConnection + 断开（空闲回收 / 彻底释放时调用）
 *
 * 同一连接禁止并发 session，由调用方（adapter）串行化
 */
export class VolcengineTTSClient extends EventEmitter<VolcengineTTSEvents> {
  /** 握手响应头中的 X-Tt-Logid，用于向火山排查问题 */
  logId?: string;

  private ws?: WebSocket;
  private speaker?: string;
  private sessionId?: string;
  private connected = false;
  private sessionActive = false;
  private closed = true;
  private waiters: Waiter[] = [];
  private sessionAborted = false;

  constructor(private config: VolcengineTTSConfig) {
    super();
  }

  private get isOpen(): boolean {
    return (
      !!this.ws &&
      this.ws.readyState === WebSocket.OPEN &&
      this.connected &&
      !this.closed
    );
  }

  private buildAuthHeaders(): Record<string, string> {
    const { apiKey, resourceId } = this.config;
    if (!apiKey) {
      throw new Error('volcengine tts auth required: apiKey');
    }
    return {
      'X-Api-Key': apiKey,
      'X-Api-Resource-Id': resourceId,
      'X-Api-Connect-Id': randomUUID(),
    };
  }

  private buildTemplate(): TTSFullRequestPayload {
    return {
      req_params: {
        speaker: this.speaker!,
        audio_params: {
          format: 'pcm',
          sample_rate: 24000,
          enable_subtitle: true,
        },
        // LLM 输出可能含 markdown，必须过滤（false 会把 ** 读成「星星」）
        additions: JSON.stringify({ disable_markdown_filter: true }),
      },
    };
  }

  private send(frame: {
    event: TTSEventType;
    sessionId?: string;
    payload: unknown;
  }): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('volcengine tts client is not connected');
    }
    ws.send(encodeFullClientRequest(frame));
  }

  private waitEvent(event: TTSEventType): Promise<void> {
    return new Promise((resolve, reject) => {
      this.waiters.push({ event, resolve, reject });
    });
  }

  private resolveWaiter(event: TTSEventType): void {
    const idx = this.waiters.findIndex((w) => w.event === event);
    if (idx !== -1) {
      const [waiter] = this.waiters.splice(idx, 1);
      waiter.resolve();
    }
  }

  private rejectWaiters(err: Error): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) waiter.reject(err);
  }

  /** 建连 + StartConnection；连接可用时直接返回（复用） */
  async ensureConnection(): Promise<void> {
    if (this.isOpen) return;
    // 清理半死的旧连接
    this.close();
    await this.connect();
  }

  private async connect(): Promise<void> {
    const ws = new WebSocket(this.config.baseURL, {
      headers: this.buildAuthHeaders(),
      // 服务端帧不严格满足 UTF-8 校验，参照官方 demo 关闭
      skipUTF8Validation: true,
    });
    this.ws = ws;
    this.closed = false;

    // 出生即挂 error 监听：任何阶段（含 CONNECTING 阶段 terminate 触发的
    // abortHandshake error）都有监听者，不会 uncaughtException
    ws.on('error', (err) => {
      logger.warn('volcengine tts ws error: %s', err.message);
    });

    // 记录握手响应头中的 logid，用于排错
    ws.on('upgrade', (res) => {
      this.logId = res.headers['x-tt-logid'] as string | undefined;
      logger.debug({ logId: this.logId }, 'volcengine tts handshake');
    });

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
      const onUnexpectedResponse = async (
        _req: unknown,
        res: IncomingMessage,
      ) => {
        // 建连失败时 Body 中有错误原因说明
        let body = '';
        for await (const chunk of res) body += chunk;
        onError(
          new Error(
            `volcengine tts handshake failed: HTTP ${res.statusCode}${body ? ` ${body}` : ''}`,
          ),
        );
      };
      const onClose = () => {
        cleanup();
        reject(new Error('volcengine tts connection closed before ready'));
      };
      ws.once('open', onOpen);
      ws.once('error', onError);
      ws.once('unexpected-response', onUnexpectedResponse);
      ws.once('close', onClose);
    });

    ws.on('message', (data, isBinary) => {
      // 文本帧主要用于反馈异常错误信息
      if (isBinary) {
        this.handleMessage(data as WebSocket.RawData);
      } else {
        const text = (data as WebSocket.RawData).toString();
        logger.warn({ text }, 'volcengine tts text frame');
        this.emit('error', new Error(`volcengine tts text frame: ${text}`));
      }
    });
    ws.on('error', (err) => {
      this.connected = false;
      this.rejectWaiters(err);
      this.emit('error', err);
    });
    ws.on('close', (code) => {
      this.closed = true;
      this.connected = false;
      this.sessionActive = false;
      this.rejectWaiters(
        new Error(`volcengine tts connection closed: ${code}`),
      );
      logger.debug('volcengine tts connection closed');
      this.emit('close');
    });

    this.send({ event: TTSEventType.StartConnection, payload: {} });
    await this.waitEvent(TTSEventType.ConnectionStarted);
    this.connected = true;
  }

  /** 开启一轮 session（同一连接可多轮，禁止并发） */
  async startSession(speaker: string): Promise<void> {
    if (this.sessionActive) {
      throw new Error('volcengine tts session already active');
    }
    this.sessionAborted = false;
    this.speaker = speaker;
    this.sessionId = randomUUID();
    this.send({
      event: TTSEventType.StartSession,
      sessionId: this.sessionId,
      payload: {
        ...this.buildTemplate(),
        event: TTSEventType.StartSession,
      } satisfies TTSFullRequestPayload,
    });
    await this.waitEvent(TTSEventType.SessionStarted);
    this.sessionActive = true;
    // startSession 在途期间收到的 abort 请求在此补发（否则 CancelSession 会丢失）
    if (this.sessionAborted) void this.abort();
  }

  /** 流式喂一段碎文本（token 级即可，服务端自行缓冲断句） */
  sendText(text: string): void {
    if (!this.sessionActive) {
      throw new Error('volcengine tts session is not active');
    }
    if (!text) return;

    const template = this.buildTemplate();
    this.send({
      event: TTSEventType.TaskRequest,
      sessionId: this.sessionId,
      payload: {
        ...template,
        req_params: { ...template.req_params, text },
        event: TTSEventType.TaskRequest,
      } satisfies TTSFullRequestPayload,
    });
  }

  /** 文本喂完：FinishSession，收完全部音频；连接保留供下轮复用 */
  async finishSession(): Promise<void> {
    if (!this.sessionActive) return;
    this.sessionActive = false;
    this.send({
      event: TTSEventType.FinishSession,
      sessionId: this.sessionId,
      payload: {},
    });
    await this.waitEvent(TTSEventType.SessionFinished);
    logger.debug('volcengine tts session finished');
  }

  /**
   * 取消当前 session（barge-in 路径）。文档：收到 SessionCanceled 后
   * 重新 StartSession 即可继续合成，连接仍可复用；取消异常则弃连接
   */
  async abort(): Promise<void> {
    this.sessionAborted = true;
    if (!this.sessionActive) return;
    this.sessionActive = false;
    try {
      logger.debug('volcengine tts cancel session');
      this.send({
        event: TTSEventType.CancelSession,
        sessionId: this.sessionId,
        payload: {},
      });
      await Promise.race([
        this.waitEvent(TTSEventType.SessionCanceled),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('volcengine tts cancel timeout'));
          }, 2000).unref();
        }),
      ]);
    } catch {
      this.close();
    }
  }

  /** 断开连接（空闲回收 / 彻底释放）：FinishConnection 尽力而为，随后 close，不等其回执 */
  close(): void {
    if (!this.ws || this.closed) return;

    if (this.ws.readyState === WebSocket.OPEN && this.connected) {
      try {
        this.send({ event: TTSEventType.FinishConnection, payload: {} });
      } catch {}
    }

    logger.debug('volcengine close connection');
    this.ws.close();
  }

  private handleMessage(data: WebSocket.RawData): void {
    const raw = Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.isBuffer(data)
        ? data
        : Buffer.from(data as ArrayBuffer);

    let msg: TTSServerMessage;
    try {
      msg = decodeServerMessage(raw);
    } catch (err) {
      this.emit('error', new Error(`failed to parse tts response: ${err}`));
      return;
    }

    if (msg.type === TTSMessageType.Error) {
      const err = new TTSServerError(
        msg.errorCode ?? -1,
        msg.payloadMsg ?? msg.payload.toString('utf8'),
      );
      this.rejectWaiters(err);
      this.emit('error', err);
      return;
    }

    if (msg.type === TTSMessageType.AudioOnlyServer) {
      if (msg.payload.length > 0) this.emit('audio', msg.payload);
      return;
    }

    if (msg.type === TTSMessageType.FrontEndResultServer) {
      logger.debug(
        { payload: msg.payloadMsg },
        'volcengine tts frontend result',
      );
      return;
    }

    switch (msg.event) {
      case TTSEventType.ConnectionStarted:
      case TTSEventType.SessionStarted:
      case TTSEventType.SessionFinished:
      case TTSEventType.ConnectionFinished:
      case TTSEventType.SessionCanceled: {
        // 负载形如 {status_code, message, usage?}，20000000 才是成功
        const code = (msg.payloadMsg as { status_code?: number } | undefined)
          ?.status_code;
        if (typeof code === 'number' && code !== TTS_SUCCESS_CODE) {
          const err = new TTSServerError(code, msg.payloadMsg);
          this.rejectWaiters(err);
          this.emit('error', err);
          break;
        }
        this.resolveWaiter(msg.event!);
        break;
      }
      case TTSEventType.ConnectionFailed:
      case TTSEventType.SessionFailed: {
        const code = (msg.payloadMsg as { status_code?: number } | undefined)
          ?.status_code;
        const err = new TTSServerError(code ?? -1, msg.payloadMsg);
        this.rejectWaiters(err);
        this.emit('error', err);
        break;
      }
      case TTSEventType.TTSSentenceStart:
        this.emit(
          'sentenceStart',
          (msg.payloadMsg ?? {}) as TTSSentencePayload,
        );
        break;
      case TTSEventType.TTSSentenceEnd:
        this.emit('sentenceEnd', (msg.payloadMsg ?? {}) as TTSSentencePayload);
        break;
      case TTSEventType.TTSSubtitle:
        this.emit('subtitle', (msg.payloadMsg ?? {}) as TTSSentencePayload);
        break;
      case TTSEventType.UsageResponse:
        logger.debug({ usage: msg.payloadMsg }, 'volcengine tts usage');
        break;
      default:
        logger.debug(
          {
            type: msg.type,
            flag: msg.flag,
            event: msg.event,
            payload: msg.payload.toString('utf8').slice(0, 500),
          },
          'volcengine tts unhandled event',
        );
    }
  }
}
