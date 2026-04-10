import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultConfig, getProjectPaths, initializeProject } from '../src/lib/config.js';
import { createSource, listSources, saveSource, slugify } from '../src/lib/source.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe('source helpers', () => {
  it('slugifies labels into kebab-case ids', () => {
    expect(slugify('Company Blog RSS')).toBe('company-blog-rss');
  });

  it('normalizes csv file paths to absolute paths', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-source-'));
    tempDirs.push(cwd);

    await initializeProject(
      createDefaultConfig({
        companyName: 'Acme',
        website: 'https://example.com',
        providerId: 'anthropic',
        model: 'claude-haiku-4-5',
      }),
      cwd,
    );

    const source = await createSource(
      {
        type: 'csv',
        label: 'LinkedIn Export',
        file: './exports/linkedin.csv',
      },
      cwd,
    );

    expect(source.id).toBe('linkedin-export');
    expect(source.file).toBe(path.resolve(cwd, './exports/linkedin.csv'));
    expect(source.csv_mapping?.title).toBe('title');
  });

  it('saves and lists project sources', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-source-list-'));
    tempDirs.push(cwd);

    await initializeProject(
      createDefaultConfig({
        companyName: 'Acme',
        website: 'https://example.com',
        providerId: 'anthropic',
        model: 'claude-haiku-4-5',
      }),
      cwd,
    );

    await saveSource(
      {
        type: 'rss',
        label: 'Company Blog',
        url: 'https://example.com/feed.xml',
      },
      cwd,
    );

    const sources = await listSources(cwd);

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      id: 'company-blog',
      type: 'rss',
      label: 'Company Blog',
      url: 'https://example.com/feed.xml',
    });
    expect(getProjectPaths(cwd).sources).toContain('.personascout');
  });
});
