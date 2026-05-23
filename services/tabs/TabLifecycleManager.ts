import { StorageService } from '../storage/StorageService';
import { getEffectiveInactiveMs } from '../../lib/inactivity';

let activityCache: Record<number, number> = {};
let persistTimeout: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

async function loadCache(): Promise<void> {
  activityCache = await StorageService.getTabActivity();
}

async function persistCache(): Promise<void> {
  await StorageService.saveTabActivity(activityCache);
}

/** Debounced persist — batches rapid writes into a single storage call */
function schedulePersist(): void {
  if (persistTimeout) clearTimeout(persistTimeout);
  persistTimeout = setTimeout(() => {
    persistTimeout = null;
    persistCache().catch(console.error);
  }, 2000);
}

function markActive(tabId: number): void {
  activityCache[tabId] = Date.now();
}

export const TabLifecycleManager = {
  async init(): Promise<void> {
    await loadCache();

    // Seed all currently open tabs as "just seen" if not already tracked
    const tabs = await chrome.tabs.query({});
    let changed = false;
    for (const tab of tabs) {
      if (tab.id !== undefined && !(tab.id in activityCache)) {
        activityCache[tab.id] = tab.active ? Date.now() : Date.now() - 60 * 1000;
        changed = true;
      }
    }
    if (changed) await persistCache();

    if (initialized) return;
    initialized = true;

    // --- Event listeners (must be registered synchronously at top level) ---
    chrome.tabs.onActivated.addListener(({ tabId }: { tabId: number }) => {
      markActive(tabId);
      schedulePersist(); // debounced — no await needed
    });

    chrome.tabs.onCreated.addListener((tab: chrome.tabs.Tab) => {
      if (tab.id !== undefined) {
        markActive(tab.id);
        schedulePersist();
      }
    });

    chrome.tabs.onRemoved.addListener(async (tabId: number) => {
      delete activityCache[tabId];
      await Promise.all([
        persistCache(), // immediate — cleanup data
        StorageService.removeTabData(tabId),
      ]);
    });

    chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: { status?: string }) => {
      if (changeInfo.status === 'complete') {
        markActive(tabId);
        schedulePersist();
      }
    });

    chrome.windows.onFocusChanged.addListener(async (windowId: number) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) return;
      const [activeTab] = await chrome.tabs.query({ active: true, windowId });
      if (activeTab?.id !== undefined) {
        markActive(activeTab.id);
        schedulePersist();
      }
    });
  },

  getLastActiveAt(tabId: number): number {
    return activityCache[tabId] ?? Date.now();
  },

  getInactiveMs(tabId: number): number {
    return getEffectiveInactiveMs(this.getLastActiveAt(tabId));
  },

  getActivityMap(): Record<number, number> {
    return activityCache;
  },
};
