import chalk from 'chalk';
import ora from 'ora';
import type { Command } from 'commander';
import { formatAiBadge, formatCommandWithAiBadge } from '../lib/ai-hints.js';
import { classifyContentItem } from '../lib/classifiers/index.js';
import { buildClassificationPlan, runClassification } from '../lib/classify.js';
import { createTerminalUi } from '../lib/ui.js';

export function registerClassifyCommand(program: Command): void {
  program
    .command('classify')
    .description('Classify fetched content against your personas with an AI provider')
    .option('--provider <id>', 'override the configured provider')
    .option('--model <name>', 'override the model used for classification')
    .option('--dry-run', 'estimate tokens and cost without calling a model')
    .option('--force', 'reclassify items even if the latest run already contains them')
    .option('--source <id>', 'only classify content from a single source')
    .option('--since <date>', 'only classify items published after this ISO date', parseIsoDate)
    .addHelpText('after', `\n${formatAiBadge()} This command uses your configured AI provider unless you pass --dry-run. Live classification may incur token costs.\n`)
    .action(
      async (options: {
        provider?: string;
        model?: string;
        dryRun?: boolean;
        force?: boolean;
        source?: string;
        since?: string;
      }) => {
        const ui = createTerminalUi();
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

        console.log(`${formatAiBadge()} Using ${plan.provider.id}/${plan.model}. This may incur provider usage costs.`);
        const startedAt = Date.now();
        const spinner = ora('').start();
        let completed = 0;
        const renderSpinnerText = () => {
          spinner.text = `Classifying ${ui.progressBar(completed, plan.items_to_classify.length, { color: 'green' })} ${completed}/${plan.items_to_classify.length} (${formatElapsed(Date.now() - startedAt)})`;
        };
        const statusInterval = setInterval(renderSpinnerText, 1000);
        renderSpinnerText();

        try {
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
                renderSpinnerText();
                return scores;
              },
            },
          );

          clearInterval(statusInterval);
          spinner.succeed(`Classified ${result.item_count} items in ${formatElapsed(Date.now() - startedAt)}.`);
          if (skipped > 0) {
            console.log(chalk.yellow(`Skipped ${skipped} items after repeated JSON parse failures.`));
          }
          console.log(`${ui.success('Saved result:')} ${outputPath}`);
          console.log(`${ui.accent('Next:')} personascout report`);
        } catch (error) {
          clearInterval(statusInterval);
          spinner.fail(`Classification failed after ${formatElapsed(Date.now() - startedAt)}.`);
          throw error;
        }
      },
    );
}

function renderDryRun(plan: Awaited<ReturnType<typeof buildClassificationPlan>>): void {
  const ui = createTerminalUi();
  console.log(ui.section('CLASSIFICATION DRY RUN'));
  console.log(ui.caption('Shows the estimated scope, token usage, and cost before sending any content to a model.'));
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
  console.log('');
  console.log(`Run ${formatCommandWithAiBadge('personascout classify')} to execute the live model call.`);
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

function formatElapsed(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}
