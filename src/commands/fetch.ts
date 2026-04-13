import type { Command } from 'commander';
import { fetchProjectSources } from '../lib/fetch.js';
import { createTerminalUi } from '../lib/ui.js';

export function registerFetchCommand(program: Command): void {
  program
    .command('fetch')
    .description('Fetch content from configured sources')
    .option('--source <id>', 'fetch a single source')
    .option('--since <date>', 'only include items published after this ISO date', parseIsoDate)
    .option('--limit <n>', 'override the configured fetch limit (use 0 for no limit)', parseFetchLimit)
    .option('--force', 're-fetch and overwrite existing items')
    .action(
      async (options: {
        source?: string;
        since?: string;
        limit?: number;
        force?: boolean;
      }) => {
        const ui = createTerminalUi();
        console.log(ui.section('FETCH'));
        console.log(ui.caption('Pulls content from your configured sources and stores normalized items for later classification.'));
        console.log('');

        const results = await fetchProjectSources({
          sourceId: options.source,
          since: options.since,
          limit: options.limit,
          force: Boolean(options.force),
        });

        let totalFetched = 0;
        let totalAdded = 0;
        let totalDuplicateSkipped = 0;

        for (const result of results) {
          if (result.status === 'fetched') {
            totalFetched += result.fetched;
            totalAdded += result.added;
            totalDuplicateSkipped += result.duplicate_skipped;
          }
        }

        console.log('');
        console.log(ui.muted(`Total: ${totalFetched} items fetched, ${totalAdded} new${totalDuplicateSkipped > 0 ? `, ${totalDuplicateSkipped} duplicates skipped` : ''}`));
        console.log(`${ui.accent("Next:")} personascout classify`);
      },
    );
}

function parseFetchLimit(value: string): number {
  if (value.trim() === 'all') {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Limit must be 0 or a positive integer.');
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
