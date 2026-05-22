import type { TabCategory } from './tab';

export type AIProviderType = 'chrome' | 'disabled';

export interface AISettings {
  provider: AIProviderType;
  classifyOnLoad: boolean;
  reclassifyIntervalMs: number;
  chromeAIAvailable?: boolean;
}

export interface ClassificationResult {
  tabId: number;
  category: TabCategory;
  confidence: number;
  provider: AIProviderType;
  classifiedAt: number;
  url: string;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'disabled',
  classifyOnLoad: false,
  reclassifyIntervalMs: 4 * 60 * 60 * 1000, // 4 hours
};
