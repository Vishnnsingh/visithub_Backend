import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;

  const hashed = scryptSync(password, salt, KEY_LENGTH);
  const storedHash = Buffer.from(hash, 'hex');
  if (hashed.length !== storedHash.length) return false;
  return timingSafeEqual(hashed, storedHash);
}
