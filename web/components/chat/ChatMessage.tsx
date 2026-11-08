// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Burbuja de mensaje del Security Chatbot con estética de consola cyberpunk.

'use client';

import { AlertTriangle, BookOpen, UserRound } from 'lucide-react';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatRobot } from './ChatRobot';

export interface ChatMessageMeta {
  model?: string;
  provider?: string;
  tokensUsed?: number;
}

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  warnings?: string[];
  sources?: string[];
  meta?: ChatMessageMeta;
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1" aria-label="Generando respuesta">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400"
          style={{ animationDelay: `${index * 140}ms` }}
        />
      ))}
    </span>
  );
}

export function ChatMessage({
  role,
  content,
  streaming = false,
  warnings = [],
  sources = [],
  meta,
}: ChatMessageProps) {
  if (role === 'user') {
    return (
      <article className="sc-fade-up flex items-end justify-end gap-2">
        <div className="max-w-[88%]">
          <div className="mb-1 flex items-center justify-end gap-2 font-mono text-[9px] uppercase tracking-[0.22em] text-slate-400">
            <span>operador</span>
            <span className="h-1 w-1 rounded-full bg-amber-400" />
          </div>
          <div className="rounded-2xl rounded-br-sm border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-[13px] leading-6 text-slate-100">
            <p className="whitespace-pre-wrap break-words">{content}</p>
          </div>
        </div>
        <div className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300">
          <UserRound size={14} />
        </div>
      </article>
    );
  }

  return (
    <article className="sc-fade-up flex items-start gap-2.5">
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-500/30 bg-slate-950/80 p-1">
        <ChatRobot variant="compact" className="h-7 w-7" />
      </div>

      <div className="min-w-0 max-w-[90%] flex-1">
        <div className="mb-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.22em] text-sky-400">
          <span>Sentinel AI</span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              streaming
                ? 'animate-pulse bg-sky-400'
                : 'bg-emerald-400'
            }`}
          />
          <span className="text-slate-500">{streaming ? 'analizando' : 'en línea'}</span>
        </div>

        <div
          aria-live="polite"
          className="rounded-2xl rounded-tl-sm border border-slate-800 bg-slate-900/60 px-3.5 py-3 text-[13px] leading-6 text-slate-200"
        >
          {content ? (
            <div>
              <ChatMarkdown content={content} />
              {streaming ? (
                <span className="sc-chat-caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-sky-400" />
              ) : null}
            </div>
          ) : streaming ? (
            <TypingDots />
          ) : (
            <p className="text-slate-400">Sin respuesta.</p>
          )}
        </div>

        {warnings.length > 0 ? (
          <div className="mt-2 space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2">
            {warnings.map((warning) => (
              <p key={warning} className="flex items-start gap-1.5 text-[11px] leading-5 text-amber-200/90">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                <span>{warning}</span>
              </p>
            ))}
          </div>
        ) : null}

        {sources.length > 0 ? (
          <details className="group mt-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 font-mono text-[10px] text-slate-400">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sky-400 transition hover:text-sky-300">
              <BookOpen className="h-3 w-3" />
              <span>Fuentes RAG ({sources.length})</span>
              <span className="ml-auto text-slate-500 transition group-open:rotate-180">▾</span>
            </summary>
            <ul className="mt-2 space-y-1 border-t border-slate-800 pt-2">
              {sources.map((source) => (
                <li key={source} className="flex gap-1.5 leading-4">
                  <span className="text-slate-600">›</span>
                  <span>{source}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {meta && (meta.model || meta.provider || meta.tokensUsed) ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">
            {meta.model ? <span>{meta.model}</span> : null}
            {meta.provider ? <span className="text-slate-500">/ {meta.provider}</span> : null}
            {meta.tokensUsed ? <span className="text-slate-500">{meta.tokensUsed} tok</span> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
