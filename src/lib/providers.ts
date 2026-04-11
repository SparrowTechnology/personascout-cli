import axios from 'axios';
import { BUILT_IN_PROVIDERS } from '../providers.js';
import { readConfig } from './config.js';
import type { Config } from '../types/config.js';
import type { ProviderDefinition } from '../types/provider.js';

export interface ProviderStatus extends ProviderDefinition {
  source: 'builtin' | 'custom' | 'custom-override';
  key_status: 'key-set' | 'no-key' | 'running' | 'not-running';
}

export function resolveProvider(id: string, config: Config): ProviderDefinition {
  const builtin = BUILT_IN_PROVIDERS.find((provider) => provider.id === id);
  const custom = config.providers?.[id];

  if (!builtin && !custom) {
    throw new Error(`Unknown provider: "${id}"\nRun 'personascout providers' to see available providers.`);
  }

  return { ...builtin, ...custom, id } as ProviderDefinition;
}

export function listResolvedProviders(config: Config): Array<ProviderDefinition & { source: ProviderStatus['source'] }> {
  const customProviders = config.providers ?? {};
  const builtinIds = new Set(BUILT_IN_PROVIDERS.map((provider) => provider.id));

  const builtinResolved: Array<ProviderDefinition & { source: ProviderStatus['source'] }> = BUILT_IN_PROVIDERS.map((provider) => ({
    ...provider,
    ...(customProviders[provider.id] ?? {}),
    id: provider.id,
    source: customProviders[provider.id] ? 'custom-override' as const : 'builtin' as const,
  }));

  const customOnlyResolved: Array<ProviderDefinition & { source: ProviderStatus['source'] }> = Object.entries(customProviders)
    .filter(([id]) => !builtinIds.has(id))
    .map(([id, provider]) => ({
      id,
      display_name: provider.display_name ?? id,
      sdk: provider.sdk ?? 'openai-compatible',
      api_key_env: provider.api_key_env ?? `${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`,
      requires_key: provider.requires_key ?? true,
      default_model: provider.default_model ?? 'unknown',
      suggested_models: provider.suggested_models ?? [],
      base_url: provider.base_url,
      notes: provider.notes,
      source: 'custom' as const,
    }));

  return [...builtinResolved, ...customOnlyResolved].sort((left, right) => left.id.localeCompare(right.id));
}

export async function getProviderStatuses(cwd = process.cwd()): Promise<ProviderStatus[]> {
  const config = await readConfig(cwd);
  const providers = listResolvedProviders(config);

  return Promise.all(
    providers.map(async (provider) => ({
      ...provider,
      key_status: await getProviderKeyStatus(provider),
    })),
  );
}

export async function getProviderStatus(providerId: string, cwd = process.cwd()): Promise<ProviderStatus> {
  const config = await readConfig(cwd);
  const provider = listResolvedProviders(config).find((entry) => entry.id === providerId);

  if (!provider) {
    throw new Error(`Unknown provider: "${providerId}"\nRun 'personascout providers' to see available providers.`);
  }

  return {
    ...provider,
    key_status: await getProviderKeyStatus(provider),
  };
}

async function getProviderKeyStatus(provider: ProviderDefinition): Promise<ProviderStatus['key_status']> {
  if (provider.id === 'ollama') {
    return (await isOllamaRunning(provider)) ? 'running' : 'not-running';
  }

  if (!provider.requires_key) {
    return 'key-set';
  }

  return process.env[provider.api_key_env]?.trim() ? 'key-set' : 'no-key';
}

async function isOllamaRunning(provider: ProviderDefinition): Promise<boolean> {
  const baseUrl = provider.base_url ?? 'http://localhost:11434/v1';
  const tagsUrl = new URL('../api/tags', baseUrl).toString();

  try {
    const response = await axios.get(tagsUrl, {
      timeout: 2000,
      validateStatus: (status) => status >= 200 && status < 500,
    });
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}
