import { browser } from 'wxt/browser';

const PROTECTED_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'about:', 'edge://'];

function isProtected(url: string): boolean {
  return PROTECTED_URL_PREFIXES.some(prefix => url.startsWith(prefix));
}

function isGrouped(tab: { groupId?: number }): boolean {
  return (tab.groupId ?? browser.tabGroups.TAB_GROUP_ID_NONE) !== browser.tabGroups.TAB_GROUP_ID_NONE;
}

export const TabSleepService = {
  async sleep(tabId: number): Promise<boolean> {
    try {
      const tab = await browser.tabs.get(tabId);
      if (!tab) return false;
      if (tab.active) return false; // Never discard the active tab
      if (tab.discarded) return true; // Already sleeping
      if (tab.pinned) return false;
      if (isGrouped(tab)) return false;
      if (isProtected(tab.url ?? '')) return false;

      await browser.tabs.discard(tabId);
      return true;
    } catch {
      return false;
    }
  },

  async wake(tabId: number): Promise<boolean> {
    try {
      // Reloading a discarded tab wakes it
      await browser.tabs.reload(tabId);
      return true;
    } catch {
      return false;
    }
  },

  async sleepAllInactive(exemptActiveTab = true): Promise<number> {
    const tabs = await browser.tabs.query({});
    let count = 0;

    for (const tab of tabs) {
      if (!tab.id) continue;
      if (tab.active && exemptActiveTab) continue;
      if (tab.discarded) continue;
      if (tab.pinned) continue;
      if (isGrouped(tab)) continue;
      if (tab.audible) continue;
      if (isProtected(tab.url ?? '')) continue;

      const ok = await this.sleep(tab.id);
      if (ok) count++;
    }

    return count;
  },

  async closeSleepingTabs(): Promise<number> {
    const tabs = await browser.tabs.query({});
    const tabIds = tabs
      .filter(tab =>
        tab.id !== undefined &&
        tab.discarded &&
        !tab.active &&
        !tab.pinned &&
        !isGrouped(tab) &&
        !isProtected(tab.url ?? '')
      )
      .map(tab => tab.id!);

    if (tabIds.length === 0) return 0;

    await browser.tabs.remove(tabIds);
    return tabIds.length;
  },
};
