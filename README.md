# personascout

Map your content against your ICPs. Find the gaps. Fill them.

`personascout` is a local-first CLI for B2B teams that want to understand how well their content serves their ideal customer profiles across the funnel. It ingests content from RSS feeds, websites, and CSV exports, classifies each piece against your personas, and highlights where your coverage is thin.

The long-term product direction is open core:
- `personascout` the CLI stays truly open source under `AGPL-3.0-only`
- a separate hosted product can exist on top, but improvements to the networked software covered by this repo stay in the commons

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

The project is in active build-out. What exists today:

- `personascout init`
- `personascout persona list`
- `personascout persona add --file <path>`
- `personascout persona validate`
- `personascout source list`
- `personascout source add`
- `personascout fetch` for RSS and website sources
- website crawling with same-domain `cheerio` fallback
- optional Firecrawl-backed website crawling when `FIRECRAWL_API_KEY` is set

What is planned next:

- CSV ingestion
- provider management
- AI classification
- terminal and exportable reports
- content gap brief generation
- result diffing

## Install

```bash
npm install -g personascout
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

Add a source:

```bash
personascout source add
```

Fetch content into `.personascout/content/`:

```bash
personascout fetch
```

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
- `personascout persona add --file <path>`
- `personascout persona validate`

Personas are stored as JSON files under `.personascout/personas/`.

### `personascout source`

Current subcommands:

- `personascout source list`
- `personascout source add`

Supported source definitions today:

- `rss`
- `website`
- `csv` definition only, fetch implementation still pending

### `personascout fetch`

Fetches content from configured sources and stores normalized content items in `.personascout/content/{source-id}/`.

Currently implemented:

- RSS feeds via `rss-parser`
- website crawling via Firecrawl when configured
- website crawling via `axios` + `cheerio` fallback when Firecrawl is unavailable

Not implemented yet:

- CSV fetching

## Provider Direction

The planned provider architecture keeps the model layer deliberately simple:

- `@anthropic-ai/sdk` for Anthropic
- `openai` for OpenAI-compatible APIs including Groq, DeepSeek, Kimi, Mistral, Together, Perplexity, and Ollama

That gives the CLI broad provider support without baking provider-specific logic throughout the codebase.

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

- CSV source fetching
- provider registry command
- classification pipeline
- coverage reporting
- persona generation
- content brief generation
- result diffing

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
