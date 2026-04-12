import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultConfig, getProjectPaths, initializeProject, pathExists } from '../src/lib/config.js';
import {
  createSource,
  deleteSourceById,
  getSourceContentPath,
  listSources,
  saveSource,
  slugify,
  testSource,
} from '../src/lib/source.js';

const tempDirs: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(() => resolve(undefined)))));
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

  it('deletes a source and optionally removes its fetched content', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-source-delete-'));
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

    const contentPath = getSourceContentPath('company-blog', cwd);
    await mkdir(contentPath, { recursive: true });
    await writeFile(path.join(contentPath, 'item.json'), '{"id":"item-1"}\n', 'utf8');

    const result = await deleteSourceById('company-blog', cwd, { deleteContent: true });

    expect(result.contentDeleted).toBe(true);
    await expect(listSources(cwd)).resolves.toHaveLength(0);
    await expect(pathExists(result.sourcePath)).resolves.toBe(false);
    await expect(pathExists(result.contentPath)).resolves.toBe(false);
  });

  it('tests rss, website, and csv sources', async () => {
    const website = await startWebsiteServer('<html><body>ok</body></html>');
    servers.push(website.server);

    const rssSource = await createSource(
      {
        type: 'rss',
        label: 'Company Blog',
        url: 'https://example.com/feed.xml',
      },
      await initializeTestProject('personascout-source-rss-'),
    );

    const rssResult = await testSource(rssSource, {
      parser: {
        parseURL: async () => ({
          items: new Array(47).fill({}),
        }),
      },
    });

    expect(rssResult).toMatchObject({
      ok: true,
      detail: 'reachable (47 items available)',
    });

    const websiteSource = await createSource(
      {
        type: 'website',
        label: 'Marketing Site',
        url: website.baseUrl,
      },
      await initializeTestProject('personascout-source-website-'),
    );

    const websiteResult = await testSource(websiteSource);
    expect(websiteResult).toMatchObject({
      ok: true,
      detail: 'reachable',
    });

    const csvCwd = await initializeTestProject('personascout-source-csv-');
    const csvPath = path.join(csvCwd, 'export.csv');
    const csvSource = await createSource(
      {
        type: 'csv',
        label: 'Export',
        file: csvPath,
      },
      csvCwd,
    );

    const missingCsvResult = await testSource(csvSource);
    expect(missingCsvResult.ok).toBe(false);
    expect(missingCsvResult.detail).toContain(`file not found: ${csvPath}`);

    await writeFile(csvPath, 'title,body,date,url\n', 'utf8');

    const existingCsvResult = await testSource(csvSource);
    expect(existingCsvResult).toMatchObject({
      ok: true,
      detail: `file found: ${csvPath}`,
    });
  });
});

async function initializeTestProject(prefix: string): Promise<string> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), prefix));
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

  return cwd;
}

async function startWebsiteServer(body: string): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer((request, response) => {
    if ((request.url ?? '/') !== '/') {
      response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<html><body>Not found</body></html>');
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(body);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine server address.');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
  };
}
