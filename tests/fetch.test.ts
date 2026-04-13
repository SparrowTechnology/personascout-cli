import { createServer, type Server } from 'node:http';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultConfig, getProjectPaths, initializeProject } from '../src/lib/config.js';
import { fetchProjectSources } from '../src/lib/fetch.js';
import { saveSource } from '../src/lib/source.js';

const tempDirs: string[] = [];
const servers: Server[] = [];
const originalFirecrawlApiKey = process.env.FIRECRAWL_API_KEY;

afterEach(async () => {
  process.env.FIRECRAWL_API_KEY = originalFirecrawlApiKey;
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

  it('treats fetch limit 0 as unlimited', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-fetch-unlimited-'));
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
          <item><title>One</title><link>http://127.0.0.1:43125/posts/1</link><description>One</description></item>
          <item><title>Two</title><link>http://127.0.0.1:43125/posts/2</link><description>Two</description></item>
          <item><title>Three</title><link>http://127.0.0.1:43125/posts/3</link><description>Three</description></item>
        </channel>
      </rss>`);

    servers.push(server.server);

    await saveSource(
      {
        type: 'rss',
        label: 'Unlimited Feed',
        url: server.url,
      },
      cwd,
    );

    const results = await fetchProjectSources({ cwd, limit: 0 });

    expect(results[0]).toMatchObject({
      status: 'fetched',
      fetched: 3,
      added: 3,
    });
  });

  it('treats the legacy default fetch limit of 100 as unlimited', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-fetch-legacy-limit-'));
    tempDirs.push(cwd);

    const config = createDefaultConfig({
      companyName: 'Acme',
      website: 'https://example.com',
      providerId: 'anthropic',
      model: 'claude-haiku-4-5',
    });
    config.fetch_limit = 100;

    await initializeProject(config, cwd);

    const itemsXml = Array.from({ length: 101 }, (_, index) => `
      <item>
        <title>Post ${index + 1}</title>
        <link>http://127.0.0.1:43126/posts/${index + 1}</link>
        <description>Item ${index + 1}</description>
      </item>`).join('');

    const server = await startFeedServer(`<?xml version="1.0" encoding="UTF-8" ?>
      <rss version="2.0">
        <channel>
          <title>Legacy Feed</title>
          ${itemsXml}
        </channel>
      </rss>`);

    servers.push(server.server);

    await saveSource(
      {
        type: 'rss',
        label: 'Legacy Feed',
        url: server.url,
      },
      cwd,
    );

    const results = await fetchProjectSources({ cwd });

    expect(results[0]).toMatchObject({
      status: 'fetched',
      fetched: 101,
      added: 101,
    });
  });

  it('fetches website pages with cheerio fallback and respects crawl depth', async () => {
    delete process.env.FIRECRAWL_API_KEY;

    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-fetch-website-'));
    tempDirs.push(cwd);

    const config = createDefaultConfig({
      companyName: 'Acme',
      website: 'https://example.com',
      providerId: 'anthropic',
      model: 'claude-haiku-4-5',
    });
    config.fetch_depth = 1;

    await initializeProject(config, cwd);

    const server = await startWebsiteServer({
      '/': `
        <html>
          <head><title>Homepage</title></head>
          <body>
            <header>Header content</header>
            <nav>Navigation</nav>
            <main>
              <p>Homepage body</p>
              <a href="/blog/post-1">Post 1</a>
              <a href="/blog/post-2">Post 2</a>
              <a href="https://example.org/outside">Outside</a>
            </main>
            <footer>Footer content</footer>
          </body>
        </html>`,
      '/blog/post-1': `
        <html>
          <head>
            <title>Post One</title>
            <meta property="article:published_time" content="2026-04-09T10:00:00.000Z" />
          </head>
          <body>
            <article>
              <h1>Post One</h1>
              <p>Deep article content</p>
              <a href="/blog/post-1/comments">Comments</a>
            </article>
          </body>
        </html>`,
      '/blog/post-2': `
        <html>
          <head><title>Post Two</title></head>
          <body>
            <main>
              <p>Second article content</p>
            </main>
          </body>
        </html>`,
      '/blog/post-1/comments': `
        <html>
          <head><title>Comments</title></head>
          <body><main><p>Nested page should not be crawled at depth 1.</p></main></body>
        </html>`,
    });

    servers.push(server.server);

    await saveSource(
      {
        type: 'website',
        label: 'Marketing Site',
        url: `${server.baseUrl}/`,
      },
      cwd,
    );

    const results = await fetchProjectSources({ cwd });

    expect(results[0]).toMatchObject({
      status: 'fetched',
      fetched: 3,
      added: 3,
    });

    const contentDir = path.join(getProjectPaths(cwd).content, 'marketing-site');
    const files = await readdir(contentDir);
    expect(files).toHaveLength(3);

    const savedItems = await Promise.all(
      files.map(async (file) => JSON.parse(await readFile(path.join(contentDir, file), 'utf8')) as {
        title: string;
        body_text: string;
        url: string;
      }),
    );

    expect(savedItems.some((item) => item.title === 'Homepage' && item.body_text.includes('Homepage body'))).toBe(true);
    expect(savedItems.some((item) => item.body_text.includes('Header content'))).toBe(false);
    expect(savedItems.some((item) => item.url.endsWith('/blog/post-1/comments'))).toBe(false);
  });

  it('fetches csv rows with configured column mappings', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-fetch-csv-'));
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

    const csvPath = path.join(cwd, 'content-export.csv');
    await writeFile(
      csvPath,
      [
        'headline,content,published_at,link',
        '"CFO guide","<p>Planning content for finance buyers</p>","2026-04-10T10:00:00.000Z","https://example.com/cfo-guide"',
        '"CTO guide","<p>Deep technical article</p>","2026-04-11T10:00:00.000Z",""',
      ].join('\n'),
      'utf8',
    );

    await saveSource(
      {
        type: 'csv',
        label: 'CSV Export',
        file: csvPath,
        csv_mapping: {
          title: 'headline',
          body: 'content',
          date: 'published_at',
          url: 'link',
        },
      },
      cwd,
    );

    const results = await fetchProjectSources({ cwd });

    expect(results[0]).toMatchObject({
      status: 'fetched',
      fetched: 2,
      added: 2,
    });

    const contentDir = path.join(getProjectPaths(cwd).content, 'csv-export');
    const files = await readdir(contentDir);
    expect(files).toHaveLength(2);

    const savedItems = await Promise.all(
      files.map(async (file) => JSON.parse(await readFile(path.join(contentDir, file), 'utf8')) as {
        title: string;
        body_text: string;
        url: string;
      }),
    );

    expect(savedItems.some((item) => item.title === 'CFO guide' && item.body_text.includes('Planning content'))).toBe(true);
    expect(savedItems.some((item) => item.url.startsWith('personascout://csv/csv-export/'))).toBe(true);
  });

  it('applies the since filter to csv items', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-fetch-csv-since-'));
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

    const csvPath = path.join(cwd, 'timed-export.csv');
    await writeFile(
      csvPath,
      [
        'title,body,date,url',
        '"Old row","Old content","2026-04-01T10:00:00.000Z","https://example.com/old"',
        '"New row","New content","2026-04-11T10:00:00.000Z","https://example.com/new"',
      ].join('\n'),
      'utf8',
    );

    await saveSource(
      {
        type: 'csv',
        label: 'Timed Export',
        file: csvPath,
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

async function startWebsiteServer(routes: Record<string, string>): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    const url = request.url ?? '/';
    const body = routes[url];

    if (!body) {
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
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}
