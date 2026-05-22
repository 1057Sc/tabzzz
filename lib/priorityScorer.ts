import type { TabSnapshot } from '../types/tab';
import type { TabCategory } from '../types/tab';

const CATEGORY_WEIGHTS: Record<TabCategory, number> = {
  work: 40,
  email: 40,
  ai: 35,
  dev: 35,
  news: 10,
  social: 10,
  shopping: 5,
  entertainment: 0,
  uncategorized: 0,
};

export function scoreTab(snapshot: TabSnapshot, now: number): number {
  const minutesInactive = snapshot.metrics.inactiveMs / 60000;
  let score = 0;

  // Recency: most important signal
  score -= minutesInactive * 2;

  // Protection bonuses
  if (snapshot.info.pinned) score += 100;
  if (snapshot.info.audible) score += 80;
  if (snapshot.info.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) score += 20;

  // Category weight
  score += CATEGORY_WEIGHTS[snapshot.metrics.category];

  return score;
}

export function sortByEvictionPriority(snapshots: TabSnapshot[]): TabSnapshot[] {
  const now = Date.now();
  return [...snapshots].sort((a, b) => scoreTab(a, now) - scoreTab(b, now));
}
