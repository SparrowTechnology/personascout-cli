import axios, { type AxiosInstance } from 'axios';
import Firecrawl, { type CrawlJob } from '@mendable/firecrawl-js';
import { load } from 'cheerio';
import { normalizeContentItem, stripHtml, stripMarkdown } from '../content.js';
import type { ContentItem } from '../../types/content.js';
import type { Source } from '../../types/source.js';

export interface FetchWebsiteOptions {
  limit: number;
  depth: number;
  since?: string;
  now?: string;
  httpClient?: Pick<AxiosInstance, 'get'>;
  firecrawlClient?: Pick<Firecrawl, 'crawl'>;
  firecrawlApiKey?: string;
}

export async function fetchWebsiteSource(source: Source, options: FetchWebsiteOptions): Promise<ContentItem[]> {
  if (source.type !== 'website') {
    throw new Error(`Source "${source.id}" is not a website source.`);
  }

  if (!source.url) {
    throw new Error(`Source "${source.id}" is missing a URL.`);
  }

  const firecrawlApiKey = options.firecrawlApiKey ?? process.env.FIRECRAWL_API_KEY;
  if (firecrawlApiKey) {
    const crawlClient = options.firecrawlClient ?? new Firecrawl({ apiKey: firecrawlApiKey });
    return fetchWebsiteWithFirecrawl(source, options, crawlClient);
  }

  return fetchWebsiteWithCheerio(source, options);
}

async function fetchWebsiteWithFirecrawl(
  source: Source,
  options: FetchWebsiteOptions,
  client: Pick<Firecrawl, 'crawl'>,
): Promise<ContentItem[]> {
  const crawl = await client.crawl(source.url!, {
    limit: options.limit,
    maxDiscoveryDepth: options.depth,
    scrapeOptions: {
      formats: ['markdown', 'html'],
      onlyMainContent: true,
    },
  });

  return normalizeFirecrawlDocuments(source, crawl, options);
}

async function fetchWebsiteWithCheerio(source: Source, options: FetchWebsiteOptions): Promise<ContentItem[]> {
  const httpClient = options.httpClient ?? axios.create({
    timeout: 15000,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'personascout/0.1.0',
    },
  });

  const rootUrl = new URL(source.url!);
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: normalizeDiscoveredUrl(rootUrl), depth: 0 }];
  const items: ContentItem[] = [];
  const sinceDate = options.since ? new Date(options.since) : null;
  const fetchedAt = options.now ?? new Date().toISOString();

  while (queue.length > 0 && items.length < options.limit) {
    const current = queue.shift()!;
    if (visited.has(current.url)) {
      continue;
    }

    visited.add(current.url);

    const response = await httpClient.get<string>(current.url, {
      responseType: 'text',
    });

    const $ = load(response.data);
    const bodyText = extractWebsiteBodyText($);

    if (bodyText.length > 0) {
      const publishedAt = extractWebsitePublishedAt($);
      const normalized = normalizeContentItem({
        sourceId: source.id,
        url: current.url,
        title: extractWebsiteTitle($, current.url),
        bodyText,
        publishedAt,
        fetchedAt,
      });

      if (!sinceDate || !normalized.published_at || new Date(normalized.published_at) > sinceDate) {
        items.push(normalized);
      }
    }

    if (current.depth >= options.depth) {
      continue;
    }

    for (const link of extractWebsiteLinks($, current.url, rootUrl)) {
      if (!visited.has(link) && !queue.some((entry) => entry.url === link)) {
        queue.push({ url: link, depth: current.depth + 1 });
      }
    }
  }

  return items.slice(0, options.limit);
}

function normalizeFirecrawlDocuments(
  source: Source,
  crawl: CrawlJob,
  options: FetchWebsiteOptions,
): ContentItem[] {
  const sinceDate = options.since ? new Date(options.since) : null;
  const fetchedAt = options.now ?? new Date().toISOString();

  return (crawl.data ?? [])
    .map((document) => {
      const url = String(document.metadata?.url ?? document.metadata?.sourceURL ?? source.url ?? '').trim();
      const title = String(document.metadata?.title ?? document.metadata?.ogTitle ?? url).trim();
      const bodyText = getFirecrawlBodyText(document);
      const publishedAt = normalizePublishedDate(
        String(
          document.metadata?.publishedTime ??
            document.metadata?.modifiedTime ??
            document.metadata?.dcDate ??
            '',
        ).trim(),
      );

      if (!url || !bodyText) {
        return null;
      }

      return normalizeContentItem({
        sourceId: source.id,
        url,
        title,
        bodyText,
        publishedAt,
        fetchedAt,
      });
    })
    .filter((item): item is ContentItem => item !== null)
    .filter((item) => {
      if (!sinceDate || !item.published_at) {
        return true;
      }

      return new Date(item.published_at) > sinceDate;
    })
    .slice(0, options.limit);
}

function getFirecrawlBodyText(document: CrawlJob['data'][number]): string {
  if (document.markdown) {
    return stripMarkdown(document.markdown);
  }

  if (document.html) {
    return stripHtml(document.html);
  }

  if (document.summary) {
    return stripMarkdown(document.summary);
  }

  return '';
}

function extractWebsiteBodyText($: ReturnType<typeof load>): string {
  $('script, style, nav, footer, header, noscript').remove();

  const container = $('article').first().length > 0
    ? $('article').first()
    : $('main').first().length > 0
      ? $('main').first()
      : $('body').first();

  return container.text().replace(/\s+/g, ' ').trim();
}

function extractWebsiteTitle($: ReturnType<typeof load>, fallbackUrl: string): string {
  const title = $('head title').first().text().trim();
  if (title) {
    return title;
  }

  const h1 = $('h1').first().text().trim();
  if (h1) {
    return h1;
  }

  return fallbackUrl;
}

function extractWebsitePublishedAt($: ReturnType<typeof load>): string | null {
  const candidates = [
    $('meta[property="article:published_time"]').attr('content'),
    $('meta[name="article:published_time"]').attr('content'),
    $('meta[name="published_time"]').attr('content'),
    $('meta[name="pubdate"]').attr('content'),
    $('meta[name="date"]').attr('content'),
    $('time[datetime]').first().attr('datetime'),
  ];

  for (const candidate of candidates) {
    const normalized = normalizePublishedDate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function extractWebsiteLinks($: ReturnType<typeof load>, currentUrl: string, rootUrl: URL): string[] {
  const links = new Set<string>();

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) {
      return;
    }

    try {
      const resolved = new URL(href, currentUrl);
      if (!['http:', 'https:'].includes(resolved.protocol)) {
        return;
      }

      resolved.hash = '';
      if (!isSameDomain(rootUrl, resolved)) {
        return;
      }

      links.add(normalizeDiscoveredUrl(resolved));
    } catch {
      return;
    }
  });

  return [...links];
}

function isSameDomain(root: URL, candidate: URL): boolean {
  return normalizeHostname(root.hostname) === normalizeHostname(candidate.hostname);
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./, '').toLowerCase();
}

function normalizeDiscoveredUrl(url: URL): string {
  const normalized = new URL(url.toString());
  normalized.hash = '';
  if (normalized.pathname !== '/' && normalized.pathname.endsWith('/')) {
    normalized.pathname = normalized.pathname.slice(0, -1);
  }

  return normalized.toString();
}

function normalizePublishedDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
