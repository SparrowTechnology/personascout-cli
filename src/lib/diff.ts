import { buildCoverageReport, type CoverageReport } from './reporter.js';
import { listRunResultFiles } from './results.js';
import { createTerminalUi, pickChartColor } from './ui.js';

export interface CoverageDiffChange {
  persona_id: string;
  persona_name: string;
  funnel_stage: 'awareness' | 'consideration' | 'decision';
  from_count: number;
  to_count: number;
  delta: number;
  from_status: 'critical' | 'weak' | 'adequate';
  to_status: 'critical' | 'weak' | 'adequate';
  is_new_gap: boolean;
  is_gap_closed: boolean;
}

export interface CoverageDiffReport {
  from: CoverageReport;
  to: CoverageReport;
  changes: CoverageDiffChange[];
  summary: {
    improved: number;
    declined: number;
    unchanged: number;
    new_gaps: number;
    gaps_closed: number;
  };
}

export async function buildCoverageDiffReport(
  options: {
    cwd?: string;
    fromId?: string;
    toId?: string;
  } = {},
): Promise<CoverageDiffReport> {
  const cwd = options.cwd ?? process.cwd();
  const { fromId, toId } = await resolveDiffResultSelection({
    cwd,
    fromId: options.fromId,
    toId: options.toId,
  });

  const [from, to] = await Promise.all([
    buildCoverageReport({ cwd, resultId: fromId }),
    buildCoverageReport({ cwd, resultId: toId }),
  ]);

  const fromCells = new Map(from.coverage_matrix.map((cell) => [toKey(cell.persona_id, cell.funnel_stage), cell]));
  const toCells = new Map(to.coverage_matrix.map((cell) => [toKey(cell.persona_id, cell.funnel_stage), cell]));
  const personaNames = new Map<string, string>();

  for (const persona of [...from.personas, ...to.personas]) {
    personaNames.set(persona.id, persona.name);
  }

  const keys = [...new Set([...fromCells.keys(), ...toCells.keys()])].sort();
  const changes = keys.map((key) => {
    const [personaId, stage] = key.split(':') as [string, CoverageDiffChange['funnel_stage']];
    const fromCell = fromCells.get(key) ?? {
      persona_id: personaId,
      funnel_stage: stage,
      count: 0,
      status: 'critical' as const,
    };
    const toCell = toCells.get(key) ?? {
      persona_id: personaId,
      funnel_stage: stage,
      count: 0,
      status: 'critical' as const,
    };
    const fromGap = fromCell.status !== 'adequate';
    const toGap = toCell.status !== 'adequate';

    return {
      persona_id: personaId,
      persona_name: personaNames.get(personaId) ?? personaId,
      funnel_stage: stage,
      from_count: fromCell.count,
      to_count: toCell.count,
      delta: toCell.count - fromCell.count,
      from_status: fromCell.status,
      to_status: toCell.status,
      is_new_gap: !fromGap && toGap,
      is_gap_closed: fromGap && !toGap,
    };
  });

  return {
    from,
    to,
    changes,
    summary: {
      improved: changes.filter((change) => change.delta > 0).length,
      declined: changes.filter((change) => change.delta < 0).length,
      unchanged: changes.filter((change) => change.delta === 0).length,
      new_gaps: changes.filter((change) => change.is_new_gap).length,
      gaps_closed: changes.filter((change) => change.is_gap_closed).length,
    },
  };
}

export function renderTerminalDiffReport(report: CoverageDiffReport): string {
  const ui = createTerminalUi();
  const lines = [
    ui.section('Coverage Change Report'),
    `${ui.muted('From')} ${formatRunDate(report.from.run.created_at)}  →  ${ui.muted('To')} ${formatRunDate(report.to.run.created_at)}`,
    '',
    ui.section('SUMMARY'),
    ui.caption('Shows whether coverage improved, declined, or introduced new gaps between the two selected runs.'),
    '',
    ui.renderChart(
      [
        { label: 'Improved', value: report.summary.improved, color: pickChartColor(0) },
        { label: 'Declined', value: report.summary.declined, color: pickChartColor(5) },
        { label: 'New gaps', value: report.summary.new_gaps, color: pickChartColor(3) },
        { label: 'Gaps closed', value: report.summary.gaps_closed, color: pickChartColor(1) },
        { label: 'Unchanged', value: report.summary.unchanged, color: pickChartColor(2) },
      ],
      {
        percentage: false,
        valueLabels: true,
      },
    ),
    '',
    ui.section('CHANGES'),
    ui.caption('Shows the per-persona, per-stage coverage movement so you can see exactly where coverage improved or deteriorated.'),
  ];

  for (const change of sortChanges(report.changes)) {
    lines.push(`  ${formatTerminalChange(change, ui)}`);
  }

  lines.push('');
  lines.push(ui.muted(`Gaps closed: ${report.summary.gaps_closed}`));
  lines.push(ui.muted(`New gaps: ${report.summary.new_gaps}`));
  lines.push(ui.muted(`Improved: ${report.summary.improved}`));
  lines.push(ui.muted(`Declined: ${report.summary.declined}`));
  lines.push(ui.muted(`Unchanged: ${report.summary.unchanged}`));

  return lines.join('\n');
}

export function renderJsonDiffReport(report: CoverageDiffReport): string {
  return `${JSON.stringify(
    {
      from: {
        run_id: report.from.run.run_id,
        created_at: report.from.run.created_at,
      },
      to: {
        run_id: report.to.run.run_id,
        created_at: report.to.run.created_at,
      },
      changes: report.changes,
      summary: report.summary,
    },
    null,
    2,
  )}\n`;
}

export function renderMarkdownDiffReport(report: CoverageDiffReport): string {
  const lines = [
    '# PersonaScout Coverage Diff',
    '',
    `- From: ${report.from.run.run_id}`,
    `- To: ${report.to.run.run_id}`,
    '',
    '| Persona | Stage | From | To | Delta | Notes |',
    '| --- | --- | ---: | ---: | ---: | --- |',
  ];

  for (const change of sortChanges(report.changes)) {
    lines.push(
      `| ${escapeMarkdown(change.persona_name)} | ${change.funnel_stage} | ${change.from_count} | ${change.to_count} | ${formatDelta(change.delta)} | ${formatMarkdownNotes(change)} |`,
    );
  }

  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Gaps closed: ${report.summary.gaps_closed}`);
  lines.push(`- New gaps: ${report.summary.new_gaps}`);
  lines.push(`- Improved: ${report.summary.improved}`);
  lines.push(`- Declined: ${report.summary.declined}`);
  lines.push(`- Unchanged: ${report.summary.unchanged}`);

  return `${lines.join('\n')}\n`;
}

async function resolveDiffResultSelection(options: {
  cwd: string;
  fromId?: string;
  toId?: string;
}): Promise<{ fromId: string; toId: string }> {
  if (options.fromId && options.toId) {
    return { fromId: options.fromId, toId: options.toId };
  }

  const files = await listRunResultFiles(options.cwd);
  if (files.length < 2 && (!options.fromId || !options.toId)) {
    throw new Error("Need at least two result files to run 'personascout diff'.");
  }

  const toId = options.toId ?? stripJsonExtension(files[0]!);
  if (options.fromId) {
    return { fromId: options.fromId, toId };
  }

  const toIndex = files.findIndex((file) => file === `${toId}.json` || stripJsonExtension(file) === toId);
  if (toIndex === -1 || toIndex + 1 >= files.length) {
    throw new Error(`Could not find an older baseline result before "${toId}". Pass --from explicitly.`);
  }

  return {
    fromId: stripJsonExtension(files[toIndex + 1]!),
    toId,
  };
}

function sortChanges(changes: CoverageDiffChange[]): CoverageDiffChange[] {
  return [...changes].sort((left, right) => {
    const leftRank = getChangeRank(left);
    const rightRank = getChangeRank(right);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    if (left.persona_name !== right.persona_name) {
      return left.persona_name.localeCompare(right.persona_name);
    }

    return left.funnel_stage.localeCompare(right.funnel_stage);
  });
}

function getChangeRank(change: CoverageDiffChange): number {
  if (change.is_new_gap) {
    return 0;
  }

  if (change.is_gap_closed) {
    return 1;
  }

  if (change.delta !== 0) {
    return 2;
  }

  return 3;
}

function formatTerminalChange(change: CoverageDiffChange, ui: ReturnType<typeof createTerminalUi>): string {
  if (change.is_new_gap) {
    return ui.warning(`NEW  ${change.persona_name} — ${change.funnel_stage}: ${change.to_count} (new gap detected)`);
  }

  if (change.is_gap_closed) {
    return ui.success(`CLOSED  ${change.persona_name} — ${change.funnel_stage}: ${change.from_count} → ${change.to_count}`);
  }

  if (change.delta > 0) {
    return ui.success(`↑  ${change.persona_name} — ${change.funnel_stage}: ${change.from_count} → ${change.to_count} (+${change.delta})`);
  }

  if (change.delta < 0) {
    return ui.danger(`↓  ${change.persona_name} — ${change.funnel_stage}: ${change.from_count} → ${change.to_count} (${change.delta})`);
  }

  return `${ui.muted('→')}  ${change.persona_name} — ${change.funnel_stage}: ${change.from_count} → ${change.to_count} (no change)`;
}

function formatMarkdownNotes(change: CoverageDiffChange): string {
  if (change.is_new_gap) {
    return 'new gap detected';
  }

  if (change.is_gap_closed) {
    return 'gap closed';
  }

  if (change.delta === 0) {
    return 'no change';
  }

  return change.delta > 0 ? 'improved' : 'declined';
}

function formatDelta(delta: number): string {
  if (delta > 0) {
    return `+${delta}`;
  }

  return String(delta);
}

function formatRunDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 10);
}

function toKey(personaId: string, stage: CoverageDiffChange['funnel_stage']): string {
  return `${personaId}:${stage}`;
}

function stripJsonExtension(fileName: string): string {
  return fileName.endsWith('.json') ? fileName.slice(0, -5) : fileName;
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|');
}
