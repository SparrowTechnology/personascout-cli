import chalk from 'chalk';
import Table from 'cli-table3';
import type { Command } from 'commander';
import { buildProjectStatus } from '../lib/status.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show project progress and the suggested next step')
    .action(async () => {
      const status = await buildProjectStatus();

      console.log(chalk.bold('PersonaScout Status'));
      console.log('');
      console.log(`Project: ${status.company_name}`);
      console.log(`Website: ${status.website}`);
      console.log('');

      renderProgress(status);
      console.log('');

      if (status.sources.length > 0) {
        renderSourceTable(status);
        console.log('');
      }

      renderLatestRun(status);
      console.log('');
      renderNextStep(status);
    });
}

function renderProgress(status: Awaited<ReturnType<typeof buildProjectStatus>>): void {
  console.log('Progress');
  console.log(`${formatReady(status.persona_count > 0)} Personas        ${status.persona_count} defined`);
  console.log(`${formatReady(status.source_count > 0)} Sources         ${status.source_count} defined`);
  console.log(`${formatSyncedSources(status)}`);
  console.log(`${formatReady(status.content_item_count > 0)} Content         ${status.content_item_count} stored item${status.content_item_count === 1 ? '' : 's'}`);
  console.log(`${formatClassificationState(status.classification_state)} Classification  ${renderClassificationLabel(status)}`);
}

function renderSourceTable(status: Awaited<ReturnType<typeof buildProjectStatus>>): void {
  console.log('Sources');

  const table = new Table({
    head: ['ID', 'TYPE', 'STATUS', 'ITEMS', 'LAST FETCHED'],
    style: { head: [], border: [] },
  });

  for (const source of status.sources) {
    table.push([
      source.id,
      source.type,
      source.last_fetched ? 'fetched' : 'not fetched',
      typeof source.item_count === 'number' ? String(source.item_count) : '—',
      source.last_fetched ? formatTimestamp(source.last_fetched) : 'Never',
    ]);
  }

  console.log(table.toString());
}

function renderLatestRun(status: Awaited<ReturnType<typeof buildProjectStatus>>): void {
  console.log('Latest Run');

  if (!status.latest_result) {
    console.log('No classification run found yet.');
    return;
  }

  console.log(`Run ID:      ${status.latest_result.run_id}`);
  console.log(`Created:     ${formatTimestamp(status.latest_result.created_at)}`);
  console.log(`Provider:    ${status.latest_result.provider}/${status.latest_result.model}`);
  console.log(`Items:       ${status.latest_result.item_count}`);
  console.log(`Freshness:   ${renderClassificationLabel(status)}`);
}

function renderNextStep(status: Awaited<ReturnType<typeof buildProjectStatus>>): void {
  console.log('Suggested Next Step');
  console.log(status.next_step.title);
  console.log(`  ${status.next_step.command}`);

  if (status.next_step.reasons.length > 0) {
    console.log('');
    console.log('Why');
    for (const reason of status.next_step.reasons) {
      console.log(`- ${reason}`);
    }
  }

  if (status.next_step.follow_up_commands.length > 0) {
    console.log('');
    console.log('Then');
    for (const command of status.next_step.follow_up_commands) {
      console.log(`  ${command}`);
    }
  }
}

function formatReady(isReady: boolean): string {
  return isReady ? chalk.green('✓') : chalk.red('✗');
}

function formatSyncedSources(status: Awaited<ReturnType<typeof buildProjectStatus>>): string {
  if (status.source_count === 0) {
    return `${chalk.red('✗')} Synced sources  no sources yet`;
  }

  return `${formatReady(status.fetched_source_count > 0)} Synced sources  ${status.fetched_source_count}/${status.source_count} fetched`;
}

function formatClassificationState(state: Awaited<ReturnType<typeof buildProjectStatus>>['classification_state']): string {
  if (state === 'current') {
    return chalk.green('✓');
  }

  if (state === 'stale') {
    return chalk.yellow('!');
  }

  return chalk.red('✗');
}

function renderClassificationLabel(status: Awaited<ReturnType<typeof buildProjectStatus>>): string {
  if (status.classification_state === 'missing') {
    return 'not run yet';
  }

  if (status.classification_state === 'stale') {
    return 'stale';
  }

  return 'up to date';
}

function formatTimestamp(value: string): string {
  return value.replace('T', ' ').slice(0, 16);
}
