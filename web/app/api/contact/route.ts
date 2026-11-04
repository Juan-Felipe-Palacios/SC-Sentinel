// SC-Sentinel — contacto (POST). Sin DB ni provider de email.
// Valida con Zod, rate limit en memoria por IP y responde 200; el mensaje se loguea en stdout (Vercel).
// Los mensajes con honeypot relleno se aceptan y se descartan sin loguear.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { NextRequest, NextResponse } from 'next/server';
import { ContactSchema, RATE_LIMIT_PER_HOUR } from '@/lib/contact/schema';
import { allowContactRequest, retryAfterSeconds } from '@/lib/contact/rate-limit';

export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStoreHeaders });
  }

  const parsed = ContactSchema.safeParse(body);
  if (!parsed.success) {
    const issues = Object.fromEntries(
      parsed.error.issues.map((issue) => [String(issue.path[0] ?? 'form'), issue.message] as const)
    );
    return NextResponse.json({ error: 'bad_request', issues }, { status: 400, headers: noStoreHeaders });
  }

  // Honeypot: OK pero descartado, sin procesar ni loguear contenido.
  if (parsed.data.website && parsed.data.website.length > 0) {
    return NextResponse.json({ ok: true }, { status: 200, headers: noStoreHeaders });
  }

  const ip = clientIp(request);

  if (!allowContactRequest(ip)) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: retryAfterSeconds(ip), limit: RATE_LIMIT_PER_HOUR },
      {
        status: 429,
        headers: { ...noStoreHeaders, 'Retry-After': String(retryAfterSeconds(ip)) },
      }
    );
  }

  // Sin persistencia en DB (decisión de alcance M3): queda en el log de la plataforma.
  console.log(
    '[contact] mensaje recibido',
    JSON.stringify({
      nombre: parsed.data.nombre,
      email: parsed.data.email,
      asunto: parsed.data.asunto,
      mensaje: parsed.data.mensaje,
      ip,
      receivedAt: new Date().toISOString(),
    })
  );

  return NextResponse.json({ ok: true }, { status: 200, headers: noStoreHeaders });
}
