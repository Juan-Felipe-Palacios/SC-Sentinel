// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Widget flotante del Security Chatbot (M3.5 T3.1/T3.2).
// Estética original inspirada en una consola cyberpunk: neón cian/naranja,
// grid de red, radar y robot propio. No ejecuta acciones: solo consulta.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { consumeChatStream } from '@/lib/chat/client';
import type { ChatStreamDone, ChatStreamMeta } from '@/lib/chat/types';
import { ChatInput } from './ChatInput';
import { ChatMessage, type ChatMessageMeta } from './ChatMessage';
import { ChatRobot } from './ChatRobot';

const DEFAULT_SUGGESTIONS = [
  '¿Cómo está la red en las últimas 24 h?',
  '¿Qué hosts generan más tráfico?',
  '¿Hay alertas que requieran acción?',
];

interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  warnings?: string[];
  sources?: string[];
  meta?: ChatMessageMeta;
}

function newMessageId(): string {
  return `ui_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ChatBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(8,145,178,0.2),transparent_46%),radial-gradient(circle_at_100%_100%,rgba(249,115,22,0.08),transparent_36%)]" />
      <div className="sc-chat-grid-dense absolute inset-0 opacity-75" />

      <div className="absolute -right-24 top-24 h-72 w-72 rounded-full border border-cyan-400/10" />
      <div className="absolute -right-16 top-32 h-56 w-56 rounded-full border border-cyan-400/10" />
      <div className="absolute -right-8 top-40 h-40 w-40 rounded-full border border-cyan-400/10" />
      <div className="absolute -right-24 top-24 h-72 w-72 rounded-full border border-dashed border-cyan-300/10" />
      <div className="sc-chat-sweep absolute -right-24 top-24 h-72 w-72 rounded-full bg-[conic-gradient(from_0deg,rgba(34,211,238,0.22),transparent_26%)] opacity-40" />

      <svg
        className="absolute inset-x-0 bottom-0 h-64 w-full opacity-[0.16]"
        viewBox="0 0 420 260"
        fill="none"
      >
        <defs>
          <linearGradient id="sc-chat-line" x1="0" y1="0" x2="420" y2="260">
            <stop stopColor="#22d3ee" stopOpacity="0.7" />
            <stop offset="0.55" stopColor="#38bdf8" stopOpacity="0.25" />
            <stop offset="1" stopColor="#f97316" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        <path
          d="M-10 214 L52 176 L104 192 L158 126 L214 154 L272 92 L332 112 L430 42"
          stroke="url(#sc-chat-line)"
          strokeWidth="1.1"
        />
        <path
          d="M-10 238 L70 204 L126 220 L184 168 L246 186 L310 138 L376 154 L430 118"
          stroke="url(#sc-chat-line)"
          strokeWidth="0.7"
          opacity="0.7"
        />
        {[
          [52, 176],
          [104, 192],
          [158, 126],
          [214, 154],
          [272, 92],
          [332, 112],
          [184, 168],
          [310, 138],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.2" fill="#22d3ee" fillOpacity="0.8" />
        ))}
      </svg>

      <div className="absolute -left-24 bottom-24 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="absolute -right-12 bottom-10 h-44 w-44 rounded-full bg-orange-500/10 blur-3xl" />
      <div className="sc-chat-scanline absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-cyan-300/[0.055] to-transparent" />
    </div>
  );
}

function PanelCorners() {
  const base =
    'pointer-events-none absolute z-30 h-2.5 w-2.5 border-cyan-300/70 drop-shadow-[0_0_6px_rgba(34,211,238,0.7)]';
  return (
    <>
      <span className={`${base} left-2 top-2 border-l border-t`} />
      <span className={`${base} right-2 top-2 border-r border-t`} />
      <span className={`${base} bottom-2 left-2 border-b border-l`} />
      <span className={`${base} bottom-2 right-2 border-b border-r`} />
    </>
  );
}

function SuggestionChips({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (suggestion: string) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.slice(0, 3).map((suggestion, index) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onPick(suggestion)}
          className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/[0.055] px-2.5 py-1.5 text-left font-mono text-[9px] leading-4 text-cyan-100/75 shadow-[0_0_16px_rgba(34,211,238,0.06)] transition hover:border-cyan-300/70 hover:bg-cyan-400/10 hover:text-cyan-50 hover:shadow-[0_0_22px_rgba(34,211,238,0.18)]"
        >
          {index === 0 ? (
            <Sparkles className="h-2.5 w-2.5 shrink-0 text-orange-300/80" />
          ) : (
            <span className="text-[8px] text-cyan-300/35">
              {String(index + 1).padStart(2, '0')}
            </span>
          )}
          <span className="truncate">{suggestion}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (suggestion: string) => void }) {
  return (
    <div className="flex flex-col items-center px-1 pb-3 pt-2 text-center">
      <div className="relative mb-3">
        <div className="absolute inset-4 rounded-full bg-cyan-400/20 blur-2xl" />
        <ChatRobot className="sc-chat-float relative h-32 w-32 drop-shadow-[0_0_30px_rgba(34,211,238,0.35)]" />
        <div className="absolute -right-2 top-4 flex h-7 w-7 items-center justify-center rounded-lg border border-orange-400/40 bg-orange-500/10 text-orange-300 shadow-[0_0_18px_rgba(249,115,22,0.25)]">
          <AlertTriangle className="h-3.5 w-3.5" />
        </div>
        <div className="absolute -left-3 bottom-5 flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-400/35 bg-cyan-500/10 text-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.25)]">
          <ShieldCheck className="h-3.5 w-3.5" />
        </div>
      </div>

      <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.22em] text-emerald-300">
        <span className="sc-pulse-dot h-1.5 w-1.5 bg-emerald-400" />
        Sentinel en línea
      </div>

      <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-cyan-50 sc-chat-neon-text">
        Tu red, bajo vigilancia.
      </h2>
      <p className="mt-1 max-w-[16rem] text-[11px] leading-5 text-slate-400">
        Puedo analizar tráfico, hosts y alertas de las últimas 24 h del device autorizado.
      </p>

      <div className="sc-chat-alert-glow mt-3 w-full max-w-[19rem] rounded-xl border border-orange-400/35 bg-gradient-to-br from-orange-500/[0.13] via-red-500/[0.05] to-transparent p-3 text-left">
        <div className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.2em] text-orange-300">
          <AlertTriangle className="h-3 w-3" />
          Consulta rápida
        </div>
        <p className="mt-1.5 text-[11px] leading-5 text-orange-50/90">
          ¿Querés revisar el tráfico, los hosts o las alertas de las últimas 24 h?
        </p>
      </div>

      <div className="mt-3 w-full">
        <SuggestionChips suggestions={DEFAULT_SUGGESTIONS} onPick={onPick} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 font-mono text-[8px] uppercase tracking-[0.14em] text-cyan-100/25">
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-2.5 w-2.5" />
          RAG local
        </span>
        <span>·</span>
        <span>24 h</span>
        <span>·</span>
        <span>device autorizado</span>
      </div>
    </div>
  );
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  const setBusySafe = useCallback((value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  }, []);

  const patchAssistant = useCallback(
    (id: string, patch: Partial<UiMessage>) => {
      setMessages((previous) =>
        previous.map((message) => {
          if (message.id !== id) return message;
          return {
            ...message,
            ...patch,
            meta: patch.meta ? { ...message.meta, ...patch.meta } : message.meta,
          };
        })
      );
    },
    []
  );

  const appendToAssistant = useCallback((id: string, delta: string) => {
    setMessages((previous) =>
      previous.map((message) =>
        message.id === id ? { ...message, content: message.content + delta } : message
      )
    );
  }, []);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('sc:open-chat', handler);
    return () => window.removeEventListener('sc:open-chat', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (busyRef.current) {
        abortRef.current?.abort();
      } else {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const startNewConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusySafe(false);
    setMessages([]);
    setInput('');
    setConversationId(null);
    conversationIdRef.current = null;
    setSuggestions(DEFAULT_SUGGESTIONS);
    setError(null);
  }, [setBusySafe]);

  const sendMessage = useCallback(
    async (preset?: string) => {
      const text = (preset ?? input).trim();
      if (!text || busyRef.current) return;

      setInput('');
      setError(null);

      const assistantId = newMessageId();
      setMessages((previous) => [
        ...previous,
        { id: newMessageId(), role: 'user', content: text },
        { id: assistantId, role: 'assistant', content: '', streaming: true },
      ]);
      setBusySafe(true);

      const controller = new AbortController();
      abortRef.current = controller;
      let terminal = false;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            message: text,
            ...(conversationIdRef.current
              ? { conversationId: conversationIdRef.current }
              : {}),
          }),
        });

        if (response.status === 401) {
          const message = 'Tu sesión expiró. Volvé a iniciar sesión para continuar.';
          setError(message);
          patchAssistant(assistantId, {
            streaming: false,
            content: 'No pude autenticar la consulta.',
            warnings: ['Sesión expirada.'],
          });
          return;
        }

        if (!response.ok) {
          let detail = 'No se pudo iniciar la consulta.';
          try {
            const body = (await response.json()) as { message?: unknown };
            if (typeof body.message === 'string') detail = body.message;
          } catch {
            // La respuesta de error no era JSON.
          }
          setError(detail);
          patchAssistant(assistantId, { streaming: false, warnings: [detail] });
          return;
        }

        await consumeChatStream(response, {
          onMeta: (meta: ChatStreamMeta) => {
            setConversationId(meta.conversationId);
            conversationIdRef.current = meta.conversationId;
            setSuggestions(meta.suggestions.length > 0 ? meta.suggestions : DEFAULT_SUGGESTIONS);
            patchAssistant(assistantId, {
              sources: meta.sources,
              meta: { model: meta.model, provider: meta.provider },
            });
          },
          onToken: (delta: string) => {
            appendToAssistant(assistantId, delta);
          },
          onDone: (done: ChatStreamDone) => {
            terminal = true;
            setConversationId(done.conversationId);
            conversationIdRef.current = done.conversationId;
            setSuggestions(
              done.suggestions.length > 0 ? done.suggestions : DEFAULT_SUGGESTIONS
            );
            patchAssistant(assistantId, {
              streaming: false,
              warnings: done.warnings,
              meta: {
                model: done.model,
                provider: done.provider,
                tokensUsed: done.tokensUsed,
              },
            });
          },
          onError: (streamError) => {
            terminal = true;
            setError(streamError.message);
            patchAssistant(assistantId, {
              streaming: false,
              warnings: [streamError.message],
            });
          },
        });

        if (!terminal) {
          patchAssistant(assistantId, {
            streaming: false,
            warnings: ['La conexión se cortó antes de completar la respuesta.'],
          });
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') {
          patchAssistant(assistantId, {
            streaming: false,
            warnings: ['Respuesta detenida.'],
          });
        } else {
          const message = 'No se pudo conectar con el asistente.';
          setError(message);
          patchAssistant(assistantId, {
            streaming: false,
            warnings: [message],
          });
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusySafe(false);
      }
    },
    [appendToAssistant, input, patchAssistant, setBusySafe]
  );

  const handleSend = useCallback(() => {
    void sendMessage();
  }, [sendMessage]);

  const handleSuggestion = useCallback(
    (suggestion: string) => {
      void sendMessage(suggestion);
    },
    [sendMessage]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <>
      {!open ? (
        <div className="fixed bottom-5 right-5 z-50 sm:bottom-6 sm:right-6">
          <button
            ref={launcherRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir SC Sentinel AI"
            aria-expanded={open}
            aria-controls="sc-chat-panel"
            className="sc-chat-avatar-pulse group relative flex h-14 w-14 items-center justify-center rounded-full border border-cyan-300/55 bg-slate-950/95 shadow-[0_0_0_1px_rgba(34,211,238,0.2),0_0_34px_rgba(34,211,238,0.35),0_16px_40px_rgba(2,6,23,0.7)] transition hover:scale-105 hover:border-cyan-200/80 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.35),0_0_46px_rgba(34,211,238,0.55),0_16px_44px_rgba(2,6,23,0.8)]"
          >
            <span className="absolute inset-1 rounded-full bg-gradient-to-br from-cyan-400/20 to-blue-600/10 blur-md" />
            <ChatRobot variant="compact" className="relative h-9 w-9" />
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
            <span className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-lg border border-cyan-400/25 bg-slate-950/95 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-cyan-200/80 shadow-[0_0_24px_rgba(34,211,238,0.18)] group-hover:block">
              Sentinel AI
            </span>
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-stretch justify-center sm:items-end sm:justify-end sm:p-6">
          <button
            type="button"
            aria-label="Cerrar SC Sentinel AI"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-slate-950/70 backdrop-blur-sm sm:bg-slate-950/45"
          />

          <section
            id="sc-chat-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sc-chat-title"
            className="sc-chat-panel relative z-10 flex h-dvh w-full max-w-[420px] flex-col overflow-hidden border-x border-cyan-400/25 bg-[#050d1a]/95 sm:h-[600px] sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl sm:border"
          >
            <PanelCorners />
            <ChatBackdrop />

            <header className="relative z-20 flex items-center gap-3 border-b border-cyan-400/15 bg-slate-950/70 px-4 py-3 backdrop-blur-xl">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/35 bg-gradient-to-br from-cyan-500/15 to-blue-600/10 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                <ShieldCheck className="h-5 w-5" />
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1
                    id="sc-chat-title"
                    className="truncate font-display text-sm font-semibold tracking-wide text-cyan-50"
                  >
                    SC Sentinel AI
                  </h1>
                  <span className="rounded border border-cyan-400/25 px-1 py-0.5 font-mono text-[7px] uppercase tracking-[0.16em] text-cyan-300/55">
                    beta
                  </span>
                </div>
                <p className="truncate font-mono text-[8px] uppercase tracking-[0.2em] text-cyan-200/35">
                  anomaly.sentinel.io · security copilot
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={startNewConversation}
                  aria-label="Nueva conversación"
                  title="Nueva conversación"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-cyan-200/45 transition hover:border-cyan-400/25 hover:bg-cyan-400/10 hover:text-cyan-100"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar chat"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-cyan-200/45 transition hover:border-orange-400/30 hover:bg-orange-500/10 hover:text-orange-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div
              ref={scrollRef}
              className="sc-chat-scroll relative z-10 flex-1 overflow-y-auto overscroll-contain scroll-smooth px-4 py-4"
            >
              {messages.length === 0 ? (
                <EmptyState onPick={handleSuggestion} />
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      role={message.role}
                      content={message.content}
                      streaming={message.streaming}
                      warnings={message.warnings}
                      sources={message.sources}
                      meta={message.meta}
                    />
                  ))}

                  {!busy && suggestions.length > 0 ? (
                    <div className="pt-1">
                      <p className="mb-2 font-mono text-[8px] uppercase tracking-[0.2em] text-cyan-200/30">
                        Seguir explorando
                      </p>
                      <SuggestionChips suggestions={suggestions} onPick={handleSuggestion} />
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <footer className="relative z-20 border-t border-cyan-400/15 bg-slate-950/75 px-3 pb-3 pt-2 backdrop-blur-xl">
              <div className="mb-2 flex items-center justify-between gap-2 px-1 font-mono text-[8px] uppercase tracking-[0.15em] text-cyan-100/30">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      busy
                        ? 'animate-pulse bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.9)]'
                        : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]'
                    }`}
                  />
                  {busy ? 'Generando respuesta' : 'Canal seguro'}
                </span>
                <span className="truncate">
                  {conversationId ? `conv ${conversationId.slice(-6)}` : 'nueva sesión'} · RAG 24H
                </span>
              </div>

              {error ? (
                <div className="mb-2 flex items-start gap-1.5 rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-2 text-[10px] leading-4 text-red-200/90">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-300" />
                  <span className="flex-1">{error}</span>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    aria-label="Descartar aviso"
                    className="text-red-200/50 transition hover:text-red-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : null}

              <ChatInput
                value={input}
                onChange={setInput}
                onSend={handleSend}
                onStop={handleStop}
                busy={busy}
                autoFocus
              />
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
