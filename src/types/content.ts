export interface ContentItem {
  id: string;
  source_id: string;
  url: string;
  title: string;
  body_text: string;
  published_at: string | null;
  fetched_at: string;
}
