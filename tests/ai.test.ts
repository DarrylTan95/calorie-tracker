import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAIEnabled, getAnthropicClient } from '@/lib/ai';

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

describe('isAIEnabled', () => {
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  });

  it('returns false when the env var is unset or empty', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isAIEnabled()).toBe(false);
    process.env.ANTHROPIC_API_KEY = '';
    expect(isAIEnabled()).toBe(false);
  });

  it('returns true when the env var is set to a non-empty value', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    expect(isAIEnabled()).toBe(true);
  });
});

describe('getAnthropicClient', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
  });
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  });

  it('constructs a client when AI is enabled', () => {
    expect(() => getAnthropicClient()).not.toThrow();
  });

  it('throws if called when AI is disabled', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => getAnthropicClient()).toThrow();
  });
});
