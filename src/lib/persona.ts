import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { assertInitialized, getProjectPaths, pathExists } from './config.js';
import { listRunResultFiles, readRunResult } from './results.js';
import type { Persona } from '../types/persona.js';

export const personaSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Persona id must be kebab-case.'),
  name: z.string().min(1),
  titles: z.array(z.string().min(1)).min(1),
  company_size: z.array(z.string().min(1)).min(1),
  pain_points: z.array(z.string().min(1)).min(1),
  goals: z.array(z.string().min(1)).min(1),
  funnel_stages: z.object({
    awareness: z.string().min(1),
    consideration: z.string().min(1),
    decision: z.string().min(1),
  }),
});

export interface PersonaValidationResult {
  file: string;
  ok: boolean;
  error?: string;
}

export interface PersonaResultReference {
  run_id: string;
  created_at: string;
  provider: string;
  model: string;
}

export async function listPersonas(cwd = process.cwd()): Promise<Persona[]> {
  const paths = await assertInitialized(cwd);
  const files = (await readdir(paths.personas))
    .filter((file) => file.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(files.map((file) => readPersona(path.join(paths.personas, file))));
}

export async function readPersona(filePath: string): Promise<Persona> {
  const raw = await readFile(filePath, 'utf8');
  return personaSchema.parse(JSON.parse(raw)) as Persona;
}

export async function readPersonaById(personaId: string, cwd = process.cwd()): Promise<Persona> {
  await assertInitialized(cwd);
  return readPersona(getPersonaPath(personaId, cwd));
}

export async function importPersonaFromFile(
  inputPath: string,
  cwd = process.cwd(),
  options: { force?: boolean } = {},
): Promise<{ persona: Persona; outputPath: string }> {
  await assertInitialized(cwd);

  const sourcePath = path.resolve(cwd, inputPath);
  const persona = await readPersona(sourcePath);
  const outputPath = getPersonaPath(persona.id, cwd);

  if (!options.force && (await pathExists(outputPath))) {
    throw new Error(`Persona "${persona.id}" already exists. Re-run with --force to overwrite it.`);
  }

  await writePersona(persona, cwd);
  return { persona, outputPath };
}

export async function writePersona(persona: Persona, cwd = process.cwd()): Promise<string> {
  await assertInitialized(cwd);
  const validatedPersona = personaSchema.parse(persona) as Persona;
  const outputPath = getPersonaPath(validatedPersona.id, cwd);
  await writeFile(outputPath, `${JSON.stringify(validatedPersona, null, 2)}\n`, 'utf8');
  return outputPath;
}

export async function deletePersonaById(personaId: string, cwd = process.cwd()): Promise<string> {
  await assertInitialized(cwd);
  const outputPath = getPersonaPath(personaId, cwd);

  if (!(await pathExists(outputPath))) {
    throw new Error(`Persona "${personaId}" does not exist.`);
  }

  await rm(outputPath);
  return outputPath;
}

export async function validatePersonaDirectory(cwd = process.cwd()): Promise<PersonaValidationResult[]> {
  const paths = await assertInitialized(cwd);
  const files = (await readdir(paths.personas))
    .filter((file) => file.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    files.map(async (file) => {
      const filePath = path.join(paths.personas, file);
      try {
        await readPersona(filePath);
        return { file: filePath, ok: true };
      } catch (error) {
        return {
          file: filePath,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}

export function summariseTitles(titles: string[]): string {
  if (titles.length <= 2) {
    return titles.join(', ');
  }

  return `${titles.slice(0, 2).join(', ')} (+${titles.length - 2})`;
}

export function getPersonaPath(personaId: string, cwd = process.cwd()): string {
  const paths = getProjectPaths(cwd);
  return path.join(paths.personas, `${personaId}.json`);
}

export async function listPersonaResultReferences(
  personaId: string,
  cwd = process.cwd(),
): Promise<PersonaResultReference[]> {
  await assertInitialized(cwd);
  const resultFiles = await listRunResultFiles(cwd);
  const references: PersonaResultReference[] = [];

  for (const fileName of resultFiles) {
    const result = await readRunResult(path.join(getProjectPaths(cwd).results, fileName));
    const isReferenced = result.persona_ids.includes(personaId)
      || result.items.some((item) => item.scores.some((score) => score.persona_id === personaId));

    if (isReferenced) {
      references.push({
        run_id: result.run_id,
        created_at: result.created_at,
        provider: result.provider,
        model: result.model,
      });
    }
  }

  return references;
}
