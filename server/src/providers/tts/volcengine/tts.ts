import { type SpeakOptions, type TTS, type TTSChunk } from '@/agent/tts';
import { logger } from '@/utils/logger';
import { VolcengineTTSClient } from './client';
import { type VolcengineTTSConfig, type TTSSentencePayload } from './types';

/** 连接空闲回收默认时长（可经 config.idleTimeoutMs 覆盖） */
export const DEFAULT_TTS_IDLE_TIMEOUT_MS = 20_000;

/**
 * 句负载 → 字幕 cue（一整句一个）。
 * 时间戳取句内首/尾词边界——volcengine 仅返回词级、单位秒
 */
function toSubtitle(payload: TTSSentencePayload): TTSChunk | undefined {
  const words = payload.words ?? [];
  const first = words[0];
  const last = words[words.length - 1];
  if (!first || !last || typeof payload.text !== 'string') return undefined;
  return {
    type: 'subtitle',
    text: payload.text,
    startTimeMs: first.startTime * 1000,
    endTimeMs: last.endTime * 1000,
  };
}

/** 池条目：连接 + 其空闲回收定时器 + 健康标记 */
interface PooledClient {
  client: VolcengineTTSClient;
  idleTimer?: NodeJS.Timeout;
  /** 出错/断开后置位，归还池时据此拒绝 */
  dropped: boolean;
}

export class VolcengineTTS implements TTS {
  private clients = new Set<VolcengineTTSClient>();

  /** 空闲连接池：并发合成各自 checkout 一条连接，session 结束归还，空闲超时回收 */
  private pool: PooledClient[] = [];

  constructor(private config: VolcengineTTSConfig) {}

  /**
   * 消费 input 碎文本流，实时产出音频/字幕。
   *
   * 连接池：多个 Agent 可共享同一 provider，并发 speak 各取一条连接；
   * session 结束归还池中，空闲 idleTimeoutMs 后断开（文档推荐的连接复用模式）。
   *
   * 结束路径：
   * - input 关闭 → FinishSession → 流正常关闭（连接归还池）
   * - abortSignal 中止 → CancelSession（barge-in），流同样正常关闭，连接归还池
   * - 流被消费方 cancel → 摘监听 + 兜底 CancelSession + 归还
   *   （契约：同时须经 abortSignal 或关闭 input 停止 pump 消费）
   * - 失败 → 流 error，弃连接（下次 speak 重新建连）
   */
  speak({ input, voice, abortSignal }: SpeakOptions): ReadableStream<TTSChunk> {
    const pooled = this.acquire();
    const { client } = pooled;

    /** 结束裁决（close/error/cancel 先到者生效），之后一切产出与报错 no-op */
    let settled = false;
    /** 收尾幂等：流 cancel 与 pump finally 双入口 */
    let done = false;
    /** 真错误（非 abort 取消）标记：决定连接归还还是丢弃 */
    let failed = false;
    /** pump 是否已收尾；未收尾的提前终止需要兜底 CancelSession */
    let pumpDone = false;

    let controller: ReadableStreamDefaultController<TTSChunk> | undefined;

    const closeOutput = () => {
      if (settled) return;
      settled = true;
      controller?.close();
    };
    const errorOutput = (err: unknown) => {
      if (settled) return;
      settled = true;
      controller?.error(err);
    };
    const enqueue = (chunk: TTSChunk) => {
      if (!settled) controller?.enqueue(chunk);
    };

    const onAbort = () => void client.abort();
    abortSignal?.addEventListener('abort', onAbort, { once: true });

    const onAudio = (chunk: Buffer) => {
      enqueue({ type: 'audio', data: chunk });
    };
    const onSubtitle = (payload: TTSSentencePayload) => {
      const subtitle = toSubtitle(payload);
      if (subtitle) enqueue(subtitle);
    };
    const onError = (err: Error) => {
      if (settled) return; // 迟到错误不改变结局
      if (abortSignal?.aborted) return; // abort 取消路径：连接保留归还池
      failed = true;
      logger.warn({ err }, 'volcengine tts session error');
      errorOutput(err);
    };

    client.on('audio', onAudio);
    client.on('subtitle', onSubtitle);
    client.on('error', onError);

    /** 收尾（幂等）：摘监听 + 连接处置 */
    const teardown = () => {
      if (done) return;
      done = true;
      abortSignal?.removeEventListener('abort', onAbort);
      client.off('audio', onAudio);
      client.off('subtitle', onSubtitle);
      client.off('error', onError);
      if (failed) this.drop(pooled);
      else this.release(pooled);
    };

    // pump：消费 input 驱动合成，与流产出并发
    void (async () => {
      try {
        // 信号可能在监听注册前就已中止（如 barge-in 落在 generate 的 await 窗口），
        // 此时 onAbort 不会触发，必须先检查再开 session
        if (abortSignal?.aborted) throw new Error('volcengine tts aborted');
        await client.ensureConnection();
        await client.startSession(voice);
        for await (const text of input) {
          if (abortSignal?.aborted) throw new Error('volcengine tts aborted');
          client.sendText(text);
        }
        await client.finishSession();
        closeOutput();
      } catch (err) {
        if (abortSignal?.aborted) {
          logger.debug('volcengine tts session aborted');
          // 兜底取消：onAbort 未必送达（信号先于监听注册已中止、
          // 或 abort 落在 startSession 在途窗口），此处幂等补发
          await client.abort();
          closeOutput();
        } else {
          failed = true;
          logger.warn({ err }, 'volcengine tts session failed');
          errorOutput(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        pumpDone = true;
        teardown();
      }
    })();

    return new ReadableStream<TTSChunk>({
      start: (c) => {
        controller = c;
      },
      cancel() {
        settled = true; // 消费方终止：之后产出/报错一律 no-op
        if (!pumpDone) void client.abort();
        teardown();
      },
    });
  }

  destroy() {
    for (const entry of this.pool) {
      entry.dropped = true;
      clearTimeout(entry.idleTimer);
    }
    for (const client of this.clients) {
      void client.abort();
      client.close();
    }
    logger.debug(
      'volcengine tts destroyed, closed %d clients',
      this.clients.size,
    );
    this.pool = [];
    this.clients.clear();
  }

  /** 从池取空闲连接，没有则新建；连接级 error/close 监听在此挂载 */
  private acquire(): PooledClient {
    const pooled = this.pool.shift();
    if (pooled) {
      clearTimeout(pooled.idleTimer);
      logger.debug('volcengine tts connection reused from pool');
      return pooled;
    }

    const client = new VolcengineTTSClient(this.config);
    this.clients.add(client);
    const entry: PooledClient = { client, dropped: false };
    // 池级监听：任何时刻错误/断开都弃连接
    client.on('error', (err) => {
      logger.warn({ err }, 'volcengine tts pooled client error, dropping');
      this.drop(entry);
    });
    client.on('close', () => this.drop(entry));
    logger.debug('volcengine tts connection created');
    return entry;
  }

  /** 归还健康连接入池并武装空闲回收；已弃连接不归还 */
  private release(pooled: PooledClient): void {
    if (pooled.dropped) return;
    const idleMs = this.config.idleTimeoutMs ?? DEFAULT_TTS_IDLE_TIMEOUT_MS;
    pooled.idleTimer = setTimeout(() => {
      logger.debug({ idleMs }, 'volcengine tts connection idle, closing');
      this.drop(pooled);
    }, idleMs);
    this.pool.push(pooled);
  }

  /** 弃连接：出池、清定时器、断开；幂等（close/error 事件会重复触发） */
  private drop(pooled: PooledClient): void {
    this.clients.delete(pooled.client);
    if (pooled.dropped) return;
    pooled.dropped = true;
    clearTimeout(pooled.idleTimer);
    const i = this.pool.indexOf(pooled);
    if (i >= 0) this.pool.splice(i, 1);
    logger.debug('volcengine tts connection dropped');
    pooled.client.close();
  }
}
