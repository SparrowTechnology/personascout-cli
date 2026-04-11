import path from 'node:path';
import chalk from 'chalk';
import Table from 'cli-table3';
import { editor, input, confirm, select } from '@inquirer/prompts';
import type { Command } from 'commander';
import { getPersonaPath, importPersonaFromFile, listPersonas, personaSchema, summariseTitles, validatePersonaDirectory, writePersona } from '../lib/persona.js';
import { pathExists } from '../lib/config.js';
import { generatePersonaFromDescription, renderPersonaPreview } from '../lib/persona-generator.js';

export function registerPersonaCommand(program: Command): void {
  const persona = program.command('persona').description('Manage buyer personas');

  persona
    .command('list')
    .description('List personas')
    .action(async () => {
      const personas = await listPersonas();

      if (personas.length === 0) {
        console.log("No personas defined. Run 'personascout persona generate' to create one.");
        return;
      }

      const table = new Table({
        head: ['ID', 'NAME', 'TITLES', 'PAIN POINTS'],
        style: { head: [], border: [] },
      });

      for (const entry of personas) {
        table.push([
          entry.id,
          entry.name,
          summariseTitles(entry.titles),
          `${entry.pain_points.length} defined`,
        ]);
      }

      console.log(table.toString());
    });

  persona
    .command('add')
    .description('Add a persona')
    .option('--file <path>', 'import a persona JSON file')
    .option('--interactive', 'run the interactive persona wizard')
    .option('-f, --force', 'overwrite an existing persona')
    .action(async (options: { file?: string; interactive?: boolean; force?: boolean }) => {
      if (options.interactive) {
        throw new Error('Interactive persona creation is not implemented yet. Use --file for now.');
      }

      if (!options.file) {
        throw new Error('Provide --file <path>. Interactive add is not implemented yet.');
      }

      const { persona: importedPersona, outputPath } = await importPersonaFromFile(options.file, process.cwd(), {
        force: Boolean(options.force),
      });

      console.log(chalk.green(`✓ Saved persona ${importedPersona.id}`));
      console.log(outputPath);
    });

  persona
    .command('generate')
    .description('Generate a persona with AI')
    .option('--description <text>', 'describe the persona to target')
    .option('--provider <id>', 'override the configured provider')
    .option('--model <name>', 'override the model used for generation')
    .action(async (options: { description?: string; provider?: string; model?: string }) => {
      const description = options.description ?? await input({
        message: 'Describe the persona you want to target:',
        required: true,
      });

      console.log('Scraping company website for context...');
      const { persona: generatedPersona } = await generatePersonaFromDescription(description, {
        providerId: options.provider,
        model: options.model,
      });

      let currentPersona = generatedPersona;

      while (true) {
        console.log('');
        console.log(renderPersonaPreview(currentPersona));
        console.log('');

        const decision = await select({
          message: 'Save this persona?',
          choices: [
            { name: 'Save', value: 'save' as const },
            { name: 'Edit JSON', value: 'edit' as const },
            { name: 'Discard', value: 'discard' as const },
          ],
        });

        if (decision === 'discard') {
          console.log('Discarded generated persona.');
          return;
        }

        if (decision === 'edit') {
          const edited = await editor({
            message: 'Edit the generated persona JSON',
            default: `${JSON.stringify(currentPersona, null, 2)}\n`,
            validate: (value) => {
              try {
                personaSchema.parse(JSON.parse(value));
                return true;
              } catch (error) {
                return error instanceof Error ? error.message : String(error);
              }
            },
          });
          currentPersona = personaSchema.parse(JSON.parse(edited));
          continue;
        }

        const outputPath = getPersonaPath(currentPersona.id);
        if (await pathExists(outputPath)) {
          const shouldOverwrite = await confirm({
            message: `Persona "${currentPersona.id}" already exists. Overwrite it?`,
            default: false,
          });

          if (!shouldOverwrite) {
            continue;
          }
        }

        await writePersona(currentPersona);
        console.log(chalk.green(`✓ Saved persona ${currentPersona.id}`));
        console.log(outputPath);
        return;
      }
    });

  persona
    .command('validate')
    .description('Validate persona JSON files')
    .action(async () => {
      const results = await validatePersonaDirectory();

      if (results.length === 0) {
        console.log('No persona files found.');
        return;
      }

      let hasFailures = false;

      for (const result of results) {
        const label = path.basename(result.file);
        if (result.ok) {
          console.log(`${chalk.green('✓')} ${label}`);
          continue;
        }

        hasFailures = true;
        console.log(`${chalk.red('✗')} ${label} — ${result.error}`);
      }

      if (hasFailures) {
        process.exitCode = 2;
      }
    });
}
