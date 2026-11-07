// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Aviso persistente del modo visitante con cuenta regresiva de la sesión.

'use client';

import { useEffect, useState } from 'react';
import { Eye, LockKeyhole } from 'lucide-react';

function remainingMinutes(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 60_000));
}

export function GuestBanner({ expiresAt }: { expiresAt: number }) {
  // null hasta montar: evita mismatch de hidratación entre server y cliente.
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setMinutes(remainingMinutes(expiresAt));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const remainingLabel =
    minutes === null
      ? 'Sesión de 1 hora'
      : minutes === 0
        ? 'Sesión expirada'
        : `Expira en ${minutes} min`;

  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-sc-warn/30 bg-sc-warn/10 px-4 py-2.5 text-sc-warn"
    >
      <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
        <Eye className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
        Demo pública
      </span>
      <span className="text-xs leading-5 text-sc-text/80">
        Solo lectura, sin registro. Las acciones de administración están deshabilitadas.
      </span>
      <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-sc-warn/80">
        <LockKeyhole className="size-3" aria-hidden="true" />
        {remainingLabel}
      </span>
    </div>
  );
}
