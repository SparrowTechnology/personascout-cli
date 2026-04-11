import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultConfig, initializeProject } from '../src/lib/config.js';
import {
  buildCoverageDiffReport,
  renderJsonDiffReport,
  renderMarkdownDiffReport,
  renderTerminalDiffReport,
} from '../src/lib/diff.js';
import { writePersona } from '../src/lib/persona.js';
import { writeRunResult } from '../src/lib/results.js';
import type { RunResult } from '../src/types/index.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe('buildCoverageDiffReport', () => {
  it('compares the latest run to the previous run by default', async () => {
    const cwd = await createDiffFixture();
    const report = await buildCoverageDiffReport({ cwd });

    expect(report.summary.improved).toBeGreaterThan(0);
    expect(report.summary.new_gaps).toBe(2);
    expect(report.changes.some((change) => change.is_new_gap && change.persona_id === 'cfo' && change.funnel_stage === 'decision')).toBe(true);
    expect(report.changes.some((change) => change.is_gap_closed && change.persona_id === 'cto' && change.funnel_stage === 'consideration')).toBe(true);

    const terminal = renderTerminalDiffReport(report);
    expect(terminal).toContain('Coverage Change Report');
    expect(terminal).toContain('NEW');
    expect(terminal).toContain('CLOSED');

    const json = renderJsonDiffReport(report);
    expect(json).toContain('"summary"');
    expect(json).toContain('"new_gaps": 2');

    const markdown = renderMarkdownDiffReport(report);
    expect(markdown).toContain('| Persona | Stage | From | To | Delta | Notes |');
    expect(markdown).toContain('new gap detected');
  });

  it('can compare explicit from/to run ids', async () => {
    const cwd = await createDiffFixture();
    const report = await buildCoverageDiffReport({
      cwd,
      fromId: 'run-2026-04-10T09-00-00-000Z',
      toId: 'run-2026-04-11T09-00-00-000Z',
    });

    expect(report.from.run.run_id).toBe('run-2026-04-10T09-00-00-000Z');
    expect(report.to.run.run_id).toBe('run-2026-04-11T09-00-00-000Z');
  });
});

async function createDiffFixture(): Promise<string> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-diff-'));
  tempDirs.push(cwd);

  const config = createDefaultConfig({
    companyName: 'Acme',
    website: 'https://example.com',
    providerId: 'anthropic',
    model: 'claude-haiku-4-5',
  });
  config.coverage_thresholds = {
    critical: 0,
    weak: 1,
    adequate: 2,
  };

  await initializeProject(config, cwd);

  await writePersona(
    {
      id: 'cto',
      name: 'CTO',
      titles: ['CTO'],
      company_size: ['50-200'],
      pain_points: ['technical risk'],
      goals: ['clear architecture'],
      funnel_stages: {
        awareness: 'Problem framing',
        consideration: 'Evaluation',
        decision: 'Selection',
      },
    },
    cwd,
  );

  await writePersona(
    {
      id: 'cfo',
      name: 'CFO',
      titles: ['CFO'],
      company_size: ['50-200'],
      pain_points: ['budget uncertainty'],
      goals: ['prove ROI'],
      funnel_stages: {
        awareness: 'Problem framing',
        consideration: 'Evaluation',
        decision: 'Selection',
      },
    },
    cwd,
  );

  const olderRun: RunResult = {
    run_id: 'run-2026-04-10T09-00-00-000Z',
    created_at: '2026-04-10T09:00:00.000Z',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    item_count: 6,
    persona_ids: ['cto', 'cfo'],
    items: [
      createItem('a1', 'cto', 'awareness'),
      createItem('a2', 'cto', 'awareness'),
      createItem('a3', 'cfo', 'awareness'),
      createItem('a4', 'cfo', 'awareness'),
      createItem('a5', 'cfo', 'decision'),
      createItem('a6', 'cfo', 'decision'),
    ],
  };

  const newerRun: RunResult = {
    run_id: 'run-2026-04-11T09-00-00-000Z',
    created_at: '2026-04-11T09:00:00.000Z',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    item_count: 5,
    persona_ids: ['cto', 'cfo'],
    items: [
      createItem('b1', 'cto', 'awareness'),
      createItem('b2', 'cto', 'awareness'),
      createItem('b3', 'cto', 'consideration'),
      createItem('b4', 'cto', 'consideration'),
      createItem('b5', 'cfo', 'decision'),
    ],
  };

  await writeRunResult(olderRun, cwd);
  await writeRunResult(newerRun, cwd);

  return cwd;
}

function createItem(id: string, personaId: 'cto' | 'cfo', stage: 'awareness' | 'consideration' | 'decision') {
  return {
    id,
    source_id: 'blog',
    url: `https://example.com/${id}`,
    title: `Post ${id}`,
    body_text: 'Example content.',
    published_at: '2026-04-10T10:00:00.000Z',
    fetched_at: '2026-04-10T10:05:00.000Z',
    scores: [
      {
        persona_id: personaId,
        relevance: 8,
        funnel_stage: stage,
        reasoning: 'Relevant.',
        confidence: 'high' as const,
      },
    ],
  };
}
