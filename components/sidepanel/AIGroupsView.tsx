import React, { useEffect, useState } from 'react';
import type { AIProviderType, AISettings, ClassificationResult } from '../../types/ai';
import type { TabCategory, TabSnapshot } from '../../types/tab';
import { ALL_CATEGORIES, CATEGORY_COLORS, CATEGORY_FULL_LABELS, CATEGORY_LABELS } from '../../lib/constants';
import { api } from '../../lib/messaging';
import { checkChromeAIAvailability } from '../../services/ai/ChromeAIProvider';
import {
  SparklesIcon,
  CircleStackIcon,
  CogIcon,
  PlayIcon,
  RectangleGroupIcon,
  RectangleStackIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  Square3Stack3DIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { browser } from 'wxt/browser';

interface Props {
  settings: AISettings;
  snapshots: TabSnapshot[];
  onSave: (s: AISettings) => Promise<void>;
  onGroupAll: () => Promise<any>;
  onUngroupAll: () => Promise<any>;
}

type ChromeAIStatus = 'available' | 'unavailable' | 'downloading' | 'checking';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const reclassifyOptions = [
  { label: '1h', value: 1 * 60 * 60 * 1000 },
  { label: '2h', value: 2 * 60 * 60 * 1000 },
  { label: '4h', value: 4 * 60 * 60 * 1000 },
  { label: '8h', value: 8 * 60 * 60 * 1000 },
  { label: '24h', value: 24 * 60 * 60 * 1000 },
] as const;

const providerCards: Array<{
  id: AIProviderType;
  title: string;
  subtitle: string;
  description: string;
  disabled?: boolean;
}> = [
    { id: 'chrome', title: 'Chrome Built-in', subtitle: 'Gemini Nano', description: 'Offline / free' },
    { id: 'disabled', title: 'Disabled', subtitle: 'No classification', description: 'Manual management only' },
  ];

function CategoryBadge({ category }: { category: TabCategory }) {
  const color = CATEGORY_COLORS[category];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase border backdrop-blur-sm whitespace-nowrap shrink-0"
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

function StatusToast({ state }: { state: SaveState }) {
  if (state === 'idle') return null;

  const isError = state === 'error';
  const isSaved = state === 'saved';
  const label = state === 'saving' ? 'Saving...' : isSaved ? 'Settings saved' : 'Save failed';

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold mb-6 transition-all duration-300 shadow-lg backdrop-blur-md border ${isError
      ? 'bg-status-crit/10 text-status-crit border-status-crit/30'
      : isSaved
        ? 'bg-status-ok/10 text-status-ok border-status-ok/30'
        : 'bg-bg-elevated/80 text-text-primary border-bg-border'
      }`}>
      {isError ? <ExclamationCircleIcon className="w-5 h-5" /> : isSaved ? <CheckCircleIcon className="w-5 h-5" /> : <div className="w-5 h-5 border-2 border-t-accent-blue border-white/20 rounded-full animate-spin"></div>}
      {label}
    </div>
  );
}

function Toggle({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-indigo/50 focus:ring-offset-2 focus:ring-offset-bg-base shrink-0 ${checked ? 'bg-accent-indigo hover:bg-indigo-400' : 'bg-bg-border hover:bg-white/20'}`}
    >
      <span className="sr-only">{label}</span>
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}

export default function AIGroupsView({
  settings,
  snapshots,
  onSave,
  onGroupAll,
  onUngroupAll,
}: Props) {
  const [localSettings, setLocalSettings] = useState<AISettings>({ ...settings });
  const [showSecret, setShowSecret] = useState(false);
  const [chromeStatus, setChromeStatus] = useState<ChromeAIStatus>('checking');
  const [activeTabInfo, setActiveTabInfo] = useState<{ id: number; url: string; title: string } | null>(null);
  const [testResult, setTestResult] = useState<ClassificationResult | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [groupingBusy, setGroupingBusy] = useState<'group' | 'ungroup' | null>(null);
  const [autoGroup, setAutoGroup] = useState(() => snapshots.some((snapshot) => snapshot.info.groupId >= 0));

  useEffect(() => {
    setLocalSettings({ ...settings });
    setDirty(false);
    setSaveState('idle');
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    setChromeStatus('checking');
    checkChromeAIAvailability()
      .then((status) => {
        if (!cancelled) setChromeStatus(status);
      })
      .catch(() => {
        if (!cancelled) setChromeStatus('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        const active = tabs[0];
        if (!active?.id) {
          setActiveTabInfo(null);
          return;
        }
        setActiveTabInfo({
          id: active.id,
          url: active.url ?? '',
          title: active.title ?? '',
        });
      })
      .catch(() => setActiveTabInfo(null));
  }, [snapshots]);

  useEffect(() => {
    if (!dirty) return;
    setSaveState('saving');
    const timeoutId = window.setTimeout(async () => {
      try {
        await onSave({
          ...localSettings,
          chromeAIAvailable: chromeStatus === 'available',
        });
        setDirty(false);
        setSaveState('saved');
        window.setTimeout(() => setSaveState('idle'), 1200);
      } catch {
        setSaveState('error');
      }
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [dirty, localSettings, chromeStatus, onSave]);

  const groupedCounts = ALL_CATEGORIES.reduce<Record<TabCategory, number>>((accumulator, category) => {
    accumulator[category] = snapshots.filter((snapshot) => snapshot.metrics.category === category).length;
    return accumulator;
  }, {} as Record<TabCategory, number>);

  const baseInputClass = "bg-bg-elevated text-text-primary border border-bg-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-colors w-full";

  function updateSettings(updater: (current: AISettings) => AISettings) {
    setLocalSettings((current) => updater(current));
    setDirty(true);
  }

  async function handleRunTest() {
    if (!activeTabInfo?.id) {
      setTestStatus('error');
      setTestResult(null);
      return;
    }
    setTestStatus('running');
    setTestResult(null);
    try {
      const response = await api.classifyTab(activeTabInfo.id);
      if (response?.success && response.data) {
        setTestResult(response.data as ClassificationResult);
        setTestStatus('idle');
      } else {
        setTestStatus('error');
      }
    } catch {
      setTestStatus('error');
    }
  }

  async function handleGroupAll() {
    setGroupingBusy('group');
    try {
      await onGroupAll();
      setAutoGroup(true);
    } finally {
      setGroupingBusy(null);
    }
  }

  async function handleUngroupAll() {
    setGroupingBusy('ungroup');
    try {
      await onUngroupAll();
      setAutoGroup(false);
    } finally {
      setGroupingBusy(null);
    }
  }



  const chromeStatusColorClass =
    chromeStatus === 'available'
      ? 'text-status-ok drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]'
      : chromeStatus === 'downloading'
        ? 'text-status-warn drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]'
        : chromeStatus === 'checking'
          ? 'text-text-secondary'
          : 'text-status-crit drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]';

  const chromeStatusBgClass =
    chromeStatus === 'available'
      ? 'bg-status-ok'
      : chromeStatus === 'downloading'
        ? 'bg-status-warn'
        : chromeStatus === 'checking'
          ? 'bg-text-secondary'
          : 'bg-status-crit';

  const chromeStatusLabel =
    chromeStatus === 'available'
      ? 'Available'
      : chromeStatus === 'downloading'
        ? 'Downloading'
        : chromeStatus === 'checking'
          ? 'Checking requirements...'
          : 'Not supported on this device';

  return (
    <div className="p-4 md:p-6 lg:max-w-4xl lg:mx-auto space-y-6">
      <div className="flex justify-between items-end mb-2">
        <div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-text-secondary tracking-tight">AI Settings</h1>
          <p className="text-sm text-text-muted mt-1">Configure the intelligence engine that auto-groups your tabs.</p>
        </div>
        <div className="h-10 flex items-center">
          <StatusToast state={saveState} />
        </div>
      </div>

      <div className="glass-panel border-bg-border rounded-2xl p-6 shadow-2xl shadow-black/40 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
          <SparklesIcon className="w-64 h-64 -rotate-12 transform" />
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent-indigo/20 text-accent-indigo border border-white/10 flex items-center justify-center shadow-inner shadow-accent-indigo/20">
            <SparklesIcon className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-text-primary tracking-wide">AI Engine</h2>
        </div>

        <div className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-3">Model Provider</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6 relative z-10">
          {providerCards.map((provider) => {
            const selected = provider.id === localSettings.provider;
            return (
              <button
                key={provider.id}
                disabled={provider.disabled}
                onClick={() => {
                  if (provider.disabled) return;
                  updateSettings((current) => ({ ...current, provider: provider.id as AIProviderType }));
                }}
                className={`text-left p-4 rounded-xl border transition-all duration-300 relative overflow-hidden group/card flex flex-col h-full ${provider.disabled
                  ? 'opacity-50 cursor-not-allowed bg-bg-base/50 border-bg-border grayscale top-0'
                  : selected
                    ? 'bg-accent-indigo/10 border-accent-indigo/40 ring-1 ring-accent-indigo/20 shadow-[0_0_20px_rgba(99,102,241,0.1)] -translate-y-1'
                    : 'bg-bg-elevated/50 border-bg-border hover:bg-bg-elevated hover:border-white/10 hover:-translate-y-0.5'
                  }`}
              >
                {selected && (
                  <div className="absolute inset-0 bg-gradient-to-br from-accent-indigo/20 to-transparent opacity-50 pointer-events-none" />
                )}
                <div className="flex items-center gap-2 mb-2 relative z-10">
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${selected ? 'border-accent-indigo bg-accent-indigo/20' : 'border-text-muted bg-bg-base group-hover/card:border-text-secondary'
                    }`}>
                    {selected && <div className="w-2 h-2 rounded-full bg-accent-indigo"></div>}
                  </div>
                  <div className={`font-bold text-sm truncate ${selected ? 'text-accent-indigo' : 'text-text-primary'}`}>
                    {provider.title}
                  </div>
                </div>
                <div className={`text-xs font-medium mb-1 relative z-10 ${selected ? 'text-text-primary' : 'text-text-secondary'}`}>{provider.subtitle}</div>
                <div className="text-[10px] text-text-muted mt-auto leading-relaxed relative z-10">{provider.description}</div>
              </button>
            );
          })}
        </div>

        {localSettings.provider === 'chrome' && (
          <div className="flex items-center gap-2 bg-bg-elevated/50 border border-white/5 rounded-lg px-4 py-3 mb-6 w-fit relative z-10">
            <span className={`w-2.5 h-2.5 rounded-full ${chromeStatusBgClass} shadow-[0_0_8px_rgba(255,255,255,0.2)]`} />
            <span className={`text-sm font-semibold tracking-wide ${chromeStatusColorClass}`}>Built-in AI: {chromeStatusLabel}</span>
          </div>
        )}



        <div className="grid md:grid-cols-2 gap-6 relative z-10">
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-bg-elevated/30 hover:bg-bg-elevated/50 transition-colors">
              <div>
                <div className="text-sm font-bold text-text-primary mb-1">Auto-Classify</div>
                <div className="text-xs text-text-muted">Analyze new tabs when they open</div>
              </div>
              <Toggle checked={localSettings.classifyOnLoad} onToggle={() => updateSettings((current) => ({ ...current, classifyOnLoad: !current.classifyOnLoad }))} label="Auto-Classify" />
            </div>

            <div>
              <label className="block text-xs font-bold text-text-secondary uppercase tracking-widest mb-2">Re-evaluate Interval</label>
              <select
                value={localSettings.reclassifyIntervalMs}
                onChange={(event) => updateSettings((current) => ({ ...current, reclassifyIntervalMs: Number(event.target.value) }))}
                className={baseInputClass}
              >
                {reclassifyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    Every {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-bg-border bg-gradient-to-b from-bg-elevated/80 to-bg-elevated/30 p-5 shadow-inner">
            <div className="flex items-center gap-2 mb-4">
              <CircleStackIcon className="w-4 h-4 text-text-secondary" />
              <div className="text-xs font-bold text-text-secondary uppercase tracking-widest">Diagnostics</div>
            </div>

            <div className="bg-bg-base/50 rounded-lg p-3 border border-white/5 mb-4">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2 font-semibold">Active Tab to Test</div>
              {activeTabInfo ? (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded bg-bg-elevated border border-white/10 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    {activeTabInfo.url.includes('github.com') ? <CircleStackIcon className="w-4 h-4" /> : <RectangleStackIcon className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-text-primary truncate" title={activeTabInfo.title || 'Untitled tab'}>{activeTabInfo.title || 'Untitled tab'}</div>
                    <div className="text-[10px] text-text-muted truncate mt-0.5" title={activeTabInfo.url}>{activeTabInfo.url}</div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-text-muted flex items-center gap-2 italic py-1">
                  <ExclamationCircleIcon className="w-4 h-4" /> No active tab detected
                </div>
              )}
            </div>

            {testResult && (
              <div className="flex items-center justify-between bg-accent-indigo/10 border border-accent-indigo/20 rounded-lg px-3 py-2 mb-4 transition-all duration-300">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary">Result:</span>
                  <CategoryBadge category={testResult.category} />
                </div>
                <div className="text-[10px] font-mono text-accent-indigo font-bold bg-bg-base px-2 py-1 rounded shadow-inner">
                  {(testResult.confidence * 100).toFixed(1)}% conf
                </div>
              </div>
            )}

            {testStatus === 'error' && (
              <div className="mb-4 text-[10px] font-semibold text-status-crit bg-status-crit/10 border border-status-crit/20 rounded-lg p-3 flex items-start gap-2">
                <ExclamationCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                Classification failed. Check API key, model selection, or network connection.
              </div>
            )}

            <button
              onClick={() => void handleRunTest()}
              disabled={!activeTabInfo || testStatus === 'running'}
              className="w-full glass-button relative overflow-hidden group/btn flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-accent-indigo/10 text-accent-indigo border-accent-indigo/30 hover:bg-accent-indigo/20 hover:border-accent-indigo/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {testStatus === 'running' && <div className="absolute inset-0 bg-accent-indigo/20 animate-pulse pointer-events-none"></div>}
              {testStatus === 'running' ? (
                <>
                  <div className="w-4 h-4 border-2 border-t-accent-indigo border-accent-indigo/30 rounded-full animate-spin"></div>
                  Analyzing Concept...
                </>
              ) : (
                <>
                  <PlayIcon className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
                  Test Classification
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="glass-panel border-bg-border rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent-cyan/20 text-accent-cyan border border-white/10 flex items-center justify-center shadow-inner shadow-accent-cyan/20">
            <Square3Stack3DIcon className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-text-primary tracking-wide">Workspace Grouping</h2>
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-bg-elevated/30 hover:bg-bg-elevated/50 transition-colors mb-4">
          <div>
            <div className="text-sm font-bold text-text-primary mb-1">Auto-Group Tabs</div>
            <div className="text-xs text-text-muted">Visually organize tabs into Chrome groups</div>
          </div>
          <Toggle checked={autoGroup} onToggle={() => setAutoGroup((current) => !current)} label="Auto-Group" />
        </div>
        <div className="text-xs text-text-muted italic px-4 flex items-center gap-2 mb-8">
          <InformationCircleIcon className="w-4 h-4" /> Note: UI toggle only. Will be persisted in a future update.
        </div>

        <div className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4">Current Distribution</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {ALL_CATEGORIES.map((category) => {
            const count = groupedCounts[category];
            const color = CATEGORY_COLORS[category];
            return (
              <div key={category} className="bg-bg-elevated/60 border border-bg-border rounded-xl p-3 flex flex-col justify-between h-20 shadow-inner group transition-colors hover:border-white/10">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: color }} />
                  <span className="text-xs font-semibold text-text-primary truncate">{CATEGORY_FULL_LABELS[category]}</span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Tabs</span>
                  <span className="text-xl font-black text-text-primary group-hover:text-accent-cyan transition-colors">{count}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-bg-border/60">
          <button
            onClick={() => void handleGroupAll()}
            disabled={groupingBusy !== null}
            className="flex-1 glass-button flex items-center justify-center gap-2 py-3 text-sm font-bold bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30 hover:bg-accent-cyan/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {groupingBusy === 'group' ? (
              <><div className="w-4 h-4 border-2 border-t-accent-cyan border-accent-cyan/30 rounded-full animate-spin"></div> Grouping...</>
            ) : (
              <><RectangleGroupIcon className="w-5 h-5" /> Group Everything Now</>
            )}
          </button>
          <button
            onClick={() => void handleUngroupAll()}
            disabled={groupingBusy !== null}
            className="sm:w-1/3 glass-button flex items-center justify-center gap-2 py-3 text-sm font-bold text-text-secondary border-bg-border hover:text-white hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {groupingBusy === 'ungroup' ? (
              <><div className="w-4 h-4 border-2 border-t-text-secondary border-text-secondary/30 rounded-full animate-spin"></div> Ungrouping...</>
            ) : (
              <>Ungroup All</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
