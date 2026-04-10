# personascout

Map your content against your ICPs. Find the gaps. Fill them.

## Install

```bash
npm install -g personascout
```

## Quick Start (5 minutes)

```bash
personascout init
personascout persona add --file ./persona.json
personascout persona list
personascout persona validate
```

## Commands

Current implementation:

- `personascout init`
- `personascout persona list`
- `personascout persona add --file <path>`
- `personascout persona validate`
- `personascout source list`
- `personascout source add`
- `personascout fetch` (RSS sources)

Planned next:

- `providers`
- `classify`
- `report`
- `generate`
- `diff`

## LLM Providers

Built-in provider definitions are bundled for Anthropic, OpenAI, Groq, DeepSeek, Kimi, Mistral, Together, Perplexity, and Ollama.

## Starter Persona Library

Planned for a later milestone.

## JSON Schemas

Persona and config validation use `zod`.

## Contributing

The initial build order follows the product brief in `docs/personascout-cli-brief.md`.

## Licence

MIT
