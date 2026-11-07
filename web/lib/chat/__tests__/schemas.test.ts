import { describe, expect, it } from 'vitest';
import { ChatHistoryQuerySchema, ChatRequestSchema } from '../schemas';

describe('ChatRequestSchema', () => {
  it('acepta mensaje y conversación', () => {
    const parsed = ChatRequestSchema.safeParse({
      message: '  ¿Qué host genera más tráfico?  ',
      conversationId: 'conv_123',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.message).toBe('¿Qué host genera más tráfico?');
    }
  });

  it('rechaza deviceId/context en el body (aislamiento por query param)', () => {
    expect(
      ChatRequestSchema.safeParse({
        message: 'hola',
        context: { deviceId: 'dev_otro' },
      }).success
    ).toBe(false);
    expect(
      ChatRequestSchema.safeParse({ message: 'hola', deviceId: 'dev_otro' }).success
    ).toBe(false);
  });

  it('rechaza mensajes vacíos o demasiado largos', () => {
    expect(ChatRequestSchema.safeParse({ message: '   ' }).success).toBe(false);
    expect(
      ChatRequestSchema.safeParse({ message: 'a'.repeat(2001) }).success
    ).toBe(false);
  });
});

describe('ChatHistoryQuerySchema', () => {
  it('usa límite 20 por defecto y acepta device_id', () => {
    const parsed = ChatHistoryQuerySchema.safeParse({
      device_id: 'dev_bee8a7f6-8191-47ef-9dc2-f1ef3a9d7636',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limit).toBe(20);
    }
  });

  it('rechaza límites fuera de rango', () => {
    expect(ChatHistoryQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(ChatHistoryQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });
});
