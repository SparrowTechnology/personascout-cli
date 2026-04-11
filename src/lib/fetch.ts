import ora from 'ora';
import { readConfig } from './config.js';
import { writeContentItem } from './content.js';
import { fetchRssSource } from './fetchers/rss.js';
import { fetchWebsiteSource } from './fetchers/website.js';
import { listSources, updateSourceMetadata } from './source.js';
import type { Source } from '../types/source.js';

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

  const limit = options.limit ?? config.fetch_limit;
  const results: FetchSourceResult[] = [];

  for (const source of selectedSources) {
    const spinner = ora(`Fetching ${source.id}...`).start();

    try {
      if (source.type !== 'rss') {
        if (source.type !== 'website') {
          spinner.warn(`Skipped ${source.id} (${source.type} fetch is not implemented yet)`);
          results.push({
            source,
            status: 'skipped',
            fetched: 0,
            added: 0,
            reason: `${source.type} fetch is not implemented yet`,
          });
          continue;
        }
      }

      const items =
        source.type === 'rss'
          ? await fetchRssSource(source, {
              limit,
              since: options.since,
            })
          : await fetchWebsiteSource(source, {
              limit,
              depth: config.fetch_depth,
              since: options.since,
            });

      let added = 0;
      for (const item of items) {
        const result = await writeContentItem(item, cwd, { force: options.force });
        if (!result.existed) {
          added += 1;
        }
      }

      await updateSourceMetadata(
        source.id,
        {
          last_fetched: new Date().toISOString(),
          item_count: items.length,
        },
        cwd,
      );

      spinner.succeed(`${source.id} — ${items.length} items (${added} new)`);
      results.push({
        source,
        status: 'fetched',
        fetched: items.length,
        added,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      spinner.warn(`${source.id} — skipped (${reason})`);
      results.push({
        source,
        status: 'failed',
        fetched: 0,
        added: 0,
        reason,
      });
    }
  }

  return results;
}
