import { describe, it, expect } from 'vitest';
import { sha256Hex, verifyPassword } from '@/lib/auth';

describe('verifyPassword', () => {
  const hash = sha256Hex('correct-horse');

  it('accepts the right password', () => {
    expect(verifyPassword('correct-horse', hash)).toBe(true);
  });

  it('rejects a wrong password', () => {
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('rejects when hash is missing or malformed', () => {
    expect(verifyPassword('anything', '')).toBe(false);
    expect(verifyPassword('anything', 'not-hex')).toBe(false);
  });
});
