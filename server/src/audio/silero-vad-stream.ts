// 全局面 Transformer 类型缺 cancel 声明，用 node:stream/web 的完整类型
import type { Transformer } from 'node:stream/web';
import { SILERO_VAD_FRAME_SIZE, type SileroVadDetector } from './silero-vad';

const SAMPLE_RATE = 16_000;

const DEFAULT_THRESHOLD = 0.5;
const DEFAULT_MIN_SILENCE_MS = 100;
const DEFAULT_SPEECH_PAD_MS = 30;

/** 待切帧缓冲容量，默认 4096 采样（16k 下 256ms，8 个 512 采样帧） */
const DEFAULT_PENDING_CAPACITY_SAMPLES = 4096;

export interface SileroVadStreamOptions {
  /**
   * 语音判定阈值，默认 0.5。
   * 判停线为 threshold - 0.15（官方 VADIterator 逻辑，下限 0.01）
   */
  threshold?: number;

  /** 静音持续多久判停，默认 100ms */
  minSilenceDurationMs?: number;

  /** 语音起点向前 padding，默认 30ms */
  speechPadMs?: number;
}

/**
 * 进行中的语音流：生产者侧封装。
 * 语音起点即交付，后续帧实时 push，判停时 close。
 * 消费方中途 cancel 后流不可再用，push 会抛错，写入侧据此废弃该段
 */
class SpeechSegment {
  readonly stream: ReadableStream<Float32Array>;

  #controller!: ReadableStreamDefaultController<Float32Array>;

  constructor(readonly startSample: number) {
    this.stream = new ReadableStream<Float32Array>({
      start: (controller) => {
        this.#controller = controller;
      },
    });
  }

  push(frame: Float32Array) {
    this.#controller.enqueue(frame);
  }

  close() {
    try {
      this.#controller.close();
    } catch {
      // 流已被消费方取消等场景：目标本就是关闭，忽略
    }
  }

  error(err: unknown) {
    try {
      this.#controller.error(err);
    } catch {
      // 同上
    }
  }
}

/**
 * 语音段切分流：输入任意长度 16k mono Float32 音频块，
 * 内部按 512 采样切帧过 VAD，语音起点即输出一路实时语音流，
 * 消费方可边说边读（如喂给流式 STT），判停后该流关闭
 * （尾部含 ≤minSilenceDurationMs 的静音）。
 *
 * 非语音音频被丢弃；说话中途流关闭则强制收尾关闭未完流
 */
export function createSileroVadStream(
  detector: SileroVadDetector,
  options: SileroVadStreamOptions = {},
): TransformStream<Float32Array, ReadableStream<Float32Array>> {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const negativeThreshold = Math.max(threshold - 0.15, 0.01);
  const minSilenceSamples = Math.round(
    (SAMPLE_RATE * (options.minSilenceDurationMs ?? DEFAULT_MIN_SILENCE_MS)) /
      1000,
  );
  const speechPadSamples = Math.round(
    (SAMPLE_RATE * (options.speechPadMs ?? DEFAULT_SPEECH_PAD_MS)) / 1000,
  );

  /*
   * 待切帧缓冲：固定容量，写入侧循环复用。
   * 每次只写入「空闲量」与「块剩余」的较小值，随即排空整帧再继续，
   * 因此任意大小的输入块都被自然分片，缓冲永不扩容、内存占用恒定
   */
  const pendingCapacity = DEFAULT_PENDING_CAPACITY_SAMPLES;
  const pending = new Float32Array(pendingCapacity);
  let pendingLength = 0;

  /*
   * 最近音频滚动缓冲（pad + 一帧），
   * 语音起点要回溯 speechPad，而触发帧已经出结果，只能回头看
   */
  const recentCapacity = speechPadSamples + SILERO_VAD_FRAME_SIZE;
  const recent = new Float32Array(recentCapacity);

  /** 已过模型的样本数 */
  let currentSample = 0;
  /** 当前进行中的语音流，null = 无语音 */
  let current: SpeechSegment | null = null;
  /** 0 表示无判停候选，否则为首个低概率帧的结束位置 */
  let tempEnd = 0;

  const consumePending = (count: number) => {
    pending.copyWithin(0, count, pendingLength);
    pendingLength -= count;
  };

  /**
   * 过模型一帧并推进状态机。
   * streamLength 是发给语音流的真实样本数（flush 补零帧小于整帧）
   */
  const processFrame = async (
    frame: Float32Array,
    controller: TransformStreamDefaultController<ReadableStream<Float32Array>>,
    streamLength: number = SILERO_VAD_FRAME_SIZE,
  ): Promise<void> => {
    const probability = await detector.detect(frame);

    currentSample += SILERO_VAD_FRAME_SIZE;

    recent.copyWithin(0, SILERO_VAD_FRAME_SIZE);
    recent.set(frame, recentCapacity - SILERO_VAD_FRAME_SIZE);

    // 判停候选期内语音恢复，取消候选
    if (probability >= threshold && tempEnd !== 0) {
      tempEnd = 0;
    }

    // 进行中的语音流：当前帧拷贝后流出
    // （frame 是 pending 的视图，consumePending 会原地移位覆盖，必须 copy）
    if (current) {
      // 消费方中途取消（如 STT idle 判停/出错后 cancel input）使 enqueue 抛错：
      // 段已废弃，复位语音状态，之后的语音经下方起点检查另起新段
      try {
        current.push(frame.slice(0, streamLength));
      } catch {
        current = null;
        tempEnd = 0;
      }
    }

    // 语音起点：回溯 pad 窗口，立即交付语音流
    if (probability >= threshold && !current) {
      current = new SpeechSegment(
        Math.max(0, currentSample - speechPadSamples - SILERO_VAD_FRAME_SIZE),
      );
      const need = currentSample - current.startSample;
      current.push(recent.slice(recentCapacity - need));
      controller.enqueue(current.stream);
    }

    // 判停：关闭语音流（尾部含判停等待期的静音）
    if (probability < negativeThreshold && current) {
      if (tempEnd === 0) {
        tempEnd = currentSample;
      }
      if (currentSample - tempEnd >= minSilenceSamples) {
        current.close();
        current = null;
        tempEnd = 0;
      }
    }
  };

  /** 模型出错时同步终止进行中的语音流，再向外抛 */
  const processFrameSafe = async (
    frame: Float32Array,
    controller: TransformStreamDefaultController<ReadableStream<Float32Array>>,
    streamLength?: number,
  ): Promise<void> => {
    try {
      await processFrame(frame, controller, streamLength);
    } catch (err) {
      current?.error(err);
      current = null;
      throw err;
    }
  };

  const transformer: Transformer<Float32Array, ReadableStream<Float32Array>> = {
    async transform(chunk, controller) {
      let offset = 0;
      while (offset < chunk.length) {
        // 排空循环保证 pendingLength < FRAME_SIZE ≤ capacity，空闲量恒 > 0
        const free = pendingCapacity - pendingLength;
        const n = Math.min(free, chunk.length - offset);
        pending.set(chunk.subarray(offset, offset + n), pendingLength);
        pendingLength += n;
        offset += n;

        while (pendingLength >= SILERO_VAD_FRAME_SIZE) {
          const frame = pending.subarray(0, SILERO_VAD_FRAME_SIZE);
          await processFrameSafe(frame, controller);
          consumePending(SILERO_VAD_FRAME_SIZE);
        }
      }
    },

    async flush(controller) {
      // 剩余不足一帧的尾巴，补零过一次模型（与官方离线实现一致），
      // 语音流只收真实样本，不含补零尾巴
      if (pendingLength > 0) {
        const frame = new Float32Array(SILERO_VAD_FRAME_SIZE);
        frame.set(pending.subarray(0, pendingLength));
        const streamLength = pendingLength;
        pendingLength = 0;
        await processFrameSafe(frame, controller, streamLength);
      }

      // 说话中途流关闭，强制收尾未完流
      current?.close();
      current = null;
    },

    // 下游放弃消费：关闭进行中的语音流，避免悬挂
    cancel() {
      current?.close();
      current = null;
    },
  };

  /*
   * 段句柄是轻量对象，外层 HWM 取最小安全值 2：
   * - =1 时第二段一入队就武装背压，"实时消费当前段"的正常消费者
   *   会被卡死（背压标志只在消费者发出新 read 且队列空时释放）；
   * - =2 给实时消费留一格缓冲余量，正常消费模式下标志永不武装。
   * 注意这层防护不覆盖"彻底不读外层"的消费者——外层 read 循环
   * 不能被内层消费阻塞，那是消费方的约定
   */
  return new TransformStream<Float32Array, ReadableStream<Float32Array>>(
    transformer,
    undefined,
    new CountQueuingStrategy({ highWaterMark: 2 }),
  );
}
