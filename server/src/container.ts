import { Container } from '@inferdi/inferdi';
import type { InferdiHonoEnv } from '@inferdi/hono';
import { AgentService } from './services/agent';
import { DeviceService } from './services/device';
import { UserService } from './services/user';
import { PersonaService } from './services/persona';
import { VoiceService } from './services/voice';
import { AdminService } from './services/admin';
import { PresenceService } from './services/presence';
import { SileroVad } from './audio/silero-vad';
import { Gateway } from './gateway/gateway';

export const root = new Container()
  .registerClass('deviceService', DeviceService, [])
  .registerClass('agentService', AgentService, ['deviceService'])
  .registerClass('userService', UserService, [])
  .registerClass('personaService', PersonaService, [])
  .registerClass('voiceService', VoiceService, [])
  .registerClass('adminService', AdminService, [])
  .registerClass('presenceService', PresenceService, [])
  .registerAsyncFactory('vad', () => SileroVad.create(), [])
  .registerClass('gateway', Gateway, [
    'vad',
    'agentService',
    'presenceService',
  ]);

export type AppEnv = InferdiHonoEnv<typeof root>;
