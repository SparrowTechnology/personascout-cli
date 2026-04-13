import chalk from 'chalk';
import type { Command } from 'commander';
import { getProviderStatus, getProviderStatuses } from '../lib/providers.js';
import { detectShellKind, formatSetEnvCommand, formatShellLabel } from '../lib/shell.js';

export function registerProvidersCommand(program: Command): void {
  program
    .command('providers')
    .description('List available AI providers')
    .option('--provider <id>', 'show details for a single provider')
    .action(async (options: { provider?: string }) => {
      if (options.provider) {
        const provider = await getProviderStatus(options.provider);
        renderProviderDetail(provider);
        return;
      }

      const providers = await getProviderStatuses();
      renderProviderList(providers);
    });
}

function renderProviderList(
  providers: Awaited<ReturnType<typeof getProviderStatuses>>,
): void {
  const shellKind = detectShellKind();

  console.log('Available providers');
  console.log('');

  console.log('BUILT-IN');
  const builtin = providers.filter((provider) => provider.source !== 'custom');
  for (const provider of builtin) {
    console.log(
      `  ${pad(provider.id, 13)} ${pad(provider.display_name, 28)} ${pad(formatProviderKeyStatus(provider), 13)} ${provider.default_model}`,
    );
  }

  console.log('');
  console.log('CUSTOM (from config.json)');
  const custom = providers.filter((provider) => provider.source === 'custom');
  if (custom.length === 0) {
    console.log('  none');
  } else {
    for (const provider of custom) {
      console.log(
        `  ${pad(provider.id, 13)} ${pad(provider.display_name, 28)} ${pad(formatProviderKeyStatus(provider), 13)} ${provider.default_model}`,
      );
    }
  }

  console.log('');
  console.log('To use a provider:');
  console.log('  personascout classify --provider groq');
  console.log('  personascout classify --provider deepseek --model deepseek-chat');
  console.log('');
  console.log(`To set an API key in ${formatShellLabel(shellKind)}:`);
  console.log(`  ${formatSetEnvCommand('GROQ_API_KEY', shellKind)}`);
  console.log('');
  console.log("To add a custom provider, add to 'providers' in .personascout/config.json");
}

function renderProviderDetail(provider: Awaited<ReturnType<typeof getProviderStatus>>): void {
  const shellKind = detectShellKind();

  console.log(`Provider: ${provider.id}`);
  console.log('');
  console.log(`Name:           ${provider.display_name}`);
  console.log(`SDK:            ${provider.sdk}`);
  console.log(`Source:         ${provider.source}`);
  console.log(`Key status:     ${formatProviderKeyStatus(provider)}`);
  console.log(`API key env:    ${provider.api_key_env}`);
  console.log(`Requires key:   ${provider.requires_key ? 'yes' : 'no'}`);
  console.log(`Default model:  ${provider.default_model}`);

  if (provider.base_url) {
    console.log(`Base URL:       ${provider.base_url}`);
  }

  if (provider.suggested_models.length > 0) {
    console.log('');
    console.log('Suggested models:');
    for (const model of provider.suggested_models) {
      console.log(`  - ${model}`);
    }
  }

  if (provider.notes) {
    console.log('');
    console.log('Notes:');
    console.log(`  ${provider.notes}`);
  }

  if (provider.requires_key) {
    console.log('');
    console.log(`Set API key in ${formatShellLabel(shellKind)}:`);
    console.log(`  ${formatSetEnvCommand(provider.api_key_env, shellKind)}`);
    console.log('');
    console.log('Then verify readiness or run a command:');
    console.log(`  personascout providers --provider ${provider.id}`);
    console.log(`  personascout classify --provider ${provider.id}`);
  }
}

function formatProviderKeyStatus(provider: { key_status: string }): string {
  if (provider.key_status === 'key-set') {
    return chalk.green('✓ key set');
  }

  if (provider.key_status === 'no-key') {
    return chalk.red('✗ no key');
  }

  if (provider.key_status === 'running') {
    return chalk.green('✓ running');
  }

  return chalk.red('✗ not running');
}

function pad(value: string, width: number): string {
  return value.padEnd(width, ' ');
}
