import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  appendProjectGitignoreEntries,
  createDefaultConfig,
  getProjectPaths,
  initializeProject,
  mergeGitignoreContent,
} from '../src/lib/config.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe('config helpers', () => {
  it('builds the default config from init answers', () => {
    const config = createDefaultConfig({
      companyName: 'Acme',
      website: 'https://example.com',
      providerId: 'anthropic',
      model: 'claude-haiku-4-5',
    });

    expect(config).toEqual({
      website: 'https://example.com',
      company_name: 'Acme',
      default_provider: 'anthropic',
      default_model: 'claude-haiku-4-5',
      coverage_thresholds: {
        critical: 0,
        weak: 2,
        adequate: 3,
      },
      fetch_limit: 100,
      fetch_depth: 2,
    });
  });

  it('merges gitignore entries without duplicates', () => {
    const merged = mergeGitignoreContent('node_modules/\n.personascout/content/\n', [
      '.personascout/content/',
      '.personascout/results/',
    ]);

    expect(merged).toBe('node_modules/\n.personascout/content/\n.personascout/results/\n');
  });

  it('initializes the default project structure and config file', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-config-'));
    tempDirs.push(cwd);

    const config = createDefaultConfig({
      companyName: 'Acme',
      website: 'https://example.com',
      providerId: 'ollama',
      model: 'llama3.2',
    });

    const paths = await initializeProject(config, cwd);

    await expect(stat(paths.personas)).resolves.toBeDefined();
    await expect(stat(paths.sources)).resolves.toBeDefined();
    await expect(stat(paths.content)).resolves.toBeDefined();
    await expect(stat(paths.results)).resolves.toBeDefined();

    const saved = JSON.parse(await readFile(paths.config, 'utf8'));
    expect(saved.company_name).toBe('Acme');

    await appendProjectGitignoreEntries(cwd);

    const gitignorePath = path.join(cwd, '.gitignore');
    const gitignore = await readFile(gitignorePath, 'utf8');
    expect(gitignore).toContain('.personascout/content/');
    expect(gitignore).toContain('.personascout/results/');

    expect(getProjectPaths(cwd).home).toBe(path.join(cwd, '.personascout'));
  });
});
