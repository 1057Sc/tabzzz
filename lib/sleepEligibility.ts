import type { SleepRule } from '../types/rules';
import type { TabSnapshot } from '../types/tab';

const TAB_GROUP_ID_NONE = -1;
const PROTECTED_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'about:', 'edge://'];

export function isProtectedUrl(url?: string): boolean {
  return PROTECTED_URL_PREFIXES.some(prefix => url?.startsWith(prefix));
}

export function isGroupedTab(snapshot: TabSnapshot): boolean {
  return (snapshot.info.groupId ?? TAB_GROUP_ID_NONE) !== TAB_GROUP_ID_NONE;
}

export function matchesDomainPattern(url: string, pattern: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1);
    return hostname === pattern.slice(2) || hostname.endsWith(suffix);
  }

  return hostname === pattern;
}

export function isExemptDomain(url: string, exemptDomains?: string[]): boolean {
  if (!url || !exemptDomains?.length) return false;
  return exemptDomains.some(pattern => matchesDomainPattern(url, pattern));
}

export function getSleepBlockReason(
  snapshot: TabSnapshot,
  activeTabId: number | null,
  sleepRule?: SleepRule | null,
): string | null {
  if (snapshot.info.discarded) return 'Tab is already sleeping';
  if (snapshot.tabId === activeTabId) return 'Cannot sleep active tab';
  if (snapshot.info.pinned) return 'Pinned tabs stay awake';
  if (isGroupedTab(snapshot)) return 'Grouped tabs stay awake';
  if (isProtectedUrl(snapshot.info.url)) return 'Chrome restricts extensions from sleeping system pages';
  if (sleepRule?.exemptAudible && snapshot.info.audible) return 'Audio/video tabs stay awake';
  if (sleepRule?.exemptCategories?.includes(snapshot.metrics.category)) return 'This category is excluded from auto sleep';
  if (isExemptDomain(snapshot.info.url ?? '', sleepRule?.exemptDomains)) return 'This site is in Never sleep';
  return null;
}

export function isTabSleepEligible(
  snapshot: TabSnapshot,
  activeTabId: number | null,
  sleepRule?: SleepRule | null,
): boolean {
  return getSleepBlockReason(snapshot, activeTabId, sleepRule) === null;
}
