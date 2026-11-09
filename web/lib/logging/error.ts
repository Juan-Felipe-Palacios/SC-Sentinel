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

export function logServerError(event: string, error: unknown): void {
  console.error(JSON.stringify({ event, error: errorCode(error) }));
}
