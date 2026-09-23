import { createHmac } from 'crypto';
import env from '../config/env';
import AppError from './AppError';

type GoogleTokenInfo = {
  aud?: string;
  iss?: string;
  email?: string;
  email_verified?: string | boolean;
  sub?: string;
  name?: string;
};

export async function verifyGoogleIdToken(credential: string) {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new AppError('Google sign-in is not configured', 500);
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!response.ok) throw new AppError('Google sign-in failed. Try again.', 401);
  const payload = (await response.json()) as GoogleTokenInfo;
  if (payload.aud !== clientId) throw new AppError('Google sign-in failed. Try again.', 401);
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
    throw new AppError('Google sign-in failed. Try again.', 401);
  }
  const email = String(payload.email || '').trim().toLowerCase();
  const verified = payload.email_verified === true || payload.email_verified === 'true';
  if (!email || !verified) throw new AppError('A verified Google email is required', 400);
  return {
    email,
    googleSub: String(payload.sub || ''),
    name: String(payload.name || '').trim() || null,
  };
}

export const GOOGLE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const PHONE_SESSION_SUBJECT = 'phone';

export function signVisitorGoogle(
  organizationId: string,
  email: string,
  options?: { issuedAt?: number; expiresAt?: number }
) {
  const iat = options?.issuedAt ?? Date.now();
  const exp = options?.expiresAt ?? iat + GOOGLE_SESSION_MS;
  const payload = `${organizationId}:${email}:${iat}:${exp}`;
  const sig = createHmac('sha256', env.JWT_SECRET).update(payload).digest('hex');
  return `${iat}.${exp}.${sig}`;
}

export function parseVisitorGoogleToken(token: string) {
  const parts = String(token || '').split('.');
  if (parts.length >= 3) {
    const iat = Number(parts[0]);
    const exp = Number(parts[1]);
    const sig = parts.slice(2).join('.');
    if (!iat || !exp || !sig) return null;
    return { iat, exp, sig, version: 2 as const };
  }
  const exp = Number(parts[0]);
  const sig = parts[1];
  if (!exp || !sig) return null;
  return { iat: exp - GOOGLE_SESSION_MS, exp, sig, version: 1 as const };
}

export function googleTokenExpiry(token: string) {
  return parseVisitorGoogleToken(token)?.exp || 0;
}

export function assertVisitorGoogle(organizationId: string, email: string, token: string) {
  const parsed = parseVisitorGoogleToken(token);
  if (!parsed || Date.now() > parsed.exp) {
    throw new AppError('Google sign-in expired. Continue with Google again.', 401);
  }
  const payload =
    parsed.version === 2
      ? `${organizationId}:${email}:${parsed.iat}:${parsed.exp}`
      : `${organizationId}:${email}:${parsed.exp}`;
  const expected = createHmac('sha256', env.JWT_SECRET).update(payload).digest('hex');
  if (expected !== parsed.sig) throw new AppError('Continue with Google first', 401);
  return parsed;
}

/** HMAC check only — used to silently re-open returning visitors already in DB (even if token expired). */
export function assertVisitorGoogleSignature(organizationId: string, email: string, token: string) {
  const parsed = parseVisitorGoogleToken(token);
  if (!parsed) throw new AppError('Continue with Google first', 401);
  const payload =
    parsed.version === 2
      ? `${organizationId}:${email}:${parsed.iat}:${parsed.exp}`
      : `${organizationId}:${email}:${parsed.exp}`;
  const expected = createHmac('sha256', env.JWT_SECRET).update(payload).digest('hex');
  if (expected !== parsed.sig) throw new AppError('Continue with Google first', 401);
  return parsed;
}
