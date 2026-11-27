// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Propiedad de seguridad de la base de desarrollo local: PGlite sólo puede
// activarse en desarrollo y con el flag explícito. En producción el flag debe
// quedar inerte aunque alguien lo setee por error.
// No instancia PGlite: sólo evalúa el flag y el directorio por defecto.

import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LOCAL_DB_DEFAULT_DIR,
  LOCAL_DB_DIR_ENV,
  isLocalDevDbEnabled,
  localDevDbDir,
} from '../local-pglite';

const original = {
  NODE_ENV: process.env.NODE_ENV,
  SC_DEV_DB: process.env.SC_DEV_DB,
  SC_DEV_DB_DIR: process.env[LOCAL_DB_DIR_ENV],
};

// `process.env.NODE_ENV` es readonly en los tipos de Next: se escribe por una
// vista mutable para poder probar el caso producción.
function writeEnv(key: string, value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[key];
  else env[key] = value;
}

function setEnv(nodeEnv: string, flag?: string) {
  writeEnv('NODE_ENV', nodeEnv);
  writeEnv('SC_DEV_DB', flag);
}

beforeEach(() => {
  writeEnv(LOCAL_DB_DIR_ENV, undefined);
});

afterEach(() => {
  writeEnv('NODE_ENV', original.NODE_ENV);
  writeEnv('SC_DEV_DB', original.SC_DEV_DB);
  writeEnv(LOCAL_DB_DIR_ENV, original.SC_DEV_DB_DIR);
});

describe('base de desarrollo local (PGlite)', () => {
  it('queda deshabilitada sin el flag', () => {
    setEnv('development');
    expect(isLocalDevDbEnabled()).toBe(false);
  });

  it('queda deshabilitada con un valor distinto de pglite', () => {
    setEnv('development', 'neon');
    expect(isLocalDevDbEnabled()).toBe(false);
  });

  it('queda deshabilitada en producción aunque el flag esté puesto', () => {
    setEnv('production', 'pglite');
    expect(isLocalDevDbEnabled()).toBe(false);
  });

  it('se habilita sólo en desarrollo con SC_DEV_DB=pglite', () => {
    setEnv('development', 'pglite');
    expect(isLocalDevDbEnabled()).toBe(true);
  });

  it('usa web/.local-db por defecto y respeta SC_DEV_DB_DIR', () => {
    expect(localDevDbDir()).toBe(resolve(process.cwd(), LOCAL_DB_DEFAULT_DIR));
    writeEnv(LOCAL_DB_DIR_ENV, 'tmp/otra-base');
    expect(localDevDbDir()).toBe(resolve(process.cwd(), 'tmp/otra-base'));
  });
});
