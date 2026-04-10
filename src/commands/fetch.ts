import chalk from 'chalk';
import type { Command } from 'commander';
import { fetchProjectSources } from '../lib/fetch.js';

export function registerFetchCommand(program: Command): void {
  program
    .command('fetch')
    .description('Fetch content from configured sources')
    .option('--source <id>', 'fetch a single source')
    .option('--since <date>', 'only include items published after this ISO date', parseIsoDate)
    .option('--limit <n>', 'override the configured fetch limit', parsePositiveInteger)
    .option('--force', 're-fetch and overwrite existing items')
    .action(
      async (options: {
        source?: string;
        since?: string;
        limit?: number;
        force?: boolean;
      }) => {
        console.log('Fetching content sources...');
        console.log('');

        const results = await fetchProjectSources({
          sourceId: options.source,
          since: options.since,
          limit: options.limit,
          force: Boolean(options.force),
        });

        let totalFetched = 0;
        let totalAdded = 0;

        for (const result of results) {
          if (result.status === 'fetched') {
            totalFetched += result.fetched;
            totalAdded += result.added;
          }
        }

        console.log('');
        console.log(`Total: ${totalFetched} items fetched, ${totalAdded} new`);
        console.log("Run 'personascout classify' to analyse coverage.");
      },
    );
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('Limit must be a positive integer.');
  }

  return parsed;
}

function parseIsoDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Since must be a valid ISO date.');
  }

  return parsed.toISOString();
}
