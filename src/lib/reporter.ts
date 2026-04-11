import chalk from 'chalk';
import Table from 'cli-table3';
import { readConfig } from './config.js';
import { listPersonas } from './persona.js';
import { readSelectedRunResult } from './results.js';
import type { Config, CoverageCell, CoverageMatrix, Persona, RunResult } from '../types/index.js';

const FUNNEL_STAGES = ['awareness', 'consideration', 'decision'] as const;

export interface CoverageGap {
  persona_id: string;
  persona_name: string;
  funnel_stage: CoverageCell['funnel_stage'];
  count: number;
  status: CoverageCell['status'];
  threshold: number;
}

export interface CoverageReport {
  run: RunResult;
  personas: Persona[];
  thresholds: Config['coverage_thresholds'];
  coverage_matrix: CoverageMatrix;
  gaps: CoverageGap[];
}

export async function buildCoverageReport(
  options: {
    cwd?: string;
    resultId?: string;
  } = {},
): Promise<CoverageReport> {
  const cwd = options.cwd ?? process.cwd();
  const [config, personas, run] = await Promise.all([
    readConfig(cwd),
    listPersonas(cwd),
    readSelectedRunResult(options.resultId, cwd),
  ]);

  const coverageMatrix = computeCoverageMatrix(run, personas, config);
  const personaById = new Map(personas.map((persona) => [persona.id, persona]));
  const gaps = coverageMatrix
    .filter((cell) => cell.status !== 'adequate')
    .map((cell) => ({
      persona_id: cell.persona_id,
      persona_name: personaById.get(cell.persona_id)?.name ?? cell.persona_id,
      funnel_stage: cell.funnel_stage,
      count: cell.count,
      status: cell.status,
      threshold: cell.status === 'critical' ? config.coverage_thresholds.critical : config.coverage_thresholds.adequate,
    }));

  return {
    run,
    personas,
    thresholds: config.coverage_thresholds,
    coverage_matrix: coverageMatrix,
    gaps,
  };
}

export function computeCoverageMatrix(run: RunResult, personas: Persona[], config: Config): CoverageMatrix {
  const itemBuckets = new Map<string, CoverageCell['items']>();

  for (const personaId of run.persona_ids) {
    for (const stage of FUNNEL_STAGES) {
      itemBuckets.set(toCellKey(personaId, stage), []);
    }
  }

  for (const item of run.items) {
    for (const score of item.scores) {
      const key = toCellKey(score.persona_id, score.funnel_stage);
      const bucket = itemBuckets.get(key);
      if (!bucket) {
        continue;
      }

      bucket.push({
        id: item.id,
        title: item.title,
        url: item.url,
        relevance: score.relevance,
      });
    }
  }

  const orderedPersonaIds = getOrderedPersonaIds(run, personas);
  const matrix: CoverageMatrix = [];

  for (const personaId of orderedPersonaIds) {
    for (const stage of FUNNEL_STAGES) {
      const key = toCellKey(personaId, stage);
      const items = [...(itemBuckets.get(key) ?? [])].sort((left, right) => right.relevance - left.relevance);

      matrix.push({
        persona_id: personaId,
        funnel_stage: stage,
        count: items.length,
        items,
        status: classifyCoverageStatus(items.length, config),
      });
    }
  }

  return matrix;
}

export function renderTerminalReport(report: CoverageReport): string {
  const personaRows = buildPersonaRows(report.coverage_matrix, report.personas);
  const maxCount = Math.max(0, ...report.coverage_matrix.map((cell) => cell.count));
  const table = new Table({
    head: ['Persona', 'Awareness', 'Consideration', 'Decision', 'Total'],
    style: { head: ['cyan'], border: ['gray'] },
    wordWrap: false,
  });

  for (const row of personaRows) {
    table.push([
      row.persona_name,
      formatCoverageCell(row.awareness, maxCount),
      formatCoverageCell(row.consideration, maxCount),
      formatCoverageCell(row.decision, maxCount),
      String(row.total),
    ]);
  }

  const lines = [
    'PersonaScout',
    `Analysed: ${report.run.item_count} items  |  Run: ${formatRunDate(report.run.created_at)}  |  Provider: ${report.run.provider}/${report.run.model}`,
    '',
    'ICP COVERAGE',
    table.toString(),
    '',
  ];

  if (report.gaps.length === 0) {
    lines.push(chalk.green('No coverage gaps detected.'));
  } else {
    lines.push('GAPS DETECTED');
    for (const gap of report.gaps) {
      lines.push(`  ${formatGapLine(gap)}`);
    }
  }

  return lines.join('\n');
}

export function renderJsonReport(report: CoverageReport): string {
  return `${JSON.stringify(
    {
      ...report.run,
      personas: report.personas,
      thresholds: report.thresholds,
      coverage_matrix: report.coverage_matrix,
      gaps: report.gaps,
    },
    null,
    2,
  )}\n`;
}

export function renderCsvReport(report: CoverageReport): string {
  const lines = ['persona_id,funnel_stage,count,status'];
  for (const cell of report.coverage_matrix) {
    lines.push([cell.persona_id, cell.funnel_stage, String(cell.count), cell.status].join(','));
  }

  return `${lines.join('\n')}\n`;
}

export function renderMarkdownReport(report: CoverageReport): string {
  const personaRows = buildPersonaRows(report.coverage_matrix, report.personas);
  const lines = [
    '# PersonaScout Coverage Report',
    '',
    `- Run: ${report.run.run_id}`,
    `- Created: ${report.run.created_at}`,
    `- Provider: ${report.run.provider}/${report.run.model}`,
    `- Items analysed: ${report.run.item_count}`,
    '',
    '| Persona | Awareness | Consideration | Decision | Total |',
    '| --- | --- | --- | --- | ---: |',
  ];

  for (const row of personaRows) {
    lines.push(
      `| ${escapeMarkdown(row.persona_name)} | ${formatMarkdownCell(row.awareness)} | ${formatMarkdownCell(row.consideration)} | ${formatMarkdownCell(row.decision)} | ${row.total} |`,
    );
  }

  lines.push('');
  lines.push('## Gaps');
  lines.push('');

  if (report.gaps.length === 0) {
    lines.push('No coverage gaps detected.');
  } else {
    for (const gap of report.gaps) {
      lines.push(`- ${gap.persona_name} — ${gap.funnel_stage}: ${gap.count} (${gap.status})`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function buildPersonaRows(coverageMatrix: CoverageMatrix, personas: Persona[]) {
  const personaById = new Map(personas.map((persona) => [persona.id, persona]));
  const rows = new Map<string, {
    persona_id: string;
    persona_name: string;
    awareness: CoverageCell;
    consideration: CoverageCell;
    decision: CoverageCell;
    total: number;
  }>();

  for (const cell of coverageMatrix) {
    const existing = rows.get(cell.persona_id) ?? {
      persona_id: cell.persona_id,
      persona_name: personaById.get(cell.persona_id)?.name ?? cell.persona_id,
      awareness: emptyCoverageCell(cell.persona_id, 'awareness'),
      consideration: emptyCoverageCell(cell.persona_id, 'consideration'),
      decision: emptyCoverageCell(cell.persona_id, 'decision'),
      total: 0,
    };

    existing[cell.funnel_stage] = cell;
    existing.total = existing.awareness.count + existing.consideration.count + existing.decision.count;
    rows.set(cell.persona_id, existing);
  }

  return [...rows.values()];
}

function classifyCoverageStatus(count: number, config: Config): CoverageCell['status'] {
  if (count <= config.coverage_thresholds.critical) {
    return 'critical';
  }

  if (count < config.coverage_thresholds.adequate) {
    return 'weak';
  }

  return 'adequate';
}

function formatCoverageCell(cell: CoverageCell, maxCount: number): string {
  const bar = buildBar(cell.count, maxCount);
  const label = bar.length > 0 ? `${bar} (${cell.count})` : `(${cell.count})`;

  if (cell.status === 'adequate') {
    return chalk.green(label);
  }

  if (cell.status === 'weak') {
    return chalk.yellow(label);
  }

  return chalk.red(label);
}

function formatGapLine(gap: CoverageGap): string {
  const icon = gap.status === 'critical' ? chalk.red('!') : chalk.yellow('!');
  const thresholdLabel = gap.status === 'weak' ? `, threshold: ${gap.threshold}` : '';
  const statusLabel = gap.status === 'critical' ? chalk.red(gap.status.toUpperCase()) : chalk.yellow(gap.status.toUpperCase());
  return `${icon} ${gap.persona_name} — ${gap.funnel_stage}: ${gap.count} piece${gap.count === 1 ? '' : 's'} (${statusLabel}${thresholdLabel})`;
}

function buildBar(count: number, maxCount: number): string {
  if (count === 0 || maxCount === 0) {
    return '';
  }

  const width = Math.max(1, Math.round((count / maxCount) * 10));
  return '█'.repeat(width);
}

function formatRunDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().replace('T', ' ').slice(0, 16);
}

function formatMarkdownCell(cell: CoverageCell): string {
  return `${cell.count} (${cell.status})`;
}

function getOrderedPersonaIds(run: RunResult, personas: Persona[]): string[] {
  const available = new Set(personas.map((persona) => persona.id));
  const orderedFromRun = run.persona_ids.filter((personaId) => available.has(personaId));
  const additional = personas.map((persona) => persona.id).filter((personaId) => !orderedFromRun.includes(personaId));
  return [...orderedFromRun, ...additional];
}

function toCellKey(personaId: string, stage: CoverageCell['funnel_stage']): string {
  return `${personaId}:${stage}`;
}

function emptyCoverageCell(personaId: string, stage: CoverageCell['funnel_stage']): CoverageCell {
  return {
    persona_id: personaId,
    funnel_stage: stage,
    count: 0,
    items: [],
    status: 'critical',
  };
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|');
}
