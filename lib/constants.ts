import type { TabCategory } from '../types';

export const CATEGORY_COLORS: Record<TabCategory, string> = {
  work: '#3b82f6',
  email: '#0284c7',
  ai: '#d946ef',
  social: '#a855f7',
  shopping: '#f97316',
  news: '#f59e0b',
  dev: '#10b981',
  entertainment: '#f43f5e',
  uncategorized: '#6b7280',
};

export const CATEGORY_LABELS: Record<TabCategory, string> = {
  work: 'WORK',
  email: 'MAIL',
  ai: 'AI',
  social: 'SOC',
  shopping: 'SHOP',
  news: 'NEWS',
  dev: 'DEV',
  entertainment: 'ENT',
  uncategorized: '?',
};

export const CATEGORY_FULL_LABELS: Record<TabCategory, string> = {
  work: 'Work',
  email: 'Email',
  ai: 'AI & Chat',
  social: 'Social',
  shopping: 'Shopping',
  news: 'News',
  dev: 'Dev',
  entertainment: 'Entertainment',
  uncategorized: 'Uncategorized',
};

export const ALL_CATEGORIES: TabCategory[] = [
  'work', 'email', 'ai', 'social', 'shopping', 'news', 'dev', 'entertainment', 'uncategorized',
];

export const MEMORY_THRESHOLDS = {
  OK: 200 * 1024 * 1024,      // 200 MB
  WARN: 500 * 1024 * 1024,    // 500 MB
} as const;

export const ALARM_NAMES = {
  POLL_MEMORY: 'tabzzz:poll:memory',
  POLL_RULES: 'tabzzz:poll:rules',
  CLASSIFY_BATCH: 'tabzzz:classify:batch',
  GROUP_SYNC: 'tabzzz:group:sync',
} as const;

export const POLL_INTERVAL_MINUTES = 2; // 120 seconds
export const CLASSIFY_INTERVAL_MINUTES = 5;
export const GROUP_SYNC_INTERVAL_MINUTES = 5;

export const TAB_GROUP_COLORS: Record<TabCategory, string> = {
  work: 'blue',
  email: 'cyan',
  ai: 'purple',
  social: 'purple', // Chrome tab group colors are limited, overlapping is fine
  shopping: 'orange',
  news: 'yellow',
  dev: 'green',
  entertainment: 'red',
  uncategorized: 'grey',
};
