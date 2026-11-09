// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
export function EmptyChart({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-[340px] flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="font-display text-sm font-semibold text-sc-text">{title}</p>
      <p className="max-w-sm text-xs leading-5 text-sc-text-muted">{detail}</p>
    </div>
  );
}
