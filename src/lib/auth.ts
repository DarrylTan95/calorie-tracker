import { createHash, timingSafeEqual } from 'crypto';

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function verifyPassword(
  password: string,
  expectedHash: string = process.env.AUTH_PASSWORD_HASH ?? '',
): boolean {
  if (!/^[0-9a-f]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(sha256Hex(password), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return timingSafeEqual(actual, expected);
}
