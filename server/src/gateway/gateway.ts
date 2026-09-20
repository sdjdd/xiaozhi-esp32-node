import { WebSocket } from 'ws';
import { createDecoder, createEncoder, OpusDecoderHandle } from 'libopus-wasm';
import { randomUUID } from 'node:crypto';
import { Session } from './session';
import {
  AbortMessage,
  HelloMessage,
  ListenMessage,
  messageSchema,
} from './protocol';
import { logger } from '@/utils/logger';
import { SileroVad } from '@/audio/silero-vad';
import { AgentService } from '@/services/agent';
import type { PresenceService } from '@/services/presence';

const SAMPLE_RATE = 24000;
const FRAME_DURATION = 60;

type DeviceSession =
  | {
      initializing: true;
      destroy: () => void;
    }
  | {
      initializing: false;
      sessionId: string;
      voiceSession: Session;
      decoder: OpusDecoderHandle;
      vad: WritableStream<Float32Array>;
      isSpeaking: boolean;
      destroy: () => void;
    };

export class Gateway {
  private sessions: Map<WebSocket, DeviceSession> = new Map();

  private pullTimer: NodeJS.Timeout;

  private shuttingDown = false;

  private encoder = createEncoder({
    sampleRate: SAMPLE_RATE,
    channels: 1,
    frameSize: SAMPLE_RATE * (FRAME_DURATION / 1000),
  });

  constructor(
    private vad: SileroVad,
    private agentService: AgentService,
    private presence: PresenceService,
  ) {
    this.pullTimer = setInterval(() => this.pull(), FRAME_DURATION);
  }

  handleConnect(ws: WebSocket, clientId: string, deviceId: string) {
    logger.debug({ clientId, deviceId }, 'device connected');
    this.presence.arrive(ws, clientId);

    ws.on('message', (rawData, isBinary) => {
      const data = Array.isArray(rawData)
        ? Buffer.concat(rawData)
        : Buffer.from(rawData as ArrayBuffer);
      if (isBinary) {
        this.dispatchMessage(ws, clientId, deviceId, data);
      } else {
        this.dispatchMessage(ws, clientId, deviceId, data.toString('utf8'));
      }
    });

    ws.on('close', () => {
      logger.debug({ clientId, deviceId }, 'device disconnected');
      this.disconnect(ws);
    });
  }

  private dispatchMessage(
    ws: WebSocket,
    clientId: string,
    deviceId: string,
    data: string | Buffer,
  ) {
    if (typeof data === 'string') {
      try {
        const msg = messageSchema.parse(JSON.parse(data));
        switch (msg.type) {
          case 'hello':
            this.handleHelloMessage(ws, clientId, deviceId, msg);
            break;
          case 'listen':
            this.handleListenMessage(ws, msg);
            break;
          case 'abort':
            this.handleAbortMessage(ws, msg);
            break;
        }
      } catch {
        logger.error({ data }, 'parse message failed');
      }
    } else {
      const session = this.sessions.get(ws);
      if (session && !session.initializing && !session.isSpeaking) {
        const pcm = session.decoder.decodeFloat(data);
        const writer = session.vad.getWriter();
        writer.write(pcm);
        writer.releaseLock();
      }
    }
  }

  private async handleHelloMessage(
    ws: WebSocket,
    clientId: string,
    deviceId: string,
    msg: HelloMessage,
  ) {
    if (this.shuttingDown) {
      ws.terminate();
      return;
    }

    if (this.sessions.has(ws)) {
      return;
    }

    const {
      format = 'opus',
      sample_rate = 16000,
      channels = 1,
    } = msg.audio_params;

    // VAD/STT 链路钉死 16k mono opus，参数不符直接拒绝，
    // 避免解码错乱流进下游
    if (format !== 'opus' || sample_rate !== 16000 || channels !== 1) {
      logger.warn(msg.audio_params, 'unsupported audio params');
      ws.terminate();
      return;
    }

    let aborted = false;
    this.sessions.set(ws, {
      initializing: true,
      destroy: () => (aborted = true),
    });

    let decoder: OpusDecoderHandle | undefined;

    try {
      decoder = await createDecoder({
        sampleRate: sample_rate,
        channels: 1,
      });

      const vad = this.vad.createStream({
        minSilenceDurationMs: 500,
        speechPadMs: 200,
      });

      const sessionId = randomUUID();
      const agent = await this.agentService.createAgent({
        clientId,
        deviceId,
        sessionId,
      });
      const voiceSession = new Session(vad.readable, agent);

      if (aborted) {
        throw new Error('init aborted');
      }

      this.sessions.set(ws, {
        initializing: false,
        sessionId,
        voiceSession,
        decoder,
        vad: vad.writable,
        isSpeaking: false,
        destroy: () => {
          voiceSession.destroy();
          vad.writable.abort();
          decoder?.free();
        },
      });

      this.sendJSON(ws, {
        type: 'hello',
        transport: 'websocket',
        session_id: sessionId,
        audio_params: {
          format: 'opus',
          sample_rate: SAMPLE_RATE,
          channels: 1,
          frame_duration: FRAME_DURATION,
        },
      });
    } catch (err) {
      logger.warn({ err }, 'init device failed');
      decoder?.free();
    }
  }

  private handleListenMessage(ws: WebSocket, msg: ListenMessage) {
    const session = this.sessions.get(ws);
    if (!session || session.initializing) return;

    switch (msg.state) {
      case 'detect': {
        if (msg.text) {
          logger.debug({ text: msg.text }, 'listen detect');
          ws.send(
            JSON.stringify({
              type: 'stt',
              session_id: msg.session_id,
              text: msg.text,
            }),
          );
          session.voiceSession.handleTextInput(msg.text);
        }
        break;
      }
    }
  }

  private handleAbortMessage(ws: WebSocket, _msg: AbortMessage) {
    const session = this.sessions.get(ws);
    if (session && !session.initializing) {
      session.voiceSession.bargeIn();
      // 不要在这里修改 isSpeaking，交由下一轮 pull 自动识别
    }
  }

  disconnect(ws: WebSocket) {
    ws.terminate();
    this.presence.depart(ws);
    const session = this.sessions.get(ws);
    if (session) {
      session.destroy();
      this.sessions.delete(ws);
    }
  }

  private sendJSON(ws: WebSocket, data: any) {
    ws.send(JSON.stringify(data));
  }

  private async pull() {
    for (const [ws, session] of this.sessions.entries()) {
      if (session.initializing) continue;

      const { audio, subtitle, transcribeResult } =
        session.voiceSession.pull(FRAME_DURATION);

      if (transcribeResult) {
        ws.send(
          JSON.stringify({
            type: 'stt',
            session_id: session.sessionId,
            text: transcribeResult,
          }),
        );
      }

      if (subtitle) {
        logger.debug({ subtitle }, 'send subtitle');
        ws.send(
          JSON.stringify({
            type: 'tts',
            session_id: session.sessionId,
            state: 'sentence_start',
            text: subtitle,
          }),
        );
      }

      if (audio) {
        if (!session.isSpeaking) {
          session.isSpeaking = true;
          ws.send(
            JSON.stringify({
              session_id: session.sessionId,
              type: 'tts',
              state: 'start',
            }),
          );
        }
        const encoder = await this.encoder;
        const frame = encoder.encode(audio);
        ws.send(frame);
      } else if (session.isSpeaking) {
        session.isSpeaking = false;
        ws.send(
          JSON.stringify({
            session_id: session.sessionId,
            type: 'tts',
            state: 'stop',
          }),
        );
      }
    }
  }

  [Symbol.dispose]() {
    this.shuttingDown = true;
    clearInterval(this.pullTimer);
    for (const ws of this.sessions.keys()) {
      this.disconnect(ws);
    }
  }
}
