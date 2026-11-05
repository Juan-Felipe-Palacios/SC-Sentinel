// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

import { db, devices } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { hashToken } from './token';

export { hashToken };

export interface DeviceAuthResult {
  valid: boolean;
  deviceId?: string;
  deviceName?: string | null;
  deviceStatus?: string;
  error?: 'unauthorized' | 'forbidden';
  reason?: string;
}

export async function authenticateDeviceToken(authHeader: string | null): Promise<DeviceAuthResult> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      valid: false,
      error: 'unauthorized',
      reason: 'missing_or_malformed_authorization_header',
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return {
      valid: false,
      error: 'unauthorized',
      reason: 'empty_bearer_token',
    };
  }

  const tokenHashed = hashToken(token);

  // If database is available, verify against devices table
  if (process.env.DATABASE_URL) {
    try {
      const matched = await db
        .select()
        .from(devices)
        .where(eq(devices.tokenHash, tokenHashed))
        .limit(1);

      if (matched.length === 0) {
        return {
          valid: false,
          error: 'unauthorized',
          reason: 'device_token_unknown',
        };
      }

      const device = matched[0];
      // `enrolled_pending` se acepta: el primer ingest exitoso lo promueve a `active` (ADR-0010).
      if (device.status !== 'active' && device.status !== 'enrolled_pending') {
        return {
          valid: false,
          error: 'forbidden',
          reason: 'device_inactive_or_revoked',
        };
      }

      // Tokens emitidos desde 0003 caducan a las 24 h; los previos (null) no expiran.
      if (device.tokenExpiresAt && device.tokenExpiresAt.getTime() <= Date.now()) {
        return {
          valid: false,
          error: 'forbidden',
          reason: 'token_expired',
        };
      }

      return {
        valid: true,
        deviceId: device.id,
        deviceName: device.name,
        deviceStatus: device.status,
      };
    } catch (err) {
      console.error('Database error during device auth:', err);
      // If DB error occurs, propagate failure
      return {
        valid: false,
        error: 'unauthorized',
        reason: 'auth_verification_failed',
      };
    }
  }

  // Development fallback when DATABASE_URL is not yet configured
  if (process.env.NODE_ENV === 'development' || process.env.SC_INGEST_DEV_TOKEN) {
    const devToken = process.env.SC_INGEST_DEV_TOKEN || 'sc-sentinel-dev-token';
    if (token === devToken) {
      return {
        valid: true,
        deviceId: 'dev_local_development',
        deviceName: 'Local Dev Node',
      };
    }
  }

  return {
    valid: false,
    error: 'unauthorized',
    reason: 'device_not_enrolled',
  };
}
