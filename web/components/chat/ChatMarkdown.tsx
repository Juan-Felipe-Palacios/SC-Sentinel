// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Renderer Markdown mínimo y seguro (React escapa el HTML; no se usa innerHTML).

'use client';

import { Fragment, type ReactNode } from 'react';

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g;
  const parts = text.split(pattern);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (!part) return null;

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={key}
          className="rounded border border-sky-400/20 bg-slate-950/80 px-1 py-0.5 font-mono text-[0.85em] text-sky-400"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const [, label, href] = link;
      if (/^(https?:\/\/|mailto:)/i.test(href)) {
        return (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sky-400 underline decoration-sky-400/40 underline-offset-2 hover:decoration-sky-400"
          >
            {label}
          </a>
        );
      }
      return <Fragment key={key}>{label}</Fragment>;
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={key} className="italic text-slate-100/90">
          {part.slice(1, -1)}
        </em>
      );
    }

    return <Fragment key={key}>{part}</Fragment>;
  });
}

function renderTextBlock(block: string, blockKey: string): ReactNode[] {
  const lines = block.split('\n');
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      nodes.push(
        <p
          key={`${blockKey}-h-${index}`}
          className="font-display text-[13px] font-semibold tracking-wide text-slate-100"
        >
          {renderInline(heading[2], `${blockKey}-h-${index}`)}
        </p>
      );
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''));
        index += 1;
      }
      nodes.push(
        <ul key={`${blockKey}-ul-${index}`} className="my-1.5 list-disc space-y-1 pl-5 marker:text-sky-400/80">
          {items.map((item, itemIndex) => (
            <li key={`${blockKey}-li-${index}-${itemIndex}`}>
              {renderInline(item, `${blockKey}-li-${index}-${itemIndex}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''));
        index += 1;
      }
      nodes.push(
        <ol key={`${blockKey}-ol-${index}`} className="my-1.5 list-decimal space-y-1 pl-5 marker:text-sky-400/80">
          {items.map((item, itemIndex) => (
            <li key={`${blockKey}-oli-${index}-${itemIndex}`}>
              {renderInline(item, `${blockKey}-oli-${index}-${itemIndex}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      if (
        !current.trim() ||
        /^#{1,4}\s+/.test(current) ||
        /^\s*[-*]\s+/.test(current) ||
        /^\s*\d+[.)]\s+/.test(current)
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }

    if (paragraph.length > 0) {
      nodes.push(
        <p key={`${blockKey}-p-${index}`} className="whitespace-pre-wrap">
          {paragraph.map((paragraphLine, lineIndex) => (
            <Fragment key={`${blockKey}-pl-${index}-${lineIndex}`}>
              {lineIndex > 0 ? <br /> : null}
              {renderInline(paragraphLine, `${blockKey}-pl-${index}-${lineIndex}`)}
            </Fragment>
          ))}
        </p>
      );
    }
  }

  return nodes;
}

export function ChatMarkdown({ content }: { content: string }) {
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-[13px] leading-6 text-slate-100/90">
      {segments.map((segment, index) => {
        if (!segment) return null;

        if (segment.startsWith('```')) {
          const match = segment.match(/^```[^\n]*\n?([\s\S]*?)```$/);
          const code = (match?.[1] ?? segment.slice(3, -3)).replace(/\n$/, '');
          return (
            <pre
              key={`code-${index}`}
              className="overflow-x-auto rounded-lg border border-sky-400/20 bg-slate-950/90 p-3 font-mono text-[11px] leading-5 text-sky-400/90"
            >
              <code>{code}</code>
            </pre>
          );
        }

        return (
          <Fragment key={`text-${index}`}>
            {renderTextBlock(segment, `block-${index}`)}
          </Fragment>
        );
      })}
    </div>
  );
}
