import { mkdir, readFile, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { load } from 'cheerio';
import { getProjectPaths, pathExists } from './config.js';
import type { ContentItem } from '../types/content.js';

export function createContentId(seed: string): string {
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 12);
}

export function stripHtml(input: string): string {
  const $ = load(input);
  return $.text().replace(/\s+/g, ' ').trim();
}

export function stripMarkdown(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeContentItem(input: {
  sourceId: string;
  url: string;
  title: string;
  bodyText: string;
  publishedAt: string | null;
  fetchedAt?: string;
}): ContentItem {
  const cleanUrl = input.url.trim();
  const cleanTitle = input.title.trim();
  const cleanBody = input.bodyText.trim();

  return {
    id: createContentId(cleanUrl || `${cleanTitle}:${cleanBody}`),
    source_id: input.sourceId,
    url: cleanUrl,
    title: cleanTitle,
    body_text: cleanBody,
    published_at: input.publishedAt,
    fetched_at: input.fetchedAt ?? new Date().toISOString(),
  };
}

export function getContentItemPath(sourceId: string, itemId: string, cwd = process.cwd()): string {
  return path.join(getProjectPaths(cwd).content, sourceId, `${itemId}.json`);
}

export async function writeContentItem(
  item: ContentItem,
  cwd = process.cwd(),
  options: { force?: boolean } = {},
): Promise<{ existed: boolean; path: string }> {
  const outputPath = getContentItemPath(item.source_id, item.id, cwd);
  const existed = await pathExists(outputPath);

  if (existed && !options.force) {
    return { existed: true, path: outputPath };
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(item, null, 2)}\n`, 'utf8');

  return { existed, path: outputPath };
}

export async function readContentItem(filePath: string): Promise<ContentItem> {
  return JSON.parse(await readFile(filePath, 'utf8')) as ContentItem;
}
