import Parser from 'rss-parser';
import { normalizeContentItem, stripHtml } from '../content.js';
import type { ContentItem } from '../../types/content.js';
import type { Source } from '../../types/source.js';

export interface FetchRssOptions {
  limit: number;
  since?: string;
  parser?: Parser;
  now?: string;
  onProgress?: (message: string) => void;
}

export async function fetchRssSource(source: Source, options: FetchRssOptions): Promise<ContentItem[]> {
  if (source.type !== 'rss') {
    throw new Error(`Source "${source.id}" is not an RSS source.`);
  }

  if (!source.url) {
    throw new Error(`Source "${source.id}" is missing a URL.`);
  }

  const parser = options.parser ?? new Parser();
  options.onProgress?.('requesting feed');
  const feed = await parser.parseURL(source.url);
  const allItems = feed.items ?? [];
  const items = options.limit > 0 ? allItems.slice(0, options.limit) : allItems;
  options.onProgress?.(`parsed ${allItems.length} feed item${allItems.length === 1 ? '' : 's'}`);
  const sinceDate = options.since ? new Date(options.since) : null;
  const fetchedAt = options.now ?? new Date().toISOString();

  return items
    .map((item) => {
      const body = item.content ?? item['content:encoded'] ?? item.summary ?? '';
      const publishedAt = item.isoDate ?? normalizePublishedDate(item.pubDate);

      return normalizeContentItem({
        sourceId: source.id,
        url: item.link ?? '',
        title: item.title ?? '(untitled)',
        bodyText: stripHtml(body),
        publishedAt,
        fetchedAt,
      });
    })
    .filter((item) => item.url.length > 0)
    .filter((item) => {
      if (!sinceDate || !item.published_at) {
        return true;
      }

      return new Date(item.published_at) > sinceDate;
    });
}

function normalizePublishedDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
