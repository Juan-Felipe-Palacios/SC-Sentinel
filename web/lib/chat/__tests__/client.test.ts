// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { describe, expect, it } from 'vitest';
import { consumeChatStream, parseSseBlock } from '../client';

describe('parseSseBlock', () => {
  it('parsea event y data JSON', () => {
    expect(
      parseSseBlock('event: token\ndata: {"delta":"hola"}')
    ).toEqual({ event: 'token', data: { delta: 'hola' } });
  });

  it('une varias líneas data', () => {
    expect(
      parseSseBlock('event: nota\ndata: {"a":1,\ndata: "b":2}')
    ).toEqual({ event: 'nota', data: { a: 1, b: 2 } });
  });

  it('ignora [DONE], bloques sin data y JSON inválido', () => {
    expect(parseSseBlock('data: [DONE]')).toBeNull();
    expect(parseSseBlock('event: token')).toBeNull();
    expect(parseSseBlock('data: {roto')).toBeNull();
  });
});

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('consumeChatStream', () => {
  it('despacha meta, tokens y done aunque los bloques lleguen cortados', async () => {
    const events: string[] = [];
    const tokens: string[] = [];
    let done: { tokensUsed: number } | null = null;

    const response = new Response(
      streamFrom([
        'event: meta\ndata: {"conversationId":"conv_1","sources":[]}\n\n',
        'event: token\ndata: {"delta":"Hola "}\n\nevent: token\ndata: {"del',
        'ta":"mundo"}\n\n',
        'event: done\ndata: {"tokensUsed":12}\n\n',
      ]),
      { status: 200 }
    );

    await consumeChatStream(response, {
      onMeta: (meta) => events.push(`meta:${meta.conversationId}`),
      onToken: (delta) => tokens.push(delta),
      onDone: (value) => {
        done = value as unknown as { tokensUsed: number };
      },
    });

    expect(events).toEqual(['meta:conv_1']);
    expect(tokens.join('')).toBe('Hola mundo');
    expect(done).toEqual({ tokensUsed: 12 });
  });

  it('despacha error con código y mensaje', async () => {
    const errors: Array<{ code: string; message: string }> = [];
    const response = new Response(
      streamFrom([
        'event: error\ndata: {"code":"missing_api_key","message":"Falta la clave"}\n\n',
      ]),
      { status: 200 }
    );

    await consumeChatStream(response, {
      onError: (error) => errors.push(error),
    });

    expect(errors).toEqual([
      { code: 'missing_api_key', message: 'Falta la clave' },
    ]);
  });

  it('falla si el servidor no devuelve body', async () => {
    await expect(
      consumeChatStream(new Response(null, { status: 200 }), {})
    ).rejects.toThrow('El servidor no devolvió un stream.');
  });
});
