import path from 'node:path';
import * as ort from 'onnxruntime-node';
import {
  createSileroVadStream,
  type SileroVadStreamOptions,
} from './silero-vad-stream';

const CONTEXT_SIZE = 64;
const STATE_DIMS = [2, 1, 128] as const;

/**
 * v6 模型 @16k 唯一支持的流式帧长：512 采样 = 32ms。
 * 官方 OnnxWrapper 硬校验：其他长度直接 raise，
 * 且要求每块 >= 32ms（sr / samples <= 31.25）
 */
export const SILERO_VAD_FRAME_SIZE = 512;

const INPUT_SIZE = CONTEXT_SIZE + SILERO_VAD_FRAME_SIZE;

/**
 * 共享 ONNX 会话，每进程创建一个即可。
 * https://github.com/snakers4/silero-vad
 */
export class SileroVad {
  private constructor(private readonly session: ort.InferenceSession) {}

  static async create(modelPath?: string): Promise<SileroVad> {
    modelPath ??= path.resolve(process.cwd(), 'models/silero_vad.onnx');

    const session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],

      // Silero VAD 是很小的模型，
      // 并发来自多个 detector，而不是并行化一次小推理
      intraOpNumThreads: 1,
      interOpNumThreads: 1,
      executionMode: 'sequential',

      graphOptimizationLevel: 'all',
    });

    return new SileroVad(session);
  }

  /** 创建一路音频流的检测器，用完即弃 */
  createDetector(): SileroVadDetector {
    return new SileroVadDetector(this.session);
  }

  /**
   * 创建语音段切分流：输入任意长度 Float32 音频块，
   * 语音起点即输出一路实时语音流，判停后关闭；非语音音频被丢弃
   */
  createStream(
    options?: SileroVadStreamOptions,
  ): TransformStream<Float32Array, ReadableStream<Float32Array>> {
    return createSileroVadStream(this.createDetector(), options);
  }

  [Symbol.asyncDispose]() {
    return this.session.release();
  }
}

/**
 * 帧级语音概率检测器。
 *
 * 内含 RNN 隐状态与 64 采样 context，detect() 不是纯函数：
 * 同一实例必须 await 上一帧完成后再喂下一帧，不同实例互不影响
 */
export class SileroVadDetector {
  /** [64 采样 context][当前帧] */
  private readonly inputData = new Float32Array(INPUT_SIZE);

  private readonly inputTensor: ort.Tensor;
  private readonly context = new Float32Array(CONTEXT_SIZE);

  private readonly sampleRateTensor = new ort.Tensor(
    'int64',
    new BigInt64Array([16000n]),
    [],
  );

  private stateTensor: ort.Tensor;

  constructor(private readonly session: ort.InferenceSession) {
    this.inputTensor = new ort.Tensor('float32', this.inputData, [
      1,
      INPUT_SIZE,
    ]);

    this.stateTensor = new ort.Tensor(
      'float32',
      new Float32Array(2 * 1 * 128),
      [...STATE_DIMS],
    );
  }

  /**
   * 喂一帧音频，返回语音概率 0~1。
   *
   * frame 必须恰好 SILERO_VAD_FRAME_SIZE 采样，
   * 16kHz mono Float32，通常归一化到 [-1, 1]
   */
  async detect(frame: Float32Array): Promise<number> {
    if (frame.length !== SILERO_VAD_FRAME_SIZE) {
      throw new RangeError(
        `Expected ${SILERO_VAD_FRAME_SIZE} samples, got ${frame.length}`,
      );
    }

    this.inputData.set(this.context, 0);
    this.inputData.set(frame, CONTEXT_SIZE);

    const outputs = await this.session.run({
      input: this.inputTensor,
      state: this.stateTensor,
      sr: this.sampleRateTensor,
    });

    // 优先官方输出名，否则按位置取（概率在第一、状态在第二）
    const prob = outputs.output ?? outputs[Object.keys(outputs)[0]];
    const state = outputs.stateN ?? outputs[Object.keys(outputs)[1]];

    this.stateTensor = state;
    this.context.set(this.inputData.subarray(SILERO_VAD_FRAME_SIZE));

    return Number(prob.data[0]);
  }
}
