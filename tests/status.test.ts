import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultConfig, initializeProject } from '../src/lib/config.js';
import { writeGenerationRunRecord } from '../src/lib/generation-history.js';
import { normalizeContentItem, writeContentItem } from '../src/lib/content.js';
import { getPersonaTemplate } from '../src/lib/persona-templates.js';
import { writePersona } from '../src/lib/persona.js';
import { writeRunResult } from '../src/lib/results.js';
import { buildProjectStatus } from '../src/lib/status.js';
import { saveSource, updateSourceMetadata } from '../src/lib/source.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe('project status', () => {
  it('suggests defining personas first', async () => {
    const cwd = await createProject();

    const status = await buildProjectStatus(cwd);

    expect(status.persona_count).toBe(0);
    expect(status.next_step.command).toBe('personascout persona templates');
  });

  it('suggests classifying when content exists but no run has been created', async () => {
    const cwd = await createProject();

    await writePersona(getPersonaTemplate('cfo'), cwd);
    await saveSource(
      {
        type: 'rss',
        label: 'Blog Feed',
        url: 'https://example.com/feed.xml',
      },
      cwd,
    );
    await updateSourceMetadata(
      'blog-feed',
      {
        last_fetched: '2026-04-13T10:00:00.000Z',
        item_count: 1,
      },
      cwd,
    );
    await writeContentItem(
      normalizeContentItem({
        sourceId: 'blog-feed',
        url: 'https://example.com/posts/1',
        title: 'Post One',
        bodyText: 'Example body',
        publishedAt: '2026-04-13T09:00:00.000Z',
        fetchedAt: '2026-04-13T10:00:00.000Z',
      }),
      cwd,
    );

    const status = await buildProjectStatus(cwd);

    expect(status.content_item_count).toBe(1);
    expect(status.classification_state).toBe('missing');
    expect(status.next_step.command).toBe('personascout classify');
  });

  it('marks classification as stale when content is newer than the latest run', async () => {
    const cwd = await createProject();

    await writePersona(getPersonaTemplate('cfo'), cwd);
    await saveSource(
      {
        type: 'rss',
        label: 'Blog Feed',
        url: 'https://example.com/feed.xml',
      },
      cwd,
    );
    await updateSourceMetadata(
      'blog-feed',
      {
        last_fetched: '2026-04-13T12:00:00.000Z',
        item_count: 1,
      },
      cwd,
    );
    const item = normalizeContentItem({
      sourceId: 'blog-feed',
      url: 'https://example.com/posts/1',
      title: 'Post One',
      bodyText: 'Example body',
      publishedAt: '2026-04-13T11:00:00.000Z',
      fetchedAt: '2026-04-13T12:00:00.000Z',
    });
    await writeContentItem(item, cwd);
    await writeRunResult(
      {
        run_id: 'run-2026-04-13T11-30-00-000Z',
        created_at: '2026-04-13T11:30:00.000Z',
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        item_count: 1,
        persona_ids: ['cfo'],
        items: [
          {
            ...item,
            scores: [
              {
                persona_id: 'cfo',
                relevance: 8,
                funnel_stage: 'awareness',
                reasoning: 'Relevant.',
                confidence: 'high',
              },
            ],
          },
        ],
      },
      cwd,
    );

    const status = await buildProjectStatus(cwd);

    expect(status.classification_state).toBe('stale');
    expect(status.next_step.command).toBe('personascout classify');
  });

  it('suggests reviewing coverage when the latest run is current', async () => {
    const cwd = await createProject();

    await writePersona(getPersonaTemplate('cfo'), cwd);
    await saveSource(
      {
        type: 'rss',
        label: 'Blog Feed',
        url: 'https://example.com/feed.xml',
      },
      cwd,
    );
    await updateSourceMetadata(
      'blog-feed',
      {
        last_fetched: '2026-04-13T10:00:00.000Z',
        item_count: 1,
      },
      cwd,
    );
    const item = normalizeContentItem({
      sourceId: 'blog-feed',
      url: 'https://example.com/posts/1',
      title: 'Post One',
      bodyText: 'Example body',
      publishedAt: '2026-04-13T09:00:00.000Z',
      fetchedAt: '2026-04-13T10:00:00.000Z',
    });
    await writeContentItem(item, cwd);
    await writeRunResult(
      {
        run_id: 'run-2026-04-13T10-30-00-000Z',
        created_at: '2026-04-13T10:30:00.000Z',
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        item_count: 1,
        persona_ids: ['cfo'],
        items: [
          {
            ...item,
            scores: [
              {
                persona_id: 'cfo',
                relevance: 8,
                funnel_stage: 'awareness',
                reasoning: 'Relevant.',
                confidence: 'high',
              },
            ],
          },
        ],
      },
      cwd,
    );

    const status = await buildProjectStatus(cwd);

    expect(status.classification_state).toBe('current');
    expect(status.next_step.command).toBe('personascout report');
  });

  it('includes the latest generation summary when artifacts have been created', async () => {
    const cwd = await createProject();

    await writeGenerationRunRecord(
      {
        run_id: 'generation-2026-04-13T11-00-00-000Z',
        created_at: '2026-04-13T11:00:00.000Z',
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        artifact_count: 2,
        output_dir: path.join(cwd, 'generated'),
        artifacts: [
          {
            persona_id: 'cfo',
            persona_name: 'CFO',
            funnel_stage: 'awareness',
            channel: 'blog',
            format: 'brief',
            output_path: path.join(cwd, 'generated', 'cfo-awareness-blog.json'),
          },
          {
            persona_id: 'cto',
            persona_name: 'CTO',
            funnel_stage: 'consideration',
            channel: 'linkedin-article',
            format: 'draft',
            output_path: path.join(cwd, 'generated', 'cto-consideration-linkedin-article.md'),
          },
        ],
      },
      cwd,
    );

    const status = await buildProjectStatus(cwd);

    expect(status.latest_generation?.artifact_count).toBe(2);
    expect(status.latest_generation?.output_dir).toBe(path.join(cwd, 'generated'));
  });
});

async function createProject(): Promise<string> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-status-'));
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

  return cwd;
}
