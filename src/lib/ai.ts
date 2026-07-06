import Anthropic from '@anthropic-ai/sdk';

export const AI_MODEL = 'claude-haiku-4-5-20251001';

export function isAIEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function getAnthropicClient(): Anthropic {
  if (!isAIEnabled()) {
    throw new Error('getAnthropicClient called while AI is disabled — check isAIEnabled() first');
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}
