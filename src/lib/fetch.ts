import ora from 'ora';
import { pathExists, readConfig } from './config.js';
import { getContentDuplicateKey, getContentItemPath, writeContentItem } from './content.js';
import { fetchCsvSource } from './fetchers/csv.js';
import { fetchRssSource } from './fetchers/rss.js';
import { fetchWebsiteSource } from './fetchers/website.js';
import { loadContentItems } from './results.js';
import { listSources, updateSourceMetadata } from './source.js';
import type { Source } from '../types/source.js';

const LEGACY_DEFAULT_FETCH_LIMIT = 100;

export interface FetchRunOptions {
  sourceId?: string;
  since?: string;
  limit?: number;
  force?: boolean;
  cwd?: string;
}

export interface FetchSourceResult {
  source: Source;
  status: 'fetched' | 'skipped' | 'failed';
  fetched: number;
  added: number;
  duplicate_skipped: number;
  reason?: string;
}

export async function fetchProjectSources(options: FetchRunOptions = {}): Promise<FetchSourceResult[]> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  const allSources = await listSources(cwd);
  if (allSources.length === 0) {
    throw new Error("No sources defined. Run 'personascout source add' first.");
  }

  const selectedSources = options.sourceId
    ? allSources.filter((source) => source.id === options.sourceId)
    : allSources;

  if (options.sourceId && selectedSources.length === 0) {
    throw new Error(`Source "${options.sourceId}" was not found.`);
  }

  const limit = options.limit ?? normalizeFetchLimit(config.fetch_limit);
  const results: FetchSourceResult[] = [];
  const seenDuplicateKeys = new Set((await loadContentItems(cwd)).map((item) => getContentDuplicateKey(item)));

  for (const source of selectedSources) {
    const spinner = ora(`Fetching ${source.id}...`).start();
    const startedAt = Date.now();
    let statusMessage = 'starting';
    const renderSpinnerText = () => {
      spinner.text = `Fetching ${source.id} — ${statusMessage} (${formatElapsed(Date.now() - startedAt)})`;
    };
    const statusInterval = setInterval(renderSpinnerText, 1000);
    const updateStatus = (message: string) => {
      statusMessage = message;
      renderSpinnerText();
    };

    renderSpinnerText();

    try {
      const items =
        source.type === 'rss'
          ? await fetchRssSource(source, {
              limit,
              since: options.since,
              onProgress: updateStatus,
            })
          : source.type === 'website'
            ? await fetchWebsiteSource(source, {
                limit,
                depth: config.fetch_depth,
                since: options.since,
                onProgress: updateStatus,
              })
            : await fetchCsvSource(source, {
                limit,
                since: options.since,
                onProgress: updateStatus,
              });

      let added = 0;
      let duplicateSkipped = 0;
      for (const [index, item] of items.entries()) {
        updateStatus(`saving ${index + 1}/${items.length} items`);
        const duplicateKey = getContentDuplicateKey(item);
        const outputPath = getContentItemPath(item.source_id, item.id, cwd);
        const existedInThisSource = await pathExists(outputPath);
        if (seenDuplicateKeys.has(duplicateKey) && !existedInThisSource) {
          duplicateSkipped += 1;
          continue;
        }

        const result = await writeContentItem(item, cwd, { force: options.force });
        if (!result.existed) {
          added += 1;
          seenDuplicateKeys.add(duplicateKey);
        }
      }

      await updateSourceMetadata(
        source.id,
        {
          last_fetched: new Date().toISOString(),
          item_count: items.length - duplicateSkipped,
        },
        cwd,
      );

      clearInterval(statusInterval);
      spinner.succeed(
        `${source.id} — ${items.length} items (${added} new${duplicateSkipped > 0 ? `, ${duplicateSkipped} duplicates skipped` : ''}, ${formatElapsed(Date.now() - startedAt)})`,
      );
      results.push({
        source,
        status: 'fetched',
        fetched: items.length,
        added,
        duplicate_skipped: duplicateSkipped,
      });
    } catch (error) {
      clearInterval(statusInterval);
      const reason = error instanceof Error ? error.message : String(error);
      spinner.warn(`${source.id} — skipped after ${formatElapsed(Date.now() - startedAt)} (${reason})`);
      results.push({
        source,
        status: 'failed',
        fetched: 0,
        added: 0,
        duplicate_skipped: 0,
        reason,
      });
    }
  }

  return results;
}

function formatElapsed(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function normalizeFetchLimit(limit: number): number {
  // Older projects were initialized with fetch_limit=100 as the default cap.
  // Treat that legacy default as "unlimited" so existing users get the new behavior
  // without having to hand-edit config.json.
  if (limit === LEGACY_DEFAULT_FETCH_LIMIT) {
    return 0;
  }

  return limit;
}
