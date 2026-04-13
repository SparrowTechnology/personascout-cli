import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { select } from '@inquirer/prompts';
import { z } from 'zod';
import { formatAiBadge } from './ai-hints.js';
import { buildCoverageReport, type CoverageGap } from './reporter.js';
import { readConfig } from './config.js';
import { createGenerationRunId, writeGenerationRunRecord } from './generation-history.js';
import { completeWithProvider } from './llm.js';
import { listSources } from './source.js';
import { listPersonas } from './persona.js';
import { resolveProvider, resolveReadyProvider } from './providers.js';
import type {
  Config,
  ContentChannel,
  GeneratedArtifact,
  GeneratedBrief,
  GenerationFormat,
  GenerationTarget,
  Persona,
  ProviderDefinition,
  RunResult,
  Source,
} from '../types/index.js';

const briefSchema = z.object({
  headline: z.string().min(1),
  angle: z.string().min(1),
  key_points: z.array(z.string().min(1)).min(1),
  format: z.string().min(1),
  suggested_length: z.string().min(1),
  hook: z.string().min(1),
  cta: z.string().min(1),
});

const GENERATION_SYSTEM_PROMPT = `You are a B2B content strategist and writer. You create content briefs and drafts targeted at specific buyer personas at specific stages of their buying journey.

You will receive:
1. A buyer persona definition
2. The target funnel stage
3. The target channel/format
4. Examples of the company's existing content (for tone/voice matching)
5. The company context

Your output depends on the requested mode:
- "brief": a structured content brief (not a full draft)
- "draft": a complete, publish-ready piece of content

For briefs, return JSON matching this schema:
{
  "headline": "suggested headline",
  "angle": "the specific angle or hook",
  "key_points": ["point 1", "point 2", "point 3"],
  "format": "blog post|linkedin article|linkedin post|twitter thread|email",
  "suggested_length": "word count or character count",
  "hook": "opening line or paragraph",
  "cta": "suggested call to action"
}

For drafts, return the full content as a markdown string (not JSON).

Return ONLY the requested format. No preamble.`;

const CHANNELS: ContentChannel[] = ['blog', 'linkedin-article', 'linkedin-post', 'twitter-thread', 'email'];
const FORMATS: GenerationFormat[] = ['brief', 'draft'];

export interface GenerationOptions {
  cwd?: string;
  providerId?: string;
  model?: string;
  resultId?: string;
  personaId?: string;
  stage?: GenerationTarget['funnel_stage'];
  channel?: ContentChannel;
  format?: GenerationFormat;
  outputDir?: string;
  all?: boolean;
}

export interface GenerationPlan {
  provider: ProviderDefinition;
  model: string;
  report: Awaited<ReturnType<typeof buildCoverageReport>>;
  personas: Persona[];
  sources: Source[];
  targets: GenerationTarget[];
  channel: ContentChannel;
  format: GenerationFormat;
  outputDir?: string;
}

export async function buildGenerationPlan(options: GenerationOptions = {}): Promise<GenerationPlan> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  const [report, personas, sources] = await Promise.all([
    buildCoverageReport({ cwd, resultId: options.resultId }),
    listPersonas(cwd),
    listSources(cwd),
  ]);

  const provider = resolveProvider(options.providerId ?? config.default_provider, config);
  const model = selectModel(provider, config.default_provider, config.default_model, options.model);
  const targets = await resolveTargets({
    report,
    personas,
    personaId: options.personaId,
    stage: options.stage,
    all: Boolean(options.all),
  });
  const channel = options.channel ?? await promptForChannel();
  const format = options.format ?? await promptForFormat(provider.id, model);

  return {
    provider,
    model,
    report,
    personas,
    sources,
    targets,
    channel,
    format,
    outputDir: options.outputDir ? path.resolve(cwd, options.outputDir) : undefined,
  };
}

export async function runGeneration(
  options: GenerationOptions = {},
  dependencies: {
    generateArtifact?: (provider: ProviderDefinition, model: string, input: { systemPrompt: string; userPrompt: string; format: GenerationFormat }) => Promise<GeneratedBrief | string>;
  } = {},
): Promise<{ artifacts: GeneratedArtifact[] }> {
  const cwd = options.cwd ?? process.cwd();
  const plan = await buildGenerationPlan({ ...options, cwd });
  return runGenerationPlan(plan, { cwd }, dependencies);
}

export async function runGenerationPlan(
  plan: GenerationPlan,
  options: { cwd?: string } = {},
  dependencies: {
    generateArtifact?: (provider: ProviderDefinition, model: string, input: { systemPrompt: string; userPrompt: string; format: GenerationFormat }) => Promise<GeneratedBrief | string>;
  } = {},
): Promise<{ artifacts: GeneratedArtifact[] }> {
  const cwd = options.cwd ?? process.cwd();
  const provider = await resolveReadyProvider(plan.provider.id, cwd);
  const generateArtifact = dependencies.generateArtifact ?? generateWithProvider;
  const artifacts: GeneratedArtifact[] = [];

  for (const target of plan.targets) {
    const persona = plan.personas.find((entry) => entry.id === target.persona_id);
    if (!persona) {
      throw new Error(`Persona "${target.persona_id}" was not found.`);
    }

    const userPrompt = buildGenerationUserPrompt({
      config: await readConfig(cwd),
      sources: plan.sources,
      run: plan.report.run,
      persona,
      target,
      channel: plan.channel,
      format: plan.format,
    });

    const content = await generateArtifact(provider, plan.model, {
      systemPrompt: GENERATION_SYSTEM_PROMPT,
      userPrompt,
      format: plan.format,
    });

    const artifact: GeneratedArtifact = {
      target,
      channel: plan.channel,
      format: plan.format,
      content,
    };

    if (plan.outputDir) {
      artifact.output_path = await writeGeneratedArtifact(artifact, plan.outputDir);
    }

    artifacts.push(artifact);
  }

  await writeGenerationRunRecord(
    {
      run_id: createGenerationRunId(),
      created_at: new Date().toISOString(),
      provider: provider.id,
      model: plan.model,
      artifact_count: artifacts.length,
      output_dir: plan.outputDir,
      artifacts: artifacts.map((artifact) => ({
        persona_id: artifact.target.persona_id,
        persona_name: artifact.target.persona_name,
        funnel_stage: artifact.target.funnel_stage,
        channel: artifact.channel,
        format: artifact.format,
        output_path: artifact.output_path,
      })),
    },
    cwd,
  );

  return { artifacts };
}

export function renderGeneratedArtifact(artifact: GeneratedArtifact): string {
  if (artifact.format === 'draft') {
    return [
      `Content Draft: ${artifact.target.persona_name} — ${titleCase(artifact.target.funnel_stage)} — ${formatChannelLabel(artifact.channel)}`,
      '',
      artifact.content as string,
    ].join('\n');
  }

  const brief = artifact.content as GeneratedBrief;
  const keyPoints = brief.key_points.map((point, index) => `  ${index + 1}. ${point}`).join('\n');

  return [
    `Content Brief: ${artifact.target.persona_name} — ${titleCase(artifact.target.funnel_stage)} — ${formatChannelLabel(artifact.channel)}`,
    '',
    'HEADLINE',
    brief.headline,
    '',
    'ANGLE',
    brief.angle,
    '',
    'KEY POINTS',
    keyPoints,
    '',
    `FORMAT: ${brief.format}`,
    `SUGGESTED LENGTH: ${brief.suggested_length}`,
    '',
    'HOOK',
    brief.hook,
    '',
    'CTA',
    brief.cta,
  ].join('\n');
}

async function resolveTargets(input: {
  report: Awaited<ReturnType<typeof buildCoverageReport>>;
  personas: Persona[];
  personaId?: string;
  stage?: GenerationTarget['funnel_stage'];
  all: boolean;
}): Promise<GenerationTarget[]> {
  if (input.personaId) {
    const persona = input.personas.find((entry) => entry.id === input.personaId);
    if (!persona) {
      throw new Error(`Persona "${input.personaId}" was not found.`);
    }

    const stage = input.stage ?? await promptForStage();
    const existingGap = input.report.gaps.find((gap) => gap.persona_id === input.personaId && gap.funnel_stage === stage);

    return [
      {
        persona_id: persona.id,
        persona_name: persona.name,
        funnel_stage: stage,
        count: existingGap?.count ?? 0,
        status: existingGap?.status ?? 'adequate',
      },
    ];
  }

  if (input.stage && !input.personaId) {
    throw new Error('Use --persona together with --stage.');
  }

  if (input.report.gaps.length === 0) {
    throw new Error('No coverage gaps detected. Use --persona and --stage to generate targeted content anyway.');
  }

  if (input.all) {
    return input.report.gaps.map(toGenerationTarget);
  }

  const selectedGap = await promptForGap(input.report.gaps);
  return [toGenerationTarget(selectedGap)];
}

function toGenerationTarget(gap: CoverageGap): GenerationTarget {
  return {
    persona_id: gap.persona_id,
    persona_name: gap.persona_name,
    funnel_stage: gap.funnel_stage,
    count: gap.count,
    status: gap.status,
  };
}

function buildGenerationUserPrompt(input: {
  config: Config;
  sources: Source[];
  run: RunResult;
  persona: Persona;
  target: GenerationTarget;
  channel: ContentChannel;
  format: GenerationFormat;
}): string {
  return `COMPANY CONTEXT:
${buildCompanyContext(input.config, input.sources, input.run)}

TARGET PERSONA:
${JSON.stringify(input.persona, null, 2)}

FUNNEL STAGE: ${input.target.funnel_stage}
CHANNEL: ${input.channel}
MODE: ${input.format}

EXISTING CONTENT EXAMPLES (for tone matching):
${buildExistingContentExamples(input.run, input.target)}`;
}

function buildCompanyContext(config: Config, sources: Source[], run: RunResult): string {
  const sourceLines = sources.length === 0
    ? ['- none configured']
    : sources.map((source) => `- ${source.label} (${source.type})`);

  return [
    `Company name: ${config.company_name}`,
    `Website: ${config.website}`,
    `Default provider: ${config.default_provider}`,
    `Analysed content items in latest run: ${run.item_count}`,
    'Configured content sources:',
    ...sourceLines,
  ].join('\n');
}

function buildExistingContentExamples(run: RunResult, target: GenerationTarget): string {
  const examples = selectExampleItems(run, target).slice(0, 3);
  if (examples.length === 0) {
    return 'No existing content examples available.';
  }

  return examples.map((item) => {
    const excerpt = item.body_text.replace(/\s+/g, ' ').trim().slice(0, 240);
    return `- Title: ${item.title}\n  URL: ${item.url}\n  Excerpt: ${excerpt}`;
  }).join('\n');
}

function selectExampleItems(run: RunResult, target: GenerationTarget) {
  const exactMatches = run.items.filter((item) =>
    item.scores.some((score) => score.persona_id === target.persona_id && score.funnel_stage === target.funnel_stage),
  );
  const personaMatches = run.items.filter((item) =>
    item.scores.some((score) => score.persona_id === target.persona_id),
  );
  const combined = [...exactMatches, ...personaMatches, ...run.items];
  const seen = new Set<string>();

  return combined.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

async function generateWithProvider(
  provider: ProviderDefinition,
  model: string,
  input: { systemPrompt: string; userPrompt: string; format: GenerationFormat },
): Promise<GeneratedBrief | string> {
  const response = await completeWithProvider(provider, model, {
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    maxTokens: 2048,
    temperature: input.format === 'draft' ? 0.7 : 0.2,
  });

  if (input.format === 'draft') {
    return response.trim();
  }

  try {
    return parseBrief(response);
  } catch {
    const retry = await completeWithProvider(
      provider,
      model,
      {
        systemPrompt: input.systemPrompt,
        userPrompt: `${input.userPrompt}\n\nIMPORTANT:\nYour previous response was not valid JSON for the brief schema. Return ONLY valid JSON matching the requested brief structure.`,
        maxTokens: 2048,
        temperature: 0.2,
      },
    );
    return parseBrief(retry);
  }
}

function parseBrief(rawResponse: string): GeneratedBrief {
  return briefSchema.parse(JSON.parse(extractJsonPayload(rawResponse))) as GeneratedBrief;
}

function extractJsonPayload(rawResponse: string): string {
  const trimmed = rawResponse.trim();
  if (trimmed.startsWith('{')) {
    return trimmed;
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return objectMatch[0];
  }

  throw new Error('Model response did not contain a JSON object.');
}

async function writeGeneratedArtifact(artifact: GeneratedArtifact, outputDir: string): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const fileName = `${artifact.target.persona_id}-${artifact.target.funnel_stage}-${artifact.channel}.${artifact.format === 'brief' ? 'json' : 'md'}`;
  const outputPath = path.join(outputDir, fileName);
  const serialized = artifact.format === 'brief'
    ? `${JSON.stringify(artifact.content, null, 2)}\n`
    : `${artifact.content}\n`;

  await writeFile(outputPath, serialized, 'utf8');
  return outputPath;
}

async function promptForGap(gaps: CoverageGap[]): Promise<CoverageGap> {
  return select({
    message: 'Generate for which gap?',
    choices: gaps.map((gap) => ({
      name: `${gap.persona_name} — ${titleCase(gap.funnel_stage)} (${gap.status}: ${gap.count})`,
      value: gap,
    })),
  });
}

async function promptForStage(): Promise<GenerationTarget['funnel_stage']> {
  return select({
    message: 'Which funnel stage?',
    choices: [
      { name: 'Awareness', value: 'awareness' },
      { name: 'Consideration', value: 'consideration' },
      { name: 'Decision', value: 'decision' },
    ],
  });
}

async function promptForChannel(): Promise<ContentChannel> {
  return select({
    message: 'Channel?',
    choices: CHANNELS.map((channel) => ({
      name: formatChannelLabel(channel),
      value: channel,
    })),
  });
}

async function promptForFormat(providerId: string, model: string): Promise<GenerationFormat> {
  return select({
    message: `Output mode? ${formatAiBadge()} AI call happens after this selection (${providerId}/${model}). Ctrl+C to cancel.`,
    choices: FORMATS.map((format) => ({
      name: titleCase(format),
      value: format,
    })),
  });
}

function selectModel(
  provider: ProviderDefinition,
  configuredProviderId: string,
  configuredModel: string,
  explicitModel: string | undefined,
): string {
  if (explicitModel) {
    return explicitModel;
  }

  if (provider.id === configuredProviderId) {
    return configuredModel;
  }

  return provider.default_model;
}

function formatChannelLabel(channel: ContentChannel): string {
  return channel
    .split('-')
    .map((part) => titleCase(part))
    .join(' ');
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
