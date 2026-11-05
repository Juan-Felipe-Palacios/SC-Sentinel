-- Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
-- Migración 0003: expiración del token de enrolamiento (ADR-0010, M3.1).
-- Nullable: los devices creados antes de esta migración conservan un token sin
-- fecha de expiración (comportamiento previo), así que se siguen aceptando.

ALTER TABLE "devices" ADD COLUMN "token_expires_at" timestamp with time zone;

COMMENT ON COLUMN "devices"."token_expires_at" IS
  'ADR-0010: expiración del token de enrolamiento (24 h desde su emisión). NULL en devices previos a la migración 0003.';
