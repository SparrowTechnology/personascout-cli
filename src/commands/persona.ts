import path from 'node:path';
import chalk from 'chalk';
import Table from 'cli-table3';
import { editor, input, confirm, select } from '@inquirer/prompts';
import type { Command } from 'commander';
import {
  deletePersonaById,
  getPersonaPath,
  importPersonaFromFile,
  listPersonas,
  listPersonaResultReferences,
  personaSchema,
  readPersonaById,
  summariseTitles,
  validatePersonaDirectory,
  writePersona,
} from '../lib/persona.js';
import { pathExists } from '../lib/config.js';
import { generatePersonaFromDescription, renderPersonaPreview } from '../lib/persona-generator.js';
import { getPersonaTemplate, listPersonaTemplates } from '../lib/persona-templates.js';

export function registerPersonaCommand(program: Command): void {
  const persona = program.command('persona').description('Manage buyer personas');

  persona
    .command('list')
    .description('List personas')
    .option('--templates', 'list built-in persona templates')
    .action(async (options: { templates?: boolean }) => {
      if (options.templates) {
        const templates = listPersonaTemplates();
        renderPersonaTable(templates);
        return;
      }

      const personas = await listPersonas();

      if (personas.length === 0) {
        console.log("No personas defined. Run 'personascout persona generate' to create one.");
        return;
      }
      renderPersonaTable(personas);
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
    .command('use <templateId>')
    .description('Copy a built-in persona template into the project')
    .option('-f, --force', 'overwrite an existing persona')
    .action(async (templateId: string, options: { force?: boolean }) => {
      const personaTemplate = getPersonaTemplate(templateId);
      const outputPath = getPersonaPath(personaTemplate.id);

      if (!options.force && (await pathExists(outputPath))) {
        const shouldOverwrite = await confirm({
          message: `Persona "${personaTemplate.id}" already exists. Overwrite it?`,
          default: false,
        });

        if (!shouldOverwrite) {
          console.log('Template import cancelled.');
          return;
        }
      }

      await writePersona(personaTemplate);
      console.log(chalk.green(`✓ Saved persona template ${personaTemplate.id}`));
      console.log(outputPath);
    });

  persona
    .command('edit <personaId>')
    .description('Edit a persona JSON file in your editor')
    .action(async (personaId: string) => {
      const existingPersona = await readPersonaById(personaId);
      let draft = `${JSON.stringify(existingPersona, null, 2)}\n`;

      while (true) {
        const edited = await editor({
          message: `Edit persona "${personaId}"`,
          default: draft,
        });

        try {
          const parsed = personaSchema.parse(JSON.parse(edited));
          const outputPath = await writePersona(parsed);
          console.log(chalk.green(`✓ Saved persona ${parsed.id}`));
          console.log(outputPath);
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(chalk.red(`Invalid persona JSON: ${message}`));
          draft = edited;
        }
      }
    });

  persona
    .command('delete <personaId>')
    .description('Delete a persona')
    .action(async (personaId: string) => {
      const references = await listPersonaResultReferences(personaId);

      if (references.length > 0) {
        console.log(chalk.yellow(`Warning: ${references.length} classification run(s) reference persona "${personaId}".`));
        for (const reference of references.slice(0, 5)) {
          console.log(`- ${reference.run_id} (${reference.provider}/${reference.model})`);
        }
      }

      const shouldDelete = await confirm({
        message: `Delete persona "${personaId}"?`,
        default: false,
      });

      if (!shouldDelete) {
        console.log('Delete cancelled.');
        return;
      }

      const outputPath = await deletePersonaById(personaId);
      console.log(chalk.green(`✓ Deleted persona ${personaId}`));
      console.log(outputPath);
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

function renderPersonaTable(personas: Array<{ id: string; name: string; titles: string[]; pain_points: string[] }>): void {
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
}
