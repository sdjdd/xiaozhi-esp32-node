import { gzipSync, gunzipSync } from 'node:zlib';

export const PROTOCOL_VERSION = 0b0001;
export const HEADER_SIZE = 1; // 以 4 字节为单位

export enum MessageType {
  ClientFullRequest = 0b0001,
  ClientAudioOnlyRequest = 0b0010,
  ServerFullResponse = 0b1001,
  ServerErrorResponse = 0b1111,
}

export enum MessageFlags {
  NoSequence = 0b0000,
  PosSequence = 0b0001,
  NegSequence = 0b0010,
  NegWithSequence = 0b0011,
}

export enum SerializationType {
  None = 0b0000,
  Json = 0b0001,
}

export enum CompressionType {
  None = 0b0000,
  Gzip = 0b0001,
}

function buildHeader(
  messageType: MessageType,
  flags: MessageFlags,
  serialization: SerializationType,
  compression: CompressionType,
): Buffer {
  const header = Buffer.alloc(4);
  header[0] = (PROTOCOL_VERSION << 4) | HEADER_SIZE;
  header[1] = (messageType << 4) | flags;
  header[2] = (serialization << 4) | compression;
  header[3] = 0x00;
  return header;
}

/** FullClientRequest：header + int32 seq + uint32 size + gzip(json 负载) */
export function buildFullClientRequest(seq: number, payload: unknown): Buffer {
  const compressed = Buffer.from(
    gzipSync(Buffer.from(JSON.stringify(payload), 'utf-8')),
  );

  const request = Buffer.alloc(4 + 4 + 4);
  buildHeader(
    MessageType.ClientFullRequest,
    MessageFlags.PosSequence,
    SerializationType.Json,
    CompressionType.Gzip,
  ).copy(request);
  request.writeInt32BE(seq, 4);
  request.writeUInt32BE(compressed.length, 8);

  return Buffer.concat([request, compressed]);
}

/** AudioOnlyRequest：header + int32 seq（末包为负）+ uint32 size + gzip(audio) */
export function buildAudioOnlyRequest(
  seq: number,
  audio: Buffer,
  isLast = false,
): Buffer {
  const compressed = Buffer.from(gzipSync(audio));

  const request = Buffer.alloc(4 + 4 + 4);
  buildHeader(
    MessageType.ClientAudioOnlyRequest,
    isLast ? MessageFlags.NegWithSequence : MessageFlags.PosSequence,
    SerializationType.None,
    CompressionType.Gzip,
  ).copy(request);
  request.writeInt32BE(isLast ? -seq : seq, 4);
  request.writeUInt32BE(compressed.length, 8);

  return Buffer.concat([request, compressed]);
}

export interface AsrProtocolResponse {
  messageType: MessageType;
  sequence: number;
  isLast: boolean;
  event?: number;
  errorCode: number;
  payloadSize: number;
  payloadMsg?: unknown;
}

/** 解析服务端二进制响应帧 */
export function parseResponse(data: Buffer): AsrProtocolResponse {
  const headerSize = data[0] & 0x0f;
  const messageType = data[1] >> 4;
  const flags = data[1] & 0x0f;
  const serialization = data[2] >> 4;
  const compression = data[2] & 0x0f;

  let offset = headerSize * 4;
  let sequence = 0;
  let isLast = false;
  let event: number | undefined;

  if (flags & 0b0001) {
    sequence = data.readInt32BE(offset);
    offset += 4;
  }
  if (flags & 0b0010) {
    isLast = true;
  }
  if (flags & 0b0100) {
    event = data.readInt32BE(offset);
    offset += 4;
  }

  let errorCode = 0;
  let payload: Buffer;
  if (messageType === MessageType.ServerFullResponse) {
    const payloadSize = data.readUInt32BE(offset);
    payload = data.subarray(offset + 4, offset + 4 + payloadSize);
  } else if (messageType === MessageType.ServerErrorResponse) {
    errorCode = data.readInt32BE(offset);
    const payloadSize = data.readUInt32BE(offset + 4);
    payload = data.subarray(offset + 8, offset + 8 + payloadSize);
  } else {
    payload = data.subarray(offset);
  }

  if (compression === CompressionType.Gzip && payload.length > 0) {
    payload = gunzipSync(payload);
  }

  let payloadMsg: unknown;
  if (serialization === SerializationType.Json && payload.length > 0) {
    const text = payload.toString('utf-8');
    try {
      payloadMsg = JSON.parse(text);
    } catch {
      // 服务端错误响应可能是纯文本，保留原文便于排查
      payloadMsg = text;
    }
  }

  return {
    messageType,
    sequence,
    isLast,
    event,
    errorCode,
    payloadSize: payload.length,
    payloadMsg,
  };
}
