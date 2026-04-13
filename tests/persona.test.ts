import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultConfig, getProjectPaths, initializeProject } from '../src/lib/config.js';
import { generatePersonaFromDescription, renderPersonaPreview } from '../src/lib/persona-generator.js';
import { getPersonaTemplate, listPersonaTemplates } from '../src/lib/persona-templates.js';
import {
  createPersonaFromInteractiveInput,
  deletePersonaById,
  importPersonaFromFile,
  listPersonaResultReferences,
  personaSchema,
  readPersonaById,
  splitCommaSeparatedValues,
  splitLineSeparatedValues,
  summariseTitles,
  validatePersonaDirectory,
  writePersona,
} from '../src/lib/persona.js';
import { scrapeWebsiteContext } from '../src/lib/scraper.js';
import { writeRunResult } from '../src/lib/results.js';

const tempDirs: string[] = [];
const servers: Server[] = [];
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

afterEach(async () => {
  process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(() => resolve(undefined)))));
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

  it('builds a persona from interactive input strings', () => {
    const persona = createPersonaFromInteractiveInput({
      id: 'revops-lead',
      name: 'Revenue Operations Lead',
      titles: 'Revenue Operations Lead, RevOps Director',
      company_size: '50-200, 200-1000',
      pain_points: [
        'We struggle to align funnel reporting across teams.',
        'Content handoff into sales is inconsistent.',
        'I cannot see coverage gaps by buyer type.',
      ].join('\n'),
      goals: [
        'Improve visibility into persona coverage.',
        'Give marketing and sales a shared planning view.',
      ].join('\n'),
      awareness: 'Operational content about persona coverage and planning gaps.',
      consideration: 'Comparison content about audit workflows and reporting systems.',
      decision: 'Proof content focused on adoption, reporting clarity, and stakeholder buy-in.',
    });

    expect(persona).toMatchObject({
      id: 'revops-lead',
      titles: ['Revenue Operations Lead', 'RevOps Director'],
      company_size: ['50-200', '200-1000'],
      pain_points: [
        'We struggle to align funnel reporting across teams.',
        'Content handoff into sales is inconsistent.',
        'I cannot see coverage gaps by buyer type.',
      ],
      goals: [
        'Improve visibility into persona coverage.',
        'Give marketing and sales a shared planning view.',
      ],
    });
  });

  it('splits comma-separated and line-separated values cleanly', () => {
    expect(splitCommaSeparatedValues(' CFO, VP Finance , , Controller ')).toEqual([
      'CFO',
      'VP Finance',
      'Controller',
    ]);

    expect(splitLineSeparatedValues('One\n\n Two \r\nThree  ')).toEqual(['One', 'Two', 'Three']);
  });

  it('lists bundled persona templates', () => {
    const templates = listPersonaTemplates();
    expect(templates).toHaveLength(15);
    expect(templates[0]?.id).toBe('cfo');
    expect(templates.some((template) => template.id === 'procurement-lead')).toBe(true);
  });

  it('returns a bundled persona template by id', () => {
    const template = getPersonaTemplate('cto');
    expect(template.name).toBe('CTO / VP Engineering');
    expect(template.titles).toContain('CTO');
  });

  it('scrapes company context from the homepage and linked pages', async () => {
    const server = await startWebsiteServer({
      '/': `
        <html>
          <head><title>Acme</title></head>
          <body>
            <main>
              <p>Acme helps teams quantify engineering risk.</p>
              <a href="/product">Product</a>
              <a href="/about">About</a>
              <a href="https://example.org/outside">Outside</a>
            </main>
          </body>
        </html>`,
      '/product': `
        <html>
          <head><title>Product</title></head>
          <body><main><p>The platform maps technical debt to business exposure.</p></main></body>
        </html>`,
      '/about': `
        <html>
          <head><title>About</title></head>
          <body><main><p>Built for B2B software leaders.</p></main></body>
        </html>`,
    });

    servers.push(server.server);

    const context = await scrapeWebsiteContext(server.baseUrl);
    expect(context).toContain('Acme helps teams quantify engineering risk.');
    expect(context).toContain('The platform maps technical debt to business exposure.');
    expect(context).toContain('Built for B2B software leaders.');
    expect(context).not.toContain('Outside');
  });

  it('generates and validates a persona with one retry on invalid JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-persona-generate-'));
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

    let callCount = 0;
    const result = await generatePersonaFromDescription(
      'A finance leader evaluating engineering risk visibility',
      { cwd },
      {
        scrapeCompanyContext: async () => 'Acme helps finance and engineering teams understand software risk.',
        complete: async () => {
          callCount += 1;
          if (callCount === 1) {
            return 'not valid json';
          }

          return JSON.stringify({
            id: 'cfo',
            name: 'CFO',
            titles: ['CFO', 'VP Finance'],
            company_size: ['50-500', '500+'],
            pain_points: [
              'I struggle to understand technical debt in financial terms.',
              "There's no way to see delivery risk before it hits the board pack.",
            ],
            goals: [
              'Tie engineering risk to budget decisions.',
              'Improve visibility into ROI and delivery confidence.',
            ],
            funnel_stages: {
              awareness: 'Educational content that frames technical debt as a financial risk.',
              consideration: 'Comparative content showing how different approaches expose engineering risk.',
              decision: 'Proof-oriented content with ROI, implementation confidence, and stakeholder alignment.',
            },
          });
        },
      },
    );

    expect(callCount).toBe(2);
    expect(result.persona.id).toBe('cfo');
    expect(renderPersonaPreview(result.persona)).toContain('Generated Persona: CFO');
  });

  it('normalizes generated personal names into persona-type labels', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-persona-normalize-'));
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

    const result = await generatePersonaFromDescription(
      'An agency leader managing client software delivery',
      { cwd },
      {
        scrapeCompanyContext: async () => 'Acme helps agencies report on code quality and delivery risk.',
        complete: async () =>
          JSON.stringify({
            id: 'agency-consultant-persona',
            name: 'Alex Martinez',
            titles: ['Partner, Software Development Agency', 'Head of Delivery'],
            company_size: ['50-500', '500+'],
            pain_points: [
              'I struggle to prove delivery quality to clients.',
              "We can't spend weeks on manual audits.",
            ],
            goals: [
              'Provide faster client reporting.',
              'Reduce audit time.',
            ],
            funnel_stages: {
              awareness: 'Educational content about code quality risks for agencies.',
              consideration: 'Comparative content about audit workflows and reporting tools.',
              decision: 'Proof content focused on implementation and client-facing reporting.',
            },
          }),
      },
    );

    expect(result.persona.name).toBe('Partner, Software Development Agency / Head of Delivery');
  });

  it('can save a bundled template into the project persona directory', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-persona-template-'));
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

    const template = getPersonaTemplate('product-manager');
    const outputPath = path.join(getProjectPaths(cwd).personas, `${template.id}.json`);
    await writeFile(outputPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');

    const results = await validatePersonaDirectory(cwd);
    expect(results.find((entry) => entry.file.endsWith('product-manager.json'))?.ok).toBe(true);
  });

  it('can read and delete personas by id', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-persona-delete-'));
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

    const template = getPersonaTemplate('it-manager');
    await writePersona(template, cwd);

    const loaded = await readPersonaById('it-manager', cwd);
    expect(loaded.name).toBe('IT Manager / Head of IT');

    const deletedPath = await deletePersonaById('it-manager', cwd);
    expect(deletedPath).toBe(path.join(getProjectPaths(cwd).personas, 'it-manager.json'));

    const results = await validatePersonaDirectory(cwd);
    expect(results).toHaveLength(0);
  });

  it('finds classification result references for a persona', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'personascout-persona-refs-'));
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

    const template = getPersonaTemplate('cfo');
    await writePersona(template, cwd);
    await writeRunResult(
      {
        run_id: 'run-2026-04-12T09-30-00-000Z',
        created_at: '2026-04-12T09:30:00.000Z',
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        item_count: 1,
        persona_ids: ['cfo'],
        items: [
          {
            id: 'item-1',
            source_id: 'blog',
            url: 'https://example.com/item-1',
            title: 'Finance risk post',
            body_text: 'Example content.',
            published_at: '2026-04-12T08:00:00.000Z',
            fetched_at: '2026-04-12T08:05:00.000Z',
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

    const references = await listPersonaResultReferences('cfo', cwd);
    expect(references).toHaveLength(1);
    expect(references[0]?.run_id).toBe('run-2026-04-12T09-30-00-000Z');
  });
});

async function startWebsiteServer(routes: Record<string, string>): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    const url = request.url ?? '/';
    const body = routes[url];

    if (!body) {
      response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<html><body>Not found</body></html>');
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(body);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine server address.');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}
