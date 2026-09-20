import { z } from 'zod';

const helloMessageSchema = z.object({
  type: z.literal('hello'),
  version: z.literal(1),
  features: z.record(z.string(), z.boolean()),
  audio_params: z
    .object({
      format: z.string(),
      sample_rate: z.literal([8000, 12000, 16000, 24000]),
      channels: z.literal([1, 2]),
      frame_duration: z.int().positive(),
    })
    .partial(),
});

const listenMessageSchema = z.object({
  type: z.literal('listen'),
  session_id: z.string(),
  state: z.enum(['start', 'stop', 'detect']),
  text: z.string().optional(),
  mode: z.enum(['auto', 'manual', 'realtime']).optional(),
});

const abortMessageSchema = z.object({
  type: z.literal('abort'),
  session_id: z.string(),
});

export const messageSchema = z.discriminatedUnion('type', [
  helloMessageSchema,
  listenMessageSchema,
  abortMessageSchema,
]);

export type HelloMessage = z.infer<typeof helloMessageSchema>;
export type ListenMessage = z.infer<typeof listenMessageSchema>;
export type AbortMessage = z.infer<typeof abortMessageSchema>;
