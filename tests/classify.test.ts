import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildClassificationPlan, runClassification } from '../src/lib/classify.js';
import { createDefaultConfig, initializeProject } from '../src/lib/config.js';
import { writeContentItem } from '../src/lib/content.js';
import { writePersona } from '../src/lib/persona.js';
import { readRunResult, writeRunResult } from '../src/lib/results.js';

const tempDirs: string[] = [];
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

afterEach(async () => {
  process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe('classification planning', () => {
  it('can build a dry-run style plan without an API key', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const cwd = await createFixtureProject('personascout-classify-dry-run-');
    await seedContent(cwd);

    const plan = await buildClassificationPlan({ cwd });
    expect(plan.provider.id).toBe('anthropic');
    expect(plan.items_to_classify).toHaveLength(2);
  });

  it('skips items found in the latest run unless force is enabled', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const cwd = await createFixtureProject('personascout-classify-skip-');
    const [firstItem, secondItem] = await seedContent(cwd);

    await writeRunResult(
      {
        run_id: 'run-2026-04-11T09-00-00-000Z',
        created_at: '2026-04-11T09:00:00.000Z',
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        item_count: 1,
        persona_ids: ['cto'],
        items: [
          {
            ...firstItem,
            scores: [],
          },
        ],
      },
      cwd,
    );

    const plan = await buildClassificationPlan({ cwd });
    expect(plan.items).toHaveLength(2);
    expect(plan.items_to_classify.map((item) => item.id)).toEqual([secondItem.id]);

    const forcedPlan = await buildClassificationPlan({ cwd, force: true });
    expect(forcedPlan.items_to_classify).toHaveLength(2);
  });

  it('applies source and since filters to classification candidates', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const cwd = await createFixtureProject('personascout-classify-filter-');
    await seedContent(cwd);

    await writeContentItem(
      {
        id: 'csv-item',
        source_id: 'csv-export',
        url: 'personascout://csv/csv-export/1',
        title: 'CSV item',
        body_text: 'Imported row for a different source.',
        published_at: '2026-04-11T12:00:00.000Z',
        fetched_at: '2026-04-11T12:05:00.000Z',
      },
      cwd,
    );

    const plan = await buildClassificationPlan({
      cwd,
      sourceId: 'blog',
      since: '2026-04-11T00:00:00.000Z',
    });

    expect(plan.items_to_classify).toHaveLength(1);
    expect(plan.items_to_classify[0].title).toBe('Fresh architecture post');
  });
});

describe('runClassification', () => {
  it('writes a result file using the supplied classifier implementation', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const cwd = await createFixtureProject('personascout-classify-run-');
    await seedContent(cwd);

    const { result, outputPath, skipped } = await runClassification(
      { cwd },
      {
        classifyItem: async (_provider, _model, personas, item) => {
          return item.title.includes('Fresh')
            ? [
                {
                  persona_id: personas[0].id,
                  relevance: 8,
                  funnel_stage: 'consideration',
                  reasoning: 'This article maps directly to the persona pain points.',
                  confidence: 'high',
                },
              ]
            : [];
        },
      },
    );

    expect(skipped).toBe(0);
    expect(result.item_count).toBe(2);
    const saved = await readRunResult(outputPath);
    expect(saved.items).toHaveLength(2);
    expect(saved.items.find((item) => item.title.includes('Fresh'))?.scores[0]?.persona_id).toBe('cto');
  });
});

async function createFixtureProject(prefix: string): Promise<string> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), prefix));
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

  await writePersona(
    {
      id: 'cto',
      name: 'CTO',
      titles: ['CTO', 'VP Engineering'],
      company_size: ['50-200', '200-1000'],
      pain_points: ['integration complexity', 'technical risk'],
      goals: ['faster evaluation', 'clear architecture'],
      funnel_stages: {
        awareness: 'Understands the problem space.',
        consideration: 'Compares approaches and vendors.',
        decision: 'Needs evidence to support a final choice.',
      },
    },
    cwd,
  );

  return cwd;
}

async function seedContent(cwd: string) {
  const firstItem = {
    id: 'older-blog-item',
    source_id: 'blog',
    url: 'https://example.com/blog/older',
    title: 'Legacy migration notes',
    body_text: 'A short post about old systems.',
    published_at: '2026-04-10T10:00:00.000Z',
    fetched_at: '2026-04-11T08:00:00.000Z',
  };
  const secondItem = {
    id: 'fresh-blog-item',
    source_id: 'blog',
    url: 'https://example.com/blog/fresh',
    title: 'Fresh architecture post',
    body_text: 'A detailed article about technical evaluation and buying criteria.',
    published_at: '2026-04-11T10:00:00.000Z',
    fetched_at: '2026-04-11T10:05:00.000Z',
  };

  await writeContentItem(firstItem, cwd);
  await writeContentItem(secondItem, cwd);

  return [firstItem, secondItem] as const;
}
