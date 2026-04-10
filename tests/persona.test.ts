import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultConfig, getProjectPaths, initializeProject } from '../src/lib/config.js';
import { importPersonaFromFile, personaSchema, summariseTitles, validatePersonaDirectory } from '../src/lib/persona.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe('persona helpers', () => {
  it('accepts a valid persona document', () => {
    const result = personaSchema.parse({
      id: 'cto',
      name: 'CTO / VP Engineering',
      titles: ['CTO', 'VP Engineering'],
      company_size: ['50-500', '500+'],
      pain_points: ['I struggle with technical debt.'],
      goals: ['Ship more predictably.'],
      funnel_stages: {
        awareness: 'Industry education',
        consideration: 'Approach comparison',
        decision: 'Vendor selection',
      },
    });

    expect(result.id).toBe('cto');
  });

  it('rejects an invalid persona id', () => {
    expect(() =>
      personaSchema.parse({
        id: 'CTO Persona',
        name: 'CTO',
        titles: ['CTO'],
        company_size: ['any'],
        pain_points: ['I struggle with technical debt.'],
        goals: ['Ship more predictably.'],
        funnel_stages: {
          awareness: 'Industry education',
          consideration: 'Approach comparison',
          decision: 'Vendor selection',
        },
      }),
    ).toThrow();
  });

  it('imports a persona file into the project persona directory', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-persona-'));
    tempDirs.push(cwd);

    await initializeProject(
      createDefaultConfig({
        companyName: 'Acme',
        website: 'https://example.com',
        providerId: 'anthropic',
        model: 'claude-haiku-4-5',
      }),
      cwd,
    );

    const inputFile = path.join(cwd, 'persona.json');
    await writeFile(
      inputFile,
      JSON.stringify(
        {
          id: 'cfo',
          name: 'CFO',
          titles: ['CFO'],
          company_size: ['200-1000'],
          pain_points: ['I struggle to tie technical spend to business outcomes.'],
          goals: ['Improve visibility into ROI.'],
          funnel_stages: {
            awareness: 'Risk framing',
            consideration: 'Solution evaluation',
            decision: 'Commercial proof',
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const { outputPath, persona } = await importPersonaFromFile(inputFile, cwd);
    expect(persona.id).toBe('cfo');
    expect(outputPath).toBe(path.join(getProjectPaths(cwd).personas, 'cfo.json'));
  });

  it('validates all persona files in the project directory', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-persona-validate-'));
    tempDirs.push(cwd);

    await initializeProject(
      createDefaultConfig({
        companyName: 'Acme',
        website: 'https://example.com',
        providerId: 'anthropic',
        model: 'claude-haiku-4-5',
      }),
      cwd,
    );

    const personasDir = getProjectPaths(cwd).personas;
    await mkdir(personasDir, { recursive: true });
    await writeFile(
      path.join(personasDir, 'valid.json'),
      JSON.stringify(
        {
          id: 'it-manager',
          name: 'IT Manager',
          titles: ['IT Manager'],
          company_size: ['any'],
          pain_points: ['I struggle with fragmented tooling.'],
          goals: ['Reduce operational overhead.'],
          funnel_stages: {
            awareness: 'Problem framing',
            consideration: 'Tooling comparison',
            decision: 'Implementation confidence',
          },
        },
        null,
        2,
      ),
      'utf8',
    );
    await writeFile(path.join(personasDir, 'invalid.json'), '{"id":"Bad Persona"}', 'utf8');

    const results = await validatePersonaDirectory(cwd);

    expect(results).toHaveLength(2);
    expect(results.find((entry) => entry.ok)?.file).toContain('valid.json');
    expect(results.find((entry) => !entry.ok)?.file).toContain('invalid.json');
  });

  it('summarizes long title lists for terminal output', () => {
    expect(summariseTitles(['CTO', 'VP Engineering', 'Head of Platform'])).toBe('CTO, VP Engineering (+1)');
  });
});
