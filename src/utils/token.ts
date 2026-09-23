import { createHmac, timingSafeEqual } from 'crypto';
import env from '../config/env';
import type { AuthUser } from '../types/auth';
import { normalizeStaffPages } from './dashboardAccess';

type TokenPayload = AuthUser & { exp: number };

function parseExpirySeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return 7 * 24 * 60 * 60;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === 's') return amount;
  if (unit === 'm') return amount * 60;
  if (unit === 'h') return amount * 60 * 60;
  return amount * 24 * 60 * 60;
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(input: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(input).digest('base64url');
}

export function getTokenTtlSeconds(): number {
  return parseExpirySeconds(env.JWT_EXPIRES_IN);
}

export function signAuthToken(user: AuthUser): string {
  const payload: TokenPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + getTokenTtlSeconds(),
  };
  const encoded = encode(payload);
  return `${encoded}.${sign(encoded)}`;
}

export function verifyAuthToken(token: string): AuthUser | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const given = Buffer.from(signature);
  const good = Buffer.from(expected);
  if (given.length !== good.length || !timingSafeEqual(given, good)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as TokenPayload;
    if (!payload?.id || !payload.email || !payload.role || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return {
      id: payload.id,
      email: payload.email,
      fullName: payload.fullName,
      phone: payload.phone || '',
      role: payload.role,
      organizationId: payload.organizationId ?? null,
      staffRoleId: payload.staffRoleId ?? null,
      staffCode: payload.staffCode ?? null,
      allowedPages: payload.role === 'staff' ? normalizeStaffPages(payload.allowedPages) : undefined,
    };
  } catch {
    return null;
  }
}
