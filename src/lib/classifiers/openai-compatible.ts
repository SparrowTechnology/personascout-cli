import OpenAI from 'openai';
import { CLASSIFICATION_SYSTEM_PROMPT } from './shared.js';
import type { ProviderDefinition } from '../../types/index.js';

export async function classifyWithOpenAICompatible(
  provider: ProviderDefinition,
  model: string,
  userPrompt: string,
): Promise<string> {
  const apiKey = provider.requires_key
    ? process.env[provider.api_key_env]?.trim()
    : process.env[provider.api_key_env]?.trim() || 'personascout-local';

  if (!apiKey) {
    throw new Error(`Missing API key. Set ${provider.api_key_env} before running classification.`);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: provider.base_url,
  });

  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: CLASSIFICATION_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  const rawContent = completion.choices[0]?.message?.content as unknown;
  if (!rawContent) {
    throw new Error('Provider returned an empty response.');
  }

  if (typeof rawContent === 'string') {
    return rawContent.trim();
  }

  if (!Array.isArray(rawContent)) {
    throw new Error('Provider returned a response format PersonaScout does not support.');
  }

  return rawContent
    .map((part: { text?: string }) => part.text ?? '')
    .join('\n')
    .trim();
}
