import { Buffer } from 'node:buffer';
import { Deque } from '@datastructures-js/deque';
import { logger } from '@/utils/logger';
import { Agent } from '@/agent/agent';
import { toPCM16Bytes } from '@/audio/pcm16';

interface Subtitle {
  text: string;
  startTimeMs: number;
}

/**
 * 一轮对话：从一次语音段或文本输入开始，到 LLM 生成、TTS 合成、播放缓冲耗尽为止。
 * 播放状态全部挂在轮上：新轮开始即打断上一轮，其未播缓冲随之整体废弃，
 * 不存在跨轮残留音频，也无须显式清空
 */
interface Round {
  controller: AbortController;

  transcribeResult?: string;

  audioQueue: Deque<Uint8Array>;
  audioBytes: number;

  pendingSubtitles: Subtitle[];

  playTime: number;
}

export class Session {
  private round?: Round;

  private destroyed = false;

  constructor(
    segments: ReadableStream<ReadableStream<Float32Array>>,
    private agent: Agent,
  ) {
    this.consume(segments).catch(console.error);
  }

  /**
   * 开始新一轮：abort 上一轮（LLM 停止生成、TTS CancelSession、
   * 其播放缓冲废弃，tick 因无音频自然下发 tts stop）
   */
  private beginRound(): Round {
    this.round?.controller.abort();
    const round: Round = {
      controller: new AbortController(),
      audioQueue: new Deque(),
      audioBytes: 0,
      pendingSubtitles: [],
      playTime: 0,
    };
    this.round = round;
    return round;
  }

  private async consume(streams: ReadableStream<ReadableStream<Float32Array>>) {
    try {
      for await (const vadStream of streams) {
        if (this.destroyed) break;

        logger.debug('voice detected');

        const round = this.beginRound();
        const { signal } = round.controller;

        void (async () => {
          if (signal.aborted) return;

          const pcm = vadStream.pipeThrough(toPCM16Bytes());

          try {
            const text = (await this.agent.transcribe(pcm)).trim();
            if (signal.aborted || !text) return;

            logger.debug({ text }, 'transcribe');
            round.transcribeResult = text;

            await this.runRound(round, text);
          } catch (err) {
            if (!signal.aborted) logger.warn({ err }, 'round failed');
          }
        })();
      }
    } catch {
      // 段流错误即终止消费
    }
  }

  /** 文本输入入口（客户端 listen/detect）：与语音段同等开启新一轮 */
  async handleTextInput(input: string) {
    const round = this.beginRound();
    try {
      await this.runRound(round, input);
    } catch (err) {
      if (!round.controller.signal.aborted) {
        logger.warn({ err }, 'round failed');
      }
    }
  }

  private async runRound(round: Round, input: string) {
    const { signal } = round.controller;

    const { textStream } = await this.agent.generate(input, {
      abortSignal: signal,
    });

    const outputAudioStream = this.agent.speak({
      input: textStream,
      voice: this.agent.voice,
      format: 'pcm',
      sampleRate: 24000,
      abortSignal: signal,
    });

    for await (const chunk of outputAudioStream) {
      switch (chunk.type) {
        case 'audio':
          round.audioQueue.pushBack(chunk.data);
          round.audioBytes += chunk.data.length;
          break;
        case 'subtitle':
          const text = chunk.text.trim();
          if (text) {
            const first = text.slice(0, 1);
            const rest = text.slice(1);
            if ('，。！”'.includes(first)) {
              if (round.pendingSubtitles.length) {
                round.pendingSubtitles[
                  round.pendingSubtitles.length - 1
                ].text += first;
              }
              if (rest) {
                round.pendingSubtitles.push({ ...chunk, text: rest });
              }
            } else {
              round.pendingSubtitles.push(chunk);
            }
          }
          break;
      }
    }
  }

  pull(durationMs: number) {
    const round = this.round;
    if (!round) {
      return {
        audio: undefined,
        subtitle: undefined,
        transcribeResult: undefined,
      };
    }

    const transcribeResult = round.transcribeResult;
    delete round.transcribeResult;

    const sampleRate = 24000;
    const channels = 1;
    const sampleBytes = 2; // 16 位
    const samples = Math.ceil(
      sampleRate * (durationMs / 1000) * channels * sampleBytes,
    );

    let audio: Uint8Array | undefined;
    if (round.audioBytes >= samples) {
      let needed = samples;
      const chunks: Uint8Array[] = [];
      while (needed > 0) {
        const chunk = round.audioQueue.popFront()!;
        if (chunk.length > needed) {
          chunks.push(chunk.subarray(0, needed));
          round.audioQueue.pushFront(chunk.subarray(needed));
          round.audioBytes -= needed;
          needed = 0;
        } else {
          chunks.push(chunk);
          round.audioBytes -= chunk.length;
          needed -= chunk.length;
        }
      }
      audio = Buffer.concat(chunks);
      round.playTime += durationMs;
    }

    let subtitle: string | undefined;
    while (round.pendingSubtitles.length) {
      const _subtitle = round.pendingSubtitles[0];
      if (!_subtitle || _subtitle.startTimeMs > round.playTime) break;
      subtitle = _subtitle.text.trim();
      round.pendingSubtitles.shift();
    }

    return {
      audio,
      subtitle,
      transcribeResult,
    };
  }

  bargeIn() {
    this.beginRound();
  }

  destroy() {
    this.destroyed = true;
    this.round?.controller.abort();
  }
}
