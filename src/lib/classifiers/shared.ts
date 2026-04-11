import { z } from 'zod';
import type { ContentItem, Persona, PersonaScore } from '../../types/index.js';

export const CLASSIFICATION_SYSTEM_PROMPT = `You are a B2B content analyst. Your job is to assess whether a piece of content is relevant and useful to specific buyer personas, and if so, at which stage of their buying journey.

You will be given:
1. A list of buyer personas with their characteristics
2. A piece of content (title + body text)

For each persona, return:
- relevance: integer 0-10 (0 = completely irrelevant, 10 = perfectly targeted)
- funnel_stage: the single stage this content best serves this persona ("awareness", "consideration", or "decision")
- reasoning: 1 sentence explaining the score
- confidence: "high", "medium", or "low" based on how clear-cut the classification is

Only include personas where relevance >= 3. Return an empty array if no personas are relevant.

Return ONLY valid JSON. No preamble, no markdown fences.

Schema:
[
  {
    "persona_id": "string",
    "relevance": 0-10,
    "funnel_stage": "awareness|consideration|decision",
    "reasoning": "string",
    "confidence": "high|medium|low"
  }
]`;

export const classificationScoreSchema = z.array(
  z.object({
    persona_id: z.string().min(1),
    relevance: z.number().int().min(0).max(10),
    funnel_stage: z.enum(['awareness', 'consideration', 'decision']),
    reasoning: z.string().min(1),
    confidence: z.enum(['high', 'medium', 'low']),
  }),
);

export interface ClassificationUsageEstimate {
  item_count: number;
  persona_count: number;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_total_tokens: number;
  estimated_cost_usd: number | null;
}

const APPROX_INPUT_TOKENS_PER_ITEM = 1100;
const APPROX_OUTPUT_TOKENS_PER_ITEM = 200;

const APPROX_MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  'anthropic:claude-haiku-4-5': { inputPerMillion: 0.8, outputPerMillion: 4 },
  'anthropic:claude-sonnet-4-5': { inputPerMillion: 3, outputPerMillion: 15 },
  'openai:gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'openai:gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
};

export function buildClassificationUserPrompt(personas: Persona[], item: ContentItem): string {
  const personaDefinitions = personas.map((persona) => ({
    id: persona.id,
    name: persona.name,
    titles: persona.titles,
    company_size: persona.company_size,
    pain_points: persona.pain_points,
    goals: persona.goals,
    funnel_stages: persona.funnel_stages,
  }));

  return `PERSONAS:
${JSON.stringify(personaDefinitions, null, 2)}

CONTENT:
Title: ${item.title}
URL: ${item.url}

Body:
${truncateBodyText(item.body_text)}`;
}

export function buildRetryPrompt(basePrompt: string, parseError: string): string {
  return `${basePrompt}

IMPORTANT:
Your previous response could not be parsed as valid JSON that matched the schema.
Parser error: ${parseError}

Return ONLY a JSON array matching the exact schema. Do not include markdown fences, commentary, or trailing text.`;
}

export function parseClassificationResponse(rawResponse: string, personaIds: Iterable<string>): PersonaScore[] {
  const allowedPersonaIds = new Set(personaIds);
  const parsed = classificationScoreSchema.parse(JSON.parse(extractJsonPayload(rawResponse))) as PersonaScore[];
  const deduped = new Map<string, PersonaScore>();

  for (const score of parsed) {
    if (!allowedPersonaIds.has(score.persona_id) || score.relevance < 3) {
      continue;
    }

    const existing = deduped.get(score.persona_id);
    if (!existing || score.relevance > existing.relevance) {
      deduped.set(score.persona_id, score);
    }
  }

  return [...deduped.values()].sort((left, right) => right.relevance - left.relevance);
}

export function estimateClassificationUsage(
  itemCount: number,
  personaCount: number,
  providerId: string,
  model: string,
): ClassificationUsageEstimate {
  const estimatedInputTokens = itemCount * APPROX_INPUT_TOKENS_PER_ITEM;
  const estimatedOutputTokens = itemCount * APPROX_OUTPUT_TOKENS_PER_ITEM;
  const pricing = APPROX_MODEL_PRICING[`${providerId}:${model}`] ?? null;

  return {
    item_count: itemCount,
    persona_count: personaCount,
    estimated_input_tokens: estimatedInputTokens,
    estimated_output_tokens: estimatedOutputTokens,
    estimated_total_tokens: estimatedInputTokens + estimatedOutputTokens,
    estimated_cost_usd: pricing
      ? ((estimatedInputTokens / 1_000_000) * pricing.inputPerMillion)
        + ((estimatedOutputTokens / 1_000_000) * pricing.outputPerMillion)
      : null,
  };
}

function truncateBodyText(bodyText: string): string {
  return bodyText.trim().slice(0, 8000);
}

function extractJsonPayload(rawResponse: string): string {
  const trimmed = rawResponse.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return trimmed;
  }

  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return arrayMatch[0];
  }

  throw new Error('Model response did not contain a JSON array.');
}
