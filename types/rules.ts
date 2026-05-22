import type { TabCategory } from './tab';

export type RuleType = 'sleep' | 'memoryLimit' | 'tabLimit' | 'categorySchedule';

export interface BaseRule {
  id: string;
  type: RuleType;
  enabled: boolean;
  createdAt: number;
}

export interface SleepRule extends BaseRule {
  type: 'sleep';
  thresholdMs: number;
  exemptPinned: boolean;
  exemptAudible: boolean;
  exemptCategories: TabCategory[];
  exemptDomains: string[]; // Exact domains or wildcards, e.g. '*.openai.com', 'localhost'
}

export interface MemoryLimitRule extends BaseRule {
  type: 'memoryLimit';
  limitBytes: number;
  availableMemoryFloorBytes?: number;
  action: 'sleepLRU' | 'sleepHighestMemory' | 'closeLRU';
  exemptPinned: boolean;
  exemptAudible: boolean;
}

export interface TabLimitRule extends BaseRule {
  type: 'tabLimit';
  maxCount: number;
  action: 'sleep' | 'close' | 'notify';
  exemptPinned: boolean;
}

export interface CategoryScheduleEntry {
  category: TabCategory;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  days: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
}

export interface CategoryScheduleRule extends BaseRule {
  type: 'categorySchedule';
  schedules: CategoryScheduleEntry[];
}

export type Rule = SleepRule | MemoryLimitRule | TabLimitRule | CategoryScheduleRule;

export interface RulesConfig {
  rules: Rule[];
  lastModified: number;
  autoRecycleEnabled?: boolean;
  lruThresholdMs?: number; // Configurable forgotten tabs timeout
}

export const DEFAULT_FORGOTTEN_TABS_THRESHOLD_MS = 8 * 60 * 60 * 1000;

export const AUTO_MEMORY_MODE = {
  sleepThresholdMs: 30 * 60 * 1000,
  tabMemoryLimitBytes: 12 * 1024 * 1024 * 1024,
  availableMemoryFloorBytes: 1.5 * 1024 * 1024 * 1024,
  maxActiveTabs: 80,
} as const;

export const DEFAULT_EXEMPT_DOMAINS: string[] = [
  'localhost',
  '127.0.0.1',
  '::1',
  '*.local',
  '*.localhost',
  'claude.ai',
  'chatgpt.com',
  'gemini.google.com',
];

export const DEFAULT_RULES: Rule[] = [
  {
    id: 'default-sleep',
    type: 'sleep',
    enabled: true,
    createdAt: Date.now(),
    thresholdMs: AUTO_MEMORY_MODE.sleepThresholdMs,
    exemptPinned: true,
    exemptAudible: true,
    exemptCategories: [],
    exemptDomains: DEFAULT_EXEMPT_DOMAINS,
  },
  {
    id: 'default-memory',
    type: 'memoryLimit',
    enabled: true,
    createdAt: Date.now(),
    limitBytes: AUTO_MEMORY_MODE.tabMemoryLimitBytes,
    availableMemoryFloorBytes: AUTO_MEMORY_MODE.availableMemoryFloorBytes,
    action: 'sleepLRU',
    exemptPinned: true,
    exemptAudible: true,
  },
  {
    id: 'default-tabcount',
    type: 'tabLimit',
    enabled: true,
    createdAt: Date.now(),
    maxCount: AUTO_MEMORY_MODE.maxActiveTabs,
    action: 'sleep',
    exemptPinned: true,
  },
  {
    id: 'default-schedule',
    type: 'categorySchedule',
    enabled: false,
    createdAt: Date.now(),
    schedules: [],
  },
];
