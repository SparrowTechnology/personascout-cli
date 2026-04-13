import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { normalizeContentItem, stripHtml } from '../content.js';
import { DEFAULT_CSV_MAPPING } from '../source.js';
import type { ContentItem } from '../../types/content.js';
import type { Source } from '../../types/source.js';

export interface FetchCsvOptions {
  since?: string;
  limit: number;
  now?: string;
  onProgress?: (message: string) => void;
}

export async function fetchCsvSource(source: Source, options: FetchCsvOptions): Promise<ContentItem[]> {
  if (source.type !== 'csv') {
    throw new Error(`Source "${source.id}" is not a CSV source.`);
  }

  if (!source.file) {
    throw new Error(`Source "${source.id}" is missing a file path.`);
  }

  const csvPath = path.resolve(source.file);
  options.onProgress?.('reading csv file');
  const raw = readFileSync(csvPath, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Array<Record<string, string>>;
  options.onProgress?.(`parsed ${rows.length} csv row${rows.length === 1 ? '' : 's'}`);

  const sinceDate = options.since ? new Date(options.since) : null;
  const fetchedAt = options.now ?? new Date().toISOString();

  return rows
    .map((row, index) => toContentItem(source, row, index, fetchedAt))
    .filter((item): item is ContentItem => item !== null)
    .filter((item) => {
      if (!sinceDate || !item.published_at) {
        return true;
      }

      return new Date(item.published_at) > sinceDate;
    })
    .slice(0, options.limit > 0 ? options.limit : undefined);
}

function toContentItem(
  source: Source,
  row: Record<string, string>,
  index: number,
  fetchedAt: string,
): ContentItem | null {
  const mapping = source.csv_mapping ?? DEFAULT_CSV_MAPPING;
  const title = getFirstDefinedValue(row, [mapping.title, 'title', 'headline', 'name'])?.trim() ?? '';
  const body = getFirstDefinedValue(row, [mapping.body, 'body', 'text', 'content'])?.trim() ?? '';
  const publishedAt = normalizePublishedDate(
    getFirstDefinedValue(row, [mapping.date, 'date', 'published_at', 'publishedAt']),
  );
  const url =
    getFirstDefinedValue(row, [mapping.url, 'url', 'link'])?.trim() ??
    `personascout://csv/${source.id}/${index + 1}`;

  if (!title && !body) {
    return null;
  }

  return normalizeContentItem({
    sourceId: source.id,
    url,
    title: title || `CSV row ${index + 1}`,
    bodyText: stripHtml(body),
    publishedAt,
    fetchedAt,
  });
}

function getFirstDefinedValue(row: Record<string, string>, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const direct = row[candidate];
    if (typeof direct === 'string' && direct.trim().length > 0) {
      return direct;
    }

    const matchedKey = Object.keys(row).find((key) => key.toLowerCase() === candidate.toLowerCase());
    if (matchedKey) {
      const value = row[matchedKey];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
  }

  return undefined;
}

function normalizePublishedDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
