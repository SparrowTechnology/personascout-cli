import { z } from 'zod';

export const sourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Source id must be kebab-case.'),
  type: z.enum(['rss', 'website', 'csv']),
  label: z.string().min(1),
  url: z.string().url().optional(),
  file: z.string().min(1).optional(),
  csv_mapping: z
    .object({
      title: z.string().min(1),
      body: z.string().min(1),
      date: z.string().min(1),
      url: z.string().min(1),
    })
    .optional(),
  last_fetched: z.string().datetime().optional(),
  item_count: z.number().int().min(0).optional(),
});
