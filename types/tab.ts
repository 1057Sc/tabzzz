export type TabCategory =
  | 'work'
  | 'email'
  | 'ai'
  | 'social'
  | 'shopping'
  | 'news'
  | 'dev'
  | 'entertainment'
  | 'uncategorized';

export interface TabInfo {
  id: number;
  windowId: number;
  url: string;
  title: string;
  faviconUrl?: string;
  pinned: boolean;
  audible: boolean;
  discarded: boolean;
  groupId: number;
  index: number;
}

export interface TabMetrics {
  tabId: number;
  processId?: number;
  memoryBytes?: number;
  cpuUsagePercent?: number;
  lastActiveAt: number;
  inactiveMs: number;
  category: TabCategory;
  categoryConfidence: number;
  isSleeping: boolean;
  priority: number;
}

export interface TabSnapshot {
  tabId: number;
  info: TabInfo;
  metrics: TabMetrics;
  capturedAt: number;
}
