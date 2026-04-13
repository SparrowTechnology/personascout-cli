import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { getProjectPaths, pathExists } from './config.js';
import type { GenerationRunRecord } from '../types/index.js';

const generationArtifactSummarySchema = z.object({
  persona_id: z.string().min(1),
  persona_name: z.string().min(1),
  funnel_stage: z.enum(['awareness', 'consideration', 'decision']),
  channel: z.enum(['blog', 'linkedin-article', 'linkedin-post', 'twitter-thread', 'email']),
  format: z.enum(['brief', 'draft']),
  output_path: z.string().min(1).optional(),
});

export const generationRunRecordSchema = z.object({
  run_id: z.string().min(1),
  created_at: z.string().datetime(),
  provider: z.string().min(1),
  model: z.string().min(1),
  artifact_count: z.number().int().min(0),
  output_dir: z.string().min(1).optional(),
  artifacts: z.array(generationArtifactSummarySchema),
});

export async function writeGenerationRunRecord(record: GenerationRunRecord, cwd = process.cwd()): Promise<string> {
  const validated = generationRunRecordSchema.parse(record) as GenerationRunRecord;
  const outputPath = path.join(getGenerationRunsPath(cwd), `${validated.run_id}.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
  return outputPath;
}

export async function getLatestGenerationRunRecord(cwd = process.cwd()): Promise<GenerationRunRecord | null> {
  const files = await listGenerationRunFiles(cwd);
  if (files.length === 0) {
    return null;
  }

  return readGenerationRunRecord(path.join(getGenerationRunsPath(cwd), files[0]!));
}

export async function listGenerationRunFiles(cwd = process.cwd()): Promise<string[]> {
  const root = getGenerationRunsPath(cwd);
  if (!(await pathExists(root))) {
    return [];
  }

  return (await readdir(root))
    .filter((file) => file.endsWith('.json'))
    .sort((left, right) => right.localeCompare(left));
}

export async function readGenerationRunRecord(filePath: string): Promise<GenerationRunRecord> {
  const raw = await readFile(filePath, 'utf8');
  return generationRunRecordSchema.parse(JSON.parse(raw)) as GenerationRunRecord;
}

export function createGenerationRunId(now = new Date()): string {
  return `generation-${now.toISOString().replace(/[:.]/g, '-')}`;
}

function getGenerationRunsPath(cwd: string): string {
  return path.join(getProjectPaths(cwd).results, 'generations');
}
