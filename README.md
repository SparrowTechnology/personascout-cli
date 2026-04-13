# personascout

Map your content against your ICPs. Find the gaps. Fill them.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Node.js ≥ 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

`personascout` is a local-first CLI for B2B teams that want to understand how well their content serves their ideal customer profiles across the funnel. It ingests content from RSS feeds, websites, and CSV exports, classifies each piece against your personas, and highlights where your coverage is thin.

The long-term product direction is open core:
- `personascout` the CLI stays truly open source under `AGPL-3.0-only`
- a separate hosted product can exist on top, but improvements to the networked software covered by this repo stay in the commons

## The Problem

Most B2B teams create content without a reliable way to check whether it actually covers their ICPs, buyer personas, and buyer funnel stages.

You can have dozens of blog posts, landing pages, or newsletter issues and still end up with most of your content implicitly targeting only one target persona. That leaves hidden content gaps across awareness, consideration, and decision stages.

PersonaScout answers a direct question: **which ICPs is your content actually reaching, and which target personas are being ignored across the buyer funnel?**

## Setup Flow

The first-time setup flow is:

1. Initialise a local project with `personascout init`
2. Define the personas you care about
3. Define the content sources you want to analyse
4. Fetch content into the local project
5. Classify that content against your personas
6. Report on coverage gaps and generate new content ideas

The CLI commands for that first pass are:

```bash
personascout init

# define personas
personascout persona templates
personascout persona use cfo
personascout persona generate
personascout persona add --interactive

# define sources
personascout source add
personascout source test

# ingest and analyse content
personascout fetch
personascout classify --dry-run
personascout classify
personascout report
personascout generate --all --format brief
personascout diff
```

In practice, most teams will define personas in one of three ways:

- start from a built-in template with `personascout persona use <template-id>`
- generate a persona from a short description with `personascout persona generate`
- create one manually with `personascout persona add --interactive`

Most teams will define sources as a mix of:

- company website pages
- RSS feeds
- CSV exports from blogs, newsletters, CMSs, or social/content tools

If your chosen provider needs an API key, set it in your shell before running AI-backed commands such as `persona generate`, `classify`, or `generate`.

Examples:

```powershell
$env:ANTHROPIC_API_KEY="your_key_here"
```

```bash
export ANTHROPIC_API_KEY=your_key_here
```

You can inspect the exact env var name for any provider with:

```bash
personascout providers --provider anthropic
```

## Ongoing Workflow

Once the project is set up, the regular workflow is simpler. On a monthly or quarterly cadence, you usually:

1. Refresh the content you want to measure
2. Re-run classification
3. Review the latest coverage report
4. Compare against the previous run
5. Use the new gaps to plan or generate the next round of content

Typical recurring commands:

```bash
personascout fetch
personascout classify
personascout report
personascout diff
personascout generate --all --format brief
```

## Why This Exists

Most content audits break down at the moment a team asks a simple question:

> "Do we actually have enough content for the personas we say we care about?"

Publishing calendars, analytics dashboards, and keyword tools do not answer that directly. PersonaScout is being built to answer it with a reproducible workflow:

1. Define the personas you care about
2. Add the content sources you publish into
3. Fetch and normalize the content into a local project
4. Classify each item against each persona and funnel stage
5. Generate a coverage report and use the gaps to plan new content

## Current Status

`personascout` is now at its first public release-candidate milestone. What exists today:

- `personascout init`
- `personascout persona list`
- `personascout persona templates`
- `personascout persona add --interactive`
- `personascout persona add --file <path>`
- `personascout persona view <id>`
- `personascout persona validate`
- `personascout source list`
- `personascout source add`
- `personascout source remove <id>`
- `personascout source test`
- `personascout fetch` for RSS, website, and CSV sources
- `personascout providers`
- `personascout classify`
- `personascout report`
- `personascout generate`
- `personascout diff`
- `personascout persona use <template-id>`
- `personascout persona view <id>`
- `personascout persona edit <id>`
- `personascout persona delete <id>`
- website crawling with same-domain `cheerio` fallback
- optional Firecrawl-backed website crawling when `FIRECRAWL_API_KEY` is set

What is planned next:

- first npm release
- source editing

## Install

The npm package is not published yet, but `0.1.0` is now release-ready and has been checked with `npm pack --dry-run`.

For now, clone the repo and run it locally:

```bash
npm install
npm run build
node dist/index.js --help
```

If you want a local global-style install while testing:

```bash
npm link
personascout --help
```

Node.js `18+` is required.

## Quick Start

Initialize a project in the directory you want to analyze:

```bash
personascout init
```

Add a persona from JSON:

```bash
personascout persona add --file ./persona.json
```

Start from a bundled persona template:

```bash
personascout persona templates
personascout persona use cfo
personascout persona view cfo
```

Or directly copy a known template:

```bash
personascout persona use cfo
```

Add a source:

```bash
personascout source add
```

Fetch content into `.personascout/content/`:

```bash
personascout fetch
```

Estimate a classification run:

```bash
personascout classify --dry-run
```

Run classification:

```bash
personascout classify
```

View the latest coverage report:

```bash
personascout report
```

Generate a brief for a gap:

```bash
personascout generate --all --channel linkedin-article --format brief
```

Compare the latest run against the previous one:

```bash
personascout diff
```

Starter example assets are available in [examples/README.md](./examples/README.md).

## Example Project Layout

```text
.personascout/
  config.json
  personas/
  sources/
  content/
  results/
```

This stays local to the directory where you run `personascout init`, unless you override it with `PERSONASCOUT_HOME`.

## Commands

### `personascout init`

Creates the local project structure, writes `config.json`, and updates `.gitignore` so fetched content and result files do not pollute the repo.

### `personascout persona`

Current subcommands:

- `personascout persona list`
- `personascout persona list --templates`
- `personascout persona templates`
- `personascout persona add --interactive`
- `personascout persona add --file <path>`
- `personascout persona use <template-id>`
- `personascout persona view <id>`
- `personascout persona generate`
- `personascout persona edit <id>`
- `personascout persona delete <id>`
- `personascout persona validate`

Personas are stored as JSON files under `.personascout/personas/`.
Built-in starter templates now cover common B2B buyer personas including `cfo`, `cto`, `vp-sales`, `vp-marketing`, `product-manager`, `ma-analyst`, and `procurement-lead`.

### `personascout source`

Current subcommands:

- `personascout source list`
- `personascout source add`
- `personascout source remove <id>`
- `personascout source test`

Supported source definitions today:

- `rss`
- `website`
- `csv`

### `personascout fetch`

Fetches content from configured sources and stores normalized content items in `.personascout/content/{source-id}/`.

Currently implemented:

- RSS feeds via `rss-parser`
- website crawling via Firecrawl when configured
- website crawling via `axios` + `cheerio` fallback when Firecrawl is unavailable
- CSV imports via `csv-parse/sync` with per-source column mappings

### `personascout classify`

Classifies fetched content against all configured personas and writes a run file under `.personascout/results/`.

Current flags:

- `personascout classify --dry-run`
- `personascout classify --force`
- `personascout classify --provider anthropic`
- `personascout classify --model claude-sonnet-4-5`
- `personascout classify --source acme-blog`
- `personascout classify --since 2026-04-01`

Behavior today:

- loads all personas in a single prompt per content item
- skips items already present in the latest result file unless `--force`
- supports Anthropic and OpenAI-compatible providers through the provider registry
- gives rough token and cost estimates in dry-run mode

### `personascout report`

Loads the latest classification run, computes the coverage matrix, and renders a terminal summary by persona and funnel stage.

Current flags:

- `personascout report`
- `personascout report --format json`
- `personascout report --format csv`
- `personascout report --format markdown`
- `personascout report --result run-2026-04-11T12-10-00-000Z`

Outputs available today:

- terminal table with stage-by-stage coverage bars
- JSON including the run payload, personas, computed coverage matrix, and detected gaps
- CSV with `persona_id,funnel_stage,count,status`
- Markdown for docs, GitHub, or Notion

### `personascout generate`

Generates gap-targeted content briefs or drafts using the configured LLM provider.

Current flags:

- `personascout generate`
- `personascout generate --all`
- `personascout generate --persona cfo --stage consideration`
- `personascout generate --channel linkedin-article --format brief`
- `personascout generate --output ./generated`

Behavior today:

- uses detected weak and critical gaps from the latest coverage report by default
- supports targeted generation for any `--persona` and `--stage` pair
- can generate either structured briefs or full markdown drafts
- uses existing classified content as tone/context examples
- can print to the terminal or write files to a directory

### `personascout diff`

Compares two classification runs and shows how persona-stage coverage changed over time.

Current flags:

- `personascout diff`
- `personascout diff --from run-2026-04-10T09-00-00-000Z --to run-2026-04-11T09-00-00-000Z`
- `personascout diff --format json`
- `personascout diff --format markdown`

Behavior today:

- compares the latest run to the previous run by default
- shows improved, declined, unchanged, new-gap, and gap-closed cells
- supports terminal, JSON, and Markdown output

## Provider Direction

The planned provider architecture keeps the model layer deliberately simple:

- `@anthropic-ai/sdk` for Anthropic
- `openai` for OpenAI-compatible APIs including Groq, DeepSeek, Kimi, Mistral, Together, Perplexity, and Ollama

That gives the CLI broad provider support without baking provider-specific logic throughout the codebase.

Provider discovery is now available via:

- `personascout providers`
- `personascout providers --provider anthropic`

## Supported LLM Providers

| Provider | Notes |
| --- | --- |
| Anthropic (Claude) | Recommended. Best classification accuracy. |
| OpenAI (GPT) | GPT-4o Mini is a cost-effective default. |
| Groq | Extremely fast. Good fit for low-latency runs. |
| DeepSeek | Very low cost. Strong for structured output. |
| Kimi (Moonshot AI) | Useful when you want a Moonshot-compatible option. |
| Mistral | Good European provider option. |
| Together AI | Access to many open-weight models. |
| Perplexity | Available through the OpenAI-compatible provider path. |
| Ollama | Free, local, and no API key required. |
| Any OpenAI-compatible API | vLLM, LM Studio, LocalAI, and similar endpoints can be added through config. |

Bring your own API key, or run fully local with Ollama.

## Open Core and Licensing

This repository is licensed under `AGPL-3.0-only`.

That means:

- the CLI is genuinely open source
- commercial use is allowed
- if someone modifies and runs this software as a network service, the AGPL obligations apply to that covered software

That licensing choice is intentional. The goal is to build in public while preserving a strong copyleft boundary for the core tool.

Official license text:
- GNU AGPL v3: https://www.gnu.org/licenses/agpl-3.0.en.html

## Development Notes

The codebase is structured to stay boring and inspectable:

- TypeScript
- Commander for CLI wiring
- Zod for schema validation
- Vitest for tests
- Local JSON storage under `.personascout/`

The current implementation lives mainly in:

- `src/commands`
- `src/lib`
- `src/types`

## Contributing

Issues, bug reports, and PRs are welcome.

If you contribute code, keep in mind the design bias of the project:

- local-first over hosted dependencies
- explicit JSON files over hidden state
- simple CLI behavior over framework magic
- provider abstraction without provider sprawl

## Roadmap

Near-term milestones:

- first npm release
- source editing

## Release Notes

The first public release candidate is tracked in [CHANGELOG.md](./CHANGELOG.md).

Longer-term polish:

- starter persona library
- richer export formats
- sharper terminal UX
- stronger public docs and examples

## Security

Do not commit private planning documents, credentials, or customer material into the repository.

Local-only notes and internal product briefs should stay outside version control or in ignored paths.

## License

`AGPL-3.0-only`
