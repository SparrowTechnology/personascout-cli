export type SourceType = 'rss' | 'website' | 'csv';

export interface Source {
  id: string;
  type: SourceType;
  label: string;
  url?: string;
  file?: string;
  csv_mapping?: {
    title: string;
    body: string;
    date: string;
    url: string;
  };
  last_fetched?: string;
  item_count?: number;
}
