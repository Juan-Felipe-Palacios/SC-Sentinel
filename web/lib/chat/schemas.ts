// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { z } from 'zod';
import { CHAT_MAX_MESSAGE_LENGTH } from './types';

/**
 * Body del POST /api/chat. `.strict()` es deliberado: el device_id se resuelve
 * del query param/`DEFAULT_DEVICE_ID`, nunca de `context.deviceId` en el body.
 */
export const ChatRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(CHAT_MAX_MESSAGE_LENGTH),
    conversationId: z.string().min(1).max(80).optional(),
  })
  .strict();

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatHistoryQuerySchema = z.object({
  device_id: z.string().min(1).optional(),
  conversation_id: z.string().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
