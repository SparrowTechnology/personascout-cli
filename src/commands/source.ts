import { confirm, input, select } from '@inquirer/prompts';
import Table from 'cli-table3';
import chalk from 'chalk';
import type { Command } from 'commander';
import { fetchProjectSources } from '../lib/fetch.js';
import {
  deleteSourceById,
  formatSourceLocation,
  getSourceContentPath,
  listSources,
  readSourceById,
  saveSource,
  slugify,
  testSource,
} from '../lib/source.js';
import { pathExists } from '../lib/config.js';
import type { SourceType } from '../types/source.js';

export function registerSourceCommand(program: Command): void {
  const source = program.command('source').description('Manage content sources');

  source
    .command('list')
    .description('List sources')
    .action(async () => {
      const sources = await listSources();

      if (sources.length === 0) {
        console.log("No sources defined. Run 'personascout source add' to add one.");
        return;
      }

      const table = new Table({
        head: ['ID', 'TYPE', 'LABEL', 'URL/FILE', 'LAST FETCHED', 'ITEMS'],
        style: { head: [], border: [] },
      });

      for (const entry of sources) {
        table.push([
          entry.id,
          entry.type,
          entry.label,
          formatSourceLocation(entry),
          entry.last_fetched ? entry.last_fetched.slice(0, 10) : 'Never',
          typeof entry.item_count === 'number' ? String(entry.item_count) : '—',
        ]);
      }

      console.log(table.toString());
    });

  source
    .command('add')
    .description('Add a source')
    .option('--type <type>', 'rss|website|csv')
    .option('--url <url>', 'URL for rss or website sources')
    .option('--file <path>', 'file path for csv sources')
    .option('--label <label>', 'human-readable label')
    .option('-f, --force', 'overwrite an existing source')
    .action(
      async (options: {
        type?: string;
        url?: string;
        file?: string;
        label?: string;
        force?: boolean;
      }) => {
        const type = await resolveSourceType(options.type);
        const isNonInteractive =
          Boolean(options.type) &&
          Boolean(options.label) &&
          ((type === 'csv' && Boolean(options.file)) || (type !== 'csv' && Boolean(options.url)));

        const label =
          options.label ??
          (await input({
            message: 'Label',
            validate: (value) => (value.trim().length > 0 ? true : 'Label is required.'),
          }));

        const location =
          type === 'csv'
            ? options.file ??
              (await input({
                message: 'File path',
                validate: (value) => (value.trim().length > 0 ? true : 'File path is required.'),
              }))
            : options.url ??
              (await input({
                message: 'URL',
                validate: validateUrl,
              }));

        const defaultId = slugify(label);
        const id = isNonInteractive
          ? defaultId
          : await input({
              message: 'Source ID',
              default: defaultId,
              validate: (value) =>
                /^[a-z0-9-]+$/.test(value.trim()) ? true : 'Source ID must be kebab-case.',
            });

        const csvMapping =
          type === 'csv'
            ? isNonInteractive
              ? undefined
              : {
                  title: await input({ message: 'CSV title column', default: 'title' }),
                  body: await input({ message: 'CSV body column', default: 'body' }),
                  date: await input({ message: 'CSV date column', default: 'date' }),
                  url: await input({ message: 'CSV url column', default: 'url' }),
                }
            : undefined;

        const { source: savedSource, outputPath } = await saveSource(
          {
            id,
            type,
            label,
            url: type === 'csv' ? undefined : location,
            file: type === 'csv' ? location : undefined,
            csv_mapping: csvMapping,
          },
          process.cwd(),
          { force: Boolean(options.force) },
        );

        console.log(chalk.green(`✓ Saved source ${savedSource.id}`));
        console.log(outputPath);

        if (isNonInteractive) {
          console.log(`Run 'personascout fetch --source ${savedSource.id}' next.`);
          return;
        }

        const shouldFetch = await confirm({
          message: 'Source added. Fetch content now?',
          default: true,
        });

        if (shouldFetch) {
          const results = await fetchProjectSources({ sourceId: savedSource.id });
          const fetched = results.reduce((sum, entry) => sum + entry.fetched, 0);
          const added = results.reduce((sum, entry) => sum + entry.added, 0);
          console.log(`Total: ${fetched} items fetched, ${added} new`);
          return;
        }

        console.log(`Run 'personascout fetch --source ${savedSource.id}' next.`);
      },
    );

  source
    .command('remove <sourceId>')
    .description('Remove a source')
    .action(async (sourceId: string) => {
      await readSourceById(sourceId);

      const shouldDelete = await confirm({
        message: `Delete source "${sourceId}"?`,
        default: false,
      });

      if (!shouldDelete) {
        console.log('Delete cancelled.');
        return;
      }

      const contentPath = getSourceContentPath(sourceId);
      const hasFetchedContent = await pathExists(contentPath);
      const shouldDeleteContent = hasFetchedContent
        ? await confirm({
            message: `Delete fetched content for "${sourceId}" too?`,
            default: false,
          })
        : false;

      const result = await deleteSourceById(sourceId, process.cwd(), {
        deleteContent: shouldDeleteContent,
      });

      console.log(chalk.green(`✓ Deleted source ${sourceId}`));
      console.log(result.sourcePath);

      if (result.contentDeleted) {
        console.log(chalk.green(`✓ Deleted fetched content for ${sourceId}`));
        console.log(result.contentPath);
      }
    });

  source
    .command('test [sourceId]')
    .description('Test source connectivity')
    .action(async (sourceId?: string) => {
      const sources = await listSources();
      const selectedSources = sourceId
        ? sources.filter((sourceEntry) => sourceEntry.id === sourceId)
        : sources;

      if (selectedSources.length === 0) {
        if (sourceId) {
          throw new Error(`Source "${sourceId}" was not found.`);
        }

        console.log("No sources defined. Run 'personascout source add' to add one.");
        return;
      }

      let hasFailures = false;

      for (const sourceEntry of selectedSources) {
        const result = await testSource(sourceEntry);
        const marker = result.ok ? chalk.green('✓') : chalk.red('✗');
        console.log(`${marker} ${sourceEntry.id} — ${result.detail}`);
        if (!result.ok) {
          hasFailures = true;
        }
      }

      if (hasFailures) {
        process.exitCode = 2;
      }
    });
}

async function resolveSourceType(inputType?: string): Promise<SourceType> {
  if (inputType) {
    if (inputType === 'rss' || inputType === 'website' || inputType === 'csv') {
      return inputType;
    }

    throw new Error('Source type must be one of: rss, website, csv.');
  }

  return select<SourceType>({
    message: 'Source type',
    choices: [
      { name: 'rss', value: 'rss' },
      { name: 'website', value: 'website' },
      { name: 'csv', value: 'csv' },
    ],
  });
}

function validateUrl(value: string): true | string {
  try {
    const parsed = new URL(value.trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? true : 'URL must start with http:// or https://';
  } catch {
    return 'Enter a valid URL.';
  }
}
