# Examples

These files are starter assets for local testing and public documentation.

## Included

- `persona-cfo.json`
  A complete persona document you can import with `personascout persona add --file`.
- `source-rss.json`
  Example RSS source definition.
- `source-website.json`
  Example website source definition.
- `source-csv.json`
  Example CSV source definition with explicit column mapping.
- `content-export.csv`
  Small CSV input file that matches `source-csv.json`.

## Example Flow

```bash
personascout init
personascout persona add --file ./examples/persona-cfo.json
personascout source add
personascout fetch
personascout classify --dry-run
```
