import Table from 'cli-table3';
import type { Command } from 'commander';
import { formatCommandWithAiBadge } from '../lib/ai-hints.js';
import { buildProjectStatus } from '../lib/status.js';
import { createTerminalUi } from '../lib/ui.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show project progress and the suggested next step')
    .action(async () => {
      const status = await buildProjectStatus();
      const ui = createTerminalUi();

      console.log(ui.section('PersonaScout Status'));
      console.log(`${ui.muted('Project')} ${status.company_name}`);
      console.log(`${ui.muted('Website')} ${status.website}`);
      console.log('');

      renderProgress(status, ui);
      console.log('');

      if (status.sources.length > 0) {
        renderSourceTable(status, ui);
        console.log('');
      }

      renderLatestRun(status, ui);
      console.log('');
      renderLatestGeneration(status, ui);
      console.log('');
      renderNextStep(status, ui);
    });
}

function renderProgress(status: Awaited<ReturnType<typeof buildProjectStatus>>, ui: ReturnType<typeof createTerminalUi>): void {
  console.log(ui.section('WORKFLOW PROGRESS'));
  console.log(ui.caption('Shows which setup and analysis steps are complete, and which stages still block your next move.'));
  console.log('');

  const classificationProgress = status.classification_state === 'current' ? 1 : status.classification_state === 'stale' ? 0.5 : 0;

  const lines: Array<{
    state: 'success' | 'warning' | 'danger' | 'info';
    label: string;
    current: number;
    total: number;
    detail: string;
    color: 'green' | 'cyan' | 'blue' | 'yellow' | 'pink' | 'red';
  }> = [
    {
      state: status.persona_count > 0 ? 'success' : 'danger',
      label: 'Personas',
      current: Math.min(status.persona_count, 1),
      total: 1,
      detail: `${status.persona_count} defined`,
      color: 'green' as const,
    },
    {
      state: status.source_count > 0 ? 'success' : 'danger',
      label: 'Sources',
      current: Math.min(status.source_count, 1),
      total: 1,
      detail: `${status.source_count} defined`,
      color: 'cyan' as const,
    },
    {
      state: status.source_count > 0 && status.fetched_source_count > 0 ? 'success' : status.source_count > 0 ? 'warning' : 'danger',
      label: 'Sync',
      current: status.fetched_source_count,
      total: Math.max(1, status.source_count),
      detail:
        status.source_count === 0
          ? 'no sources yet'
          : `${status.fetched_source_count}/${status.source_count} fetched`,
      color: 'blue' as const,
    },
    {
      state: status.content_item_count > 0 ? 'success' : 'danger',
      label: 'Content',
      current: Math.min(status.content_item_count, 1),
      total: 1,
      detail: `${status.content_item_count} stored item${status.content_item_count === 1 ? '' : 's'}`,
      color: 'yellow' as const,
    },
    {
      state: status.classification_state === 'current' ? 'success' : status.classification_state === 'stale' ? 'warning' : 'danger',
      label: 'Classification',
      current: classificationProgress,
      total: 1,
      detail: renderClassificationLabel(status),
      color: status.classification_state === 'current' ? 'green' : status.classification_state === 'stale' ? 'yellow' : 'red',
    },
  ];

  for (const line of lines) {
    console.log(
      `${ui.symbol(line.state)} ${line.label.padEnd(15)} ${ui.progressBar(line.current, line.total, { color: line.color })}  ${line.detail}`,
    );
  }
}

function renderSourceTable(status: Awaited<ReturnType<typeof buildProjectStatus>>, ui: ReturnType<typeof createTerminalUi>): void {
  console.log(ui.section('SOURCES'));
  console.log(ui.caption('Shows configured sources, whether each one has been fetched, and how much stored content came from it.'));
  console.log('');

  const table = new Table({
    head: ['ID', 'TYPE', 'STATUS', 'ITEMS', 'LAST FETCHED'],
    style: { head: [], border: [] },
  });

  for (const source of status.sources) {
    table.push([
      source.id,
      source.type,
      source.last_fetched ? ui.success('fetched') : ui.warning('not fetched'),
      typeof source.item_count === 'number' ? String(source.item_count) : '—',
      source.last_fetched ? formatTimestamp(source.last_fetched) : 'Never',
    ]);
  }

  console.log(table.toString());
}

function renderLatestRun(status: Awaited<ReturnType<typeof buildProjectStatus>>, ui: ReturnType<typeof createTerminalUi>): void {
  console.log(ui.section('LATEST RUN'));
  console.log(ui.caption('Shows the most recent classification run so you can tell whether reporting is based on current content.'));
  console.log('');

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

function renderLatestGeneration(status: Awaited<ReturnType<typeof buildProjectStatus>>, ui: ReturnType<typeof createTerminalUi>): void {
  console.log(ui.section('LATEST GENERATION'));
  console.log(ui.caption('Shows the most recent brief or draft generation run, including where those artifacts were written.'));
  console.log('');

  if (!status.latest_generation) {
    console.log('No generated artifacts recorded yet.');
    return;
  }

  const latest = status.latest_generation;
  const formats = [...new Set(latest.artifacts.map((artifact) => artifact.format))].join(', ');
  const channels = [...new Set(latest.artifacts.map((artifact) => artifact.channel))].join(', ');

  console.log(`Run ID:      ${latest.run_id}`);
  console.log(`Created:     ${formatTimestamp(latest.created_at)}`);
  console.log(`Artifacts:   ${latest.artifact_count}`);
  console.log(`Formats:     ${formats}`);
  console.log(`Channels:    ${channels}`);

  if (latest.output_dir) {
    console.log(`Saved to:    ${latest.output_dir}`);
  } else {
    console.log('Saved to:    terminal only');
  }
}

function renderNextStep(status: Awaited<ReturnType<typeof buildProjectStatus>>, ui: ReturnType<typeof createTerminalUi>): void {
  console.log(ui.section('SUGGESTED NEXT STEP'));
  console.log(ui.caption('Shows the most useful next command based on the current project state, with sensible follow-ups after it.'));
  console.log('');
  console.log(status.next_step.title);
  console.log(`  ${formatCommandWithAiBadge(status.next_step.command)}`);

  if (status.next_step.reasons.length > 0) {
    console.log('');
    console.log(ui.muted('Why'));
    for (const reason of status.next_step.reasons) {
      console.log(`- ${reason}`);
    }
  }

  if (status.next_step.follow_up_commands.length > 0) {
    console.log('');
    console.log(ui.muted('Then'));
    for (const command of status.next_step.follow_up_commands) {
      console.log(`  ${formatCommandWithAiBadge(command)}`);
    }
  }
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
