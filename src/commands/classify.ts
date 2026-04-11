import chalk from 'chalk';
import ora from 'ora';
import type { Command } from 'commander';
import { classifyContentItem } from '../lib/classifiers/index.js';
import { buildClassificationPlan, runClassification } from '../lib/classify.js';

export function registerClassifyCommand(program: Command): void {
  program
    .command('classify')
    .description('Classify fetched content against your personas')
    .option('--provider <id>', 'override the configured provider')
    .option('--model <name>', 'override the model used for classification')
    .option('--dry-run', 'estimate tokens and cost without calling a model')
    .option('--force', 'reclassify items even if the latest run already contains them')
    .option('--source <id>', 'only classify content from a single source')
    .option('--since <date>', 'only classify items published after this ISO date', parseIsoDate)
    .action(
      async (options: {
        provider?: string;
        model?: string;
        dryRun?: boolean;
        force?: boolean;
        source?: string;
        since?: string;
      }) => {
        const plan = await buildClassificationPlan({
          providerId: options.provider,
          model: options.model,
          sourceId: options.source,
          since: options.since,
          force: Boolean(options.force),
        });

        if (plan.personas.length === 0) {
          throw new Error("No personas found. Add personas with 'personascout persona add --file ...' first.");
        }

        if (plan.items.length === 0) {
          throw new Error("No content items found. Run 'personascout fetch' first.");
        }

        if (options.dryRun) {
          renderDryRun(plan);
          return;
        }

        if (plan.items_to_classify.length === 0) {
          console.log('No new items to classify.');
          console.log("Use '--force' to reclassify items from the latest run.");
          return;
        }

        const spinner = ora(`Classifying ${plan.items_to_classify.length} items... [0/${plan.items_to_classify.length}]`).start();
        let completed = 0;

        const { result, outputPath, skipped } = await runClassification(
          {
            providerId: options.provider,
            model: options.model,
            sourceId: options.source,
            since: options.since,
            force: Boolean(options.force),
          },
          {
            classifyItem: async (provider, model, personas, item) => {
              const scores = await classifyContentItem(provider, model, personas, item);
              completed += 1;
              spinner.text = `Classifying ${plan.items_to_classify.length} items... [${completed}/${plan.items_to_classify.length}]`;
              return scores;
            },
          },
        );

        spinner.succeed(`Classified ${result.item_count} items.`);
        if (skipped > 0) {
          console.log(chalk.yellow(`Skipped ${skipped} items after repeated JSON parse failures.`));
        }
        console.log(`${chalk.green('Saved result:')} ${outputPath}`);
      },
    );
}

function renderDryRun(plan: Awaited<ReturnType<typeof buildClassificationPlan>>): void {
  console.log('Classification dry run');
  console.log('');
  console.log(`Provider:              ${plan.provider.id}`);
  console.log(`Model:                 ${plan.model}`);
  console.log(`Personas:              ${plan.personas.length}`);
  console.log(`Content items matched: ${plan.items.length}`);
  console.log(`Items to classify:     ${plan.items_to_classify.length}`);
  console.log(`Latest run skip set:   ${plan.latest_result_item_count}`);
  console.log(`Estimated input:       ${formatNumber(plan.usage.estimated_input_tokens)} tokens`);
  console.log(`Estimated output:      ${formatNumber(plan.usage.estimated_output_tokens)} tokens`);
  console.log(`Estimated total:       ${formatNumber(plan.usage.estimated_total_tokens)} tokens`);
  console.log(
    `Estimated cost:        ${plan.usage.estimated_cost_usd === null ? 'n/a for this provider/model' : `$${plan.usage.estimated_cost_usd.toFixed(3)} (approx)`}`,
  );
}

function parseIsoDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Since must be a valid ISO date.');
  }

  return parsed.toISOString();
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}
