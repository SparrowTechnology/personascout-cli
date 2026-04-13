import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import type { Command } from 'commander';
import {
  appendProjectGitignoreEntries,
  createDefaultConfig,
  getProjectPaths,
  initializeProject,
  isInitialized,
} from '../lib/config.js';
import { detectShellKind, formatSetEnvCommand, formatShellLabel } from '../lib/shell.js';
import { BUILT_IN_PROVIDERS } from '../providers.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialise a PersonaScout project')
    .option('-f, --force', 'overwrite existing init')
    .action(async (options: { force?: boolean }) => {
      const cwd = process.cwd();

      if ((await isInitialized(cwd)) && !options.force) {
        throw new Error(
          `PersonaScout is already initialised at ${getProjectPaths(cwd).home}.\nRe-run with --force to overwrite the config.`,
        );
      }

      const companyName = await input({
        message: 'Company name',
        validate: (value) => (value.trim().length > 0 ? true : 'Company name is required.'),
      });

      const website = await input({
        message: 'Company website URL',
        validate: validateUrl,
      });

      const selectedProvider = await select({
        message: 'Default AI provider',
        choices: [
          { name: 'anthropic   - Claude Haiku (recommended)', value: 'anthropic' },
          { name: 'openai      - GPT-4o Mini', value: 'openai' },
          { name: 'groq        - Llama 3.3 70B (fast, cheap)', value: 'groq' },
          { name: 'deepseek    - DeepSeek Chat (very cheap)', value: 'deepseek' },
          { name: 'ollama      - Local model (free, requires Ollama installed)', value: 'ollama' },
          { name: 'other       - Enter provider ID manually', value: 'other' },
        ],
      });

      const providerId =
        selectedProvider === 'other'
          ? await input({
              message: 'Provider ID',
              validate: (value) =>
                BUILT_IN_PROVIDERS.some((provider) => provider.id === value.trim())
                  ? true
                  : 'Provider ID must match a provider in the built-in registry.',
            })
          : selectedProvider;

      const provider = BUILT_IN_PROVIDERS.find((entry) => entry.id === providerId);
      if (!provider) {
        throw new Error(`Unknown provider "${providerId}".`);
      }

      const defaultModel = await input({
        message: 'Default model',
        default: provider.default_model,
        validate: (value) => (value.trim().length > 0 ? true : 'Default model is required.'),
      });

      const config = createDefaultConfig({
        companyName: companyName.trim(),
        website: website.trim(),
        providerId,
        model: defaultModel.trim(),
      });

      await initializeProject(config, cwd);
      await appendProjectGitignoreEntries(cwd);

      const shellKind = detectShellKind();

      console.log(chalk.green('✓ PersonaScout initialised'));
      console.log('');
      console.log('Setup flow:');
      console.log('  1. Define your personas');
      console.log('     personascout persona templates');
      console.log('     personascout persona use cfo');
      console.log('     personascout persona generate');
      console.log('     personascout persona add --interactive');
      console.log('');
      console.log('  2. Add your content sources');
      console.log('     personascout source add');
      console.log('     personascout source test');
      console.log('');
      console.log('  3. Fetch content and measure coverage');
      console.log('     personascout fetch');
      console.log('     personascout classify --dry-run');
      console.log('     personascout classify');
      console.log('     personascout report');
      console.log('');
      console.log('  4. Find and close the gaps');
      console.log('     personascout generate --all --format brief');
      console.log('     personascout diff');
      console.log('');
      console.log('Regular refresh flow:');
      console.log('  personascout fetch');
      console.log('  personascout classify');
      console.log('  personascout report');
      console.log('  personascout diff');

      if (provider.requires_key) {
        console.log('');
        console.log(`Before using AI commands with ${provider.id}, set your API key in ${formatShellLabel(shellKind)}:`);
        console.log(`  ${formatSetEnvCommand(provider.api_key_env, shellKind)}`);
        console.log(`  personascout providers --provider ${provider.id}`);
      }
    });
}

function validateUrl(value: string): true | string {
  try {
    const parsed = new URL(value.trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? true : 'URL must start with http:// or https://';
  } catch {
    return 'Enter a valid URL.';
  }
}
