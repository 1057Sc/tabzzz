import type { TabCategory } from '../../types/tab';
import type { AISettings, ClassificationResult } from '../../types/ai';
import { StorageService } from '../storage/StorageService';
import { classifyWithChromeAI } from './ChromeAIProvider';
import { sleep, chunk } from '../../lib/utils';
import { browser } from 'wxt/browser';

const VALID_CATEGORIES: TabCategory[] = [
  'work',
  'email',
  'ai',
  'social',
  'shopping',
  'news',
  'dev',
  'entertainment',
  'uncategorized',
];

function isValidCategory(cat: string): cat is TabCategory {
  return VALID_CATEGORIES.includes(cat as TabCategory);
}

export async function classifyTab(
  tabId: number,
  url: string,
  title: string,
  settings: AISettings,
): Promise<ClassificationResult | null> {
  if (settings.provider === 'disabled') return null;
  if (!url || url.startsWith('chrome://') || url.startsWith('about:')) {
    return {
      tabId,
      category: 'uncategorized',
      confidence: 1.0,
      provider: 'disabled',
      classifiedAt: Date.now(),
      url,
    };
  }

  let result: { category: string; confidence: number } | null = null;

  if (settings.provider === 'chrome') {
    result = await classifyWithChromeAI(url, title);
  }

  if (!result || !isValidCategory(result.category)) return null;

  const classification: ClassificationResult = {
    tabId,
    category: result.category,
    confidence: result.confidence,
    provider: settings.provider,
    classifiedAt: Date.now(),
    url,
  };

  await StorageService.updateTabCategory(tabId, classification);
  return classification;
}

export async function classifyBatch(
  tabs: Array<{ id: number; url: string; title: string }>,
  settings: AISettings,
): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = [];
  const batchSize = settings.provider === 'chrome' ? 1 : 5; // Chrome AI is serial
  const delayMs = settings.provider === 'chrome' ? 0 : 200;

  const batches = chunk(tabs, batchSize);

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(t => classifyTab(t.id, t.url, t.title, settings))
    );
    results.push(...batchResults.filter(Boolean) as ClassificationResult[]);
    if (delayMs > 0) await sleep(delayMs);
  }

  return results;
}

export async function classifyUnclassifiedTabs(settings: AISettings): Promise<void> {
  if (settings.provider === 'disabled') return;

  const [tabs, categories] = await Promise.all([
    browser.tabs.query({}),
    StorageService.getTabCategories(),
  ]);

  const STALE_THRESHOLD = settings.reclassifyIntervalMs || 4 * 60 * 60 * 1000;
  const now = Date.now();

  const toClassify = tabs
    .filter(t => t.id !== undefined && t.url && !t.discarded)
    .filter(t => {
      const existing = categories[t.id!];
      if (!existing) return true;
      return (now - existing.classifiedAt) > STALE_THRESHOLD;
    })
    .map(t => ({ id: t.id!, url: t.url!, title: t.title ?? '' }));

  if (toClassify.length === 0) return;

  await classifyBatch(toClassify, settings);
}
