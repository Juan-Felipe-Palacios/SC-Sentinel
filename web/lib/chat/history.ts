// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Persistencia del historial del chatbot, siempre acotada al device autorizado.

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  bigintToNumber,
  defaultQueryDb,
  isoOrNull,
  queryRows,
  type QueryDb,
} from '@/lib/query/db-rows';
import type {
  ChatConversation,
  ChatConversationSummary,
  ChatRole,
  ChatStoredMessage,
} from './types';

interface ConversationRow {
  id: string;
  title: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
}

interface ConversationSummaryRow extends ConversationRow {
  message_count: number | string | null;
}

interface MessageRow {
  id: string;
  role: string;
  content: string;
  tokens_used: number | string | null;
  metadata_json: unknown;
  created_at: Date | string | null;
}

function mapConversation(row: ConversationRow): ChatConversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: isoOrNull(row.created_at),
    updatedAt: isoOrNull(row.updated_at),
  };
}

function mapMessage(row: MessageRow): ChatStoredMessage {
  const role: ChatRole = row.role === 'user' ? 'user' : 'assistant';
  return {
    id: row.id,
    role,
    content: row.content,
    tokensUsed: bigintToNumber(row.tokens_used),
    metadata: row.metadata_json ?? null,
    createdAt: isoOrNull(row.created_at),
  };
}

/** Título corto y estable para listar conversaciones. */
export function titleFromMessage(message: string, maxLength = 80): string {
  const compact = message.replace(/\s+/g, ' ').trim();
  if (!compact) return 'Nueva conversación';
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1)}…`;
}

export async function createConversation(
  deviceId: string,
  title: string,
  database: QueryDb = defaultQueryDb
): Promise<ChatConversation> {
  const id = `conv_${randomUUID()}`;
  const rows = await queryRows<ConversationRow>(
    database,
    sql`INSERT INTO chat_conversations (id, device_id, title, created_at, updated_at)
        VALUES (${id}, ${deviceId}, ${title}, NOW(), NOW())
        RETURNING id, title, created_at, updated_at`
  );

  return mapConversation(
    rows[0] ?? {
      id,
      title,
      created_at: null,
      updated_at: null,
    }
  );
}

export async function getConversation(
  conversationId: string,
  deviceId: string,
  database: QueryDb = defaultQueryDb
): Promise<ChatConversation | null> {
  const rows = await queryRows<ConversationRow>(
    database,
    sql`SELECT id, title, created_at, updated_at
        FROM chat_conversations
        WHERE id = ${conversationId}
          AND device_id = ${deviceId}
        LIMIT 1`
  );
  return rows[0] ? mapConversation(rows[0]) : null;
}

export async function listConversations(
  deviceId: string,
  database: QueryDb = defaultQueryDb,
  limit = 20
): Promise<ChatConversationSummary[]> {
  const rows = await queryRows<ConversationSummaryRow>(
    database,
    sql`SELECT c.id,
               c.title,
               c.created_at,
               c.updated_at,
               COUNT(m.id)::bigint AS message_count
        FROM chat_conversations c
        LEFT JOIN chat_messages m ON m.conversation_id = c.id
        WHERE c.device_id = ${deviceId}
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        LIMIT ${limit}`
  );

  return rows.map((row) => ({
    ...mapConversation(row),
    messageCount: bigintToNumber(row.message_count),
  }));
}

async function queryMessages(
  conversationId: string,
  deviceId: string,
  database: QueryDb,
  limit: number,
  order: 'asc' | 'desc'
): Promise<ChatStoredMessage[]> {
  const direction = order === 'asc' ? sql`ASC` : sql`DESC`;
  const rows = await queryRows<MessageRow>(
    database,
    sql`SELECT m.id,
               m.role,
               m.content,
               m.tokens_used,
               m.metadata_json,
               m.created_at
        FROM chat_messages m
        INNER JOIN chat_conversations c ON c.id = m.conversation_id
        WHERE m.conversation_id = ${conversationId}
          AND c.device_id = ${deviceId}
        ORDER BY m.created_at ${direction}, m.id ${direction}
        LIMIT ${limit}`
  );

  return rows.map(mapMessage);
}

/** Últimos mensajes en orden cronológico (para el prompt del LLM). */
export async function getRecentMessages(
  conversationId: string,
  deviceId: string,
  database: QueryDb = defaultQueryDb,
  limit = 12
): Promise<ChatStoredMessage[]> {
  const rows = await queryMessages(conversationId, deviceId, database, limit, 'desc');
  return rows.reverse();
}

/** Historial completo (acotado) para el endpoint de lectura. */
export async function getConversationMessages(
  conversationId: string,
  deviceId: string,
  database: QueryDb = defaultQueryDb,
  limit = 50
): Promise<ChatStoredMessage[]> {
  return queryMessages(conversationId, deviceId, database, limit, 'asc');
}

export async function appendMessage(
  args: {
    conversationId: string;
    deviceId: string;
    role: ChatRole;
    content: string;
    tokensUsed?: number;
    metadata?: unknown;
  },
  database: QueryDb = defaultQueryDb
): Promise<string> {
  const id = `msg_${randomUUID()}`;
  const metadataJson = args.metadata == null ? null : JSON.stringify(args.metadata);

  await queryRows<{ id: string }>(
    database,
    sql`INSERT INTO chat_messages
          (id, conversation_id, role, content, tokens_used, metadata_json, created_at)
        VALUES (
          ${id},
          ${args.conversationId},
          ${args.role},
          ${args.content},
          ${args.tokensUsed ?? 0},
          ${metadataJson}::jsonb,
          NOW()
        )
        RETURNING id`
  );

  await queryRows<{ id: string }>(
    database,
    sql`UPDATE chat_conversations
        SET updated_at = NOW()
        WHERE id = ${args.conversationId}
          AND device_id = ${args.deviceId}
        RETURNING id`
  );

  return id;
}

export async function deleteConversation(
  conversationId: string,
  deviceId: string,
  database: QueryDb = defaultQueryDb
): Promise<boolean> {
  const rows = await queryRows<{ id: string }>(
    database,
    sql`DELETE FROM chat_conversations
        WHERE id = ${conversationId}
          AND device_id = ${deviceId}
        RETURNING id`
  );
  return rows.length > 0;
}
