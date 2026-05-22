import { defineBackground } from 'wxt/utils/define-background';
import { StorageService } from '../services/storage/StorageService';
import { TabLifecycleManager } from '../services/tabs/TabLifecycleManager';
import { MemoryMonitor } from '../services/memory/MemoryMonitor';
import { RulesEngine } from '../services/rules/RulesEngine';
import { TabSleepService } from '../services/tabs/TabSleepService';
import { TabGroupService } from '../services/tabs/TabGroupService';
import { browser } from 'wxt/browser';
import { classifyUnclassifiedTabs, classifyTab } from '../services/ai/AIClassifier';
import { broadcastStateUpdate } from '../lib/messaging';
import { ALARM_NAMES, POLL_INTERVAL_MINUTES, CLASSIFY_INTERVAL_MINUTES, GROUP_SYNC_INTERVAL_MINUTES } from '../lib/constants';
import type { AISettings } from '../types/ai';
import type { RulesConfig } from '../types/rules';
import type { UiSettings } from '../types/ui';

let initPromise: Promise<void> | null = null;
let badgeUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
let sidePanelPortCount = 0;
let sidePanelSyncTimeout: ReturnType<typeof setTimeout> | null = null;

const SIDE_PANEL_PORT_NAME = 'tabzzz:sidepanel';
const SIDE_PANEL_SYNC_DEBOUNCE_MS = 800;

export default defineBackground({
  type: 'module',
  main() {
    // Initialize on install/update
    browser.runtime.onInstalled.addListener(async () => {
      await init();
      await registerAlarms();
      await applyCurrentUiSettings();
      await updateSleepBadge();
    });

    // Re-initialize when SW wakes up
    browser.runtime.onStartup.addListener(async () => {
      await init();
      await registerAlarms();
      await applyCurrentUiSettings();
      await updateSleepBadge();
    });

    // Register alarm handler at top level (required for MV3 SW)
    browser.alarms.onAlarm.addListener(handleAlarm);

    // Register message handler at top level
    browser.runtime.onMessage.addListener(handleMessage);
    browser.runtime.onConnect.addListener(handleConnect);

    // Do initial setup
    init().then(async () => {
      await registerAlarms();
      await applyCurrentUiSettings();
      await updateSleepBadge();
    });

    browser.tabs.onRemoved.addListener(() => {
      scheduleSleepBadgeUpdate();
      scheduleSidePanelStateSync();
    });

    browser.tabs.onCreated.addListener(() => {
      scheduleSidePanelStateSync();
    });

    browser.tabs.onUpdated.addListener((_tabId: number, changeInfo: any) => {
      if (typeof changeInfo.discarded === 'boolean') scheduleSleepBadgeUpdate();
      if (hasMeaningfulTabUpdate(changeInfo)) scheduleSidePanelStateSync();
    });

    browser.tabs.onActivated.addListener(() => {
      scheduleSidePanelStateSync();
    });

    browser.tabs.onMoved.addListener(() => {
      scheduleSidePanelStateSync();
    });

    browser.tabs.onAttached.addListener(() => {
      scheduleSidePanelStateSync();
    });

    browser.tabs.onDetached.addListener(() => {
      scheduleSidePanelStateSync();
    });

    browser.tabGroups.onCreated.addListener(() => {
      scheduleSidePanelStateSync();
    });

    browser.tabGroups.onUpdated.addListener(() => {
      scheduleSidePanelStateSync();
    });

    browser.tabGroups.onRemoved.addListener(() => {
      scheduleSidePanelStateSync();
    });
  },
});

async function applyCurrentUiSettings(): Promise<void> {
  await applyUiSettings(await StorageService.getUiSettings());
}

async function applyUiSettings(settings: UiSettings): Promise<void> {
  await Promise.all([
    browser.sidePanel.setPanelBehavior({
      openPanelOnActionClick: settings.sidebarModeEnabled,
    }).catch(() => { }),
    browser.action.setPopup({
      popup: settings.sidebarModeEnabled ? '' : 'sidepanel.html?surface=popup',
    }).catch(() => { }),
  ]);
}

function handleConnect(port: any): void {
  if (port.name !== SIDE_PANEL_PORT_NAME) return;

  sidePanelPortCount += 1;
  scheduleSidePanelStateSync();

  port.onDisconnect.addListener(() => {
    sidePanelPortCount = Math.max(0, sidePanelPortCount - 1);
    if (sidePanelPortCount === 0 && sidePanelSyncTimeout) {
      clearTimeout(sidePanelSyncTimeout);
      sidePanelSyncTimeout = null;
    }
  });
}

function hasMeaningfulTabUpdate(changeInfo: Record<string, unknown>): boolean {
  return [
    'audible',
    'discarded',
    'favIconUrl',
    'groupId',
    'mutedInfo',
    'pinned',
    'status',
    'title',
    'url',
  ].some(key => key in changeInfo);
}

function formatSleepBadgeText(count: number): string {
  if (count <= 0) return '';
  if (count > 99) return '99+';
  return `${count}z`;
}

async function setSleepBadge(count: number): Promise<void> {
  await Promise.all([
    browser.action.setBadgeText({ text: formatSleepBadgeText(count) }).catch(() => { }),
    browser.action.setBadgeBackgroundColor({ color: '#2563eb' }).catch(() => { }),
  ]);
}

async function updateSleepBadge(count?: number): Promise<void> {
  const sleepingCount = count ?? (await browser.tabs.query({})).filter(tab => tab.discarded).length;
  await setSleepBadge(sleepingCount);
}

function scheduleSleepBadgeUpdate(): void {
  if (badgeUpdateTimeout) clearTimeout(badgeUpdateTimeout);
  badgeUpdateTimeout = setTimeout(() => {
    badgeUpdateTimeout = null;
    updateSleepBadge().catch(() => { });
  }, 250);
}

function scheduleSidePanelStateSync(): void {
  if (sidePanelPortCount === 0) return;

  if (sidePanelSyncTimeout) clearTimeout(sidePanelSyncTimeout);
  sidePanelSyncTimeout = setTimeout(() => {
    sidePanelSyncTimeout = null;
    syncSidePanelState().catch(() => { });
  }, SIDE_PANEL_SYNC_DEBOUNCE_MS);
}

async function syncSidePanelState(): Promise<void> {
  if (sidePanelPortCount === 0) return;

  const { snapshot, snapshots } = await MemoryMonitor.poll({ force: true, writeHistory: false });
  broadcastStateUpdate({ snapshots, latestMemory: snapshot });
  await updateSleepBadge(snapshot.sleeping);
}

async function init(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await StorageService.init();
      await Promise.all([
        TabLifecycleManager.init(),
        MemoryMonitor.init(),
      ]);
    })();
  }
  await initPromise;
}

async function registerAlarms(): Promise<void> {
  browser.alarms.create(ALARM_NAMES.POLL_MEMORY, { periodInMinutes: POLL_INTERVAL_MINUTES });
  await browser.alarms.clear(ALARM_NAMES.POLL_RULES);

  const [settings, rules] = await Promise.all([
    StorageService.getAISettings(),
    StorageService.getRules(),
  ]);
  await Promise.all([
    syncClassificationAlarm(settings),
    syncGroupSyncAlarm(rules),
  ]);
}

async function syncClassificationAlarm(settings: AISettings): Promise<void> {
  if (settings.provider !== 'disabled' && settings.classifyOnLoad) {
    browser.alarms.create(ALARM_NAMES.CLASSIFY_BATCH, { periodInMinutes: CLASSIFY_INTERVAL_MINUTES });
    return;
  }
  await browser.alarms.clear(ALARM_NAMES.CLASSIFY_BATCH);
}

function hasEnabledCategorySchedule(rules: RulesConfig): boolean {
  return rules.rules.some(r => r.type === 'categorySchedule' && r.enabled);
}

async function syncGroupSyncAlarm(rules: RulesConfig): Promise<void> {
  if (hasEnabledCategorySchedule(rules)) {
    browser.alarms.create(ALARM_NAMES.GROUP_SYNC, { periodInMinutes: GROUP_SYNC_INTERVAL_MINUTES });
    return;
  }
  await browser.alarms.clear(ALARM_NAMES.GROUP_SYNC);
}

async function handleAlarm(alarm: any): Promise<void> {
  switch (alarm.name) {
    case ALARM_NAMES.POLL_MEMORY: {
      const { snapshot, snapshots } = await MemoryMonitor.poll({ force: true, writeHistory: true });
      const changed = await RulesEngine.evaluate(snapshots, snapshot);
      if (changed > 0) {
        const updated = await MemoryMonitor.poll({ force: true, writeHistory: false });
        broadcastStateUpdate({ snapshots: updated.snapshots, latestMemory: updated.snapshot });
        await updateSleepBadge(updated.snapshot.sleeping);
      } else {
        broadcastStateUpdate({ snapshots, latestMemory: snapshot });
        await updateSleepBadge(snapshot.sleeping);
      }
      break;
    }
    case ALARM_NAMES.POLL_RULES: {
      const changed = await RulesEngine.evaluate();
      if (changed > 0) {
        const updated = await MemoryMonitor.poll({ force: true, writeHistory: false });
        broadcastStateUpdate({ snapshots: updated.snapshots, latestMemory: updated.snapshot });
        await updateSleepBadge(updated.snapshot.sleeping);
      } else {
        await updateSleepBadge();
      }
      break;
    }
    case ALARM_NAMES.CLASSIFY_BATCH: {
      const settings = await StorageService.getAISettings();
      if (settings.classifyOnLoad) {
        await classifyUnclassifiedTabs(settings);
      }
      break;
    }
    case ALARM_NAMES.GROUP_SYNC: {
      const rules = await StorageService.getRules();
      if (hasEnabledCategorySchedule(rules)) await TabGroupService.groupByCategory();
      break;
    }
  }
}

function handleMessage(
  request: { type: string; payload?: unknown },
  sender: any,
  sendResponse: (response: unknown) => void,
): boolean {
  handleMessageAsync(request, sender, sendResponse);
  return true; // Keep channel open for async response
}

async function handleMessageAsync(
  request: { type: string; payload?: unknown },
  sender: any,
  sendResponse: (response: unknown) => void,
): Promise<void> {
  try {
    switch (request.type) {
      case 'GET_STATE': {
        const { snapshot, snapshots } = await MemoryMonitor.getState();
        const [rules, aiSettings, uiSettings] = await Promise.all([
          StorageService.getRules(),
          StorageService.getAISettings(),
          StorageService.getUiSettings(),
        ]);
        sendResponse({ success: true, data: { snapshots, latestMemory: snapshot, rules, aiSettings, uiSettings } });
        break;
      }

      case 'REFRESH_STATE': {
        const { snapshot, snapshots } = await MemoryMonitor.poll({ force: true, writeHistory: false });
        const [rules, aiSettings, uiSettings] = await Promise.all([
          StorageService.getRules(),
          StorageService.getAISettings(),
          StorageService.getUiSettings(),
        ]);
        await updateSleepBadge(snapshot.sleeping);
        sendResponse({ success: true, data: { snapshots, latestMemory: snapshot, rules, aiSettings, uiSettings } });
        break;
      }

      case 'GET_RULES': {
        const rules = await StorageService.getRules();
        sendResponse({ success: true, data: rules });
        break;
      }

      case 'GET_TAB_SNAPSHOTS': {
        sendResponse({ success: true, data: MemoryMonitor.getCachedSnapshots() });
        break;
      }

      case 'GET_MEMORY_HISTORY': {
        const history = await StorageService.getHistory();
        sendResponse({ success: true, data: history });
        break;
      }

      case 'SLEEP_TAB': {
        const { tabId } = request.payload as { tabId: number };
        const ok = await TabSleepService.sleep(tabId);
        await updateSleepBadge();
        sendResponse({ success: ok });
        break;
      }

      case 'SLEEP_ALL_INACTIVE': {
        const count = await TabSleepService.sleepAllInactive();
        await updateSleepBadge();
        sendResponse({ success: true, data: { count } });
        break;
      }

      case 'CLOSE_SLEEPING_TABS': {
        const count = await TabSleepService.closeSleepingTabs();
        await updateSleepBadge();
        sendResponse({ success: true, data: { count } });
        break;
      }

      case 'WAKE_TAB': {
        const { tabId } = request.payload as { tabId: number };
        const ok = await TabSleepService.wake(tabId);
        await updateSleepBadge();
        sendResponse({ success: ok });
        break;
      }

      case 'CLASSIFY_TABS': {
        const settings = await StorageService.getAISettings();
        await classifyUnclassifiedTabs(settings);
        sendResponse({ success: true });
        break;
      }

      case 'CLASSIFY_TAB': {
        const { tabId } = request.payload as { tabId: number };
        const tab = await browser.tabs.get(tabId);
        const settings = await StorageService.getAISettings();
        const result = await classifyTab(tabId, tab.url ?? '', tab.title ?? '', settings);
        sendResponse({ success: true, data: result });
        break;
      }

      case 'GROUP_BY_CATEGORY': {
        await TabGroupService.groupByCategory();
        sendResponse({ success: true });
        break;
      }

      case 'UNGROUP_ALL': {
        await TabGroupService.ungroupAll();
        sendResponse({ success: true });
        break;
      }

      case 'UPDATE_RULES': {
        const rules = request.payload as RulesConfig;
        await StorageService.saveRules(rules);
        await syncGroupSyncAlarm(rules);
        sendResponse({ success: true });
        break;
      }

      case 'UPDATE_AI_SETTINGS': {
        const settings = request.payload as AISettings;
        await StorageService.saveAISettings(settings);
        await syncClassificationAlarm(settings);
        sendResponse({ success: true });
        break;
      }

      case 'UPDATE_UI_SETTINGS': {
        const settings = request.payload as UiSettings;
        await applyUiSettings(settings);
        await transitionUiSurface(settings, sender);
        await StorageService.saveUiSettings(settings);
        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (err) {
    sendResponse({ success: false, error: String(err) });
  }
}

async function transitionUiSurface(settings: UiSettings, sender: any): Promise<void> {
  const windowId = await getTargetWindowId(sender);

  if (settings.sidebarModeEnabled) {
    await browser.sidePanel.open({ windowId }).catch(() => { });
    return;
  }

  if (typeof browser.sidePanel.close === 'function') {
    await browser.sidePanel.close({ windowId }).catch(() => { });
  }

  if (typeof browser.action.openPopup === 'function') {
    await browser.action.openPopup().catch(() => { });
  }
}

async function getTargetWindowId(sender: any): Promise<number> {
  if (typeof sender?.tab?.windowId === 'number') return sender.tab.windowId;

  const currentWindow = await browser.windows.getLastFocused().catch(() => undefined);
  return typeof currentWindow?.id === 'number' ? currentWindow.id : browser.windows.WINDOW_ID_CURRENT;
}
