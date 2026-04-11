import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultConfig, getProjectPaths, initializeProject } from '../src/lib/config.js';
import { getProviderStatus, listResolvedProviders, resolveProvider } from '../src/lib/providers.js';
import type { Config } from '../src/types/config.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe('provider helpers', () => {
  it('resolves a built-in provider', () => {
    const config: Config = createDefaultConfig({
      companyName: 'Acme',
      website: 'https://example.com',
      providerId: 'anthropic',
      model: 'claude-haiku-4-5',
    });

    const provider = resolveProvider('anthropic', config);
    expect(provider.default_model).toBe('claude-haiku-4-5');
    expect(provider.sdk).toBe('anthropic');
  });

  it('applies custom overrides and custom providers', () => {
    const config: Config = {
      ...createDefaultConfig({
        companyName: 'Acme',
        website: 'https://example.com',
        providerId: 'openai',
        model: 'gpt-4o-mini',
      }),
      providers: {
        openai: {
          default_model: 'gpt-4.1-mini',
        },
        'my-llm': {
          display_name: 'Internal LLM',
          sdk: 'openai-compatible',
          base_url: 'https://llm.internal.example/v1',
          api_key_env: 'INTERNAL_LLM_KEY',
          requires_key: true,
          default_model: 'company-model-v2',
        },
      },
    };

    const providers = listResolvedProviders(config);

    expect(providers.find((entry) => entry.id === 'openai')?.default_model).toBe('gpt-4.1-mini');
    expect(providers.find((entry) => entry.id === 'openai')?.source).toBe('custom-override');
    expect(providers.find((entry) => entry.id === 'my-llm')?.display_name).toBe('Internal LLM');
    expect(providers.find((entry) => entry.id === 'my-llm')?.source).toBe('custom');
  });

  it('reports provider status from project config', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-providers-'));
    tempDirs.push(cwd);

    const config = createDefaultConfig({
      companyName: 'Acme',
      website: 'https://example.com',
      providerId: 'anthropic',
      model: 'claude-haiku-4-5',
    });

    await initializeProject(config, cwd);

    const paths = getProjectPaths(cwd);
    const updatedConfig = {
      ...config,
      providers: {
        'team-llm': {
          display_name: 'Team LLM',
          sdk: 'openai-compatible',
          base_url: 'https://team-llm.example/v1',
          api_key_env: 'TEAM_LLM_KEY',
          requires_key: true,
          default_model: 'team-model',
        },
      },
    };

    await writeFile(paths.config, `${JSON.stringify(updatedConfig, null, 2)}\n`, 'utf8');

    const status = await getProviderStatus('team-llm', cwd);
    expect(status.display_name).toBe('Team LLM');
    expect(status.key_status).toBe('no-key');
  });
});
