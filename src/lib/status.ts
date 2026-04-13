import { readConfig } from './config.js';
import { listPersonas } from './persona.js';
import { loadContentItems, getLatestRunResult, listRunResultFiles } from './results.js';
import { listSources } from './source.js';
import type { RunResult, Source } from '../types/index.js';

export type ClassificationState = 'missing' | 'stale' | 'current';

export interface SuggestedNextStep {
  title: string;
  command: string;
  reasons: string[];
  follow_up_commands: string[];
}

export interface ProjectStatus {
  company_name: string;
  website: string;
  persona_count: number;
  source_count: number;
  fetched_source_count: number;
  unfetched_source_count: number;
  content_item_count: number;
  result_count: number;
  latest_fetch_at: string | null;
  latest_result: RunResult | null;
  classification_state: ClassificationState;
  sources: Source[];
  next_step: SuggestedNextStep;
}

export async function buildProjectStatus(cwd = process.cwd()): Promise<ProjectStatus> {
  const [config, personas, sources, items, latestResult, resultFiles] = await Promise.all([
    readConfig(cwd),
    listPersonas(cwd),
    listSources(cwd),
    loadContentItems(cwd),
    getLatestRunResult(cwd),
    listRunResultFiles(cwd),
  ]);

  const fetchedSourceCount = sources.filter((source) => Boolean(source.last_fetched)).length;
  const unfetchedSourceCount = sources.length - fetchedSourceCount;
  const latestFetchAt = getLatestFetchAt(sources, items);
  const classificationState = getClassificationState(latestResult, latestFetchAt);

  const status: ProjectStatus = {
    company_name: config.company_name,
    website: config.website,
    persona_count: personas.length,
    source_count: sources.length,
    fetched_source_count: fetchedSourceCount,
    unfetched_source_count: unfetchedSourceCount,
    content_item_count: items.length,
    result_count: resultFiles.length,
    latest_fetch_at: latestFetchAt,
    latest_result: latestResult,
    classification_state: classificationState,
    sources,
    next_step: {
      title: '',
      command: '',
      reasons: [],
      follow_up_commands: [],
    },
  };

  status.next_step = determineSuggestedNextStep(status);
  return status;
}

export function determineSuggestedNextStep(status: Pick<
  ProjectStatus,
  | 'persona_count'
  | 'source_count'
  | 'content_item_count'
  | 'unfetched_source_count'
  | 'classification_state'
  | 'result_count'
>): SuggestedNextStep {
  if (status.persona_count === 0) {
    return {
      title: 'Define your first persona',
      command: 'personascout persona templates',
      reasons: ['No personas are defined yet.'],
      follow_up_commands: [
        'personascout persona generate',
        'personascout persona add --interactive',
      ],
    };
  }

  if (status.source_count === 0) {
    return {
      title: 'Add your first content source',
      command: 'personascout source add',
      reasons: ['No content sources are configured yet.'],
      follow_up_commands: ['personascout source test'],
    };
  }

  if (status.unfetched_source_count > 0 || status.content_item_count === 0) {
    return {
      title: 'Fetch content from your configured sources',
      command: 'personascout fetch',
      reasons: [
        status.unfetched_source_count > 0
          ? `${status.unfetched_source_count} source${status.unfetched_source_count === 1 ? '' : 's'} have not been fetched yet.`
          : 'No content has been stored yet.',
      ],
      follow_up_commands: ['personascout classify --dry-run', 'personascout classify'],
    };
  }

  if (status.classification_state === 'missing') {
    return {
      title: 'Classify your fetched content',
      command: 'personascout classify',
      reasons: [
        `${status.content_item_count} content item${status.content_item_count === 1 ? '' : 's'} are ready for analysis.`,
        'No classification run exists yet.',
      ],
      follow_up_commands: ['personascout report'],
    };
  }

  if (status.classification_state === 'stale') {
    return {
      title: 'Re-run classification on newly fetched content',
      command: 'personascout classify',
      reasons: ['New content has been fetched since the latest classification run.'],
      follow_up_commands: ['personascout report', 'personascout diff'],
    };
  }

  if (status.result_count >= 2) {
    return {
      title: 'Review the latest coverage and compare it to the previous run',
      command: 'personascout report',
      reasons: ['Your latest classification run is up to date.'],
      follow_up_commands: ['personascout diff', 'personascout generate --all --format brief', 'personascout fetch'],
    };
  }

  return {
    title: 'Review your current coverage report',
    command: 'personascout report',
    reasons: ['Your latest classification run is up to date.'],
    follow_up_commands: ['personascout generate --all --format brief', 'personascout fetch'],
  };
}

function getLatestFetchAt(sources: Source[], items: Array<{ fetched_at: string }>): string | null {
  const timestamps = [
    ...sources.map((source) => source.last_fetched).filter((value): value is string => Boolean(value)),
    ...items.map((item) => item.fetched_at),
  ].sort((left, right) => right.localeCompare(left));

  return timestamps[0] ?? null;
}

function getClassificationState(latestResult: RunResult | null, latestFetchAt: string | null): ClassificationState {
  if (!latestResult) {
    return 'missing';
  }

  if (latestFetchAt && latestResult.created_at < latestFetchAt) {
    return 'stale';
  }

  return 'current';
}
