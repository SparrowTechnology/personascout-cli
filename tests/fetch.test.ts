import { createServer, type Server } from 'node:http';
import { readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultConfig, getProjectPaths, initializeProject } from '../src/lib/config.js';
import { fetchProjectSources } from '../src/lib/fetch.js';
import { saveSource } from '../src/lib/source.js';

const tempDirs: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(() => resolve(undefined)))));
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe('fetchProjectSources', () => {
  it('fetches rss items, strips html, and persists content files', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-fetch-'));
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

    const server = await startFeedServer(`<?xml version="1.0" encoding="UTF-8" ?>
      <rss version="2.0">
        <channel>
          <title>Acme Blog</title>
          <item>
            <title>First Post</title>
            <link>http://127.0.0.1:43123/posts/1</link>
            <description><![CDATA[<p>Hello <strong>world</strong>.</p>]]></description>
            <pubDate>Wed, 10 Apr 2026 10:00:00 GMT</pubDate>
          </item>
          <item>
            <title>Second Post</title>
            <link>http://127.0.0.1:43123/posts/2</link>
            <description><![CDATA[<p>Another item.</p>]]></description>
            <pubDate>Thu, 11 Apr 2026 10:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`);

    servers.push(server.server);

    await saveSource(
      {
        type: 'rss',
        label: 'Acme Blog',
        url: server.url,
      },
      cwd,
    );

    const results = await fetchProjectSources({ cwd });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      status: 'fetched',
      fetched: 2,
      added: 2,
    });

    const contentDir = path.join(getProjectPaths(cwd).content, 'acme-blog');
    const files = await readdir(contentDir);
    expect(files).toHaveLength(2);

    const firstSaved = JSON.parse(await readFile(path.join(contentDir, files[0]), 'utf8')) as {
      body_text: string;
      source_id: string;
    };

    expect(firstSaved.source_id).toBe('acme-blog');
    expect(firstSaved.body_text).not.toContain('<strong>');
  });

  it('applies the since filter to rss items', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-fetch-since-'));
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

    const server = await startFeedServer(`<?xml version="1.0" encoding="UTF-8" ?>
      <rss version="2.0">
        <channel>
          <title>Acme Blog</title>
          <item>
            <title>Old Post</title>
            <link>http://127.0.0.1:43124/posts/old</link>
            <description>Old item</description>
            <pubDate>Wed, 01 Apr 2026 10:00:00 GMT</pubDate>
          </item>
          <item>
            <title>New Post</title>
            <link>http://127.0.0.1:43124/posts/new</link>
            <description>New item</description>
            <pubDate>Thu, 10 Apr 2026 10:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`);

    servers.push(server.server);

    await saveSource(
      {
        type: 'rss',
        label: 'Filtered Feed',
        url: server.url,
      },
      cwd,
    );

    const results = await fetchProjectSources({
      cwd,
      since: '2026-04-05T00:00:00.000Z',
    });

    expect(results[0]).toMatchObject({
      status: 'fetched',
      fetched: 1,
      added: 1,
    });
  });
});

async function startFeedServer(feedXml: string): Promise<{ server: Server; url: string }> {
  const server = createServer((_, response) => {
    response.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
    response.end(feedXml);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine server address.');
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}/feed.xml`,
  };
}
