import type { MemoryHistory, MemorySnapshot } from '../../types/memory';
import type { RulesConfig } from '../../types/rules';
import type { AISettings } from '../../types/ai';
import type { ClassificationResult } from '../../types/ai';
import type { UiSettings } from '../../types/ui';
import { AUTO_MEMORY_MODE, DEFAULT_EXEMPT_DOMAINS, DEFAULT_RULES } from '../../types/rules';
import { DEFAULT_AI_SETTINGS } from '../../types/ai';
import { DEFAULT_UI_SETTINGS } from '../../types/ui';

const KEYS = {
  METRICS_HISTORY: 'tabzzz:metrics:history',
  RULES: 'tabzzz:rules',
  AI_SETTINGS: 'tabzzz:ai:settings',
  UI_SETTINGS: 'tabzzz:ui:settings',
  TAB_ACTIVITY: 'tabzzz:tabs:activity',
  TAB_CATEGORIES: 'tabzzz:tabs:categories',
  SCHEMA_VERSION: 'tabzzz:schema:version',
} as const;

const CURRENT_SCHEMA_VERSION = 5;
const MAX_SNAPSHOTS = 120; // 2 hours at 60s interval
const OLD_DEFAULT_SLEEP_THRESHOLD_MS = 30 * 60 * 1000;
const OLD_DEFAULT_MEMORY_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;
const OLD_DEFAULT_TAB_LIMIT = 60;
const V2_DEFAULT_SLEEP_THRESHOLD_MS = 15 * 60 * 1000;
const V2_DEFAULT_MEMORY_LIMIT_BYTES = 8 * 1024 * 1024 * 1024;
const V2_DEFAULT_AVAILABLE_MEMORY_FLOOR_BYTES = 2 * 1024 * 1024 * 1024;
const V2_DEFAULT_TAB_LIMIT = 40;
const AI_EXEMPT_DOMAINS = ['claude.ai', 'chatgpt.com', 'gemini.google.com'];

async function get<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

async function set<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

function migrateRulesForAutoMemoryMode(config: RulesConfig): RulesConfig {
  let changed = false;
  const migratedRules = config.rules.map((rule: any) => {
    if (rule.id === 'default-sleep' && rule.type === 'sleep') {
      const next = { ...rule };
      if (next.thresholdMs === OLD_DEFAULT_SLEEP_THRESHOLD_MS) {
        next.thresholdMs = AUTO_MEMORY_MODE.sleepThresholdMs;
        changed = true;
      }
      if (Array.isArray(next.exemptCategories) && next.exemptCategories.join(',') === 'work,email,ai') {
        next.exemptCategories = [];
        changed = true;
      }
      return next;
    }

    if (rule.id === 'default-memory' && rule.type === 'memoryLimit') {
      const next = { ...rule };
      if (next.limitBytes === OLD_DEFAULT_MEMORY_LIMIT_BYTES) {
        next.limitBytes = AUTO_MEMORY_MODE.tabMemoryLimitBytes;
        changed = true;
      }
      if (typeof next.availableMemoryFloorBytes !== 'number') {
        next.availableMemoryFloorBytes = AUTO_MEMORY_MODE.availableMemoryFloorBytes;
        changed = true;
      }
      return next;
    }

    if (rule.id === 'default-tabcount' && rule.type === 'tabLimit') {
      const next = { ...rule };
      if (next.maxCount === OLD_DEFAULT_TAB_LIMIT) {
        next.maxCount = AUTO_MEMORY_MODE.maxActiveTabs;
        changed = true;
      }
      return next;
    }

    return rule;
  });

  return changed ? { ...config, rules: migratedRules, lastModified: Date.now() } : config;
}

function migrateRulesForGentleAutoRecycle(config: RulesConfig): RulesConfig {
  let changed = false;
  const migratedRules = config.rules.map((rule: any) => {
    if (rule.id === 'default-sleep' && rule.type === 'sleep' && rule.thresholdMs === V2_DEFAULT_SLEEP_THRESHOLD_MS) {
      changed = true;
      return { ...rule, thresholdMs: AUTO_MEMORY_MODE.sleepThresholdMs };
    }

    if (rule.id === 'default-memory' && rule.type === 'memoryLimit') {
      const next = { ...rule };
      if (next.limitBytes === V2_DEFAULT_MEMORY_LIMIT_BYTES) {
        next.limitBytes = AUTO_MEMORY_MODE.tabMemoryLimitBytes;
        changed = true;
      }
      if (next.availableMemoryFloorBytes === V2_DEFAULT_AVAILABLE_MEMORY_FLOOR_BYTES) {
        next.availableMemoryFloorBytes = AUTO_MEMORY_MODE.availableMemoryFloorBytes;
        changed = true;
      }
      return next;
    }

    if (rule.id === 'default-tabcount' && rule.type === 'tabLimit' && rule.maxCount === V2_DEFAULT_TAB_LIMIT) {
      changed = true;
      return { ...rule, maxCount: AUTO_MEMORY_MODE.maxActiveTabs };
    }

    return rule;
  });

  if (config.autoRecycleEnabled === undefined) {
    changed = true;
  }

  return changed
    ? { ...config, autoRecycleEnabled: config.autoRecycleEnabled ?? true, rules: migratedRules, lastModified: Date.now() }
    : config;
}

function migrateRulesForDefaultAiExemptDomains(config: RulesConfig): RulesConfig {
  let changed = false;
  const migratedRules = config.rules.map((rule: any) => {
    if (rule.id !== 'default-sleep' || rule.type !== 'sleep') return rule;

    let ruleChanged = false;
    const exemptDomains = Array.isArray(rule.exemptDomains) ? rule.exemptDomains : DEFAULT_EXEMPT_DOMAINS;
    const nextDomains = [...exemptDomains];
    if (!Array.isArray(rule.exemptDomains)) {
      ruleChanged = true;
      changed = true;
    }
    for (const domain of AI_EXEMPT_DOMAINS) {
      if (!nextDomains.includes(domain)) {
        nextDomains.push(domain);
        ruleChanged = true;
        changed = true;
      }
    }

    return ruleChanged ? { ...rule, exemptDomains: nextDomains } : rule;
  });

  return changed ? { ...config, rules: migratedRules, lastModified: Date.now() } : config;
}

export const StorageService = {
  async init(): Promise<void> {
    const version = await get<number>(KEYS.SCHEMA_VERSION);
    if (!version) {
      // Fresh install: seed defaults
      await set(KEYS.SCHEMA_VERSION, CURRENT_SCHEMA_VERSION);
      await set<MemoryHistory>(KEYS.METRICS_HISTORY, { snapshots: [], maxSnapshots: MAX_SNAPSHOTS });
      await set<RulesConfig>(KEYS.RULES, { autoRecycleEnabled: true, rules: DEFAULT_RULES, lastModified: Date.now() });
      await set<AISettings>(KEYS.AI_SETTINGS, DEFAULT_AI_SETTINGS);
      await set<UiSettings>(KEYS.UI_SETTINGS, DEFAULT_UI_SETTINGS);
      await set<Record<number, number>>(KEYS.TAB_ACTIVITY, {});
      await set<Record<number, ClassificationResult>>(KEYS.TAB_CATEGORIES, {});
      return;
    }

    if (version < CURRENT_SCHEMA_VERSION) {
      let migrated = await this.getRules();
      if (version < 2) {
        migrated = migrateRulesForAutoMemoryMode(migrated);
      }
      if (version < 3) {
        migrated = migrateRulesForGentleAutoRecycle(migrated);
      }
      if (version < 4) {
        migrated = migrateRulesForDefaultAiExemptDomains(migrated);
      }
      await set<RulesConfig>(KEYS.RULES, migrated);
      if (version < 5) {
        const storedUiSettings = await get<UiSettings>(KEYS.UI_SETTINGS);
        if (!storedUiSettings) await set<UiSettings>(KEYS.UI_SETTINGS, DEFAULT_UI_SETTINGS);
      }
      await set(KEYS.SCHEMA_VERSION, CURRENT_SCHEMA_VERSION);
    }
  },

  async appendSnapshot(snapshot: MemorySnapshot): Promise<void> {
    const history = await get<MemoryHistory>(KEYS.METRICS_HISTORY) ?? { snapshots: [], maxSnapshots: MAX_SNAPSHOTS };
    history.snapshots.push(snapshot);
    if (history.snapshots.length > MAX_SNAPSHOTS) {
      history.snapshots = history.snapshots.slice(-MAX_SNAPSHOTS);
    }
    await set(KEYS.METRICS_HISTORY, history);
  },

  async getHistory(): Promise<MemoryHistory> {
    return await get<MemoryHistory>(KEYS.METRICS_HISTORY) ?? { snapshots: [], maxSnapshots: MAX_SNAPSHOTS };
  },

  async getRules(): Promise<RulesConfig> {
    const stored = await get<RulesConfig>(KEYS.RULES);
    if (!stored) return { autoRecycleEnabled: true, rules: DEFAULT_RULES, lastModified: Date.now() };

    // Migration: backfill exemptDomains on existing sleep rules that predate this field
    let needsSave = false;
    const defaultSleepRule = DEFAULT_RULES.find(r => r.type === 'sleep') as any;
    const migratedRules = stored.rules.map((r: any) => {
      if (r.type === 'sleep' && !Array.isArray(r.exemptDomains)) {
        needsSave = true;
        return { ...r, exemptDomains: defaultSleepRule?.exemptDomains ?? [] };
      }
      return r;
    });

    if (stored.autoRecycleEnabled === undefined) {
      needsSave = true;
    }

    if (needsSave) {
      const migrated = { ...stored, autoRecycleEnabled: stored.autoRecycleEnabled ?? true, rules: migratedRules, lastModified: Date.now() };
      await set(KEYS.RULES, migrated);
      return migrated;
    }

    return stored;
  },

  async saveRules(config: RulesConfig): Promise<void> {
    await set(KEYS.RULES, { ...config, lastModified: Date.now() });
  },

  async getAISettings(): Promise<AISettings> {
    return await get<AISettings>(KEYS.AI_SETTINGS) ?? DEFAULT_AI_SETTINGS;
  },

  async saveAISettings(settings: AISettings): Promise<void> {
    await set(KEYS.AI_SETTINGS, settings);
  },

  async getUiSettings(): Promise<UiSettings> {
    return { ...DEFAULT_UI_SETTINGS, ...(await get<Partial<UiSettings>>(KEYS.UI_SETTINGS) ?? {}) };
  },

  async saveUiSettings(settings: UiSettings): Promise<void> {
    await set(KEYS.UI_SETTINGS, { ...DEFAULT_UI_SETTINGS, ...settings });
  },

  async getTabActivity(): Promise<Record<number, number>> {
    return await get<Record<number, number>>(KEYS.TAB_ACTIVITY) ?? {};
  },

  async saveTabActivity(activity: Record<number, number>): Promise<void> {
    await set(KEYS.TAB_ACTIVITY, activity);
  },

  async getTabCategories(): Promise<Record<number, ClassificationResult>> {
    return await get<Record<number, ClassificationResult>>(KEYS.TAB_CATEGORIES) ?? {};
  },

  async saveTabCategories(categories: Record<number, ClassificationResult>): Promise<void> {
    await set(KEYS.TAB_CATEGORIES, categories);
  },

  async updateTabCategory(tabId: number, result: ClassificationResult): Promise<void> {
    const categories = await this.getTabCategories();
    categories[tabId] = result;
    await set(KEYS.TAB_CATEGORIES, categories);
  },

  async removeTabData(tabId: number): Promise<void> {
    const [activity, categories] = await Promise.all([
      this.getTabActivity(),
      this.getTabCategories(),
    ]);
    delete activity[tabId];
    delete categories[tabId];
    await Promise.all([
      set(KEYS.TAB_ACTIVITY, activity),
      set(KEYS.TAB_CATEGORIES, categories),
    ]);
  },
};
