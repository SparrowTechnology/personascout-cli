import type { ContentItem } from './content.js';

export interface PersonaScore {
  persona_id: string;
  relevance: number;
  funnel_stage: 'awareness' | 'consideration' | 'decision';
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ClassifiedItem extends ContentItem {
  scores: PersonaScore[];
}

export interface RunResult {
  run_id: string;
  created_at: string;
  provider: string;
  model: string;
  item_count: number;
  persona_ids: string[];
  items: ClassifiedItem[];
}

export interface CoverageCell {
  persona_id: string;
  funnel_stage: 'awareness' | 'consideration' | 'decision';
  count: number;
  items: Array<{ id: string; title: string; url: string; relevance: number }>;
  status: 'critical' | 'weak' | 'adequate';
}

export type CoverageMatrix = CoverageCell[];
