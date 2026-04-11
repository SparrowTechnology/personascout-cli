import type { Command } from 'commander';
import { buildCoverageDiffReport, renderJsonDiffReport, renderMarkdownDiffReport, renderTerminalDiffReport } from '../lib/diff.js';

export function registerDiffCommand(program: Command): void {
  program
    .command('diff')
    .description('Compare two classification runs and show coverage changes')
    .option('--from <id>', 'baseline result run id or filename')
    .option('--to <id>', 'comparison result run id or filename')
    .option('--format <format>', 'output format: terminal, json, markdown', parseFormat, 'terminal')
    .action(async (options: { from?: string; to?: string; format: DiffFormat }) => {
      const report = await buildCoverageDiffReport({
        fromId: options.from,
        toId: options.to,
      });

      if (options.format === 'json') {
        process.stdout.write(renderJsonDiffReport(report));
        return;
      }

      if (options.format === 'markdown') {
        process.stdout.write(renderMarkdownDiffReport(report));
        return;
      }

      console.log(renderTerminalDiffReport(report));
    });
}

type DiffFormat = 'terminal' | 'json' | 'markdown';

function parseFormat(value: string): DiffFormat {
  if (value === 'terminal' || value === 'json' || value === 'markdown') {
    return value;
  }

  throw new Error('Format must be one of: terminal, json, markdown.');
}
