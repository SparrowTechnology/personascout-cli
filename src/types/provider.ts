export type ProviderSDK = 'anthropic' | 'openai-compatible';

export interface ProviderDefinition {
  id: string;
  display_name: string;
  sdk: ProviderSDK;
  base_url?: string;
  api_key_env: string;
  requires_key: boolean;
  default_model: string;
  suggested_models: string[];
  notes?: string;
}
