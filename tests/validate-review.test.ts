import { describe, it, expect } from 'vitest';
import { ApplyReviewBody, GenerateReviewBody } from '@/lib/validate';

describe('GenerateReviewBody', () => {
  it('accepts a valid date and rejects a malformed one', () => {
    expect(GenerateReviewBody.safeParse({ today: '2026-07-03' }).success).toBe(true);
    expect(GenerateReviewBody.safeParse({ today: '07/03/2026' }).success).toBe(false);
    expect(GenerateReviewBody.safeParse({}).success).toBe(false);
  });
});

describe('ApplyReviewBody', () => {
  it('accepts a valid date and rejects a malformed one', () => {
    expect(ApplyReviewBody.safeParse({ effectiveFrom: '2026-07-03' }).success).toBe(true);
    expect(ApplyReviewBody.safeParse({ effectiveFrom: 'not-a-date' }).success).toBe(false);
  });
});
