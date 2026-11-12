// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Hash de contraseña de operador con scrypt de Node. Nunca se guarda la
// contraseña en claro ni se devuelve el hash por la API.

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const OPERATOR_PASSWORD_MIN_LENGTH = 12;
const KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, SCRYPT_PARAMS, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashOperatorPassword(password: string): Promise<string> {
  if (password.length < OPERATOR_PASSWORD_MIN_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${OPERATOR_PASSWORD_MIN_LENGTH} caracteres.`);
  }
  const salt = randomBytes(16).toString('hex');
  const derived = await derive(password, salt);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt}$${derived.toString('hex')}`;
}

export async function verifyOperatorPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, hash] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;

  try {
    const derived = await derive(password, salt);
    const expected = Buffer.from(hash, 'hex');
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export function normalizeOperatorEmail(email: string): string {
  return email.trim().toLowerCase();
}
