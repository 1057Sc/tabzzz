import React, { useEffect, useMemo, useState, useRef } from 'react';
import type { TabCategory, TabSnapshot } from '../../types/tab';
import type { RulesConfig } from '../../types/rules';
import { DEFAULT_FORGOTTEN_TABS_THRESHOLD_MS } from '../../types/rules';
import { api } from '../../lib/messaging';
import {
  ALL_CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_FULL_LABELS,
  MEMORY_THRESHOLDS,
} from '../../lib/constants';
import { formatBytes, formatBytesFull } from '../../lib/utils';
import { PlayIcon, ArchiveBoxIcon as ArchiveBoxSolidIcon, MoonIcon, TrashIcon, LinkIcon, MagnifyingGlassIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/solid';
import { ClockIcon, ServerStackIcon, SparklesIcon, TrashIcon as TrashOutlineIcon } from '@heroicons/react/24/outline';
import { browser } from 'wxt/browser';

interface Props {
  snapshots: TabSnapshot[];
  rules: RulesConfig | null;
  onRefresh: () => void;
  isZenMode?: boolean;
}

type SortKey = 'natural' | 'memory' | 'inactivity' | 'category';
type StatusFilter = 'all' | 'active' | 'sleeping';
type ToolbarBusy = 'sleep' | 'group' | 'closeSleeping';

const PROTECTED_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'about:', 'edge://'];
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const filterCategories: Array<'all' | TabCategory> = [
  'all',
  ...ALL_CATEGORIES.filter((category) => category !== 'uncategorized'),
];

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getMemoryColor(memoryBytes: number, isSleeping: boolean): string {
  if (isSleeping) return '#6366f1';
  if (memoryBytes > MEMORY_THRESHOLDS.WARN) return '#ef4444';
  if (memoryBytes > MEMORY_THRESHOLDS.OK) return '#f59e0b';
  return '#10b981';
}

function isProtectedUrl(url?: string): boolean {
  return PROTECTED_URL_PREFIXES.some(prefix => url?.startsWith(prefix));
}

function isGroupedTab(snapshot: TabSnapshot): boolean {
  return (snapshot.info.groupId ?? browser.tabGroups.TAB_GROUP_ID_NONE) !== browser.tabGroups.TAB_GROUP_ID_NONE;
}

function isSleepableTab(snapshot: TabSnapshot, activeTabId: number | null): boolean {
  return (
    !snapshot.info.discarded &&
    snapshot.tabId !== activeTabId &&
    !snapshot.info.pinned &&
    !isGroupedTab(snapshot) &&
    !isProtectedUrl(snapshot.info.url)
  );
}

function formatThresholdLabel(thresholdMs: number): string {
  if (thresholdMs >= DAY_MS && thresholdMs % DAY_MS === 0) return `${thresholdMs / DAY_MS}D`;
  if (thresholdMs >= HOUR_MS && thresholdMs % HOUR_MS === 0) return `${thresholdMs / HOUR_MS}H`;
  return `${Math.max(1, Math.round(thresholdMs / MINUTE_MS))}M`;
}

function CategoryBadge({ category }: { category: TabCategory }) {
  const color = CATEGORY_COLORS[category];
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest border backdrop-blur-sm whitespace-nowrap shrink-0"
      style={{
        backgroundColor: `${color}1f`,
        color,
        borderColor: `${color}4a`,
      }}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  primary = false,
  icon: Icon
}: {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  primary?: boolean;
  icon?: any;
}) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        const res = onClick();
        if (res instanceof Promise) res.catch(console.error);
      }}
      disabled={disabled}
      className={`glass-button flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'} ${primary ? 'bg-accent-purple/20 text-accent-purple border-accent-purple/30 hover:bg-accent-purple/30 shadow-[0_0_10px_rgba(168,85,247,0.2)]' : 'text-text-primary hover:bg-bg-hover'}`}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {!Icon && label.includes('Sleep') && <span className="text-[10px] font-black tracking-widest pt-[1px] font-comic">zᶻZ</span>}
      {label}
    </button>
  );
}

export default function TabsView({ snapshots, rules, onRefresh, isZenMode = false }: Props) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('natural');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TabCategory>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toolbarBusy, setToolbarBusy] = useState<ToolbarBusy | null>(null);
  const [groupBy, setGroupBy] = useState<'hybrid' | 'native' | 'domain'>('hybrid');
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string | number>>(new Set());
  const [isForgottenCollapsed, setIsForgottenCollapsed] = useState(false);
  const [isControlsExpanded, setIsControlsExpanded] = useState(false);
  const [pendingCloseKey, setPendingCloseKey] = useState<string | null>(null);

  // Track auto-collapsed states
  const previousSleepStates = useRef<Record<string, boolean>>({});

  // Native Chrome Tab Groups state
  const [nativeGroups, setNativeGroups] = useState<any[]>([]);

  useEffect(() => {
    // Fetch initial groups
    browser.tabGroups.query({}).then(setNativeGroups).catch(console.error);

    // Monitor group changes
    const updateGroups = () => browser.tabGroups.query({}).then(setNativeGroups).catch(console.error);
    browser.tabGroups.onCreated.addListener(updateGroups);
    browser.tabGroups.onUpdated.addListener(updateGroups);
    browser.tabGroups.onRemoved.addListener(updateGroups);

    // Track active tab
    const updateActiveTab = async () => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) setActiveTabId(tab.id);
      } catch (err) {
        console.error('Failed to query active tab:', err);
      }
    };
    updateActiveTab();

    const handleActivated = (activeInfo: any) => {
      setActiveTabId(activeInfo.tabId);
    };
    browser.tabs.onActivated.addListener(handleActivated);

    return () => {
      browser.tabGroups.onCreated.removeListener(updateGroups);
      browser.tabGroups.onUpdated.removeListener(updateGroups);
      browser.tabGroups.onRemoved.removeListener(updateGroups);
      browser.tabs.onActivated.removeListener(handleActivated);
    };
  }, []);

  useEffect(() => {
    if (!pendingCloseKey) return;
    const timeoutId = window.setTimeout(() => setPendingCloseKey(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [pendingCloseKey]);

  const filteredTabs = snapshots.filter((snapshot) => {
    const haystack = `${snapshot.info.title} ${snapshot.info.url} `.toLowerCase();
    const matchesSearch = !search.trim() || haystack.includes(search.trim().toLowerCase());
    const matchesCategory = categoryFilter === 'all' || snapshot.metrics.category === categoryFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && !snapshot.info.discarded) ||
      (statusFilter === 'sleeping' && snapshot.info.discarded);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const sortedTabs = [...filteredTabs].sort((left, right) => {
    if (sortKey === 'memory') {
      return (right.metrics.memoryBytes ?? 0) - (left.metrics.memoryBytes ?? 0);
    }
    if (sortKey === 'inactivity') {
      return (right.metrics.inactiveMs ?? 0) - (left.metrics.inactiveMs ?? 0);
    }
    if (sortKey === 'category') {
      return CATEGORY_FULL_LABELS[left.metrics.category].localeCompare(CATEGORY_FULL_LABELS[right.metrics.category]);
    }
    // Default to 'natural' order
    if (left.info.windowId !== right.info.windowId) {
      return left.info.windowId - right.info.windowId;
    }
    return left.info.index - right.info.index;
  });

  // Group tabs by selected method
  const { groupedTabs, forgottenTabs } = useMemo(() => {
    const groups = new Map<string | number, TabSnapshot[]>();
    const forgotten: TabSnapshot[] = [];
    const thresholdMs = rules?.lruThresholdMs ?? DEFAULT_FORGOTTEN_TABS_THRESHOLD_MS;

    sortedTabs.forEach(tab => {
      const inactiveMs = tab.metrics.inactiveMs ?? 0;
      if (inactiveMs > thresholdMs && tab.tabId !== activeTabId) {
        forgotten.push(tab);
        return; // skip normal grouping
      }

      const isUnassigned = (tab.info.groupId ?? browser.tabGroups.TAB_GROUP_ID_NONE) === browser.tabGroups.TAB_GROUP_ID_NONE;
      const gId = tab.info.groupId ?? browser.tabGroups.TAB_GROUP_ID_NONE;

      if (groupBy === 'native' || (groupBy === 'hybrid' && !isUnassigned)) {
        if (!groups.has(gId)) groups.set(gId, []);
        groups.get(gId)!.push(tab);
      } else {
        let domain = getDomain(tab.info.url);
        if (!domain || domain === '') domain = 'Other';
        if (!groups.has(domain)) groups.set(domain, []);
        groups.get(domain)!.push(tab);
      }
    });

    // Merge single-item domain groups into "Ungrouped Sites"
    if (groupBy === 'domain' || groupBy === 'hybrid') {
      const singletons: TabSnapshot[] = [];
      const UNGROUPED_KEY = 'Single Tabs';

      for (const [key, items] of groups.entries()) {
        if (typeof key === 'string' && items.length === 1) {
          singletons.push(items[0]);
          groups.delete(key);
        }
      }

      if (singletons.length > 0) {
        groups.set(UNGROUPED_KEY, singletons);
      }
    }

    // Sort appropriately
    let finalGroups = groups;
    if (groupBy === 'domain') {
      finalGroups = new Map([...groups.entries()].sort((a, b) => {
        if (a[0] === 'Single Tabs') return 1; // Put single tabs at bottom
        if (b[0] === 'Single Tabs') return -1;
        return b[1].length - a[1].length;
      }));
    } else if (groupBy === 'hybrid') {
      const sorted = [...groups.entries()].sort((a, b) => {
        // Put native groups (numbers) first, then sort domains by size
        if (typeof a[0] === 'number' && typeof b[0] !== 'number') return -1;
        if (typeof a[0] !== 'number' && typeof b[0] === 'number') return 1;
        if (typeof a[0] === 'number' && typeof b[0] === 'number') return a[0] - b[0];
        if (a[0] === 'Single Tabs') return 1;
        if (b[0] === 'Single Tabs') return -1;
        return b[1].length - a[1].length;
      });
      finalGroups = new Map(sorted);
    }

    return { groupedTabs: finalGroups, forgottenTabs: forgotten };
  }, [sortedTabs, groupBy, activeTabId, rules]);

  const totalVisibleMemory = filteredTabs.reduce((sum, snapshot) => sum + (snapshot.metrics.memoryBytes ?? 0), 0);
  const closeableSleepingCount = snapshots.filter(snapshot =>
    snapshot.info.discarded &&
    !snapshot.info.pinned &&
    !isGroupedTab(snapshot) &&
    snapshot.tabId !== activeTabId &&
    !isProtectedUrl(snapshot.info.url)
  ).length;

  async function runTabAction(tabId: number, action: () => Promise<unknown>) {
    setBusyId(tabId);
    try {
      await action();
    } finally {
      setBusyId(null);
      await onRefresh();
    }
  }

  async function switchToTab(tabId: number, windowId: number) {
    try {
      await browser.tabs.update(tabId, { active: true });
      await browser.windows.update(windowId, { focused: true });
    } catch (err) {
      console.error('Failed to switch tab:', err);
    }
  }

  async function handleSleepAll() {
    setToolbarBusy('sleep');
    try {
      await api.sleepAllInactive();
    } finally {
      setToolbarBusy(null);
      await onRefresh();
    }
  }

  async function handleCloseSleepingTabs() {
    if (closeableSleepingCount === 0) return;

    if (pendingCloseKey !== 'sleeping') {
      setPendingCloseKey('sleeping');
      return;
    }

    setToolbarBusy('closeSleeping');
    try {
      await api.closeSleepingTabs();
    } finally {
      setPendingCloseKey(null);
      setToolbarBusy(null);
      await onRefresh();
    }
  }

  async function handleSleepGroup(groupTabs: TabSnapshot[], groupId?: string | number) {
    const toSleep = groupTabs.filter(t => isSleepableTab(t, activeTabId));
    if (toSleep.length === 0) return;
    setToolbarBusy('sleep');
    try {
      for (const t of toSleep) {
        await api.sleepTab(t.tabId);
      }
      if (groupId !== undefined) {
        if (groupId === 'forgotten') {
          setIsForgottenCollapsed(true);
        } else {
          setCollapsedGroups(prev => new Set(prev).add(groupId));
        }
      }
    } finally {
      setToolbarBusy(null);
      await onRefresh();
    }
  }

  async function handleCloseGroup(groupTabs: TabSnapshot[], closeKey: string) {
    const toClose = groupTabs
      .filter(t => !isProtectedUrl(t.info.url))
      .map(t => t.tabId);
    if (toClose.length === 0) return;

    if (pendingCloseKey !== closeKey) {
      setPendingCloseKey(closeKey);
      return;
    }

    setToolbarBusy('group'); // visual busy indicator
    try {
      await browser.tabs.remove(toClose);
    } finally {
      setPendingCloseKey(null);
      setToolbarBusy(null);
      await onRefresh();
    }
  }

  async function handleGroupByCategory() {
    setToolbarBusy('group');
    try {
      await api.classifyTabs();
      await api.groupByCategory();
    } finally {
      setToolbarBusy(null);
      await onRefresh();
    }
  }

  function toggleGroup(groupId: string | number) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  const forgottenThresholdMs = rules?.lruThresholdMs ?? DEFAULT_FORGOTTEN_TABS_THRESHOLD_MS;
  const forgottenThresholdLabel = formatThresholdLabel(forgottenThresholdMs);
  const isForgottenSectionVisible = search.trim() === '' && statusFilter === 'all' && forgottenTabs.length > 0;
  const hasCollapsibleSections = groupedTabs.size > 0 || isForgottenSectionVisible;

  const allSectionsAreCollapsed = useMemo(() => {
    if (!hasCollapsibleSections) return true;
    for (const groupId of groupedTabs.keys()) {
      if (!collapsedGroups.has(groupId)) return false;
    }
    return !isForgottenSectionVisible || isForgottenCollapsed;
  }, [groupedTabs, collapsedGroups, hasCollapsibleSections, isForgottenSectionVisible, isForgottenCollapsed]);

  function toggleAllGroups() {
    if (allSectionsAreCollapsed) {
      setCollapsedGroups(new Set());
      if (isForgottenSectionVisible) setIsForgottenCollapsed(false);
    } else {
      setCollapsedGroups(new Set(groupedTabs.keys()));
      if (isForgottenSectionVisible) setIsForgottenCollapsed(true);
    }
  }

  // Track previous sleepable counts for safe auto-collapse
  const prevSleepableCountsRef = useRef<Record<string, number>>({});

  // Auto-collapse groups when they transition to fully sleeping
  useEffect(() => {
    let shouldUpdate = false;
    const nextCollapsed = new Set(collapsedGroups);
    const newCounts: Record<string, number> = {};

    for (const [groupId, tabs] of groupedTabs.entries()) {
      const gIdStr = groupId.toString();
      const awakeCount = tabs.filter(t => !t.info.discarded).length;
      newCounts[gIdStr] = awakeCount;

      const prevCount = prevSleepableCountsRef.current[gIdStr];

      // Auto-collapse ONLY IF the group transitions from having awake tabs (or unknown) to 0 awake tabs
      if (tabs.length > 0 && awakeCount === 0) {
        if (prevCount !== undefined && prevCount > 0 && !nextCollapsed.has(groupId)) {
          nextCollapsed.add(groupId);
          shouldUpdate = true;
        }
      }
    }

    prevSleepableCountsRef.current = newCounts;

    if (shouldUpdate) {
      setCollapsedGroups(nextCollapsed);
    }
  }, [groupedTabs, activeTabId]);

  const firstWakeableTabId = useMemo(() => {
    for (const tabs of groupedTabs.values()) {
      const found = tabs.find(t => isSleepableTab(t, activeTabId));
      if (found) return found.tabId;
    }
    return null;
  }, [groupedTabs, activeTabId]);

  const baseInputClass = "bg-bg-elevated text-text-primary border border-bg-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-colors";

  function renderTabRow(snapshot: TabSnapshot) {
    const isSleeping = snapshot.info.discarded;
    const memoryBytes = snapshot.metrics.memoryBytes ?? 0;
    const memoryColor = getMemoryColor(memoryBytes, isSleeping);
    const isBusy = busyId === snapshot.tabId;
    const isActiveTab = activeTabId === snapshot.tabId;
    const isProtectedTabUrl = isProtectedUrl(snapshot.info.url);
    const isGrouped = isGroupedTab(snapshot);
    const sleepBlockReason = isActiveTab
      ? 'Cannot sleep active tab'
      : isProtectedTabUrl
        ? 'Chrome restricts extensions from sleeping system pages'
        : snapshot.info.pinned
          ? 'Pinned tabs stay awake'
          : isGrouped
            ? 'Grouped tabs stay awake'
            : null;
    const canRunSleepAction = isSleeping || sleepBlockReason === null;
    const sleepButtonTitle = isSleeping ? 'Click to wake tab' : sleepBlockReason ?? 'Click to sleep tab';

    let displayTitle = snapshot.info.title || snapshot.info.url;
    if (displayTitle.startsWith('zᶻZ ')) displayTitle = displayTitle.substring(4);
    if (displayTitle.startsWith('zZz ')) displayTitle = displayTitle.substring(4); // Legacy fallback
    if (displayTitle.startsWith('💤 ')) displayTitle = displayTitle.substring(3); // Legacy fallback

    return (
      <div
        key={snapshot.tabId}
        className={`glass-card border rounded-lg mb-1 transition-all duration-300 overflow-hidden ${isBusy ? 'opacity-50 pointer-events-none' : ''} ${isActiveTab ? 'border-accent-cyan/50 ring-1 ring-accent-cyan/30 shadow-[0_0_15px_rgba(34,211,238,0.15)] bg-accent-cyan/5' : 'border-white/5 hover:border-white/10'}`}
      >
        {/* Compact Header (Always Visible) */}
        <div className="p-1 px-1 flex items-center gap-1.5 group relative">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full group-hover:translate-x-full duration-1000 transition-transform pointer-events-none"></div>

          <div
            className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              switchToTab(snapshot.tabId, snapshot.info.windowId);
            }}
            title="Click to switch to this tab"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!canRunSleepAction) return;
                if (isSleeping) {
                  runTabAction(snapshot.tabId, () => api.wakeTab(snapshot.tabId));
                } else {
                  runTabAction(snapshot.tabId, () => api.sleepTab(snapshot.tabId));
                }
              }}
              disabled={isBusy || !canRunSleepAction}
              className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 relative transition-transform ${!canRunSleepAction ? (isActiveTab ? 'border border-accent-cyan/50 bg-bg-elevated cursor-help opacity-40' : 'border border-white/5 bg-bg-elevated cursor-help opacity-40') : 'border border-white/5 bg-bg-elevated hover:bg-white/10 hover:border-white/20 hover:scale-110 active:scale-95 cursor-pointer'}`}
              title={isZenMode ? `${displayTitle}\n${sleepButtonTitle}` : sleepButtonTitle}
            >
              {snapshot.info.faviconUrl ? (
                <div className="w-full h-full p-[2px] bg-white/10 rounded flex items-center justify-center">
                  <img src={snapshot.info.faviconUrl} className={`w-full h-full object-contain transition-opacity ${isSleeping ? 'opacity-40' : 'opacity-100'}`} onError={(e) => e.currentTarget.style.display = 'none'} />
                </div>
              ) : (
                <LinkIcon className={`w-3.5 h-3.5 text-text-muted transition-opacity ${isSleeping ? 'opacity-40' : 'opacity-100'}`} />
              )}

              {/* Status Badge Overlay */}
              {(isSleeping || isActiveTab) && (
                <div className="absolute -bottom-1 -right-1 bg-bg-elevated border border-white/10 rounded-full w-3.5 h-3.5 flex items-center justify-center shadow-lg ring-1 ring-black/50 overflow-hidden">
                  {isSleeping ? (
                    <span className="text-[7px] font-black leading-none text-accent-blue font-comic scale-90">zᶻZ</span>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan shadow-[0_0_4px_rgba(34,211,238,0.8)]"></span>
                  )}
                </div>
              )}

              {/* Onboarding Cue */}
              {!isSleeping && canRunSleepAction && snapshot.tabId === firstWakeableTabId && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2" title="Tip: Click icon to sleep/wake">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-cyan opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-cyan border border-bg-elevated"></span>
                </span>
              )}
            </button>

            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <span className={`text-xs font-medium truncate min-w-0 ${isSleeping ? 'text-text-muted/80' : isActiveTab ? 'text-accent-cyan font-bold' : 'text-text-primary'}`}>
                {displayTitle}
              </span>
              <div className="flex items-center gap-1 shrink-0" style={{ color: memoryColor }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: memoryColor, boxShadow: `0 0 4px ${memoryColor}` }}></span>
                <span className="text-[10px] font-mono font-bold tracking-tight whitespace-nowrap">{formatBytesFull(memoryBytes)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Helper to resolve group UI mapping
  const resolveGroupInfo = (groupId: string | number) => {
    if (typeof groupId === 'string') {
      return { title: groupId, color: '#94a3b8' }; // Slate for domains
    }

    if (groupId === browser.tabGroups.TAB_GROUP_ID_NONE) {
      return { title: 'Unassigned Tabs', color: '#64748b' }; // Slate
    }
    const group = nativeGroups.find(g => g.id === groupId);
    return {
      title: group?.title || `Native Group(${group?.color})`,
      color: group?.color ? groupColorToHex(group.color) : '#818cf8'
    };
  };

  return (
    <div className="px-1 py-1 md:px-2 md:py-2 mx-auto pb-24">
      {/* Search Bar */}
      {!isZenMode && (
        <div className="relative mb-2">
          <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-muted absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tabs..."
            className={`w-full pl-7 pr-9 ${baseInputClass}`}
          />
          <button
            type="button"
            onClick={toggleAllGroups}
            disabled={!hasCollapsibleSections}
            aria-label={allSectionsAreCollapsed ? 'Expand all tab groups' : 'Collapse all tab groups'}
            title={!hasCollapsibleSections ? 'No groups to collapse' : allSectionsAreCollapsed ? 'Expand all tab groups' : 'Collapse all tab groups'}
            className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md border border-bg-border bg-bg-elevated text-text-muted transition-colors hover:border-white/20 hover:bg-white/5 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {allSectionsAreCollapsed ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronUpIcon className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      {!isZenMode && closeableSleepingCount > 0 && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-status-crit/20 bg-status-crit/5 px-2 py-1.5">
          <div className="min-w-0 flex items-center gap-1.5 text-[11px] font-semibold text-text-muted">
            <span className="shrink-0 text-accent-blue font-black tracking-widest font-comic">zᶻZ</span>
            <span className="truncate">{closeableSleepingCount} sleeping</span>
          </div>
          <button
            onClick={handleCloseSleepingTabs}
            disabled={toolbarBusy !== null}
            className={`shrink-0 flex w-[72px] items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${pendingCloseKey === 'sleeping' ? 'text-white bg-status-crit/20 border-status-crit/50' : 'text-status-crit/80 hover:text-status-crit border-status-crit/20 hover:border-status-crit/40 hover:bg-status-crit/10'}`}
            title={pendingCloseKey === 'sleeping' ? `Click again to close ${closeableSleepingCount} sleeping tabs` : `Close ${closeableSleepingCount} sleeping tabs`}
          >
            {pendingCloseKey === 'sleeping' ? (
              <span>Confirm</span>
            ) : (
              <>
                <TrashOutlineIcon className="w-3 h-3" />
                Close
              </>
            )}
          </button>
        </div>
      )}

      <div className="flex flex-col">
        {Array.from(groupedTabs.entries())
          .sort((a, b) => {
            // Sort native groups by ID (number), domain groups are already sorted by size or hybrid logic in useMemo
            if (groupBy === 'native' && typeof a[0] === 'number' && typeof b[0] === 'number') {
              return a[0] - b[0];
            }
            return 0;
          })
          .map(([groupId, tabs]) => {
            if (tabs.length === 0) return null;
            const { title, color } = resolveGroupInfo(groupId);
            const closeKey = `group:${String(groupId)}`;
            const closeArmed = pendingCloseKey === closeKey;

            // Group sleep button logic
            const sleepableCount = tabs.filter(t => isSleepableTab(t, activeTabId)).length;
            const allTabsSleeping = tabs.every(t => t.info.discarded);
            const isCollapsed = collapsedGroups.has(groupId);

            return (
              <div key={groupId} className="transition-all duration-500 fill-mode-both">
                {/* Native Group Header */}
                <div
                  className="flex items-center gap-1.5 mb-1.5 cursor-pointer group/header hover:bg-white/5 p-1 rounded-lg transition-colors"
                  onClick={() => toggleGroup(groupId)}
                >
                  <div className="w-5 h-5 flex items-center justify-center shrink-0 text-text-muted group-hover/header:text-text-primary transition-colors">
                    {isCollapsed ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronUpIcon className="w-3.5 h-3.5" />}
                  </div>
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}80` }}></div>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="text-[12px] font-bold tracking-tight truncate shrink" style={{ color }}>{groupId === 'Single Tabs' ? 'Single Tabs' : title}</div>
                    {tabs.length > 0 && allTabsSleeping && (
                      <div className="px-1.5 py-0.5 rounded transition-all duration-300 text-[9px] font-black uppercase tracking-widest text-accent-cyan bg-accent-cyan/10 border border-accent-cyan/20 whitespace-nowrap shrink-0" title="All tabs in group are sleeping">
                        zᶻZ
                      </div>
                    )}
                  </div>
                  <div className="px-1.5 py-0.5 rounded text-[10px] bg-bg-elevated text-text-muted font-mono shrink-0 font-bold">{tabs.length}</div>

                  <div className="ml-auto flex items-center gap-1 opacity-0 group-hover/header:opacity-100 transition-opacity">
                    {sleepableCount > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSleepGroup(tabs, groupId); }}
                        disabled={toolbarBusy !== null}
                        className="flex items-center justify-center w-7 h-7 rounded-md border border-white/10 text-text-secondary hover:text-white hover:bg-white/10 hover:border-white/30 transition-colors bg-bg-elevated"
                        title={`Sleep ${sleepableCount} idle tabs in this group`}
                      >
                        <span className="text-[9px] font-black tracking-widest font-comic text-accent-blue">zᶻZ</span>
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCloseGroup(tabs, closeKey); }}
                      disabled={toolbarBusy !== null}
                      className={`flex items-center justify-center w-7 h-7 rounded-md border transition-colors bg-bg-elevated ${closeArmed ? 'border-status-crit/50 text-white bg-status-crit/20' : 'border-status-crit/20 text-status-crit/70 hover:text-status-crit hover:bg-status-crit/10 hover:border-status-crit/40'}`}
                      title={closeArmed ? `Click again to close all ${tabs.length} tabs in this group` : `Close all ${tabs.length} tabs in this group`}
                    >
                      {closeArmed ? <span className="text-[9px] font-bold">OK</span> : <TrashOutlineIcon className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="transition-all duration-200">
                    {tabs.map(renderTabRow)}
                  </div>
                )}
              </div>
            )
          })}
        {groupedTabs.size === 0 && (
          <div className="glass-panel border-dashed border-bg-border rounded-xl p-8 text-center text-sm text-text-muted">
            No tabs match the current filters.
          </div>
        )}

        {/* Forgotten Tabs Section */}
        {isForgottenSectionVisible && (
          <div className="transition-all duration-500 fill-mode-both mt-3 pt-2">
            <div
              className="flex items-center gap-1.5 mb-1.5 cursor-pointer group/header hover:bg-white/5 p-1 rounded-lg transition-colors"
              onClick={() => setIsForgottenCollapsed(!isForgottenCollapsed)}
            >
              <div className="w-5 h-5 flex items-center justify-center shrink-0 text-text-muted group-hover/header:text-text-primary transition-colors">
                {isForgottenCollapsed ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronUpIcon className="w-3.5 h-3.5" />}
              </div>
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: '#f59e0b', boxShadow: '0 0 10px #f59e0b80' }}></div>
              <div className="text-xs font-bold truncate text-status-warning flex items-center gap-2">
                Forgotten Tabs
              </div>
              <div className="px-1.5 py-0.5 rounded text-[10px] bg-bg-elevated text-text-muted font-mono shrink-0 font-bold">{forgottenTabs.length}</div>

              <div className="ml-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <span className="whitespace-nowrap text-[10px] text-text-muted/60 font-semibold tracking-wide bg-bg-elevated px-2 py-0.5 rounded border border-white/5" title={`Configured forgotten tabs threshold: ${forgottenThresholdLabel}`}>OVER {forgottenThresholdLabel}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover/header:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSleepGroup(forgottenTabs, 'forgotten'); }}
                    disabled={toolbarBusy !== null || forgottenTabs.length === 0}
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-white/10 text-text-secondary hover:text-white hover:bg-white/10 hover:border-white/30 transition-colors bg-bg-elevated"
                    title={`Sleep all forgotten tabs`}
                  >
                    <span className="text-[9px] font-black tracking-widest font-comic text-accent-blue">zᶻZ</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCloseGroup(forgottenTabs, 'forgotten'); }}
                    disabled={toolbarBusy !== null || forgottenTabs.length === 0}
                    className={`flex items-center justify-center w-7 h-7 rounded-md border transition-colors bg-bg-elevated ${pendingCloseKey === 'forgotten' ? 'border-status-crit/50 text-white bg-status-crit/20' : 'border-status-crit/20 text-status-crit/70 hover:text-status-crit hover:bg-status-crit/10 hover:border-status-crit/40'}`}
                    title={pendingCloseKey === 'forgotten' ? 'Click again to close all forgotten tabs' : `Close all forgotten tabs`}
                  >
                    {pendingCloseKey === 'forgotten' ? <span className="text-[9px] font-bold">OK</span> : <TrashOutlineIcon className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {!isForgottenCollapsed && forgottenTabs.length > 0 && (
              <div className="transition-all duration-200 mb-2">
                {forgottenTabs.map(renderTabRow)}
              </div>
            )}
            {!isForgottenCollapsed && forgottenTabs.length === 0 && (
              <div className="pl-4 ml-2.5 text-xs text-text-muted/50 italic mb-2">No forgotten tabs currently.</div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// Map Chrome's color strings to actual hex codes for UI display
function groupColorToHex(color: string): string {
  const MAP: Record<string, string> = {
    grey: '#9CA3AF',
    blue: '#60A5FA',
    red: '#F87171',
    yellow: '#FBBF24',
    green: '#34D399',
    pink: '#F472B6',
    purple: '#A78BFA',
    cyan: '#22D3EE',
    orange: '#FB923C',
  };
  return MAP[color] || '#818cf8';
}
