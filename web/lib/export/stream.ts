// web/lib/export/stream.ts
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Streaming CSV con ReadableStream: el encabezado y las filas se emiten en
// lotes de 500 para no materializar un string gigante en memoria ni bloquear
// el hilo con un join de 10k filas. Node runtime only.

const BATCH_SIZE = 500;
const encoder = new TextEncoder();

export function csvStreamFromRows(header: string, rows: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`${header}\n`));
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        controller.enqueue(encoder.encode(`${batch.join('\n')}\n`));
      }
      controller.close();
    },
  });
}
