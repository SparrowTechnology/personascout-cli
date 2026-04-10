import type { ProviderDefinition } from './provider.js';

export interface Config {
  website: string;
  company_name: string;
  default_provider: string;
  default_model: string;
  coverage_thresholds: {
    critical: number;
    weak: number;
    adequate: number;
  };
  fetch_limit: number;
  fetch_depth: number;
  providers?: Record<string, Partial<ProviderDefinition>>;
}
