/**
 * Float32 语音块 → PCM16 LE 字节块（raw 编码用）。
 *
 * 逐块无状态换算，可 pipeThrough 到任意 Float32 流后使用：
 *   stream.pipeThrough(toPcm16Bytes()).pipeTo(sink)
 *
 * 非对称缩放：负向 ×0x8000、正向 ×0x7fff，避免 -1 映射溢出回绕
 */
export function toPCM16Bytes(): TransformStream<Float32Array, Uint8Array> {
  return new TransformStream<Float32Array, Uint8Array>({
    transform(chunk, controller) {
      const pcm = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      // Int16Array 为全新分配（byteOffset=0），可零拷贝作字节视图
      controller.enqueue(new Uint8Array(pcm.buffer));
    },
  });
}
