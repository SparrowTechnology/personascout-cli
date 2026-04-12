# Changelog

## 0.1.0 - 2026-04-12

First public release candidate.

### Added

- `init` command for bootstrapping a local PersonaScout project
- persona management commands:
  - `persona list`
  - `persona add --file`
  - `persona generate`
  - `persona use <template-id>`
  - `persona edit <id>`
  - `persona delete <id>`
  - `persona validate`
- source management for RSS, website, and CSV inputs
- content fetching for RSS, website crawling, and CSV imports
- provider registry command with built-in and configurable providers
- content classification with Anthropic and OpenAI-compatible providers
- coverage reporting in terminal, JSON, CSV, and Markdown formats
- gap-driven content generation for briefs and drafts
- diff reporting between classification runs
- bundled starter persona templates for common B2B buyer roles

### Notes

- The npm package is not published yet.
- This release candidate completes the first major build pass from the original CLI brief before public npm release.
