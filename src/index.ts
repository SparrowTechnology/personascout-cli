#!/usr/bin/env node
import chalk from 'chalk';
import { Command } from 'commander';
import { registerClassifyCommand } from './commands/classify.js';
import { registerFetchCommand } from './commands/fetch.js';
import { registerInitCommand } from './commands/init.js';
import { registerPersonaCommand } from './commands/persona.js';
import { registerProvidersCommand } from './commands/providers.js';
import { registerReportCommand } from './commands/report.js';
import { registerSourceCommand } from './commands/source.js';

const program = new Command();

program
  .name('personascout')
  .description('Map your content against your ICPs. Find the gaps. Fill them.')
  .version('0.1.0')
  .showHelpAfterError();

registerInitCommand(program);
registerPersonaCommand(program);
registerSourceCommand(program);
registerFetchCommand(program);
registerProvidersCommand(program);
registerClassifyCommand(program);
registerReportCommand(program);

void program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(message));
  process.exitCode = process.exitCode ?? 1;
});
