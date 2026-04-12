import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import axios, { type AxiosInstance } from 'axios';
import Parser from 'rss-parser';
import { z } from 'zod';
import { assertInitialized, getProjectPaths, pathExists } from './config.js';
import type { Source, SourceType } from '../types/source.js';

const csvMappingSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  date: z.string().min(1),
  url: z.string().min(1),
});

export const sourceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'Source id must be kebab-case.'),
    type: z.enum(['rss', 'website', 'csv']),
    label: z.string().min(1),
    url: z.string().url().optional(),
    file: z.string().min(1).optional(),
    csv_mapping: csvMappingSchema.optional(),
    last_fetched: z.string().datetime().optional(),
    item_count: z.number().int().min(0).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.type === 'rss' || value.type === 'website') && !value.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: `A ${value.type} source requires a URL.`,
      });
    }

    if (value.type === 'csv' && !value.file) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['file'],
        message: 'A csv source requires a file path.',
      });
    }
  });

export const DEFAULT_CSV_MAPPING = {
  title: 'title',
  body: 'body',
  date: 'date',
  url: 'url',
} as const;

export interface CreateSourceInput {
  type: SourceType;
  label: string;
  url?: string;
  file?: string;
  csv_mapping?: Source['csv_mapping'];
  id?: string;
}

export interface DeleteSourceResult {
  source: Source;
  sourcePath: string;
  contentPath: string;
  contentDeleted: boolean;
}

export interface SourceTestResult {
  source: Source;
  ok: boolean;
  detail: string;
}

export interface TestSourceOptions {
  parser?: Pick<Parser, 'parseURL'>;
  httpClient?: Pick<AxiosInstance, 'get'>;
  fileExists?: (targetPath: string) => Promise<boolean>;
}

export async function listSources(cwd = process.cwd()): Promise<Source[]> {
  const paths = await assertInitialized(cwd);
  const files = (await readdir(paths.sources))
    .filter((file) => file.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(files.map((file) => readSource(path.join(paths.sources, file))));
}

export async function readSource(filePath: string): Promise<Source> {
  const raw = await readFile(filePath, 'utf8');
  return sourceSchema.parse(JSON.parse(raw)) as Source;
}

export async function readSourceById(sourceId: string, cwd = process.cwd()): Promise<Source> {
  await assertInitialized(cwd);
  return readSource(getSourcePath(sourceId, cwd));
}

export async function writeSource(source: Source, cwd = process.cwd()): Promise<string> {
  await assertInitialized(cwd);
  const outputPath = getSourcePath(source.id, cwd);
  const validated = sourceSchema.parse(source) as Source;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');

  return outputPath;
}

export async function createSource(input: CreateSourceInput, cwd = process.cwd()): Promise<Source> {
  await assertInitialized(cwd);

  const trimmedLabel = input.label.trim();
  const id = (input.id ?? slugify(trimmedLabel)).trim();
  const source: Source = {
    id,
    type: input.type,
    label: trimmedLabel,
  };

  if (input.type === 'csv') {
    source.file = path.resolve(cwd, input.file ?? '');
    source.csv_mapping = {
      ...DEFAULT_CSV_MAPPING,
      ...(input.csv_mapping ?? {}),
    };
  } else {
    source.url = input.url?.trim();
  }

  return sourceSchema.parse(source) as Source;
}

export async function saveSource(
  input: CreateSourceInput,
  cwd = process.cwd(),
  options: { force?: boolean } = {},
): Promise<{ source: Source; outputPath: string }> {
  const source = await createSource(input, cwd);
  const outputPath = getSourcePath(source.id, cwd);

  if (!options.force && (await pathExists(outputPath))) {
    throw new Error(`Source "${source.id}" already exists. Re-run with --force to overwrite it.`);
  }

  await writeSource(source, cwd);
  return { source, outputPath };
}

export async function updateSourceMetadata(
  sourceId: string,
  metadata: Pick<Source, 'last_fetched' | 'item_count'>,
  cwd = process.cwd(),
): Promise<Source> {
  const sourcePath = getSourcePath(sourceId, cwd);
  const existing = await readSource(sourcePath);
  const updated = sourceSchema.parse({
    ...existing,
    ...metadata,
  }) as Source;

  await writeSource(updated, cwd);
  return updated;
}

export async function deleteSourceById(
  sourceId: string,
  cwd = process.cwd(),
  options: { deleteContent?: boolean } = {},
): Promise<DeleteSourceResult> {
  await assertInitialized(cwd);

  const source = await readSourceById(sourceId, cwd);
  const sourcePath = getSourcePath(sourceId, cwd);
  const contentPath = getSourceContentPath(sourceId, cwd);

  await rm(sourcePath);

  let contentDeleted = false;
  if (options.deleteContent && (await pathExists(contentPath))) {
    await rm(contentPath, { recursive: true, force: true });
    contentDeleted = true;
  }

  return {
    source,
    sourcePath,
    contentPath,
    contentDeleted,
  };
}

export async function testSource(source: Source, options: TestSourceOptions = {}): Promise<SourceTestResult> {
  try {
    if (source.type === 'rss') {
      return testRssSource(source, options);
    }

    if (source.type === 'website') {
      return testWebsiteSource(source, options);
    }

    return testCsvSource(source, options);
  } catch (error) {
    return {
      source,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getSourcePath(sourceId: string, cwd = process.cwd()): string {
  return path.join(getProjectPaths(cwd).sources, `${sourceId}.json`);
}

export function getSourceContentPath(sourceId: string, cwd = process.cwd()): string {
  return path.join(getProjectPaths(cwd).content, sourceId);
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function formatSourceLocation(source: Source): string {
  return source.type === 'csv' ? source.file ?? '' : source.url ?? '';
}

async function testRssSource(source: Source, options: TestSourceOptions): Promise<SourceTestResult> {
  if (!source.url) {
    throw new Error(`Source "${source.id}" is missing a URL.`);
  }

  const parser = options.parser ?? new Parser();
  const feed = await parser.parseURL(source.url);
  const itemCount = Array.isArray(feed.items) ? feed.items.length : 0;

  return {
    source,
    ok: true,
    detail: `reachable (${itemCount} items available)`,
  };
}

async function testWebsiteSource(source: Source, options: TestSourceOptions): Promise<SourceTestResult> {
  if (!source.url) {
    throw new Error(`Source "${source.id}" is missing a URL.`);
  }

  const httpClient = options.httpClient ?? axios.create({
    timeout: 15000,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'personascout/0.1.0',
    },
    validateStatus: (status) => status >= 200 && status < 400,
  });

  await httpClient.get(source.url, {
    responseType: 'text',
  });

  return {
    source,
    ok: true,
    detail: 'reachable',
  };
}

async function testCsvSource(source: Source, options: TestSourceOptions): Promise<SourceTestResult> {
  if (!source.file) {
    throw new Error(`Source "${source.id}" is missing a file path.`);
  }

  const exists = await (options.fileExists ?? pathExists)(source.file);
  if (!exists) {
    return {
      source,
      ok: false,
      detail: `file not found: ${source.file}`,
    };
  }

  return {
    source,
    ok: true,
    detail: `file found: ${source.file}`,
  };
}
