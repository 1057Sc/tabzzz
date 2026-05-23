import React, { useEffect, useState, useCallback } from 'react';
import type { TabSnapshot } from '../../types/tab';
import type { MemorySnapshot, MemoryHistory } from '../../types/memory';
import type { RulesConfig } from '../../types/rules';
import { AUTO_MEMORY_MODE, DEFAULT_EXEMPT_DOMAINS, DEFAULT_FORGOTTEN_TABS_THRESHOLD_MS } from '../../types/rules';
import type { AISettings } from '../../types/ai';
import type { UiSettings } from '../../types/ui';
import { DEFAULT_UI_SETTINGS } from '../../types/ui';
import { api } from '../../lib/messaging';
import { AUTO_SLEEP_PAUSE_NOTICE } from '../../lib/inactivity';
import DashboardView from '../../components/sidepanel/DashboardView';
import TabsView, { type ConfigFocusTarget } from '../../components/sidepanel/TabsView';
import ConfigView from '../../components/sidepanel/ConfigView';
import AIGroupsView from '../../components/sidepanel/AIGroupsView';
import {
  ChartPieIcon,
  RectangleStackIcon,
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ChevronUpIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import { browser } from 'wxt/browser';

type NavTab = 'dashboard' | 'tabs' | 'config';

interface AppState {
  snapshots: TabSnapshot[];
  latestMemory: MemorySnapshot | null;
  history: MemoryHistory;
  rules: RulesConfig | null;
  aiSettings: AISettings | null;
  uiSettings: UiSettings | null;
  loading: boolean;
}

const NAV_ITEMS: { id: NavTab; label: string; icon: any }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: ChartPieIcon },
  { id: 'tabs', label: 'Tabs', icon: RectangleStackIcon },
  { id: 'config', label: 'Config', icon: AdjustmentsHorizontalIcon },
];

const SLEEP_THRESHOLD_OPTIONS = [
  { label: '15min', value: 15 * 60 * 1000 },
  { label: '30min', value: 30 * 60 * 1000 },
  { label: '1h', value: 60 * 60 * 1000 },
  { label: '2h', value: 2 * 60 * 60 * 1000 },
  { label: '4h', value: 4 * 60 * 60 * 1000 },
  { label: '8h', value: 8 * 60 * 60 * 1000 },
] as const;

const FORGOTTEN_THRESHOLD_OPTIONS = [
  { label: '2h', value: 2 * 60 * 60 * 1000 },
  { label: '4h', value: 4 * 60 * 60 * 1000 },
  { label: '6h', value: 6 * 60 * 60 * 1000 },
  { label: '8h', value: 8 * 60 * 60 * 1000 },
  { label: '10h', value: 10 * 60 * 60 * 1000 },
  { label: '12h', value: 12 * 60 * 60 * 1000 },
  { label: '24h', value: 24 * 60 * 60 * 1000 },
] as const;

const LOCAL_STORAGE_KEYS = {
  NAV_ORDER: 'tabzzz:navOrder',
} as const;

const SIDE_PANEL_PORT_NAME = 'tabzzz:sidepanel';
const isPopupSurface = new URLSearchParams(window.location.search).get('surface') === 'popup';

type ThresholdOption = {
  label: string;
  value: number;
};

interface ThresholdSliderProps {
  id?: string;
  title: string;
  description: string;
  value: number;
  options: readonly ThresholdOption[];
  disabled?: boolean;
  highlighted?: boolean;
  onChange: (value: number) => void;
}

function getNearestThresholdIndex(options: readonly ThresholdOption[], value: number): number {
  return options.reduce((nearestIndex, option, index) => {
    const nearestOption = options[nearestIndex];
    return Math.abs(option.value - value) < Math.abs(nearestOption.value - value) ? index : nearestIndex;
  }, 0);
}

function ThresholdSlider({ id, title, description, value, options, disabled, highlighted = false, onChange }: ThresholdSliderProps) {
  const selectedIndex = getNearestThresholdIndex(options, value);
  const selectedOption = options[selectedIndex];

  return (
    <div
      id={id}
      className={`scroll-mt-3 rounded-xl transition-all duration-500 ${highlighted ? 'bg-accent-cyan/5 shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_0_24px_rgba(34,211,238,0.12)]' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-bold mb-0.5 text-text-secondary uppercase tracking-wider">{title}</h2>
          <p className="text-[11px] text-text-muted">{description}</p>
        </div>
        <span className="shrink-0 rounded-full border border-accent-cyan/25 bg-accent-cyan/10 px-2 py-0.5 text-[11px] font-bold text-accent-cyan">
          {selectedOption.label}
        </span>
      </div>
      <div className="mt-3 rounded-lg border border-bg-border bg-bg-elevated/40 px-3 py-2">
        <input
          type="range"
          min={0}
          max={options.length - 1}
          step={1}
          value={selectedIndex}
          disabled={disabled}
          aria-label={title}
          onChange={event => {
            const next = options[Number(event.currentTarget.value)];
            if (next) onChange(next.value);
          }}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-bg-border accent-accent-cyan disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div
          className="mt-2 grid gap-1 px-0.5 text-[9px] font-bold uppercase text-text-muted"
          style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        >
          {options.map((option, index) => (
            <span
              key={option.value}
              className={`truncate text-center ${index === selectedIndex ? 'text-accent-cyan' : ''}`}
              title={option.label}
            >
              {option.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('tabs');
  const [navOrder, setNavOrder] = useState<NavTab[]>(['tabs', 'dashboard', 'config']);
  const [configFocusTarget, setConfigFocusTarget] = useState<ConfigFocusTarget | null>(null);
  const [appState, setAppState] = useState<AppState>({
    snapshots: [],
    latestMemory: null,
    history: { snapshots: [], maxSnapshots: 120 },
    rules: null,
    aiSettings: null,
    uiSettings: null,
    loading: true,
  });
  const [isZenMode, setIsZenMode] = useState(false);
  const [sleepThresholdMs, setSleepThresholdMs] = useState(AUTO_MEMORY_MODE.sleepThresholdMs);
  const [newDomain, setNewDomain] = useState('');
  const [isExemptDomainsExpanded, setIsExemptDomainsExpanded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEYS.NAV_ORDER);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 3) {
          setNavOrder(parsed as NavTab[]);
        }
      } catch { }
    }
  }, []);

  useEffect(() => {
    const sleepRule = appState.rules?.rules.find((r: any) => r.type === 'sleep') as any;
    if (sleepRule?.thresholdMs) setSleepThresholdMs(sleepRule.thresholdMs);
  }, [appState.rules]);

  useEffect(() => {
    if (activeTab !== 'config' || !configFocusTarget) return;

    const targetId = configFocusTarget === 'autoSleep'
      ? 'config-auto-sleep-threshold'
      : 'config-forgotten-tabs-threshold';

    const scrollTimeoutId = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    const clearTimeoutId = window.setTimeout(() => setConfigFocusTarget(null), 1800);

    return () => {
      window.clearTimeout(scrollTimeoutId);
      window.clearTimeout(clearTimeoutId);
    };
  }, [activeTab, configFocusTarget]);

  const handleDragStart = (e: React.DragEvent, id: NavTab) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: NavTab) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain') as NavTab;
    if (draggedId === targetId || !navOrder.includes(draggedId)) return;

    setNavOrder(prev => {
      const newOrder = [...prev];
      const draggedIndex = newOrder.indexOf(draggedId);
      newOrder.splice(draggedIndex, 1);
      const targetIndex = newOrder.indexOf(targetId);
      newOrder.splice(targetIndex, 0, draggedId);
      localStorage.setItem(LOCAL_STORAGE_KEYS.NAV_ORDER, JSON.stringify(newOrder));
      return newOrder;
    });
  };

  const refresh = useCallback(async (fresh = true) => {
    const [stateRes, historyRes] = await Promise.all([
      fresh ? api.refreshState() : api.getState(),
      api.getMemoryHistory(),
    ]);

    if (stateRes?.success && stateRes.data) {
      const data = stateRes.data as any;
      setAppState(s => ({
        ...s,
        snapshots: data.snapshots ?? [],
        latestMemory: data.latestMemory ?? null,
        rules: data.rules ?? null,
        aiSettings: data.aiSettings ?? null,
        uiSettings: data.uiSettings ?? DEFAULT_UI_SETTINGS,
        loading: false,
      }));
    }

    if (historyRes?.success && historyRes.data) {
      setAppState(s => ({ ...s, history: historyRes.data as MemoryHistory }));
    }
  }, []);

  useEffect(() => {
    refresh(false);

    const port = browser.runtime.connect({ name: SIDE_PANEL_PORT_NAME });

    const listener = (msg: { type: string; payload?: any }) => {
      if (msg.type === 'STATE_UPDATE' && msg.payload) {
        setAppState(s => ({
          ...s,
          snapshots: msg.payload.snapshots ?? s.snapshots,
          latestMemory: msg.payload.latestMemory ?? s.latestMemory,
        }));
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
      port.disconnect();
    };
  }, [refresh]);

  const sleepingCount = appState.snapshots.filter(s => s.info.discarded).length;
  const autoRecycleEnabled = appState.rules?.autoRecycleEnabled ?? true;
  const sidebarModeEnabled = appState.uiSettings?.sidebarModeEnabled ?? DEFAULT_UI_SETTINGS.sidebarModeEnabled;
  const forgottenThresholdMs = appState.rules?.lruThresholdMs ?? DEFAULT_FORGOTTEN_TABS_THRESHOLD_MS;
  const currentSleepRule = appState.rules?.rules.find((r: any) => r.type === 'sleep') as any;
  const exemptDomains: string[] = currentSleepRule?.exemptDomains ?? DEFAULT_EXEMPT_DOMAINS;
  const exemptDomainsTooltip = exemptDomains.join('\n');

  function saveRules(updated: RulesConfig, refreshAfter = false): void {
    setAppState(s => ({ ...s, rules: updated }));
    api.updateRules(updated)
      .then(() => {
        if (refreshAfter) void refresh(true);
      })
      .catch(console.error);
  }

  function saveUiSettings(updated: UiSettings): void {
    setAppState(s => ({ ...s, uiSettings: updated }));
    api.updateUiSettings(updated).catch(console.error);
  }

  function toggleSidebarMode(): void {
    const current = appState.uiSettings ?? DEFAULT_UI_SETTINGS;
    const updated = { ...current, sidebarModeEnabled: !sidebarModeEnabled };

    if (isPopupSurface && updated.sidebarModeEnabled) {
      void browser.action.setPopup({ popup: '' }).catch(() => { });
      void browser.sidePanel
        .open({ windowId: browser.windows.WINDOW_ID_CURRENT })
        .then(() => window.close())
        .catch(() => { });
    }

    saveUiSettings(updated);
  }

  function updateSleepRule(updater: (rule: any) => any, refreshAfter = false): void {
    if (!appState.rules) return;
    const updated = {
      ...appState.rules,
      rules: appState.rules.rules.map((rule: any) => (
        rule.type === 'sleep' ? updater(rule) : rule
      )),
    };
    saveRules(updated, refreshAfter);
  }

  function addExemptDomain(): void {
    const domain = newDomain.trim();
    if (!domain) return;

    updateSleepRule((rule: any) => ({
      ...rule,
      exemptDomains: [...new Set([...(rule.exemptDomains ?? DEFAULT_EXEMPT_DOMAINS), domain])],
    }), true);
    setNewDomain('');
  }

  function removeExemptDomain(domain: string): void {
    updateSleepRule((rule: any) => ({
      ...rule,
      exemptDomains: (rule.exemptDomains ?? DEFAULT_EXEMPT_DOMAINS).filter((item: string) => item !== domain),
    }), true);
  }

  function restoreDefaultExemptDomains(): void {
    updateSleepRule((rule: any) => ({
      ...rule,
      exemptDomains: [...DEFAULT_EXEMPT_DOMAINS],
    }), true);
  }

  function toggleExemptDomainsExpanded(): void {
    setIsExemptDomainsExpanded(value => !value);
  }

  function expandExemptDomainsFromPreview(): void {
    setIsExemptDomainsExpanded(true);
  }

  function openConfigTarget(target: ConfigFocusTarget): void {
    setConfigFocusTarget(target);
    setActiveTab('config');
  }

  return (
    <div className={`flex flex-col bg-bg-base text-text-primary font-sans overflow-hidden ${isPopupSurface ? 'w-[380px] h-[560px]' : 'h-screen'}`}>
      {/* Nav Tabs */}
      <div className="flex bg-bg-elevated/50 border-b border-bg-border shrink-0 z-10 px-1 pt-1 gap-0.5 overflow-x-auto scrollbar-hide items-center">
        <div className="flex flex-1 gap-0.5 overflow-x-auto scrollbar-hide">
          {navOrder.map((id) => {
            const item = NAV_ITEMS.find((n) => n.id === id);
            if (!item) return null;
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, item.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, item.id)}
                onClick={() => {
                  setConfigFocusTarget(null);
                  setActiveTab(item.id);
                }}
                className={`relative flex items-center gap-1.5 px-2 py-1 text-xs font-semibold transition-all duration-200 outline-none rounded-t-lg group whitespace-nowrap cursor-grab active:cursor-grabbing
                ${isActive ? 'text-text-primary bg-bg-base' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}
              `}
              >
                {isActive && (
                  <>
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-accent-indigo to-accent-cyan rounded-t-full shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                    {/* Left corner curve */}
                    <div className="absolute bottom-0 -left-2 w-2 h-2 bg-transparent shrink-0">
                      <div className="absolute inset-0 bg-bg-elevated/50 rounded-br-lg z-0" />
                      <div className="absolute inset-0 bg-bg-base rounded-br-lg z-10" style={{ boxShadow: '-2px 2px 0 0 #0f1117' }} />
                    </div>
                    {/* Right corner curve */}
                    <div className="absolute bottom-0 -right-2 w-2 h-2 bg-transparent shrink-0">
                      <div className="absolute inset-0 bg-bg-elevated/50 rounded-bl-lg z-0" />
                      <div className="absolute inset-0 bg-bg-base rounded-bl-lg z-10" style={{ boxShadow: '2px 2px 0 0 #0f1117' }} />
                    </div>
                  </>
                )}

                <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-accent-cyan' : 'group-hover:text-text-primary'}`} />
                <span>{item.label}</span>

                {item.id === 'tabs' && appState.snapshots.length > 0 && (
                  <span className={`flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full transition-colors ${isActive ? 'bg-accent-cyan/20 text-accent-cyan' : 'bg-bg-border/50 text-text-muted group-hover:text-text-secondary'}`}>
                    {appState.snapshots.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => void refresh(true)}
          className="p-1 mb-1 rounded-md text-text-muted hover:text-text-primary hover:bg-white/10 transition-colors shrink-0 outline-none focus:ring-1 focus:ring-white/20 group"
          title="Refresh data"
          aria-label="Refresh data"
        >
          <ArrowPathIcon className="w-4 h-4 group-active:rotate-180 transition-transform duration-300" />
        </button>
        <button
          onClick={() => setIsZenMode(!isZenMode)}
          className="p-1 mb-1 rounded-md text-text-muted hover:text-text-primary hover:bg-white/10 transition-colors shrink-0 outline-none focus:ring-1 focus:ring-white/20"
          title={isZenMode ? "Show controls" : "Hide controls"}
        >
          {isZenMode ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronUpIcon className="w-4 h-4" />}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden w-full relative">
        {appState.loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-white/5 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-transparent border-t-accent-cyan rounded-full animate-spin"></div>
            </div>
            <p className="text-sm font-semibold tracking-widest uppercase animate-pulse">Initializing TabZZZ...</p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardView
                snapshots={appState.snapshots}
                latestMemory={appState.latestMemory}
                history={appState.history}
              />
            )}
            {activeTab === 'tabs' && (
              <TabsView
                snapshots={appState.snapshots}
                rules={appState.rules}
                onRefresh={refresh}
                onOpenConfig={openConfigTarget}
                isZenMode={isZenMode}
              />
            )}
            {activeTab === 'config' && (
              <div className="p-3 flex flex-col gap-4 text-text-primary">
                {/* Auto Recycle */}
                <div className="rounded-lg border border-bg-border bg-bg-elevated/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-xs font-bold mb-0.5 text-text-secondary uppercase tracking-wider">Auto Recycle</h2>
                      <p className="text-[11px] text-text-muted">Automatically sleep inactive tabs when memory pressure or tab count gets high.</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={autoRecycleEnabled}
                      disabled={!appState.rules}
                      onClick={() => {
                        if (!appState.rules) return;
                        saveRules({ ...appState.rules, autoRecycleEnabled: !autoRecycleEnabled });
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${autoRecycleEnabled ? 'bg-accent-cyan' : 'bg-bg-border'}`}
                    >
                      <span className="sr-only">Toggle auto recycle</span>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${autoRecycleEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div className="mt-2 text-[10px] leading-relaxed text-text-muted">
                    Current active tab, pinned tabs, grouped tabs, and audio/video tabs are kept awake by default.
                  </div>
                </div>

                <ThresholdSlider
                  id="config-auto-sleep-threshold"
                  title="Auto-sleep threshold"
                  description={`Auto mode sleeps inactive tabs after this long. ${AUTO_SLEEP_PAUSE_NOTICE}`}
                  value={sleepThresholdMs}
                  options={SLEEP_THRESHOLD_OPTIONS}
                  disabled={!appState.rules}
                  highlighted={configFocusTarget === 'autoSleep'}
                  onChange={next => {
                    setSleepThresholdMs(next);
                    updateSleepRule((rule: any) => ({ ...rule, thresholdMs: next }));
                  }}
                />

                <ThresholdSlider
                  id="config-forgotten-tabs-threshold"
                  title="Forgotten tabs threshold"
                  description="Tabs inactive longer than this are grouped for quick review."
                  value={forgottenThresholdMs}
                  options={FORGOTTEN_THRESHOLD_OPTIONS}
                  disabled={!appState.rules}
                  highlighted={configFocusTarget === 'forgottenTabs'}
                  onChange={next => {
                    if (appState.rules) {
                      saveRules({ ...appState.rules, lruThresholdMs: next });
                    }
                  }}
                />

                {/* Exempt Domains */}
                <div className="rounded-lg border border-bg-border bg-bg-elevated/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Never sleep these sites</h2>
                        <span className="group relative inline-flex">
                          <span
                            tabIndex={0}
                            aria-label="Supports exact domains and wildcard domains"
                            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-bg-border text-[10px] font-bold text-text-muted transition-colors cursor-help hover:border-white/20 hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-cyan/40"
                          >
                            ?
                          </span>
                          <span
                            role="tooltip"
                            className="pointer-events-none absolute left-1/2 top-5 z-30 hidden w-[230px] -translate-x-1/2 rounded-md border border-accent-cyan/20 bg-bg-elevated px-2 py-1.5 text-[11px] leading-relaxed text-text-secondary shadow-xl shadow-black/30 group-hover:block group-focus-within:block"
                          >
                            Supports exact domains and wildcards. Examples: <code className="text-accent-cyan">chatgpt.com</code>, <code className="text-accent-cyan">*.openai.com</code>, <code className="text-accent-cyan">localhost</code>.
                          </span>
                        </span>
                      </div>
                      <p className="text-[11px] text-text-muted truncate">
                        {exemptDomains.length} protected {exemptDomains.length === 1 ? 'site' : 'sites'}
                      </p>
                    </div>
                    <button
                      onClick={toggleExemptDomainsExpanded}
                      aria-expanded={isExemptDomainsExpanded}
                      className="shrink-0 rounded border border-bg-border px-2 py-1 text-[11px] font-bold text-text-secondary hover:border-white/20 hover:text-text-primary hover:bg-white/5 transition-colors"
                    >
                      {isExemptDomainsExpanded ? 'Done' : 'Manage'}
                    </button>
                  </div>

                  {!isExemptDomainsExpanded && exemptDomains.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 overflow-hidden">
                      {exemptDomains.slice(0, 3).map(domain => (
                        <code
                          key={domain}
                          className="max-w-[92px] shrink truncate rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-text-muted"
                          title={domain}
                        >
                          {domain}
                        </code>
                      ))}
                      {exemptDomains.length > 3 && (
                        <button
                          type="button"
                          onClick={expandExemptDomainsFromPreview}
                          className="shrink-0 rounded px-1 py-0.5 text-[10px] text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
                          title={exemptDomainsTooltip}
                          aria-label={`Show all ${exemptDomains.length} protected sites`}
                        >
                          +{exemptDomains.length - 3} more
                        </button>
                      )}
                    </div>
                  )}

                  {isExemptDomainsExpanded && (
                    <div className="mt-3 space-y-2">
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={newDomain}
                          onChange={e => setNewDomain(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') addExemptDomain();
                          }}
                          placeholder="Add domain or wildcard"
                          className="min-w-0 flex-1 text-[11px] bg-bg-elevated border border-bg-border rounded px-2 py-1 text-text-primary placeholder-text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent-cyan/40"
                        />
                        <button
                          onClick={addExemptDomain}
                          className="shrink-0 px-2 py-1 text-[11px] font-bold bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30 rounded hover:bg-accent-cyan/20 transition-colors"
                        >
                          + Add
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {exemptDomains.length === 0 ? (
                          <div className="text-[11px] text-text-muted">No protected sites.</div>
                        ) : exemptDomains.map(domain => (
                          <span
                            key={domain}
                            className="inline-flex max-w-full items-center gap-1 rounded-md border border-white/10 bg-bg-elevated px-2 py-1"
                          >
                            <code className="max-w-[160px] truncate text-[11px] text-text-primary font-mono" title={domain}>
                              {domain}
                            </code>
                            <button
                              onClick={() => removeExemptDomain(domain)}
                              className="shrink-0 text-sm font-bold leading-none text-text-muted hover:text-red-400 transition-colors"
                              title="Remove"
                              aria-label={`Remove ${domain}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>

                      <button
                        onClick={restoreDefaultExemptDomains}
                        className="text-[11px] font-semibold text-text-muted hover:text-text-primary transition-colors"
                      >
                        Restore defaults
                      </button>
                    </div>
                  )}
                </div>

                {/* Sidebar Mode */}
                <div className="rounded-lg border border-bg-border bg-bg-elevated/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-xs font-bold mb-0.5 text-text-secondary uppercase tracking-wider">Sidebar mode</h2>
                      <p className="text-[11px] text-text-muted">Open TabZZZ in Chrome's side panel. Turn off to open it as a toolbar popup.</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={sidebarModeEnabled}
                      disabled={!appState.uiSettings}
                      onClick={toggleSidebarMode}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${sidebarModeEnabled ? 'bg-accent-cyan' : 'bg-bg-border'}`}
                    >
                      <span className="sr-only">Toggle sidebar mode</span>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${sidebarModeEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
