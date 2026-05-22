import { browser } from 'wxt/browser';
import type { MemorySnapshot, SystemMemory } from '../../types/memory';
import type { TabSnapshot, TabInfo, TabMetrics } from '../../types/tab';
import { StorageService } from '../storage/StorageService';
import { TabLifecycleManager } from '../tabs/TabLifecycleManager';
import { estimateTabMemory } from './FallbackMemoryEstimator';
import { scoreTab } from '../../lib/priorityScorer';
import type { ClassificationResult } from '../../types/ai';

let cachedSnapshots: TabSnapshot[] = [];
let cachedMemorySnapshot: MemorySnapshot | null = null;
let lastPollAt = 0;
let inFlightPoll: Promise<{ snapshot: MemorySnapshot; snapshots: TabSnapshot[] }> | null = null;

interface PollOptions {
  force?: boolean;
  writeHistory?: boolean;
  minIntervalMs?: number;
}

const DEFAULT_MIN_POLL_INTERVAL_MS = 10_000;

async function getSystemMemory(): Promise<SystemMemory> {
  const info = await browser.system.memory.getInfo();
  return {
    capacityBytes: info.capacity,
    availableCapacityBytes: info.availableCapacity,
    usedBytes: info.capacity - info.availableCapacity,
    usedPercent: ((info.capacity - info.availableCapacity) / info.capacity) * 100,
  };
}

async function getTabMemoryBytes(tab: any): Promise<number> {
  if (tab.discarded) return 0;
  return estimateTabMemory(tab);
}

function tabToInfo(tab: any): TabInfo {
  return {
    id: tab.id!,
    windowId: tab.windowId,
    url: tab.url ?? '',
    title: tab.title ?? '',
    faviconUrl: tab.favIconUrl,
    pinned: tab.pinned,
    audible: tab.audible ?? false,
    discarded: tab.discarded ?? false,
    groupId: tab.groupId ?? browser.tabGroups.TAB_GROUP_ID_NONE,
    index: tab.index,
  };
}

export const MemoryMonitor = {
  async init(): Promise<void> {
    // No-op for now
  },

  async poll(options: PollOptions = {}): Promise<{ snapshot: MemorySnapshot; snapshots: TabSnapshot[] }> {
    const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_POLL_INTERVAL_MS;
    const writeHistory = options.writeHistory ?? true;
    const nowMs = Date.now();

    if (!options.force && cachedMemorySnapshot && (nowMs - lastPollAt) < minIntervalMs) {
      return { snapshot: cachedMemorySnapshot, snapshots: cachedSnapshots };
    }

    if (!options.force && inFlightPoll) {
      return inFlightPoll;
    }

    inFlightPoll = this.pollFresh(writeHistory).finally(() => {
      inFlightPoll = null;
    });
    return inFlightPoll;
  },

  async pollFresh(writeHistory: boolean): Promise<{ snapshot: MemorySnapshot; snapshots: TabSnapshot[] }> {
    const [system, tabs, categories] = await Promise.all([
      getSystemMemory(),
      browser.tabs.query({}),
      StorageService.getTabCategories(),
    ]);

    const now = Date.now();
    const perTab: Record<number, number> = {};
    const tabSnapshots: TabSnapshot[] = [];

    await Promise.all(
      tabs
        .filter(t => t.id !== undefined)
        .map(async (tab) => {
          const memBytes = await getTabMemoryBytes(tab);
          const tabId = tab.id!;
          perTab[tabId] = memBytes;

          const inactiveMs = TabLifecycleManager.getInactiveMs(tabId);
          const category = categories[tabId];

          const metrics: TabMetrics = {
            tabId,
            memoryBytes: memBytes,
            lastActiveAt: TabLifecycleManager.getLastActiveAt(tabId),
            inactiveMs,
            category: category?.category ?? 'uncategorized',
            categoryConfidence: category?.confidence ?? 0,
            isSleeping: tab.discarded ?? false,
            priority: 0, // will be computed below
          };

          const info = tabToInfo(tab);
          const snapshot: TabSnapshot = { tabId, info, metrics, capturedAt: now };
          // Compute priority score
          snapshot.metrics.priority = scoreTab(snapshot, now);
          tabSnapshots.push(snapshot);
        })
    );

    const totalTabMemory = Object.values(perTab).reduce((a, b) => a + b, 0);
    const sleeping = tabs.filter(t => t.discarded).length;

    const memSnapshot: MemorySnapshot = {
      timestamp: now,
      system,
      totalTabMemoryBytes: totalTabMemory,
      perTab,
      sleeping,
      total: tabs.length,
    };

    cachedSnapshots = tabSnapshots;
    cachedMemorySnapshot = memSnapshot;
    lastPollAt = now;
    if (writeHistory) {
      await StorageService.appendSnapshot(memSnapshot);
    }
    return { snapshot: memSnapshot, snapshots: tabSnapshots };
  },

  async getState(maxAgeMs = 60_000): Promise<{ snapshot: MemorySnapshot | null; snapshots: TabSnapshot[] }> {
    if (cachedMemorySnapshot && (Date.now() - lastPollAt) <= maxAgeMs) {
      return { snapshot: cachedMemorySnapshot, snapshots: cachedSnapshots };
    }

    if (cachedMemorySnapshot) {
      return { snapshot: cachedMemorySnapshot, snapshots: cachedSnapshots };
    }

    const { snapshot, snapshots } = await this.poll({ writeHistory: false });
    return { snapshot, snapshots };
  },

  getCachedSnapshot(): MemorySnapshot | null {
    return cachedMemorySnapshot;
  },

  getCachedSnapshots(): TabSnapshot[] {
    return cachedSnapshots;
  },
};
