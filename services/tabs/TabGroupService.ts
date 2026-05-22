import type { TabCategory } from '../../types/tab';
import { CATEGORY_FULL_LABELS, TAB_GROUP_COLORS } from '../../lib/constants';
import { StorageService } from '../storage/StorageService';

const groupCache: Partial<Record<TabCategory, number>> = {};

async function findOrCreateGroup(
  windowId: number,
  category: TabCategory,
): Promise<number> {
  // Check if group still exists
  if (groupCache[category]) {
    try {
      await chrome.tabGroups.get(groupCache[category]!);
      return groupCache[category]!;
    } catch {
      delete groupCache[category];
    }
  }

  // Search existing groups in window
  const groups = await chrome.tabGroups.query({ windowId });
  const existing = groups.find((g: { id: number; title?: string }) => g.title === CATEGORY_FULL_LABELS[category]);
  if (existing) {
    groupCache[category] = existing.id;
    return existing.id;
  }

  // Create a new group (first need a tab to put in it temporarily)
  // We'll create via chrome.tabs.group
  return -1; // will be created inline
}

export const TabGroupService = {
  async groupByCategory(): Promise<void> {
    const [tabs, categories] = await Promise.all([
      chrome.tabs.query({}),
      StorageService.getTabCategories(),
    ]);

    // Group tabs by their category per window
    const byWindowAndCategory = new Map<string, number[]>();

    for (const tab of tabs) {
      if (!tab.id) continue;
      const cat = categories[tab.id]?.category ?? 'uncategorized';
      const key = `${tab.windowId}:${cat}`;
      const arr = byWindowAndCategory.get(key) ?? [];
      arr.push(tab.id);
      byWindowAndCategory.set(key, arr);
    }

    for (const [key, tabIds] of byWindowAndCategory) {
      const [windowIdStr, catStr] = key.split(':');
      const windowId = parseInt(windowIdStr);
      const category = catStr as TabCategory;

      if (category === 'uncategorized' || tabIds.length === 0) continue;

      try {
        let groupId = groupCache[category];

        // Check if group exists
        if (groupId) {
          try {
            await chrome.tabGroups.get(groupId);
          } catch {
            groupId = undefined;
          }
        }

        // Add tabs to group (creates new group if groupId undefined)
        const newGroupId = await chrome.tabs.group({
          tabIds,
          ...(groupId ? { groupId } : {}),
        });

        groupCache[category] = newGroupId;

        // Set group title and color
        await chrome.tabGroups.update(newGroupId, {
          title: CATEGORY_FULL_LABELS[category],
          color: TAB_GROUP_COLORS[category],
        });
      } catch (err) {
        console.error(`TabGroupService: failed to group ${category}`, err);
      }
    }
  },

  async ungroupAll(): Promise<void> {
    const tabs = await chrome.tabs.query({ pinned: false });
    const grouped = tabs.filter((t: chrome.tabs.Tab) => t.id && t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE);
    if (grouped.length === 0) return;

    await chrome.tabs.ungroup(grouped.map((t: chrome.tabs.Tab) => t.id!));

    // Clear cache
    for (const key of Object.keys(groupCache) as TabCategory[]) {
      delete groupCache[key];
    }
  },
};
