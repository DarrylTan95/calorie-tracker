import { describe, it, expect } from 'vitest';
import { ParseFoodBody } from '@/lib/validate';

describe('ParseFoodBody', () => {
  it('accepts a reasonable description and rejects empty/oversized text', () => {
    expect(ParseFoodBody.safeParse({ text: 'chicken rice with drumstick, kopi o kosong' }).success).toBe(true);
    expect(ParseFoodBody.safeParse({ text: '' }).success).toBe(false);
    expect(ParseFoodBody.safeParse({ text: 'a'.repeat(2001) }).success).toBe(false);
  });
});
