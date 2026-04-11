import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultConfig, getProjectPaths, initializeProject } from '../src/lib/config.js';
import { generatePersonaFromDescription, renderPersonaPreview } from '../src/lib/persona-generator.js';
import { importPersonaFromFile, personaSchema, summariseTitles, validatePersonaDirectory } from '../src/lib/persona.js';
import { scrapeWebsiteContext } from '../src/lib/scraper.js';

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
