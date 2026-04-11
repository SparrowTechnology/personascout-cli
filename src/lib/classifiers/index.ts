import { ZodError } from 'zod';
import { classifyWithAnthropic } from './anthropic.js';
import { classifyWithOpenAICompatible } from './openai-compatible.js';
import { buildClassificationUserPrompt, buildRetryPrompt, parseClassificationResponse } from './shared.js';
import type { ContentItem, Persona, PersonaScore, ProviderDefinition } from '../../types/index.js';

export async function classifyContentItem(
  provider: ProviderDefinition,
  model: string,
  personas: Persona[],
  item: ContentItem,
): Promise<PersonaScore[] | null> {
  const userPrompt = buildClassificationUserPrompt(personas, item);
  const personaIds = personas.map((persona) => persona.id);

  const initialResponse = await callProvider(provider, model, userPrompt);
  try {
    return parseClassificationResponse(initialResponse, personaIds);
  } catch (error) {
    if (!isParseError(error)) {
      throw error;
    }
  }

  const retryResponse = await callProvider(
    provider,
    model,
    buildRetryPrompt(userPrompt, 'Previous response was not valid JSON for the required schema.'),
  );

  try {
    return parseClassificationResponse(retryResponse, personaIds);
  } catch (error) {
    console.warn(
      `Warning: could not parse classification for "${item.title}" after retry. Skipping item. ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

async function callProvider(
  provider: ProviderDefinition,
  model: string,
  userPrompt: string,
): Promise<string> {
  if (provider.sdk === 'anthropic') {
    return classifyWithAnthropic(provider, model, userPrompt);
  }

  return classifyWithOpenAICompatible(provider, model, userPrompt);
}

function isParseError(error: unknown): boolean {
  return error instanceof SyntaxError || error instanceof ZodError;
}
