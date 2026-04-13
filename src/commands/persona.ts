import path from 'node:path';
import chalk from 'chalk';
import Table from 'cli-table3';
import { editor, input, confirm, select } from '@inquirer/prompts';
import type { Command } from 'commander';
import {
  createPersonaFromInteractiveInput,
  deletePersonaById,
  getPersonaPath,
  importPersonaFromFile,
  listPersonas,
  listPersonaResultReferences,
  personaSchema,
  readPersonaById,
  splitLineSeparatedValues,
  summariseTitles,
  validatePersonaDirectory,
  writePersona,
} from '../lib/persona.js';
import { pathExists } from '../lib/config.js';
import { generatePersonaFromDescription, renderPersonaPreview } from '../lib/persona-generator.js';
import { getPersonaTemplate, listPersonaTemplates } from '../lib/persona-templates.js';

export function registerPersonaCommand(program: Command): void {
  const persona = program.command('persona').description('Manage buyer personas');
  const templateIds = listPersonaTemplates().map((entry) => entry.id);

  persona
    .command('list')
    .description('List personas')
    .option('--templates', 'list built-in persona templates instead of project personas')
    .action(async (options: { templates?: boolean }) => {
      if (options.templates) {
        renderPersonaTemplateTable(listPersonaTemplates());
        return;
      }

      const personas = await listPersonas();

      if (personas.length === 0) {
        console.log("No personas defined. Run 'personascout persona templates' to browse built-ins or 'personascout persona generate' to create one.");
        return;
      }
      renderPersonaTable(personas);
    });

  persona
    .command('templates')
    .description('List built-in persona templates')
    .action(() => {
      renderPersonaTemplateTable(listPersonaTemplates());
    });

  persona
    .command('add')
    .description('Add a persona')
    .option('--file <path>', 'import a persona JSON file')
    .option('--interactive', 'run the interactive persona wizard')
    .option('-f, --force', 'overwrite an existing persona')
    .action(async (options: { file?: string; interactive?: boolean; force?: boolean }) => {
      if (options.file) {
        const { persona: importedPersona, outputPath } = await importPersonaFromFile(options.file, process.cwd(), {
          force: Boolean(options.force),
        });

        console.log(chalk.green(`✓ Saved persona ${importedPersona.id}`));
        console.log(outputPath);
        return;
      }

      const persona = await promptForInteractivePersona();
      const outputPath = getPersonaPath(persona.id);

      if (!options.force && (await pathExists(outputPath))) {
        const shouldOverwrite = await confirm({
          message: `Persona "${persona.id}" already exists. Overwrite it?`,
          default: false,
        });

        if (!shouldOverwrite) {
          console.log('Persona add cancelled.');
          return;
        }
      }

      await writePersona(persona);
      console.log(chalk.green(`✓ Saved persona ${persona.id}`));
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
    .addHelpText(
      'after',
      `\nExamples:\n  personascout persona templates\n  personascout persona use cfo\n  personascout persona use vp-marketing\n\nAvailable templates:\n  ${templateIds.join(', ')}\n`,
    )
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

function renderPersonaTemplateTable(personas: Array<{ id: string; name: string; titles: string[]; company_size: string[] }>): void {
  const table = new Table({
    head: ['ID', 'NAME', 'TITLES', 'COMPANY SIZE'],
    style: { head: [], border: [] },
  });

  for (const entry of personas) {
    table.push([
      entry.id,
      entry.name,
      summariseTitles(entry.titles),
      summariseCompanySize(entry.company_size),
    ]);
  }

  console.log(table.toString());
}

async function promptForInteractivePersona() {
  const id = await input({
    message: 'Persona ID',
    validate: (value) =>
      /^[a-z0-9-]+$/.test(value.trim()) ? true : 'Persona ID must be kebab-case.',
  });

  const name = await input({
    message: 'Display name',
    validate: requireValue('Display name is required.'),
  });

  const titles = await input({
    message: 'Titles (comma-separated)',
    validate: (value) =>
      value.split(',').some((entry) => entry.trim().length > 0) ? true : 'Enter at least one title.',
  });

  const companySize = await input({
    message: 'Company sizes (comma-separated)',
    validate: (value) =>
      value.split(',').some((entry) => entry.trim().length > 0) ? true : 'Enter at least one company size.',
  });

  const painPoints = await editor({
    message: 'Pain points (one per line, minimum 3)',
    validate: validateLineCount(3, 'Enter at least 3 pain points.'),
  });

  const goals = await editor({
    message: 'Goals (one per line, minimum 2)',
    validate: validateLineCount(2, 'Enter at least 2 goals.'),
  });

  const awareness = await input({
    message: 'Awareness-stage content',
    validate: requireValue('Awareness-stage content is required.'),
  });

  const consideration = await input({
    message: 'Consideration-stage content',
    validate: requireValue('Consideration-stage content is required.'),
  });

  const decision = await input({
    message: 'Decision-stage content',
    validate: requireValue('Decision-stage content is required.'),
  });

  return createPersonaFromInteractiveInput({
    id,
    name,
    titles,
    company_size: companySize,
    pain_points: painPoints,
    goals,
    awareness,
    consideration,
    decision,
  });
}

function requireValue(message: string): (value: string) => true | string {
  return (value: string) => (value.trim().length > 0 ? true : message);
}

function validateLineCount(minimum: number, message: string): (value: string) => true | string {
  return (value: string) => (splitLineSeparatedValues(value).length >= minimum ? true : message);
}

function summariseCompanySize(companySizes: string[]): string {
  if (companySizes.length <= 2) {
    return companySizes.join(', ');
  }

  return `${companySizes.slice(0, 2).join(', ')} (+${companySizes.length - 2})`;
}
