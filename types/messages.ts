import type { TabSnapshot } from './tab';
import type { MemorySnapshot } from './memory';
import type { RulesConfig, Rule } from './rules';
import type { AISettings, ClassificationResult } from './ai';
import type { UiSettings } from './ui';

export type MessageType =
  | 'GET_STATE'
  | 'REFRESH_STATE'
  | 'GET_RULES'
  | 'GET_TAB_SNAPSHOTS'
  | 'GET_MEMORY_HISTORY'
  | 'SLEEP_TAB'
  | 'SLEEP_ALL_INACTIVE'
  | 'CLOSE_SLEEPING_TABS'
  | 'WAKE_TAB'
  | 'CLASSIFY_TABS'
  | 'CLASSIFY_TAB'
  | 'GROUP_BY_CATEGORY'
  | 'UNGROUP_ALL'
  | 'UPDATE_RULES'
  | 'UPDATE_AI_SETTINGS'
  | 'UPDATE_UI_SETTINGS'
  | 'STATE_UPDATE';

export interface GetStateResponse {
  snapshots: TabSnapshot[];
  latestMemory: MemorySnapshot | null;
  rules: RulesConfig;
  aiSettings: AISettings;
  uiSettings: UiSettings;
}

export interface StateUpdatePayload {
  snapshots?: TabSnapshot[];
  latestMemory?: MemorySnapshot;
}

export interface MessageRequest<T extends MessageType = MessageType, P = unknown> {
  type: T;
  payload?: P;
}

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
