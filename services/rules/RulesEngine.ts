import type { TabSnapshot } from '../../types/tab';
import type { Rule, SleepRule, MemoryLimitRule, TabLimitRule } from '../../types/rules';
import type { MemorySnapshot } from '../../types/memory';
import { StorageService } from '../storage/StorageService';
import { sortByEvictionPriority } from '../../lib/priorityScorer';
import { TabSleepService } from './TabSleepService';
import { MemoryMonitor } from '../memory/MemoryMonitor';

const DEFAULT_AVAILABLE_MEMORY_FLOOR_BYTES = 1.5 * 1024 * 1024 * 1024;
const TAB_GROUP_ID_NONE = -1;

/**
 * Checks if a URL's hostname matches a domain pattern.
 * Supports exact match (e.g. 'localhost') and wildcard prefix (e.g. '*.openai.com').
 */
function matchesDomainPattern(url: string, pattern: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // e.g. '.openai.com'
    return hostname === pattern.slice(2) || hostname.endsWith(suffix);
  }
  return hostname === pattern;
}

function isExemptDomain(url: string, exemptDomains: string[]): boolean {
  if (!url || !exemptDomains?.length) return false;
  return exemptDomains.some(p => matchesDomainPattern(url, p));
}

function isGrouped(snapshot: TabSnapshot): boolean {
  return (snapshot.info.groupId ?? TAB_GROUP_ID_NONE) !== TAB_GROUP_ID_NONE;
}

function isProtectedFromAutomation(snapshot: TabSnapshot): boolean {
  return snapshot.info.pinned || isGrouped(snapshot);
}

async function evalSleepRule(rule: SleepRule, snapshots: TabSnapshot[]): Promise<number> {
  let discarded = 0;
  const now = Date.now();

  for (const snap of snapshots) {
    if (snap.info.discarded) continue;
    if (isProtectedFromAutomation(snap)) continue;
    if (rule.exemptAudible && snap.info.audible) continue;
    if (rule.exemptCategories.includes(snap.metrics.category)) continue;
    if (isExemptDomain(snap.info.url ?? '', rule.exemptDomains ?? [])) continue;

    const inactiveMs = now - snap.metrics.lastActiveAt;
    if (inactiveMs >= rule.thresholdMs) {
      const ok = await TabSleepService.sleep(snap.tabId);
      if (ok) discarded++;
    }
  }

  return discarded;
}

async function evalMemoryLimitRule(rule: MemoryLimitRule, snapshots: TabSnapshot[], memorySnapshot: MemorySnapshot | null): Promise<number> {
  const totalTabMemoryBytes = snapshots.reduce((total, snap) => total + (snap.metrics.memoryBytes ?? 0), 0);
  const estimatedTabMemoryExcess = Math.max(0, totalTabMemoryBytes - rule.limitBytes);
  const availableMemoryFloorBytes = rule.availableMemoryFloorBytes ?? DEFAULT_AVAILABLE_MEMORY_FLOOR_BYTES;
  const systemMemoryShortfall = memorySnapshot
    ? Math.max(0, availableMemoryFloorBytes - memorySnapshot.system.availableCapacityBytes)
    : 0;
  const targetFreedBytes = Math.max(estimatedTabMemoryExcess, systemMemoryShortfall);

  if (targetFreedBytes <= 0) return 0;

  const candidates = snapshots.filter(s =>
    !s.info.discarded &&
    !isProtectedFromAutomation(s) &&
    !(rule.exemptAudible && s.info.audible)
  );

  const orderedCandidates = rule.action === 'sleepHighestMemory'
    ? [...candidates].sort((a, b) => (b.metrics.memoryBytes ?? 0) - (a.metrics.memoryBytes ?? 0))
    : sortByEvictionPriority(candidates);

  let freed = 0;
  let discarded = 0;

  for (const snap of orderedCandidates) {
    if (freed >= targetFreedBytes) break;

    if (rule.action === 'closeLRU') {
      await chrome.tabs.remove(snap.tabId);
      freed += snap.metrics.memoryBytes ?? 0;
      discarded++;
    } else {
      const ok = await TabSleepService.sleep(snap.tabId);
      if (!ok) continue;
      freed += snap.metrics.memoryBytes ?? 0;
      discarded++;
    }
  }

  return discarded;
}

async function evalTabLimitRule(rule: TabLimitRule, snapshots: TabSnapshot[]): Promise<number> {
  const activeTabs = snapshots.filter(s => !s.info.discarded);
  if (activeTabs.length <= rule.maxCount) return 0;
  if (rule.action === 'notify') return 0;

  const excess = activeTabs.length - rule.maxCount;
  const candidates = sortByEvictionPriority(
    activeTabs.filter(s => !isProtectedFromAutomation(s))
  ).slice(0, excess);

  let discarded = 0;
  for (const snap of candidates) {
    if (rule.action === 'close') {
      await chrome.tabs.remove(snap.tabId);
      discarded++;
    } else if (rule.action === 'sleep') {
      const ok = await TabSleepService.sleep(snap.tabId);
      if (ok) discarded++;
    }
  }

  return discarded;
}

export const RulesEngine = {
  async evaluate(providedSnapshots?: TabSnapshot[], providedMemorySnapshot?: MemorySnapshot): Promise<number> {
    const config = await StorageService.getRules();
    if (config.autoRecycleEnabled === false) return 0;

    const state = providedSnapshots && providedMemorySnapshot ? null : await MemoryMonitor.getState();
    const snapshots = providedSnapshots ?? state?.snapshots ?? [];
    const memorySnapshot = providedMemorySnapshot ?? state?.snapshot ?? null;

    if (snapshots.length === 0) return 0;
    let changed = 0;

    for (const rule of config.rules) {
      if (!rule.enabled) continue;

      switch (rule.type) {
        case 'sleep':
          changed += await evalSleepRule(rule as SleepRule, snapshots);
          break;
        case 'memoryLimit':
          changed += await evalMemoryLimitRule(rule as MemoryLimitRule, snapshots, memorySnapshot);
          break;
        case 'tabLimit':
          changed += await evalTabLimitRule(rule as TabLimitRule, snapshots);
          break;
        case 'categorySchedule':
          // TODO in Phase 7
          break;
      }
    }
    return changed;
  },
};
