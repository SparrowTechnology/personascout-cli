export type ContentChannel = 'blog' | 'linkedin-article' | 'linkedin-post' | 'twitter-thread' | 'email';

export type GenerationFormat = 'brief' | 'draft';

export interface GeneratedBrief {
  headline: string;
  angle: string;
  key_points: string[];
  format: string;
  suggested_length: string;
  hook: string;
  cta: string;
}

export interface GenerationTarget {
  persona_id: string;
  persona_name: string;
  funnel_stage: 'awareness' | 'consideration' | 'decision';
  count: number;
  status: 'critical' | 'weak' | 'adequate';
}

export interface GeneratedArtifact {
  target: GenerationTarget;
  channel: ContentChannel;
  format: GenerationFormat;
  content: GeneratedBrief | string;
  output_path?: string;
}

export interface GenerationRunArtifactSummary {
  persona_id: string;
  persona_name: string;
  funnel_stage: GenerationTarget['funnel_stage'];
  channel: ContentChannel;
  format: GenerationFormat;
  output_path?: string;
}

export interface GenerationRunRecord {
  run_id: string;
  created_at: string;
  provider: string;
  model: string;
  artifact_count: number;
  output_dir?: string;
  artifacts: GenerationRunArtifactSummary[];
}
