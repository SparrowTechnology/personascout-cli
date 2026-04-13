import type { Command } from 'commander';
import { buildGenerationPlan, renderGeneratedArtifact, runGenerationPlan } from '../lib/generator.js';
import type { ContentChannel, GenerationFormat } from '../types/index.js';

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Generate content briefs or drafts for detected coverage gaps')
    .option('--provider <id>', 'override the configured provider')
    .option('--model <name>', 'override the model used for generation')
    .option('--result <id>', 'specific classification result run id or filename')
    .option('--persona <id>', 'target a specific persona instead of choosing a detected gap')
    .option('--stage <stage>', 'awareness, consideration, or decision', parseStage)
    .option('--channel <channel>', 'blog, linkedin-article, linkedin-post, twitter-thread, or email', parseChannel)
    .option('--format <format>', 'brief or draft output mode', parseFormat)
    .option('--output <dir>', 'write generated artifacts to a directory instead of terminal-only output')
    .option('--all', 'generate one artifact for every detected gap')
    .addHelpText(
      'after',
      `\nBehavior:\n  - 'personascout generate' chooses one detected gap interactively and generates one artifact.\n  - '--all' generates one artifact per detected gap.\n  - '--persona <id> --stage <stage>' targets a specific persona-stage pair.\n  - Without '--output', content is printed to the terminal only.\n  - With '--output ./generated', briefs are saved as JSON and drafts as Markdown.\n\nBrief vs Draft:\n  - brief: structured plan with headline, angle, key points, hook, CTA, and suggested length\n  - draft: full written content ready for editing/publishing\n\nExamples:\n  personascout generate\n  personascout generate --persona cfo --stage awareness --channel blog --format brief\n  personascout generate --all --channel linkedin-article --format brief --output ./generated\n  personascout help generate\n`,
    )
    .action(
      async (options: {
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

        console.log(`Generating ${plan.format} for ${plan.targets.length} target${plan.targets.length === 1 ? '' : 's'}...`);
        console.log('');

        const { artifacts } = await runGenerationPlan(plan);

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
