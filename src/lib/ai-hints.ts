import { createTerminalUi } from './ui.js';

const AI_COMMAND_PREFIXES = [
  'personascout classify',
  'personascout generate',
  'personascout persona generate',
] as const;

export function isAiCommand(command: string): boolean {
  const normalized = command.trim();

  if (normalized.startsWith('personascout classify') && normalized.includes('--dry-run')) {
    return false;
  }

  return AI_COMMAND_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function formatCommandWithAiBadge(command: string): string {
  if (!isAiCommand(command)) {
    return command;
  }

  const ui = createTerminalUi();
  return `${command} ${ui.warning('[AI]')}`;
}

export function formatAiBadge(): string {
  const ui = createTerminalUi();
  return ui.warning('[AI]');
}
