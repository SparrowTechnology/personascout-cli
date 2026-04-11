import type { Command } from 'commander';
import {
  buildCoverageReport,
  renderCsvReport,
  renderJsonReport,
  renderMarkdownReport,
  renderTerminalReport,
} from '../lib/reporter.js';

export function registerReportCommand(program: Command): void {
  program
    .command('report')
    .description('Compute and display coverage from a classification run')
    .option('--format <format>', 'output format: terminal, json, csv, markdown', parseFormat, 'terminal')
    .option('--result <id>', 'specific result run id or filename')
    .action(async (options: { format: ReportFormat; result?: string }) => {
      const report = await buildCoverageReport({
        resultId: options.result,
      });

      if (options.format === 'json') {
        process.stdout.write(renderJsonReport(report));
        return;
      }

      if (options.format === 'csv') {
        process.stdout.write(renderCsvReport(report));
        return;
      }

      if (options.format === 'markdown') {
        process.stdout.write(renderMarkdownReport(report));
        return;
      }

      console.log(renderTerminalReport(report));
    });
}

type ReportFormat = 'terminal' | 'json' | 'csv' | 'markdown';

function parseFormat(value: string): ReportFormat {
  if (value === 'terminal' || value === 'json' || value === 'csv' || value === 'markdown') {
    return value;
  }

  throw new Error("Format must be one of: terminal, json, csv, markdown.");
}
