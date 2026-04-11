import axios, { type AxiosInstance } from 'axios';
import { load } from 'cheerio';

export interface ScrapeWebsiteContextOptions {
  limitPages?: number;
  maxCharacters?: number;
  httpClient?: Pick<AxiosInstance, 'get'>;
}

export async function scrapeWebsiteContext(
  websiteUrl: string,
  options: ScrapeWebsiteContextOptions = {},
): Promise<string> {
  const limitPages = options.limitPages ?? 4;
  const maxCharacters = options.maxCharacters ?? 12_000;
  const httpClient = options.httpClient ?? axios.create({
    timeout: 15_000,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'personascout/0.1.0',
    },
  });

  const rootUrl = new URL(websiteUrl);
  const queue = [normalizeUrl(rootUrl)];
  const visited = new Set<string>();
  const sections: string[] = [];

  while (queue.length > 0 && visited.size < limitPages && sections.join('\n\n').length < maxCharacters) {
    const currentUrl = queue.shift()!;
    if (visited.has(currentUrl)) {
      continue;
    }

    visited.add(currentUrl);

    let responseText = '';
    try {
      const response = await httpClient.get<string>(currentUrl, {
        responseType: 'text',
      });
      responseText = response.data;
    } catch {
      continue;
    }

    const $ = load(responseText);
    const discoveredLinks = extractLinks($, currentUrl, rootUrl);
    const title = $('head title').first().text().trim() || $('h1').first().text().trim() || currentUrl;
    const body = extractBodyText($);

    if (body.length > 0) {
      sections.push(`Page: ${title}\nURL: ${currentUrl}\n${body}`);
    }

    for (const link of discoveredLinks) {
      if (!visited.has(link) && !queue.includes(link) && visited.size + queue.length < limitPages) {
        queue.push(link);
      }
    }
  }

  return sections.join('\n\n').slice(0, maxCharacters).trim();
}

function extractBodyText($: ReturnType<typeof load>): string {
  $('script, style, nav, footer, header, noscript, a').remove();
  const container = $('main').first().length > 0
    ? $('main').first()
    : $('article').first().length > 0
      ? $('article').first()
      : $('body').first();

  return container.text().replace(/\s+/g, ' ').trim();
}

function extractLinks($: ReturnType<typeof load>, currentUrl: string, rootUrl: URL): string[] {
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
      if (!sameDomain(rootUrl, resolved)) {
        return;
      }

      links.add(normalizeUrl(resolved));
    } catch {
      return;
    }
  });

  return [...links];
}

function sameDomain(root: URL, candidate: URL): boolean {
  return normalizeHostname(root.hostname) === normalizeHostname(candidate.hostname);
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./, '').toLowerCase();
}

function normalizeUrl(url: URL): string {
  const normalized = new URL(url.toString());
  normalized.hash = '';
  if (normalized.pathname !== '/' && normalized.pathname.endsWith('/')) {
    normalized.pathname = normalized.pathname.slice(0, -1);
  }

  return normalized.toString();
}
