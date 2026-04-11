import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { assertInitialized } from './config.js';
import { readContentItem } from './content.js';
import type { ContentItem, RunResult } from '../types/index.js';

const personaScoreSchema = z.object({
  persona_id: z.string().min(1),
  relevance: z.number().int().min(0).max(10),
  funnel_stage: z.enum(['awareness', 'consideration', 'decision']),
  reasoning: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
});

const classifiedItemSchema = z.object({
  id: z.string().min(1),
  source_id: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  body_text: z.string(),
  published_at: z.string().datetime().nullable(),
  fetched_at: z.string().datetime(),
  scores: z.array(personaScoreSchema),
});

export const runResultSchema = z.object({
  run_id: z.string().min(1),
  created_at: z.string().datetime(),
  provider: z.string().min(1),
  model: z.string().min(1),
  item_count: z.number().int().min(0),
  persona_ids: z.array(z.string().min(1)),
  items: z.array(classifiedItemSchema),
});

export interface ContentItemFilters {
  sourceId?: string;
  since?: string;
}

export async function loadContentItems(
  cwd = process.cwd(),
  filters: ContentItemFilters = {},
): Promise<ContentItem[]> {
  const paths = await assertInitialized(cwd);
  const files = await listJsonFiles(paths.content);
  const items = await Promise.all(files.map((filePath) => readContentItem(filePath)));

  return items
    .filter((item) => !filters.sourceId || item.source_id === filters.sourceId)
    .filter((item) => !filters.since || getItemTimestamp(item) >= filters.since)
    .sort(compareContentItems);
}

export async function writeRunResult(result: RunResult, cwd = process.cwd()): Promise<string> {
  const paths = await assertInitialized(cwd);
  const validated = runResultSchema.parse(result) as RunResult;
  const outputPath = path.join(paths.results, `${validated.run_id}.json`);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');

  return outputPath;
}

export async function getLatestRunResult(cwd = process.cwd()): Promise<RunResult | null> {
  const paths = await assertInitialized(cwd);
  const files = await listRunResultFiles(cwd);

  if (files.length === 0) {
    return null;
  }

  return readRunResult(path.join(paths.results, files[0]!));
}

export async function readRunResult(filePath: string): Promise<RunResult> {
  const raw = await readFile(filePath, 'utf8');
  return runResultSchema.parse(JSON.parse(raw)) as RunResult;
}

export async function readSelectedRunResult(resultId: string | undefined, cwd = process.cwd()): Promise<RunResult> {
  if (!resultId) {
    const latest = await getLatestRunResult(cwd);
    if (!latest) {
      throw new Error("No result files found. Run 'personascout classify' first.");
    }

    return latest;
  }

  const filePath = await resolveRunResultPath(resultId, cwd);
  return readRunResult(filePath);
}

export async function listRunResultFiles(cwd = process.cwd()): Promise<string[]> {
  const paths = await assertInitialized(cwd);
  return (await readdir(paths.results))
    .filter((file) => file.endsWith('.json'))
    .sort((left, right) => right.localeCompare(left));
}

export function createRunId(now = new Date()): string {
  return `run-${now.toISOString().replace(/[:.]/g, '-')}`;
}

export function getAlreadyClassifiedItemIds(result: RunResult | null): Set<string> {
  if (!result) {
    return new Set<string>();
  }

  return new Set(result.items.map((item) => item.id));
}

function getItemTimestamp(item: ContentItem): string {
  return item.published_at ?? item.fetched_at;
}

function compareContentItems(left: ContentItem, right: ContentItem): number {
  const leftTimestamp = getItemTimestamp(left);
  const rightTimestamp = getItemTimestamp(right);

  if (leftTimestamp !== rightTimestamp) {
    return rightTimestamp.localeCompare(leftTimestamp);
  }

  return left.id.localeCompare(right.id);
}

async function listJsonFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }

  return files;
}

async function resolveRunResultPath(resultId: string, cwd: string): Promise<string> {
  const paths = await assertInitialized(cwd);
  const files = await listRunResultFiles(cwd);
  const normalized = resultId.endsWith('.json') ? resultId : `${resultId}.json`;
  const match = files.find((file) => file === normalized || path.parse(file).name === resultId);

  if (!match) {
    throw new Error(`Result "${resultId}" not found in ${paths.results}.`);
  }

  return path.join(paths.results, match);
}
