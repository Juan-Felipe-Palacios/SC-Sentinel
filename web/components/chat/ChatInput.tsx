// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Entrada del chatbot: textarea auto-expandible y controles de streaming.

'use client';

import { useEffect, useRef } from 'react';
import { CornerDownLeft, Send, Square } from 'lucide-react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  disabled = false,
  autoFocus = false,
  placeholder = 'Escribe tu consulta de seguridad…',
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 132)}px`;
  }, [value]);

  useEffect(() => {
    if (!autoFocus) return;
    const frame = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2 backdrop-blur-xl transition focus-within:border-sky-500/50">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (!busy && !disabled && value.trim()) onSend();
            }
          }}
          placeholder={placeholder}
          aria-label="Consulta para SC Sentinel AI"
          className="sc-chat-scroll min-h-[36px] flex-1 resize-none bg-transparent px-1.5 py-2 font-mono text-[12px] leading-5 text-slate-100 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        />

        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Detener respuesta"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-slate-100"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={disabled || !value.trim()}
            aria-label="Enviar consulta"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-500/40 bg-sky-500 text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 px-1.5 font-mono text-[8px] uppercase tracking-[0.16em] text-slate-500">
        <span className="flex items-center gap-1">
          <CornerDownLeft className="h-2.5 w-2.5" />
          Enter envía · Shift+Enter salto
        </span>
        <span className="hidden sm:inline">La IA puede equivocarse</span>
      </div>
    </div>
  );
}
