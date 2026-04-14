# Changelog

## 0.2.0 - 2026-04-14

Adds the first machine-readable CLI output layer so PersonaScout can be integrated more cleanly into other systems and hosted wrappers.

### Added

- `personascout status --format json`
- `personascout classify --format json`
- `personascout generate --result-format json`

### Changed

- `classify` now emits structured JSON for both dry-run and live-run summaries when requested
- `generate` now emits structured JSON including artifact output and generation run metadata when requested
- `status` can now return the full project status payload as JSON
- README now documents the machine-readable command surface for integrators

## 0.1.0 - 2026-04-12

First public release. This completes the initial CLI scope and is the baseline for public npm distribution.

### Added

- `init` command for bootstrapping a local PersonaScout project
- `status` command for project progress, latest run visibility, and suggested next steps
- persona management commands:
  - `persona list`
  - `persona templates`
  - `persona add --interactive`
  - `persona add --file`
  - `persona view <id>`
  - `persona generate`
  - `persona use <template-id>`
  - `persona edit <id>`
  - `persona delete <id>`
  - `persona validate`
- source management for RSS, website, and CSV inputs:
  - `source list`
  - `source add`
  - `source remove <id>`
  - `source test [sourceId]`
- content fetching for RSS, website crawling, and CSV imports
- provider registry command with built-in and configurable providers
- content classification with Anthropic and OpenAI-compatible providers
- coverage reporting in terminal, JSON, CSV, and Markdown formats
- gap-driven content generation for briefs and drafts
- diff reporting between classification runs
- bundled starter persona templates for common B2B buyer roles
- local generation history surfaced in `status`
- cross-source content deduplication by canonical URL/fingerprint
- public examples, screenshots, and improved README guidance

### Changed

- terminal output now uses a richer styled reporting layer with `chartscii` and `styl3`
- `report` now includes graphical coverage summaries, plain-English captions, and a suggested next step
- `status` now renders as a workflow dashboard instead of a plain text checklist
- `diff` now includes a graphical summary before the detailed change list
- fetch and classification flows now show clearer progress and elapsed time
- AI-backed commands and suggested commands are explicitly marked with `[AI]`
- interactive AI prompts now warn at the last safe cancel point before a provider call

### Notes

- Published on npm as `personascout@0.1.0`.
- `npm pack --dry-run` was clean before publish.
- This release completes the first major build pass from the original CLI brief.
