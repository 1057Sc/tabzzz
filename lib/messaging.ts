import type { MessageRequest, MessageResponse, MessageType, GetStateResponse, StateUpdatePayload } from '../types/messages';
import type { RulesConfig } from '../types/rules';
import type { AISettings } from '../types/ai';
import type { UiSettings } from '../types/ui';

export function sendMessage<T = unknown>(
  type: MessageType,
  payload?: unknown,
): Promise<MessageResponse<T>> {
  const request: MessageRequest = { type, payload };
  return chrome.runtime.sendMessage(request);
}

export function onMessage(
  handler: (request: MessageRequest, sender: chrome.runtime.MessageSender, sendResponse: (response: MessageResponse) => void) => void | boolean,
): void {
  chrome.runtime.onMessage.addListener(handler);
}

// Typed convenience helpers
export const api = {
  getState: () => sendMessage<GetStateResponse>('GET_STATE'),
  refreshState: () => sendMessage<GetStateResponse>('REFRESH_STATE'),
  getTabSnapshots: () => sendMessage('GET_TAB_SNAPSHOTS'),
  getMemoryHistory: () => sendMessage('GET_MEMORY_HISTORY'),
  sleepTab: (tabId: number) => sendMessage('SLEEP_TAB', { tabId }),
  sleepAllInactive: () => sendMessage('SLEEP_ALL_INACTIVE'),
  closeSleepingTabs: () => sendMessage<{ count: number }>('CLOSE_SLEEPING_TABS'),
  wakeTab: (tabId: number) => sendMessage('WAKE_TAB', { tabId }),
  classifyTabs: () => sendMessage('CLASSIFY_TABS'),
  classifyTab: (tabId: number) => sendMessage('CLASSIFY_TAB', { tabId }),
  groupByCategory: () => sendMessage('GROUP_BY_CATEGORY'),
  ungroupAll: () => sendMessage('UNGROUP_ALL'),
  getRules: () => sendMessage('GET_RULES'),
  updateRules: (rules: RulesConfig) => sendMessage('UPDATE_RULES', rules),
  updateAISettings: (settings: AISettings) => sendMessage('UPDATE_AI_SETTINGS', settings),
  updateUiSettings: (settings: UiSettings) => sendMessage('UPDATE_UI_SETTINGS', settings),
};

export function broadcastStateUpdate(payload: StateUpdatePayload): void {
  chrome.runtime.sendMessage({ type: 'STATE_UPDATE', payload }).catch(() => {
    // No listeners open — that's fine
  });
}
