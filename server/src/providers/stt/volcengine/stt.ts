import {
  TranscribeIdleTimeout,
  type STT,
  type TranscribeOptions,
} from '@/agent/stt';
import { VolcengineAsrClient } from './client';
import type { VolcengineAsrConfig } from './types';

const DEFAULT_IDLE_TIMEOUT_MS = 1000;

export class VolcengineSTT implements STT {
  private clients = new Set<VolcengineAsrClient>();

  constructor(private config: VolcengineAsrConfig) {}

  async transcribe(
    input: ReadableStream<Uint8Array>,
    options?: TranscribeOptions,
  ): Promise<string> {
    const idleTimeoutMs = options?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    const client = new VolcengineAsrClient(this.config);
    this.clients.add(client);

    let lastText = '';
    let settled = false;
    /** 进入 finish 后连接关闭属于正常收尾，此前关闭视为异常 */
    let finishing = false;
    let idleTimer: NodeJS.Timeout | undefined;

    return new Promise<string>((resolve, reject) => {
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(idleTimer);
        this.clients.delete(client);
        fn();
      };

      client.on('result', (result) => {
        lastText = result.text ?? '';
      });
      client.on('error', (err) =>
        settle(() => {
          client.close();
          reject(err);
        }),
      );
      client.on('close', () =>
        settle(() => {
          if (finishing) {
            resolve(lastText);
          } else {
            reject(new Error('volcengine asr connection closed before finish'));
          }
        }),
      );

      const idle = () =>
        new Promise<'idle'>((r) => {
          idleTimer = setTimeout(() => r('idle'), idleTimeoutMs);
        });

      void (async () => {
        const reader = input.getReader();
        let endedByIdle = false;
        try {
          // 音频约定：pcm16le 16k mono
          await client.start({
            format: 'pcm',
            rate: 16000,
            bits: 16,
            channel: 1,
          });
          let sentAny = false;
          for (;;) {
            const chunk = await Promise.race([reader.read(), idle()]);
            clearTimeout(idleTimer);
            if (chunk === 'idle') {
              endedByIdle = true;
              break;
            }
            if (chunk.done) break;
            client.sendAudio(Buffer.from(chunk.value));
            sentAny = true;
          }
          if (!sentAny) {
            // 没有任何音频，不必请求服务端（会报空音频错误）
            client.close();
            settle(() => resolve(''));
            return;
          }
          finishing = true;
          await client.finish();
          settle(() => resolve(lastText));
        } catch (err) {
          client.close();
          settle(() =>
            reject(err instanceof Error ? err : new Error(String(err))),
          );
        } finally {
          await reader
            .cancel(
              endedByIdle
                ? new TranscribeIdleTimeout(idleTimeoutMs)
                : undefined,
            )
            .catch(() => {});
        }
      })();
    });
  }

  destroy() {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
  }
}
