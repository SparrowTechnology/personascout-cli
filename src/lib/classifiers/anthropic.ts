import Anthropic from '@anthropic-ai/sdk';
import { CLASSIFICATION_SYSTEM_PROMPT } from './shared.js';
import type { ProviderDefinition } from '../../types/index.js';

export async function classifyWithAnthropic(
  provider: ProviderDefinition,
  model: string,
  userPrompt: string,
): Promise<string> {
  const apiKey = process.env[provider.api_key_env]?.trim();
  if (!apiKey) {
    throw new Error(`Missing API key. Set ${provider.api_key_env} before running classification.`);
  }

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system: CLASSIFICATION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}
