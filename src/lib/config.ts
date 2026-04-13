import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { DEFAULT_COVERAGE_THRESHOLDS, DEFAULT_FETCH_DEPTH, DEFAULT_FETCH_LIMIT } from '../constants.js';
import type { Config } from '../types/config.js';

const providerOverrideSchema = z.object({
  display_name: z.string().min(1).optional(),
  sdk: z.enum(['anthropic', 'openai-compatible']).optional(),
  base_url: z.string().url().optional(),
  api_key_env: z.string().min(1).optional(),
  requires_key: z.boolean().optional(),
  default_model: z.string().min(1).optional(),
  suggested_models: z.array(z.string().min(1)).optional(),
  notes: z.string().min(1).optional(),
});

export const configSchema = z.object({
  website: z.string().url(),
  company_name: z.string().min(1),
  default_provider: z.string().min(1),
  default_model: z.string().min(1),
  coverage_thresholds: z.object({
    critical: z.number().int().min(0),
    weak: z.number().int().min(0),
    adequate: z.number().int().min(0),
  }),
  fetch_limit: z.number().int().min(0),
  fetch_depth: z.number().int().min(0),
  providers: z.record(z.string().min(1), providerOverrideSchema).optional(),
});

export interface ProjectPaths {
  root: string;
  home: string;
  config: string;
  personas: string;
  sources: string;
  content: string;
  results: string;
}

export function getProjectPaths(cwd = process.cwd()): ProjectPaths {
  const root = path.resolve(cwd);
  const configuredHome = process.env.PERSONASCOUT_HOME?.trim();
  const home = configuredHome
    ? path.isAbsolute(configuredHome)
      ? configuredHome
      : path.resolve(root, configuredHome)
    : path.join(root, '.personascout');

  return {
    root,
    home,
    config: path.join(home, 'config.json'),
    personas: path.join(home, 'personas'),
    sources: path.join(home, 'sources'),
    content: path.join(home, 'content'),
    results: path.join(home, 'results'),
  };
}

export async function isInitialized(cwd = process.cwd()): Promise<boolean> {
  try {
    const info = await stat(getProjectPaths(cwd).home);
    return info.isDirectory();
  } catch {
    return false;
  }
}

export async function assertInitialized(cwd = process.cwd()): Promise<ProjectPaths> {
  const paths = getProjectPaths(cwd);
  if (!(await isInitialized(cwd))) {
    throw new Error("Not a PersonaScout project. Run 'personascout init' first.");
  }

  return paths;
}

export function createDefaultConfig(input: {
  companyName: string;
  website: string;
  providerId: string;
  model: string;
}): Config {
  return {
    website: input.website,
    company_name: input.companyName,
    default_provider: input.providerId,
    default_model: input.model,
    coverage_thresholds: {
      critical: DEFAULT_COVERAGE_THRESHOLDS.critical,
      weak: DEFAULT_COVERAGE_THRESHOLDS.weak,
      adequate: DEFAULT_COVERAGE_THRESHOLDS.adequate,
    },
    fetch_limit: DEFAULT_FETCH_LIMIT,
    fetch_depth: DEFAULT_FETCH_DEPTH,
  };
}

export async function initializeProject(config: Config, cwd = process.cwd()): Promise<ProjectPaths> {
  const paths = getProjectPaths(cwd);

  await mkdir(paths.personas, { recursive: true });
  await mkdir(paths.sources, { recursive: true });
  await mkdir(paths.content, { recursive: true });
  await mkdir(paths.results, { recursive: true });
  await writeJson(paths.config, configSchema.parse(config));

  return paths;
}

export async function readConfig(cwd = process.cwd()): Promise<Config> {
  const paths = await assertInitialized(cwd);
  const raw = await readFile(paths.config, 'utf8');
  return configSchema.parse(JSON.parse(raw)) as Config;
}

export async function writeConfig(config: Config, cwd = process.cwd()): Promise<void> {
  const paths = getProjectPaths(cwd);
  await writeJson(paths.config, configSchema.parse(config));
}

export async function appendProjectGitignoreEntries(cwd = process.cwd()): Promise<boolean> {
  const paths = getProjectPaths(cwd);
  const gitignorePath = path.join(paths.root, '.gitignore');

  let existing = '';
  try {
    existing = await readFile(gitignorePath, 'utf8');
  } catch {
    existing = '';
  }

  const merged = mergeGitignoreContent(existing, getProjectGitignoreEntries(cwd));
  if (merged === normalizeLineEndings(existing)) {
    return false;
  }

  await writeFile(gitignorePath, merged, 'utf8');
  return true;
}

export function getProjectGitignoreEntries(cwd = process.cwd()): string[] {
  const paths = getProjectPaths(cwd);
  return [paths.content, paths.results].map((targetPath) => {
    const relative = path.relative(paths.root, targetPath);
    const normalized = toPosixPath(relative.length > 0 ? relative : targetPath);
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  });
}

export function mergeGitignoreContent(existing: string, entries: string[]): string {
  const normalized = normalizeLineEndings(existing);
  const lines = normalized.length > 0 ? normalized.split('\n').filter((line) => line.length > 0) : [];
  const seen = new Set(lines);
  const merged = [...lines];

  for (const entry of entries) {
    if (!seen.has(entry)) {
      merged.push(entry);
      seen.add(entry);
    }
  }

  return merged.length > 0 ? `${merged.join('\n')}\n` : '';
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n');
}
