import { z } from 'zod';
import { completeWithProvider } from './llm.js';
import { readConfig } from './config.js';
import { personaSchema } from './persona.js';
import { resolveProvider, resolveReadyProvider } from './providers.js';
import { scrapeWebsiteContext } from './scraper.js';
import type { Persona, ProviderDefinition } from '../types/index.js';

const PERSONA_GENERATION_SYSTEM_PROMPT = `You are a B2B marketing strategist helping define buyer personas for content strategy.

You will be given:
1. Context about the company (scraped from their website)
2. A description of the persona the user wants to target

Generate a detailed buyer persona in JSON format. 

Rules:
- name must be a persona type label such as "VP Marketing / Head of Marketing" or "Software Development Agency Partner", never a fictional person's name
- Write pain_points in the persona's own voice, first person: "I struggle with..." or "We can't..." or "There's no way to..."
- Write goals from the persona's perspective: what are they trying to achieve?
- funnel_stages should describe what KIND of content serves this persona at each stage, not just repeat the stage name
- titles should be realistic job titles, not categories
- Be specific to the company's actual product domain — don't be generic

Return ONLY valid JSON. No preamble, no markdown fences.

Schema:
{
  "id": "kebab-case-string",
  "name": "Display Name",
  "titles": ["Job Title 1", "Job Title 2"],
  "company_size": ["50-500", "500+"],
  "pain_points": ["pain point 1", "pain point 2"],
  "goals": ["goal 1", "goal 2"],
  "funnel_stages": {
    "awareness": "description of awareness stage content for this persona",
    "consideration": "description of consideration stage content",
    "decision": "description of decision stage content"
  }
}`;

export interface PersonaGenerationPlan {
  provider: ProviderDefinition;
  model: string;
  companyContext: string;
}

export async function buildPersonaGenerationPlan(
  options: {
    cwd?: string;
    providerId?: string;
    model?: string;
    companyContext?: string;
  } = {},
  dependencies: {
    scrapeCompanyContext?: (websiteUrl: string) => Promise<string>;
  } = {},
): Promise<PersonaGenerationPlan> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  const provider = resolveProvider(options.providerId ?? config.default_provider, config);
  const model = options.model ?? (provider.id === config.default_provider ? config.default_model : provider.default_model);
  const scrapeCompanyContext = dependencies.scrapeCompanyContext ?? ((websiteUrl: string) => scrapeWebsiteContext(websiteUrl));
  const companyContext = options.companyContext ?? await scrapeCompanyContext(config.website);

  return {
    provider,
    model,
    companyContext,
  };
}

export async function generatePersonaFromDescription(
  description: string,
  options: {
    cwd?: string;
    providerId?: string;
    model?: string;
    companyContext?: string;
  } = {},
  dependencies: {
    scrapeCompanyContext?: (websiteUrl: string) => Promise<string>;
    complete?: (provider: ProviderDefinition, model: string, input: { systemPrompt: string; userPrompt: string }) => Promise<string>;
  } = {},
): Promise<{ persona: Persona; companyContext: string; provider: ProviderDefinition; model: string }> {
  const cwd = options.cwd ?? process.cwd();
  const plan = await buildPersonaGenerationPlan(options, {
    scrapeCompanyContext: dependencies.scrapeCompanyContext,
  });
  const provider = await resolveReadyProvider(plan.provider.id, cwd);
  const complete = dependencies.complete ?? ((selectedProvider, selectedModel, input) =>
    completeWithProvider(selectedProvider, selectedModel, {
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      maxTokens: 2048,
      temperature: 0.2,
    }));
  const userPrompt = buildPersonaGenerationUserPrompt(plan.companyContext, description);

  const firstResponse = await complete(provider, plan.model, {
    systemPrompt: PERSONA_GENERATION_SYSTEM_PROMPT,
    userPrompt,
  });

  try {
    return {
      persona: parseGeneratedPersona(firstResponse),
      companyContext: plan.companyContext,
      provider,
      model: plan.model,
    };
  } catch (error) {
    if (!isParseError(error)) {
      throw error;
    }
  }

  const retryResponse = await complete(provider, plan.model, {
    systemPrompt: PERSONA_GENERATION_SYSTEM_PROMPT,
    userPrompt: `${userPrompt}\n\nIMPORTANT:\nYour previous response was not valid JSON for the required persona schema. Return ONLY valid JSON matching the schema.`,
  });

  return {
    persona: parseGeneratedPersona(retryResponse),
    companyContext: plan.companyContext,
    provider,
    model: plan.model,
  };
}

export function renderPersonaPreview(persona: Persona): string {
  return renderPersonaDetails(persona, 'Generated Persona');
}

export function renderPersonaDetails(persona: Persona, heading = 'Persona'): string {
  return [
    `${heading}: ${persona.name}`,
    '',
    `ID: ${persona.id}`,
    `Titles: ${persona.titles.join(', ')}`,
    `Company size: ${persona.company_size.join(', ')}`,
    '',
    'Pain points:',
    ...persona.pain_points.map((item) => `- ${item}`),
    '',
    'Goals:',
    ...persona.goals.map((item) => `- ${item}`),
    '',
    'Funnel stages:',
    `- Awareness: ${persona.funnel_stages.awareness}`,
    `- Consideration: ${persona.funnel_stages.consideration}`,
    `- Decision: ${persona.funnel_stages.decision}`,
  ].join('\n');
}

export function buildPersonaGenerationUserPrompt(companyContext: string, description: string): string {
  return `COMPANY CONTEXT:
${companyContext}

TARGET PERSONA:
${description}`;
}

function parseGeneratedPersona(rawResponse: string): Persona {
  const parsed = personaSchema.parse(JSON.parse(extractJsonPayload(rawResponse))) as Persona;
  return normalizeGeneratedPersona(parsed);
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

function isParseError(error: unknown): boolean {
  return error instanceof Error || error instanceof z.ZodError;
}

function normalizeGeneratedPersona(persona: Persona): Persona {
  if (!looksLikePersonalName(persona.name)) {
    return persona;
  }

  return {
    ...persona,
    name: buildPersonaTypeName(persona.titles),
  };
}

function looksLikePersonalName(value: string): boolean {
  const trimmed = value.trim();
  if (!/^[A-Z][a-z]+(?: [A-Z][a-z]+){1,2}$/.test(trimmed)) {
    return false;
  }

  return !containsRoleKeyword(trimmed);
}

function buildPersonaTypeName(titles: string[]): string {
  const primary = titles[0]?.trim();
  if (!primary) {
    return 'Buyer Persona';
  }

  const secondary = titles[1]?.trim();
  if (!secondary || secondary.toLowerCase() === primary.toLowerCase()) {
    return primary;
  }

  if (secondary.length <= 36) {
    return `${primary} / ${secondary}`;
  }

  return primary;
}

function containsRoleKeyword(value: string): boolean {
  return /\b(ceo|cto|cfo|cmo|coo|chief|head|director|manager|lead|partner|consultant|analyst|engineer|developer|founder|president|vp)\b/i.test(value);
}
