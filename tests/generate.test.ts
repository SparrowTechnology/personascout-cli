import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultConfig, initializeProject } from '../src/lib/config.js';
import { buildGenerationPlan, renderGeneratedArtifact, runGeneration } from '../src/lib/generator.js';
import { writePersona } from '../src/lib/persona.js';
import { writeRunResult } from '../src/lib/results.js';
import { writeSource } from '../src/lib/source.js';
import type { RunResult, Source } from '../src/types/index.js';

const tempDirs: string[] = [];
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

afterEach(async () => {
  process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe('buildGenerationPlan', () => {
  it('selects all detected gaps when --all is used', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const cwd = await createGenerateFixture();

    const plan = await buildGenerationPlan({
      cwd,
      all: true,
      channel: 'blog',
      format: 'brief',
    });

    expect(plan.targets).toHaveLength(6);
    expect(plan.targets.map((target) => `${target.persona_id}:${target.funnel_stage}`)).toEqual([
      'cto:awareness',
      'cto:consideration',
      'cto:decision',
      'cfo:awareness',
      'cfo:consideration',
      'cfo:decision',
    ]);
  });

  it('supports explicit persona/stage generation even when no gap is detected', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const cwd = await createGenerateFixture();

    const plan = await buildGenerationPlan({
      cwd,
      personaId: 'cto',
      stage: 'awareness',
      channel: 'email',
      format: 'draft',
    });

    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0]).toMatchObject({
      persona_id: 'cto',
      funnel_stage: 'awareness',
      status: 'weak',
    });
  });
});

describe('runGeneration', () => {
  it('writes generated brief files when an output directory is supplied', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const cwd = await createGenerateFixture();
    const outputDir = path.join(cwd, 'generated');

    const { artifacts } = await runGeneration(
      {
        cwd,
        all: true,
        channel: 'linkedin-article',
        format: 'brief',
        outputDir,
      },
      {
        generateArtifact: async () => ({
          headline: 'Closing the visibility gap',
          angle: 'Tie technical uncertainty to budget risk.',
          key_points: ['Quantify hidden cost', 'Ask better questions', 'Build a better buying case'],
          format: 'LinkedIn article',
          suggested_length: '800-1000 words',
          hook: 'Most finance leaders hear about delivery risk too late.',
          cta: 'Request a walkthrough.',
        }),
      },
    );

    expect(artifacts).toHaveLength(6);
    expect(artifacts.every((artifact) => artifact.output_path)).toBe(true);

    const saved = await readFile(artifacts[0].output_path!, 'utf8');
    expect(saved).toContain('"headline": "Closing the visibility gap"');
  });

  it('renders briefs in a readable terminal format', () => {
    const output = renderGeneratedArtifact({
      target: {
        persona_id: 'cfo',
        persona_name: 'CFO',
        funnel_stage: 'consideration',
        count: 0,
        status: 'critical',
      },
      channel: 'linkedin-article',
      format: 'brief',
      content: {
        headline: 'A sharper way to see delivery risk',
        angle: 'Translate engineering risk into financial planning terms.',
        key_points: ['See hidden costs', 'Frame the conversation', 'Choose an evaluation path'],
        format: 'LinkedIn article',
        suggested_length: '800-1000 words',
        hook: 'Technical debt is rarely visible on a finance dashboard.',
        cta: 'Book a review.',
      },
    });

    expect(output).toContain('Content Brief: CFO');
    expect(output).toContain('HEADLINE');
    expect(output).toContain('KEY POINTS');
  });
});

async function createGenerateFixture(): Promise<string> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-generate-'));
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
  await mkdir(path.join(cwd, '.personascout', 'sources'), { recursive: true });

  await writePersona(
    {
      id: 'cto',
      name: 'CTO',
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
        awareness: 'Problem definition',
        consideration: 'Evaluation',
        decision: 'Selection',
      },
    },
    cwd,
  );

  const blogSource: Source = {
    id: 'acme-blog',
    type: 'rss',
    label: 'Acme Blog',
    url: 'https://example.com/feed.xml',
  };
  await writeSource(blogSource, cwd);

  const run: RunResult = {
    run_id: 'run-2026-04-11T19-00-00-000Z',
    created_at: '2026-04-11T19:00:00.000Z',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    item_count: 2,
    persona_ids: ['cto', 'cfo'],
    items: [
      {
        id: 'post-1',
        source_id: 'acme-blog',
        url: 'https://example.com/post-1',
        title: 'Architecture roadmap',
        body_text: 'A post about technical evaluation and architecture tradeoffs.',
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
            persona_id: 'cto',
            relevance: 7,
            funnel_stage: 'consideration',
            reasoning: 'Supports vendor evaluation.',
            confidence: 'high',
          },
        ],
      },
      {
        id: 'post-2',
        source_id: 'acme-blog',
        url: 'https://example.com/post-2',
        title: 'Implementation proof',
        body_text: 'A case study focused on implementation confidence.',
        published_at: '2026-04-10T11:00:00.000Z',
        fetched_at: '2026-04-11T08:05:00.000Z',
        scores: [
          {
            persona_id: 'cto',
            relevance: 9,
            funnel_stage: 'decision',
            reasoning: 'Useful late-stage proof.',
            confidence: 'high',
          },
          {
            persona_id: 'cfo',
            relevance: 4,
            funnel_stage: 'awareness',
            reasoning: 'Touches spend risk lightly.',
            confidence: 'medium',
          },
        ],
      },
    ],
  };

  await writeRunResult(run, cwd);
  return cwd;
}
