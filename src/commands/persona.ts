import path from 'node:path';
import chalk from 'chalk';
import Table from 'cli-table3';
import type { Command } from 'commander';
import { importPersonaFromFile, listPersonas, summariseTitles, validatePersonaDirectory } from '../lib/persona.js';

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
