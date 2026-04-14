import type { Command } from 'commander';
import { formatAiBadge } from '../lib/ai-hints.js';
import { buildGenerationPlan, renderGeneratedArtifact, runGenerationPlan } from '../lib/generator.js';
import { createTerminalUi } from '../lib/ui.js';
import type { ContentChannel, GenerationFormat } from '../types/index.js';

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Generate content briefs or drafts for detected coverage gaps with an AI provider')
    .option('--result-format <format>', 'result output format: terminal or json', parseResultFormat, 'terminal')
    .option('--provider <id>', 'override the configured provider')
    .option('--model <name>', 'override the model used for generation')
    .option('--result <id>', 'specific classification result run id or filename')
    .option('--persona <id>', 'target a specific persona instead of choosing a detected gap')
    .option('--stage <stage>', 'awareness, consideration, or decision', parseStage)
    .option('--channel <channel>', 'blog, linkedin-article, linkedin-post, twitter-thread, or email', parseChannel)
    .option('--format <format>', 'brief or draft output mode', parseFormat)
    .option('--output <dir>', 'write generated artifacts to a directory instead of terminal-only output')
    .option('--all', 'generate one artifact for every detected gap')
    .addHelpText('after', `\n${formatAiBadge()} This command uses your configured AI provider and may incur token costs.\n`)
    .addHelpText('after', '\nUse --result-format json for machine-readable artifact output.\n')
    .addHelpText(
      'after',
      `\nBehavior:\n  - 'personascout generate' chooses one detected gap interactively and generates one artifact.\n  - '--all' generates one artifact per detected gap.\n  - '--persona <id> --stage <stage>' targets a specific persona-stage pair.\n  - Without '--output', content is printed to the terminal only.\n  - With '--output ./generated', briefs are saved as JSON and drafts as Markdown.\n\nBrief vs Draft:\n  - brief: structured plan with headline, angle, key points, hook, CTA, and suggested length\n  - draft: full written content ready for editing/publishing\n\nExamples:\n  personascout generate\n  personascout generate --persona cfo --stage awareness --channel blog --format brief\n  personascout generate --all --channel linkedin-article --format brief --output ./generated\n  personascout help generate\n`,
    )
    .action(
      async (options: {
        resultFormat: ResultFormat;
        provider?: string;
        model?: string;
        result?: string;
        persona?: string;
        stage?: GenerationTarget['funnel_stage'];
        channel?: ContentChannel;
        format?: GenerationFormat;
        output?: string;
        all?: boolean;
      }) => {
        const ui = createTerminalUi();
        const plan = await buildGenerationPlan({
          providerId: options.provider,
          model: options.model,
          resultId: options.result,
          personaId: options.persona,
          stage: options.stage,
          channel: options.channel,
          format: options.format,
          outputDir: options.output,
          all: Boolean(options.all),
        });

        if (options.resultFormat === 'terminal') {
          console.log(`${formatAiBadge()} Using ${plan.provider.id}/${plan.model}. This may incur provider usage costs.`);
          console.log(`${ui.section('GENERATION')}`);
          console.log(ui.caption('Creates new content briefs or drafts for the selected persona-stage gaps using your configured AI provider.'));
          console.log('');
          console.log(`Generating ${plan.format} for ${plan.targets.length} target${plan.targets.length === 1 ? '' : 's'}...`);
          console.log('');
        }

        const { artifacts, record, outputPath } = await runGenerationPlan(plan);

        if (options.resultFormat === 'json') {
          process.stdout.write(
            `${JSON.stringify({
              provider: record.provider,
              model: record.model,
              run_id: record.run_id,
              created_at: record.created_at,
              output_path: outputPath,
              output_dir: record.output_dir,
              artifact_count: record.artifact_count,
              artifacts,
            }, null, 2)}\n`,
          );
          return;
        }

        for (const artifact of artifacts) {
          console.log(renderGeneratedArtifact(artifact));
          if (artifact.output_path) {
            console.log('');
            console.log(`Saved: ${artifact.output_path}`);
          }
          console.log('');
        }
      },
    );
}

type GenerationTarget = {
  funnel_stage: 'awareness' | 'consideration' | 'decision';
};

function parseStage(value: string): GenerationTarget['funnel_stage'] {
  if (value === 'awareness' || value === 'consideration' || value === 'decision') {
    return value;
  }

  throw new Error('Stage must be one of: awareness, consideration, decision.');
}

function parseChannel(value: string): ContentChannel {
  if (value === 'blog' || value === 'linkedin-article' || value === 'linkedin-post' || value === 'twitter-thread' || value === 'email') {
    return value;
  }

  throw new Error('Channel must be one of: blog, linkedin-article, linkedin-post, twitter-thread, email.');
}

function parseFormat(value: string): GenerationFormat {
  if (value === 'brief' || value === 'draft') {
    return value;
  }

  throw new Error('Format must be one of: brief, draft.');
}

type ResultFormat = 'terminal' | 'json';

function parseResultFormat(value: string): ResultFormat {
  if (value === 'terminal' || value === 'json') {
    return value;
  }

  throw new Error('Result format must be one of: terminal, json.');
}
