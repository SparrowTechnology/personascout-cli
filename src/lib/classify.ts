import { classifyContentItem } from './classifiers/index.js';
import { estimateClassificationUsage } from './classifiers/shared.js';
import { readConfig } from './config.js';
import { listPersonas } from './persona.js';
import { resolveProvider, resolveReadyProvider } from './providers.js';
import {
  createRunId,
  getAlreadyClassifiedItemIds,
  getLatestRunResult,
  loadContentItems,
  writeRunResult,
} from './results.js';
import type { ClassifiedItem, ContentItem, Persona, ProviderDefinition, RunResult } from '../types/index.js';

export interface ClassificationOptions {
  cwd?: string;
  providerId?: string;
  model?: string;
  sourceId?: string;
  since?: string;
  force?: boolean;
}

export interface ClassificationPlan {
  provider: ProviderDefinition;
  model: string;
  personas: Persona[];
  items: ContentItem[];
  items_to_classify: ContentItem[];
  latest_result_item_count: number;
  usage: ReturnType<typeof estimateClassificationUsage>;
}

export async function buildClassificationPlan(options: ClassificationOptions = {}): Promise<ClassificationPlan> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  const provider = resolveProvider(options.providerId ?? config.default_provider, config);
  const model = selectModel(provider, config.default_provider, config.default_model, options.model);
  const personas = await listPersonas(cwd);
  const items = await loadContentItems(cwd, {
    sourceId: options.sourceId,
    since: options.since,
  });
  const latestResult = options.force ? null : await getLatestRunResult(cwd);
  const alreadyClassifiedIds = getAlreadyClassifiedItemIds(latestResult);
  const itemsToClassify = options.force
    ? items
    : items.filter((item) => !alreadyClassifiedIds.has(item.id));

  return {
    provider,
    model,
    personas,
    items,
    items_to_classify: itemsToClassify,
    latest_result_item_count: latestResult?.items.length ?? 0,
    usage: estimateClassificationUsage(itemsToClassify.length, personas.length, provider.id, model),
  };
}

export async function runClassification(
  options: ClassificationOptions = {},
  dependencies: {
    classifyItem?: (provider: ProviderDefinition, model: string, personas: Persona[], item: ContentItem) => Promise<ClassifiedItem['scores'] | null>;
  } = {},
): Promise<{ result: RunResult; outputPath: string; skipped: number }> {
  const cwd = options.cwd ?? process.cwd();
  const plan = await buildClassificationPlan({ ...options, cwd });
  await resolveReadyProvider(plan.provider.id, cwd);
  const classifyItem = dependencies.classifyItem ?? classifyContentItem;
  const classifiedItems: ClassifiedItem[] = [];
  let skipped = 0;

  for (const item of plan.items_to_classify) {
    const scores = await classifyItem(plan.provider, plan.model, plan.personas, item);
    if (scores === null) {
      skipped += 1;
      continue;
    }

    classifiedItems.push({
      ...item,
      scores,
    });
  }

  const result: RunResult = {
    run_id: createRunId(),
    created_at: new Date().toISOString(),
    provider: plan.provider.id,
    model: plan.model,
    item_count: classifiedItems.length,
    persona_ids: plan.personas.map((persona) => persona.id),
    items: classifiedItems,
  };

  const outputPath = await writeRunResult(result, cwd);
  return { result, outputPath, skipped };
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
