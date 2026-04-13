import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultConfig, initializeProject } from '../src/lib/config.js';
import { writePersona } from '../src/lib/persona.js';
import {
  buildCoverageReport,
  computeCoverageMatrix,
  renderCsvReport,
  renderJsonReport,
  renderMarkdownReport,
  renderTerminalReport,
} from '../src/lib/reporter.js';
import { writeRunResult } from '../src/lib/results.js';
import type { Config, Persona, RunResult } from '../src/types/index.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe('computeCoverageMatrix', () => {
  it('computes counts and statuses for each persona-stage cell', async () => {
    const { config, personas, run } = await createReportFixture();
    const matrix = computeCoverageMatrix(run, personas, config);

    const cfoConsideration = matrix.find(
      (cell) => cell.persona_id === 'cfo' && cell.funnel_stage === 'consideration',
    );
    const ctoDecision = matrix.find(
      (cell) => cell.persona_id === 'cto' && cell.funnel_stage === 'decision',
    );
    const ctoAwareness = matrix.find(
      (cell) => cell.persona_id === 'cto' && cell.funnel_stage === 'awareness',
    );

    expect(cfoConsideration).toMatchObject({
      count: 0,
      status: 'critical',
    });
    expect(ctoDecision).toMatchObject({
      count: 1,
      status: 'weak',
    });
    expect(ctoAwareness).toMatchObject({
      count: 2,
      status: 'adequate',
    });
  });
});

describe('buildCoverageReport', () => {
  it('loads the latest run and exposes gaps plus renderers', async () => {
    const { cwd, run } = await createReportFixture();
    const report = await buildCoverageReport({ cwd });

    expect(report.run.run_id).toBe(run.run_id);
    expect(report.gaps.some((gap) => gap.persona_id === 'cfo' && gap.funnel_stage === 'consideration')).toBe(true);
    expect(report.gaps.find((gap) => gap.persona_id === 'cto' && gap.funnel_stage === 'decision')?.threshold).toBe(2);

    const terminal = renderTerminalReport(report);
    expect(terminal).toContain('ICP COVERAGE');
    expect(terminal).toContain('Shows the total number of classified content pieces');
    expect(terminal).toContain('FUNNEL BALANCE');
    expect(terminal).toContain('COVERAGE DETAIL');
    expect(terminal).toContain('GAPS DETECTED');
    expect(terminal).toContain('threshold: 2');
    expect(terminal).toContain("Next: Run 'personascout generate --all --format brief'");

    const json = renderJsonReport(report);
    expect(json).toContain('"coverage_matrix"');
    expect(json).toContain('"gaps"');

    const csv = renderCsvReport(report);
    expect(csv).toContain('persona_id,funnel_stage,count,status');
    expect(csv).toContain('cfo,consideration,0,critical');

    const markdown = renderMarkdownReport(report);
    expect(markdown).toContain('| Persona | Awareness | Consideration | Decision | Total |');
    expect(markdown).toContain('## Gaps');
  });

  it('can load a specific result id', async () => {
    const { cwd, run } = await createReportFixture();
    const report = await buildCoverageReport({ cwd, resultId: run.run_id });
    expect(report.run.run_id).toBe(run.run_id);
  });
});

async function createReportFixture(): Promise<{
  cwd: string;
  config: Config;
  personas: Persona[];
  run: RunResult;
}> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-report-'));
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

  const personas = [
    {
      id: 'cto',
      name: 'CTO / VP Eng',
      titles: ['CTO'],
      company_size: ['50-200'],
      pain_points: ['technical risk'],
      goals: ['clear architecture'],
      funnel_stages: {
        awareness: 'Problem definition',
        consideration: 'Evaluation',
        decision: 'Selection',
      },
    },
    {
      id: 'cfo',
      name: 'CFO',
      titles: ['CFO'],
      company_size: ['50-200'],
      pain_points: ['budget risk'],
      goals: ['prove ROI'],
      funnel_stages: {
        awareness: 'Problem definition',
        consideration: 'Evaluation',
        decision: 'Selection',
      },
    },
  ];

  for (const persona of personas) {
    await writePersona(persona, cwd);
  }

  const run: RunResult = {
    run_id: 'run-2026-04-11T12-10-00-000Z',
    created_at: '2026-04-11T12:10:00.000Z',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    item_count: 3,
    persona_ids: ['cto', 'cfo'],
    items: [
      {
        id: 'post-1',
        source_id: 'blog',
        url: 'https://example.com/post-1',
        title: 'Architecture overview',
        body_text: '...',
        published_at: '2026-04-10T10:00:00.000Z',
        fetched_at: '2026-04-11T08:00:00.000Z',
        scores: [
          {
            persona_id: 'cto',
            relevance: 8,
            funnel_stage: 'awareness',
            reasoning: 'Matches technical exploration.',
            confidence: 'high',
          },
          {
            persona_id: 'cfo',
            relevance: 4,
            funnel_stage: 'awareness',
            reasoning: 'Touches budgeting at a high level.',
            confidence: 'medium',
          },
        ],
      },
      {
        id: 'post-2',
        source_id: 'blog',
        url: 'https://example.com/post-2',
        title: 'Technical evaluation checklist',
        body_text: '...',
        published_at: '2026-04-10T11:00:00.000Z',
        fetched_at: '2026-04-11T08:05:00.000Z',
        scores: [
          {
            persona_id: 'cto',
            relevance: 9,
            funnel_stage: 'consideration',
            reasoning: 'Supports vendor evaluation.',
            confidence: 'high',
          },
        ],
      },
      {
        id: 'post-3',
        source_id: 'blog',
        url: 'https://example.com/post-3',
        title: 'Implementation case study',
        body_text: '...',
        published_at: '2026-04-10T12:00:00.000Z',
        fetched_at: '2026-04-11T08:10:00.000Z',
        scores: [
          {
            persona_id: 'cto',
            relevance: 7,
            funnel_stage: 'decision',
            reasoning: 'Provides proof for purchase confidence.',
            confidence: 'high',
          },
          {
            persona_id: 'cto',
            relevance: 6,
            funnel_stage: 'awareness',
            reasoning: 'Also reinforces strategic understanding.',
            confidence: 'medium',
          },
        ],
      },
    ],
  };

  await writeRunResult(run, cwd);

  return {
    cwd,
    config,
    personas,
    run,
  };
}
