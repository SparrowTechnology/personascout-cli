import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { ProviderDefinition } from '../types/index.js';

export interface CompletionInput {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export async function completeWithProvider(
  provider: ProviderDefinition,
  model: string,
  input: CompletionInput,
): Promise<string> {
  if (provider.sdk === 'anthropic') {
    const apiKey = process.env[provider.api_key_env]?.trim();
    if (!apiKey) {
      throw new Error(`Missing API key. Set ${provider.api_key_env} before running this command.`);
    }

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model,
      max_tokens: input.maxTokens ?? 2048,
      system: input.systemPrompt,
      messages: [{ role: 'user', content: input.userPrompt }],
    });

    return message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
  }

  const apiKey = provider.requires_key
    ? process.env[provider.api_key_env]?.trim()
    : process.env[provider.api_key_env]?.trim() || 'personascout-local';

  if (!apiKey) {
    throw new Error(`Missing API key. Set ${provider.api_key_env} before running this command.`);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: provider.base_url,
  });
  const completion = await client.chat.completions.create({
    model,
    temperature: input.temperature ?? 0,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
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
