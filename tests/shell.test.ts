import { describe, expect, it } from 'vitest';
import { detectShellKind, formatSetEnvCommand, formatShellLabel } from '../src/lib/shell.js';

describe('shell helpers', () => {
  it('detects PowerShell on Windows environments', () => {
    expect(
      detectShellKind(
        {
          PSModulePath: 'C:\\Users\\hello\\Documents\\PowerShell\\Modules',
        },
        'win32',
      ),
    ).toBe('powershell');
  });

  it('detects fish and posix shells from SHELL', () => {
    expect(detectShellKind({ SHELL: '/usr/bin/fish' }, 'linux')).toBe('fish');
    expect(detectShellKind({ SHELL: '/bin/bash' }, 'linux')).toBe('posix');
  });

  it('formats environment variable commands for each shell', () => {
    expect(formatSetEnvCommand('ANTHROPIC_API_KEY', 'powershell')).toBe('$env:ANTHROPIC_API_KEY="your_key_here"');
    expect(formatSetEnvCommand('ANTHROPIC_API_KEY', 'cmd')).toBe('set ANTHROPIC_API_KEY=your_key_here');
    expect(formatSetEnvCommand('ANTHROPIC_API_KEY', 'fish')).toBe('set -x ANTHROPIC_API_KEY your_key_here');
    expect(formatSetEnvCommand('ANTHROPIC_API_KEY', 'posix')).toBe('export ANTHROPIC_API_KEY=your_key_here');
  });

  it('formats human-readable shell labels', () => {
    expect(formatShellLabel('powershell')).toBe('PowerShell');
    expect(formatShellLabel('cmd')).toBe('Command Prompt');
    expect(formatShellLabel('fish')).toBe('fish');
    expect(formatShellLabel('posix')).toBe('Bash/Zsh');
  });
});
