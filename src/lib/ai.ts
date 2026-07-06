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

export interface ParsedFoodItem {
  name: string;
  portionLabel: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const PARSE_FOOD_TOOL: Anthropic.Tool = {
  name: 'log_food_items',
  description: 'A structured list of food items parsed from a free-text meal description, with estimated nutrition.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            portionLabel: { type: 'string' },
            calories: { type: 'number' },
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
          },
          required: ['name', 'portionLabel', 'calories', 'protein', 'carbs', 'fat'],
        },
      },
    },
    required: ['items'],
  },
};

export async function parseFood(text: string): Promise<ParsedFoodItem[]> {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    tools: [PARSE_FOOD_TOOL],
    tool_choice: { type: 'tool', name: 'log_food_items' },
    messages: [{
      role: 'user',
      content: `Parse this meal description into individual food items with estimated nutrition (calories, protein in grams, carbs in grams, fat in grams). Use realistic portion sizes. Prefer Singaporean/hawker food knowledge when the description sounds local. Description: "${text}"`,
    }],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
  );
  if (!toolUse) return [];

  const input = toolUse.input as { items?: ParsedFoodItem[] };
  return input.items ?? [];
}

export async function reviewNarrative(input: {
  weekStart: string;
  weightTrendPercent: number | null;
  calorieAdherencePercent: number;
  proteinAdherencePercent: number;
  workoutsCompleted: number;
  workoutsPlanned: number;
  recommendationMessage: string;
}): Promise<string> {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Write a short (2-3 sentence), specific, honest coach-style summary of this past week for a calorie-tracking app user. No generic filler, no greeting. Data: weight trend ${input.weightTrendPercent === null ? 'no data' : `${input.weightTrendPercent.toFixed(2)}%/week`}, calorie adherence ${input.calorieAdherencePercent}%, protein adherence ${input.proteinAdherencePercent}%, workouts ${input.workoutsCompleted}/${input.workoutsPlanned}, current rule-based recommendation: "${input.recommendationMessage}".`,
    }],
  });

  const textBlock = message.content.find(
    (block): block is Anthropic.Messages.TextBlock => block.type === 'text',
  );
  return textBlock?.text ?? '';
}
