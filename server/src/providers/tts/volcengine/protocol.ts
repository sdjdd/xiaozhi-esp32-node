import { gunzipSync } from 'node:zlib';

/**
 * 双向流式 TTS WebSocket 二进制协议（帧格式参照官方 bidirection demo）。
 * https://docs.volcengine.com/docs/DoubaoVoice/bidirectional-streaming-text-to-speech-websocket
 */

const PROTOCOL_VERSION = 0b0001;
/** 头长度，以 4 字节为单位 */
const HEADER_SIZE_UNITS = 1;

export enum TTSMessageType {
  FullClientRequest = 0b0001,
  AudioOnlyClient = 0b0010,
  FullServerResponse = 0b1001,
  AudioOnlyServer = 0b1011,
  FrontEndResultServer = 0b1100,
  Error = 0b1111,
}

export enum TTSMessageFlag {
  NoSeq = 0b0000,
  PositiveSeq = 0b0001,
  LastNoSeq = 0b0010,
  NegativeSeq = 0b0011,
  WithEvent = 0b0100,
}

export enum TTSSerialization {
  Raw = 0b0000,
  Json = 0b0001,
}

export enum TTSCompression {
  None = 0b0000,
  Gzip = 0b0001,
}

export enum TTSEventType {
  StartConnection = 1,
  FinishConnection = 2,
  ConnectionStarted = 50,
  ConnectionFailed = 51,
  ConnectionFinished = 52,
  StartSession = 100,
  CancelSession = 101,
  FinishSession = 102,
  SessionStarted = 150,
  SessionCanceled = 151,
  SessionFinished = 152,
  SessionFailed = 153,
  UsageResponse = 154,
  TaskRequest = 200,
  TTSSentenceStart = 350,
  TTSSentenceEnd = 351,
  TTSResponse = 352,
  /** 字幕事件（enable_subtitle: true，TTS2.0），每次一整句。文档未列码，实测 364 */
  TTSSubtitle = 364,
  TTSEnded = 359,
}

/** 连接级事件不带 sessionId */
const SESSION_ID_SKIP_EVENTS = new Set<number>([
  TTSEventType.StartConnection,
  TTSEventType.FinishConnection,
  TTSEventType.ConnectionStarted,
  TTSEventType.ConnectionFailed,
  TTSEventType.ConnectionFinished,
]);

const CONNECT_ID_EVENTS = new Set<number>([
  TTSEventType.ConnectionStarted,
  TTSEventType.ConnectionFailed,
  TTSEventType.ConnectionFinished,
]);

export interface TTSRequestFrame {
  event: TTSEventType;
  sessionId?: string;
  payload: unknown;
}

/**
 * 编码客户端 FullClientRequest（WithEvent + JSON + 不压缩）。
 * 客户端只发这一种消息形态
 */
export function encodeFullClientRequest(frame: TTSRequestFrame): Buffer {
  const payload = Buffer.from(JSON.stringify(frame.payload ?? {}), 'utf8');

  const pieces: Buffer[] = [];
  const header = Buffer.alloc(4);
  header[0] = (PROTOCOL_VERSION << 4) | HEADER_SIZE_UNITS;
  header[1] =
    (TTSMessageType.FullClientRequest << 4) | TTSMessageFlag.WithEvent;
  header[2] = (TTSSerialization.Json << 4) | TTSCompression.None;
  header[3] = 0x00;
  pieces.push(header);

  const event = Buffer.alloc(4);
  event.writeInt32BE(frame.event, 0);
  pieces.push(event);

  // 连接级事件不携带 sessionId，其余事件必须带（可为空串）
  if (!SESSION_ID_SKIP_EVENTS.has(frame.event)) {
    const sessionId = Buffer.from(frame.sessionId ?? '', 'utf8');
    const size = Buffer.alloc(4);
    size.writeUInt32BE(sessionId.length, 0);
    pieces.push(size, sessionId);
  }

  const size = Buffer.alloc(4);
  size.writeUInt32BE(payload.length, 0);
  pieces.push(size, payload);

  return Buffer.concat(pieces);
}

export interface TTSServerMessage {
  type: TTSMessageType;
  flag: TTSMessageFlag;
  event?: TTSEventType;
  sessionId?: string;
  connectId?: string;
  sequence?: number;
  errorCode?: number;
  payload: Buffer;
  /** serialization 为 JSON 时解析出的负载（解析失败时保留原文） */
  payloadMsg?: unknown;
}

/** 解码服务端帧（事件响应 / 音频分片 / 错误） */
export function decodeServerMessage(data: Buffer): TTSServerMessage {
  if (data.length < 4) {
    throw new Error(`tts frame too short: ${data.length} bytes`);
  }

  const headerSize = data[0] & 0x0f;
  const type = data[1] >> 4;
  const flag = data[1] & 0x0f;
  const serialization = data[2] >> 4;
  const compression = data[2] & 0x0f;

  let offset = headerSize * 4;
  const msg: TTSServerMessage = {
    type,
    flag,
    payload: Buffer.alloc(0),
  };

  if (
    type !== TTSMessageType.Error &&
    (flag === TTSMessageFlag.PositiveSeq || flag === TTSMessageFlag.NegativeSeq)
  ) {
    msg.sequence = data.readInt32BE(offset);
    offset += 4;
  }

  if (type === TTSMessageType.Error) {
    msg.errorCode = data.readUInt32BE(offset);
    offset += 4;
  }

  if (flag === TTSMessageFlag.WithEvent) {
    msg.event = data.readInt32BE(offset);
    offset += 4;

    if (!SESSION_ID_SKIP_EVENTS.has(msg.event)) {
      const size = data.readUInt32BE(offset);
      offset += 4;
      if (size > 0) {
        msg.sessionId = data.subarray(offset, offset + size).toString('utf8');
        offset += size;
      }
    }

    if (CONNECT_ID_EVENTS.has(msg.event)) {
      const size = data.readUInt32BE(offset);
      offset += 4;
      if (size > 0) {
        msg.connectId = data.subarray(offset, offset + size).toString('utf8');
        offset += size;
      }
    }
  }

  const payloadSize = data.readUInt32BE(offset);
  offset += 4;
  let payload = data.subarray(offset, offset + payloadSize);
  if (compression === TTSCompression.Gzip && payload.length > 0) {
    payload = gunzipSync(payload);
  }
  msg.payload = payload;

  if (serialization === TTSSerialization.Json && payload.length > 0) {
    const text = payload.toString('utf8');
    try {
      msg.payloadMsg = JSON.parse(text);
    } catch {
      // 错误负载可能是纯文本，保留原文便于排查
      msg.payloadMsg = text;
    }
  }

  return msg;
}
