// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Logging estructurado de errores: nunca serializa el error completo, porque
// Drizzle/Neon pueden incluir la consulta y sus valores en el mensaje.

export function errorCode(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code || error.name || 'error';
  }
  return 'unknown';
}

export interface LogServerErrorOptions {
  /**
   * Añade el mensaje del error al log. Por omisión se omite porque
   * Drizzle/Neon pueden incluir la consulta y sus valores; para errores de
   * driver (código SQLSTATE) el mensaje es lo único que permite diagnosticar.
   */
  includeMessage?: boolean;
}

export function logServerError(
  event: string,
  error: unknown,
  options: LogServerErrorOptions = {}
): void {
  const payload: Record<string, unknown> = { event, error: errorCode(error) };
  if (options.includeMessage && error instanceof Error && error.message) {
    payload.detail = error.message.slice(0, 320);
  }
  console.error(JSON.stringify(payload));
}
