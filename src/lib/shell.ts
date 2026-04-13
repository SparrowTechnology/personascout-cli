export type ShellKind = 'powershell' | 'cmd' | 'fish' | 'posix';

export function detectShellKind(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): ShellKind {
  const shellPath = env.SHELL?.toLowerCase() ?? '';

  if (shellPath.includes('fish')) {
    return 'fish';
  }

  if (shellPath.includes('bash') || shellPath.includes('zsh') || shellPath.includes('sh')) {
    return 'posix';
  }

  if (platform === 'win32') {
    if (env.PSModulePath || env.PSExecutionPolicyPreference || env.POWERSHELL_DISTRIBUTION_CHANNEL) {
      return 'powershell';
    }

    return 'cmd';
  }

  return 'posix';
}

export function formatSetEnvCommand(variableName: string, shellKind = detectShellKind()): string {
  if (shellKind === 'powershell') {
    return `$env:${variableName}="your_key_here"`;
  }

  if (shellKind === 'cmd') {
    return `set ${variableName}=your_key_here`;
  }

  if (shellKind === 'fish') {
    return `set -x ${variableName} your_key_here`;
  }

  return `export ${variableName}=your_key_here`;
}

export function formatShellLabel(shellKind = detectShellKind()): string {
  if (shellKind === 'powershell') {
    return 'PowerShell';
  }

  if (shellKind === 'cmd') {
    return 'Command Prompt';
  }

  if (shellKind === 'fish') {
    return 'fish';
  }

  return 'Bash/Zsh';
}
