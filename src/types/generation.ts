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
