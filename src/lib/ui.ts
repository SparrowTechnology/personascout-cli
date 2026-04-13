import Chartscii from 'chartscii';
import style from 'styl3';
import type { CoverageCell } from '../types/index.js';

const DEFAULT_THEME = 'nature';
const DEFAULT_CHART_FILL = '░';
const DEFAULT_CHART_COLORS = ['green', 'cyan', 'blue', 'yellow', 'pink', 'red'] as const;

type Palette = {
  [key: string]: ((strings: TemplateStringsArray, ...args: string[]) => string) | undefined;
} | null;
type ChartColor = (typeof DEFAULT_CHART_COLORS)[number];

export interface ChartDatum {
  label: string;
  value: number;
  color?: ChartColor;
}

export interface ChartRenderOptions {
  width?: number;
  percentage?: boolean;
  valueLabels?: boolean;
  scale?: number | 'auto';
}

export interface TerminalUi {
  color_enabled: boolean;
  theme: string | null;
  accent(value: string): string;
  info(value: string): string;
  muted(value: string): string;
  success(value: string): string;
  warning(value: string): string;
  danger(value: string): string;
  section(value: string): string;
  caption(value: string): string;
  symbol(state: 'success' | 'warning' | 'danger' | 'info'): string;
  status(value: string, state: CoverageCell['status']): string;
  progressBar(current: number, total: number, options?: { width?: number; color?: ChartColor }): string;
  renderChart(data: ChartDatum[], options?: ChartRenderOptions): string;
}

export function createTerminalUi(): TerminalUi {
  const colorEnabled = shouldUseColor();
  const palette: Palette = colorEnabled ? (style({ theme: DEFAULT_THEME }) as unknown as NonNullable<Palette>) : null;

  return {
    color_enabled: colorEnabled,
    theme: colorEnabled ? DEFAULT_THEME : null,
    accent: (value) => applyColor(palette, 'cyan', value),
    info: (value) => applyColor(palette, 'blue', value),
    muted: (value) => applyColor(palette, 'blue', value),
    success: (value) => applyColor(palette, 'green', value),
    warning: (value) => applyColor(palette, 'yellow', value),
    danger: (value) => applyColor(palette, 'red', value),
    section: (value) => applyColor(palette, 'cyan', value),
    caption: (value) => applyColor(palette, 'green', value),
    symbol: (state) => {
      if (state === 'success') {
        return applyColor(palette, 'green', '✓');
      }

      if (state === 'warning') {
        return applyColor(palette, 'yellow', '!');
      }

      if (state === 'danger') {
        return applyColor(palette, 'red', '✗');
      }

      return applyColor(palette, 'blue', '•');
    },
    status: (value, state) => {
      if (state === 'adequate') {
        return applyColor(palette, 'green', value);
      }

      if (state === 'weak') {
        return applyColor(palette, 'yellow', value);
      }

      return applyColor(palette, 'red', value);
    },
    progressBar: (current, total, options) =>
      renderProgressBar(
        current,
        total,
        colorEnabled,
        palette,
        options?.width ?? 18,
        options?.color ?? 'green',
      ),
    renderChart: (data, options) => renderAsciiChart(data, colorEnabled, options),
  };
}

export function pickChartColor(index: number): ChartColor {
  return DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length];
}

function renderAsciiChart(data: ChartDatum[], colorEnabled: boolean, options: ChartRenderOptions = {}): string {
  if (data.length === 0) {
    return 'No data.';
  }

  const chartData = colorEnabled
    ? data
    : data.map((point) => ({
        label: point.label,
        value: point.value,
      }));

  const chart = new Chartscii(chartData, {
    width: options.width ?? getDefaultChartWidth(),
    fill: DEFAULT_CHART_FILL,
    percentage: Boolean(options.percentage),
    valueLabels: Boolean(options.valueLabels),
    barSize: 1,
    height: data.length,
    colorLabels: colorEnabled,
    theme: colorEnabled ? DEFAULT_THEME : '',
    scale: options.scale ?? 'auto',
  });

  return chart.create();
}

function renderProgressBar(
  current: number,
  total: number,
  colorEnabled: boolean,
  palette: Palette,
  width: number,
  color: ChartColor,
): string {
  const safeTotal = Math.max(1, total);
  const ratio = Math.max(0, Math.min(1, current / safeTotal));
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const bar = `${'█'.repeat(filled)}${DEFAULT_CHART_FILL.repeat(empty)}`;

  if (!colorEnabled) {
    return bar;
  }

  const filledPart = filled > 0 ? applyColor(palette, color, '█'.repeat(filled)) : '';
  const emptyPart = empty > 0 ? applyColor(palette, 'blue', DEFAULT_CHART_FILL.repeat(empty)) : '';
  return `${filledPart}${emptyPart}`;
}

function applyColor(palette: Palette | null, color: ChartColor, value: string): string {
  if (!palette) {
    return value;
  }

  const formatter = palette[color];
  if (!formatter) {
    return value;
  }

  return formatter`${value}`;
}

function shouldUseColor(): boolean {
  if ('NO_COLOR' in process.env) {
    return false;
  }

  if (process.env.FORCE_COLOR === '0') {
    return false;
  }

  if (typeof process.stdout.isTTY === 'boolean') {
    return process.stdout.isTTY;
  }

  return false;
}

function getDefaultChartWidth(): number {
  const available = (process.stdout.columns ?? 100) - 34;
  return Math.max(18, Math.min(44, available));
}
