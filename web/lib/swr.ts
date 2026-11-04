// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

export class FetchError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
  }
}

export async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    let detail = `Error ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.error === 'string') detail = body.error;
    } catch {
      /* respuesta no-JSON: se usa el status */
    }
    throw new FetchError(response.status, detail);
  }
  return (await response.json()) as T;
}
