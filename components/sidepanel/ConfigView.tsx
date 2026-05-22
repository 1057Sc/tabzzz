import React, { useEffect, useState } from 'react';
import type {
  CategoryScheduleRule,
  MemoryLimitRule,
  Rule,
  RulesConfig,
  RuleType,
  SleepRule,
  TabLimitRule,
} from '../../types/rules';
import type { TabCategory } from '../../types/tab';
import { DEFAULT_FORGOTTEN_TABS_THRESHOLD_MS, DEFAULT_RULES } from '../../types/rules';
import { ALL_CATEGORIES, CATEGORY_COLORS, CATEGORY_FULL_LABELS } from '../../lib/constants';
import {
  MoonIcon,
  BoltIcon,
  HashtagIcon,
  CalendarDaysIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { browser } from 'wxt/browser';

interface Props {
  rules: RulesConfig;
  onSave: (config: RulesConfig) => Promise<void>;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const sleepThresholdOptions = [
  { label: '15min', value: 15 * 60 * 1000 },
  { label: '30min', value: 30 * 60 * 1000 },
  { label: '1h', value: 60 * 60 * 1000 },
  { label: '2h', value: 2 * 60 * 60 * 1000 },
  { label: '4h', value: 4 * 60 * 60 * 1000 },
  { label: '8h', value: 8 * 60 * 60 * 1000 },
] as const;

const forgottenThresholdOptions = [
  { label: '2h', value: 2 * 60 * 60 * 1000 },
  { label: '4h', value: 4 * 60 * 60 * 1000 },
  { label: '6h', value: 6 * 60 * 60 * 1000 },
  { label: '8h', value: 8 * 60 * 60 * 1000 },
  { label: '10h', value: 10 * 60 * 60 * 1000 },
  { label: '12h', value: 12 * 60 * 60 * 1000 },
  { label: '24h', value: 24 * 60 * 60 * 1000 },
] as const;

const memoryLimitOptions = [
  { label: '4GB', value: 4 * 1024 * 1024 * 1024 },
  { label: '6GB', value: 6 * 1024 * 1024 * 1024 },
  { label: '8GB', value: 8 * 1024 * 1024 * 1024 },
  { label: '10GB', value: 10 * 1024 * 1024 * 1024 },
  { label: '12GB', value: 12 * 1024 * 1024 * 1024 },
  { label: '16GB', value: 16 * 1024 * 1024 * 1024 },
] as const;

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type ThresholdOption = {
  label: string;
  value: number;
};

function getNearestThresholdIndex(options: readonly ThresholdOption[], value: number): number {
  return options.reduce((nearestIndex, option, index) => {
    const nearestOption = options[nearestIndex];
    return Math.abs(option.value - value) < Math.abs(nearestOption.value - value) ? index : nearestIndex;
  }, 0);
}

function cloneRule<T extends Rule>(rule: T): T {
  if (rule.type === 'categorySchedule') {
    return {
      ...rule,
      schedules: rule.schedules.map((entry) => ({ ...entry, days: [...entry.days] })),
    } as T;
  }
  return { ...rule } as T;
}

function normalizeRulesConfig(config: RulesConfig): RulesConfig {
  const order: RuleType[] = ['sleep', 'memoryLimit', 'tabLimit', 'categorySchedule'];
  return {
    lastModified: config.lastModified,
    autoRecycleEnabled: config.autoRecycleEnabled ?? true,
    rules: order.map((type) => {
      const existing = config.rules.find((rule) => rule.type === type);
      if (existing) return cloneRule(existing);
      return cloneRule(DEFAULT_RULES.find((rule) => rule.type === type)!);
    }),
  };
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatDays(days: number[]): string {
  if (days.length === 7) return 'Daily';
  if (days.length === 5 && days.join(',') === '1,2,3,4,5') return 'Mon-Fri';
  return days.map((day) => dayLabels[day]).join(', ');
}

function StatusToast({ state }: { state: SaveState }) {
  if (state === 'idle') return null;

  const isError = state === 'error';
  const isSaved = state === 'saved';
  const label = state === 'saving' ? 'Saving...' : isSaved ? 'All changes saved' : 'Save failed';

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
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-blue/50 focus:ring-offset-2 focus:ring-offset-bg-base ${enabled ? 'bg-status-ok hover:bg-emerald-400' : 'bg-bg-border hover:bg-white/20'}`}
    >
      <span className="sr-only">Toggle rule</span>
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}

function Card({
  title,
  icon: Icon,
  toggle,
  children,
  active
}: {
  title: string;
  icon: any;
  toggle: React.ReactNode;
  children: React.ReactNode;
  active: boolean;
}) {
  return (
    <div className={`glass-panel border-bg-border rounded-xl p-5 mb-5 transition-all duration-300 ${active ? 'shadow-[0_0_20px_rgba(0,0,0,0.3)] border-white/10' : 'opacity-80 grayscale-[30%]'}`}>
      <div className="flex justify-between items-center mb-5 pb-4 border-b border-bg-border/60">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-lg ${active ? 'bg-accent-blue/20 text-accent-blue shadow-inner shadow-accent-blue/30' : 'bg-bg-elevated text-text-muted border border-white/5'}`}>
            <Icon className="w-5 h-5" />
          </div>
          <h2 className={`text-lg font-bold tracking-wide ${active ? 'text-text-primary' : 'text-text-secondary'}`}>{title}</h2>
        </div>
        {toggle}
      </div>
      <div className={`transition-all duration-300 ${active ? 'opacity-100' : 'opacity-60 pointer-events-none'}`}>
        {children}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-3">{children}</div>;
}

function Choice({
  selected,
  title,
  danger = false,
  onSelect,
}: {
  selected: boolean;
  title: string;
  danger?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${selected
        ? danger
          ? 'bg-status-crit/10 border-status-crit/30 text-status-crit shadow-[inset_0_0_10px_rgba(239,68,68,0.1)]'
          : 'bg-accent-blue/10 border-accent-blue/30 text-accent-cyan shadow-[inset_0_0_10px_rgba(56,189,248,0.1)]'
        : 'bg-bg-elevated/50 border-bg-border text-text-secondary hover:bg-bg-elevated hover:text-text-primary hover:border-white/10'
        }`}
    >
      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${selected ? (danger ? 'border-status-crit bg-status-crit/20' : 'border-accent-cyan bg-accent-cyan/20') : 'border-text-muted bg-bg-base'
        }`}>
        {selected && <div className={`w-2 h-2 rounded-full ${danger ? 'bg-status-crit' : 'bg-accent-cyan'}`}></div>}
      </div>
      <span className="text-sm font-semibold">{title}</span>
    </button>
  );
}

function Tag({
  label,
  color,
  onRemove,
}: {
  label: string;
  color: string;
  onRemove?: () => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide border backdrop-blur-sm transition-all"
      style={{
        backgroundColor: `${color}1f`,
        color,
        borderColor: `${color}4a`,
      }}
    >
      {label}
      {onRemove && (
        <button
          onClick={onRemove}
          className="hover:bg-white/20 rounded-full p-0.5 transition-colors focus:outline-none focus:ring-1 focus:ring-white/50"
          aria-label={`Remove ${label}`}
        >
          <XMarkIcon className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

export default function RulesView({ rules, onSave }: Props) {
  const [localConfig, setLocalConfig] = useState<RulesConfig>(() => normalizeRulesConfig(rules));
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [currentTabCount, setCurrentTabCount] = useState(0);
  const [categoryToAdd, setCategoryToAdd] = useState<TabCategory | ''>('');

  useEffect(() => {
    setLocalConfig(normalizeRulesConfig(rules));
    setDirty(false);
    setSaveState('idle');
  }, [rules]);

  useEffect(() => {
    browser.tabs.query({}).then((tabs) => setCurrentTabCount(tabs.length)).catch(() => setCurrentTabCount(0));
  }, []);

  useEffect(() => {
    if (!dirty) return;
    setSaveState('saving');
    const timeoutId = window.setTimeout(async () => {
      try {
        await onSave({ ...localConfig, lastModified: Date.now() });
        setDirty(false);
        setSaveState('saved');
        window.setTimeout(() => setSaveState('idle'), 1200);
      } catch {
        setSaveState('error');
      }
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [dirty, localConfig, onSave]);

  function updateRule<T extends Rule>(type: RuleType, updater: (rule: T) => T) {
    setDirty(true);
    setLocalConfig((current) => ({
      ...current,
      rules: current.rules.map((rule) => (rule.type === type ? updater(cloneRule(rule) as T) : rule)),
    }));
  }

  function handleReset() {
    setLocalConfig({
      lastModified: Date.now(),
      autoRecycleEnabled: true,
      rules: DEFAULT_RULES.map((rule) => cloneRule(rule)),
    });
    setDirty(true);
    setCategoryToAdd('');
  }

  const sleepRule = localConfig.rules.find((rule) => rule.type === 'sleep') as SleepRule;
  const memoryRule = localConfig.rules.find((rule) => rule.type === 'memoryLimit') as MemoryLimitRule;
  const tabLimitRule = localConfig.rules.find((rule) => rule.type === 'tabLimit') as TabLimitRule;
  const scheduleRule = localConfig.rules.find((rule) => rule.type === 'categorySchedule') as CategoryScheduleRule;

  const sleepIndex = getNearestThresholdIndex(sleepThresholdOptions, sleepRule.thresholdMs);
  const memoryIndex = Math.max(0, memoryLimitOptions.findIndex((option) => option.value === memoryRule.limitBytes));
  const tabUsagePercent = tabLimitRule.maxCount > 0 ? Math.min((currentTabCount / tabLimitRule.maxCount) * 100, 100) : 0;
  const currentLruThreshold = localConfig.lruThresholdMs ?? DEFAULT_FORGOTTEN_TABS_THRESHOLD_MS;
  const forgottenIndex = getNearestThresholdIndex(forgottenThresholdOptions, currentLruThreshold);

  const baseInputClass = "bg-bg-elevated text-text-primary border border-bg-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-colors";

  return (
    <div className="p-4 md:p-6 lg:max-w-4xl lg:mx-auto">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-text-secondary tracking-tight">Automation Rules</h1>
          <p className="text-sm text-text-muted mt-1">Configure how TabZZZ manages your memory automatically.</p>
        </div>
        <div className="h-10 flex items-center">
          <StatusToast state={saveState} />
        </div>
      </div>

      <Card
        title="Auto Sleep"
        icon={MoonIcon}
        active={sleepRule.enabled}
        toggle={<Toggle enabled={sleepRule.enabled} onToggle={() => updateRule<SleepRule>('sleep', (rule) => ({ ...rule, enabled: !rule.enabled }))} />}
      >
        <Label>Inactivity Threshold</Label>
        <div className="bg-bg-elevated/50 p-4 rounded-xl border border-white/5 mb-6 shadow-inner">
          <input
            type="range"
            min={0}
            max={sleepThresholdOptions.length - 1}
            step={1}
            value={sleepIndex}
            onChange={(event) => {
              const next = sleepThresholdOptions[Number(event.target.value)];
              updateRule<SleepRule>('sleep', (rule) => ({ ...rule, thresholdMs: next.value }));
            }}
            className="w-full h-2 bg-bg-border rounded-lg appearance-none cursor-pointer accent-accent-cyan"
          />
          <div className="flex justify-between mt-3 px-1 text-[10px] font-bold text-text-muted uppercase tracking-wider">
            {sleepThresholdOptions.map((option, index) => (
              <span key={option.value} className={index === sleepIndex ? 'text-accent-cyan drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]' : ''}>{option.label}</span>
            ))}
          </div>
        </div>

        <Label>Forgotten Tabs Threshold (LRU)</Label>
        <div className="bg-bg-elevated/50 p-4 rounded-xl border border-white/5 mb-6 shadow-inner">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm text-text-secondary">
              Group tabs inactive longer than this for quick review.
            </div>
            <span className="shrink-0 rounded-full border border-status-warning/25 bg-status-warning/10 px-2 py-0.5 text-xs font-bold text-status-warning">
              {forgottenThresholdOptions[forgottenIndex].label}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={forgottenThresholdOptions.length - 1}
            step={1}
            value={forgottenIndex}
            onChange={(event) => {
              const next = forgottenThresholdOptions[Number(event.target.value)];
              setDirty(true);
              setLocalConfig(current => ({ ...current, lruThresholdMs: next.value }));
            }}
            className="w-full h-2 bg-bg-border rounded-lg appearance-none cursor-pointer accent-status-warning"
          />
          <div className="grid gap-1 mt-3 px-1 text-[10px] font-bold text-text-muted uppercase tracking-wider" style={{ gridTemplateColumns: `repeat(${forgottenThresholdOptions.length}, minmax(0, 1fr))` }}>
            {forgottenThresholdOptions.map((option, index) => (
              <span key={option.value} className={`text-center ${index === forgottenIndex ? 'text-status-warning drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]' : ''}`}>{option.label}</span>
            ))}
          </div>
        </div>

        <div>
          <Label>Exceptions</Label>
          <div className="flex flex-wrap gap-2.5 mb-5">
            {sleepRule.exemptCategories.map((category) => (
              <Tag
                key={category}
                label={CATEGORY_FULL_LABELS[category]}
                color={CATEGORY_COLORS[category]}
                onRemove={() =>
                  updateRule<SleepRule>('sleep', (rule) => ({
                    ...rule,
                    exemptCategories: rule.exemptCategories.filter((item) => item !== category),
                  }))
                }
              />
            ))}
            <Tag label="📌 Pinned Tabs" color={sleepRule.exemptPinned ? '#38bdf8' : '#8b95a8'} />
            <Tag label="🎵 Playing Audio" color={sleepRule.exemptAudible ? '#38bdf8' : '#8b95a8'} />
          </div>

          <div className="flex flex-wrap gap-6 mb-5 p-4 bg-bg-elevated/30 rounded-xl border border-white/5">
            <label className="flex items-center gap-3 text-sm text-text-secondary cursor-pointer hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={sleepRule.exemptPinned}
                onChange={() => updateRule<SleepRule>('sleep', (rule) => ({ ...rule, exemptPinned: !rule.exemptPinned }))}
                className="w-4 h-4 rounded bg-bg-base border-bg-border text-accent-cyan focus:ring-accent-cyan focus:ring-offset-bg-elevated cursor-pointer"
              />
              Never sleep pinned tabs
            </label>
            <label className="flex items-center gap-3 text-sm text-text-secondary cursor-pointer hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={sleepRule.exemptAudible}
                onChange={() => updateRule<SleepRule>('sleep', (rule) => ({ ...rule, exemptAudible: !rule.exemptAudible }))}
                className="w-4 h-4 rounded bg-bg-base border-bg-border text-accent-cyan focus:ring-accent-cyan focus:ring-offset-bg-elevated cursor-pointer"
              />
              Never sleep audio/video
            </label>
          </div>

          <select
            value={categoryToAdd}
            onChange={(event) => {
              const value = event.target.value as TabCategory | '';
              setCategoryToAdd(value);
              if (!value) return;
              updateRule<SleepRule>('sleep', (rule) => ({
                ...rule,
                exemptCategories: rule.exemptCategories.includes(value) ? rule.exemptCategories : [...rule.exemptCategories, value],
              }));
              setCategoryToAdd('');
            }}
            className={`${baseInputClass} w-full sm:max-w-xs`}
          >
            <option value="">+ Add Group Exception...</option>
            {ALL_CATEGORIES.filter((category) => category !== 'uncategorized' && !sleepRule.exemptCategories.includes(category)).map((category) => (
              <option key={category} value={category}>{CATEGORY_FULL_LABELS[category]}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card
        title="Physical Memory Guard"
        icon={BoltIcon}
        active={memoryRule.enabled}
        toggle={<Toggle enabled={memoryRule.enabled} onToggle={() => updateRule<MemoryLimitRule>('memoryLimit', (rule) => ({ ...rule, enabled: !rule.enabled }))} />}
      >
        <Label>Maximum allowed RAM</Label>
        <div className="bg-bg-elevated/50 p-4 rounded-xl border border-white/5 mb-6 shadow-inner">
          <input
            type="range"
            min={0}
            max={memoryLimitOptions.length - 1}
            step={1}
            value={memoryIndex}
            onChange={(event) => {
              const next = memoryLimitOptions[Number(event.target.value)];
              updateRule<MemoryLimitRule>('memoryLimit', (rule) => ({ ...rule, limitBytes: next.value }));
            }}
            className="w-full h-2 bg-bg-border rounded-lg appearance-none cursor-pointer accent-accent-blue"
          />
          <div className="flex justify-between mt-3 px-1 text-[10px] font-bold text-text-muted uppercase tracking-wider">
            {memoryLimitOptions.map((option, index) => (
              <span key={option.value} className={index === memoryIndex ? 'text-accent-blue drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : ''}>{option.label}</span>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <Label>If limit is reached</Label>
          <div className="grid sm:grid-cols-3 gap-3">
            <Choice selected={memoryRule.action === 'sleepLRU'} title="Sleep oldest inactive" onSelect={() => updateRule<MemoryLimitRule>('memoryLimit', (rule) => ({ ...rule, action: 'sleepLRU' }))} />
            <Choice selected={memoryRule.action === 'sleepHighestMemory'} title="Sleep highest usage" onSelect={() => updateRule<MemoryLimitRule>('memoryLimit', (rule) => ({ ...rule, action: 'sleepHighestMemory' }))} />
            <Choice selected={memoryRule.action === 'closeLRU'} title="Close oldest inactive" danger onSelect={() => updateRule<MemoryLimitRule>('memoryLimit', (rule) => ({ ...rule, action: 'closeLRU' }))} />
          </div>
        </div>

        <div>
          <Label>Exceptions</Label>
          <div className="flex flex-wrap gap-6 p-4 bg-bg-elevated/30 rounded-xl border border-white/5">
            <label className="flex items-center gap-3 text-sm text-text-secondary cursor-pointer hover:text-white transition-colors">
              <input type="checkbox" checked={memoryRule.exemptPinned} onChange={() => updateRule<MemoryLimitRule>('memoryLimit', (rule) => ({ ...rule, exemptPinned: !rule.exemptPinned }))} className="w-4 h-4 rounded bg-bg-base border-bg-border text-accent-blue focus:ring-accent-blue focus:ring-offset-bg-elevated cursor-pointer" />
              Emergency only for pinned
            </label>
            <label className="flex items-center gap-3 text-sm text-text-secondary cursor-pointer hover:text-white transition-colors">
              <input type="checkbox" checked={memoryRule.exemptAudible} onChange={() => updateRule<MemoryLimitRule>('memoryLimit', (rule) => ({ ...rule, exemptAudible: !rule.exemptAudible }))} className="w-4 h-4 rounded bg-bg-base border-bg-border text-accent-blue focus:ring-accent-blue focus:ring-offset-bg-elevated cursor-pointer" />
              Emergency only for audio
            </label>
          </div>
        </div>
      </Card>

      <Card
        title="Tab Limit"
        icon={HashtagIcon}
        active={tabLimitRule.enabled}
        toggle={<Toggle enabled={tabLimitRule.enabled} onToggle={() => updateRule<TabLimitRule>('tabLimit', (rule) => ({ ...rule, enabled: !rule.enabled }))} />}
      >
        <div className="flex flex-col sm:flex-row gap-6 sm:items-end mb-6">
          <div className="flex-1">
            <Label>Maximum allowed tabs</Label>
            <input
              type="number"
              min={10}
              max={200}
              step={5}
              value={tabLimitRule.maxCount}
              onChange={(event) => updateRule<TabLimitRule>('tabLimit', (rule) => ({ ...rule, maxCount: Math.max(10, Math.min(200, Number(event.target.value) || 10)) }))}
              className={`${baseInputClass} w-32 text-lg font-bold`}
            />
          </div>

          <div className="flex-1 bg-bg-elevated/50 p-4 rounded-xl border border-white/5 shadow-inner">
            <div className="flex justify-between items-end mb-2">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-widest">Current Usage</span>
              <span className={`text-sm font-bold ${tabUsagePercent >= 100 ? 'text-status-crit' : tabUsagePercent >= 80 ? 'text-status-warn' : 'text-text-primary'}`}>{currentTabCount} / {tabLimitRule.maxCount}</span>
            </div>
            <div className="h-2 w-full bg-bg-border rounded-full overflow-hidden border border-white/5">
              <div className={`h-full rounded-full transition-all duration-1000 ${tabUsagePercent >= 100 ? 'bg-status-crit' : tabUsagePercent >= 80 ? 'bg-status-warn' : 'bg-accent-indigo'}`} style={{ width: `${tabUsagePercent}%` }} />
            </div>
          </div>
        </div>

        <div>
          <Label>If limit is reached</Label>
          <div className="grid sm:grid-cols-3 gap-3">
            <Choice selected={tabLimitRule.action === 'sleep'} title="Sleep oldest inactive" onSelect={() => updateRule<TabLimitRule>('tabLimit', (rule) => ({ ...rule, action: 'sleep' }))} />
            <Choice selected={tabLimitRule.action === 'notify'} title="Just send notification" onSelect={() => updateRule<TabLimitRule>('tabLimit', (rule) => ({ ...rule, action: 'notify' }))} />
            <Choice selected={tabLimitRule.action === 'close'} title="Close oldest inactive" danger onSelect={() => updateRule<TabLimitRule>('tabLimit', (rule) => ({ ...rule, action: 'close' }))} />
          </div>
        </div>
      </Card>

      <Card
        title="Schedule Focus Time"
        icon={CalendarDaysIcon}
        active={scheduleRule.enabled}
        toggle={<Toggle enabled={scheduleRule.enabled} onToggle={() => updateRule<CategoryScheduleRule>('categorySchedule', (rule) => ({ ...rule, enabled: !rule.enabled }))} />}
      >
        {!scheduleRule.enabled && (
          <div className="flex items-start gap-3 bg-status-warn/10 border border-status-warn/30 text-status-warn rounded-xl p-4 mb-5 text-sm">
            <InformationCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
            <p>Schedules are currently disabled. Automatically sleep specific tab groups during your scheduled focus hours.</p>
          </div>
        )}

        <div className="space-y-3 mb-5">
          <Label>Active Schedules</Label>
          {scheduleRule.schedules.map((schedule, index) => {
            const color = CATEGORY_COLORS[schedule.category];
            return (
              <div key={`${schedule.category}-${index}`} className="flex items-center justify-between gap-4 p-4 rounded-xl border border-bg-border bg-bg-elevated/50 hover:bg-bg-elevated transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="w-1.5 h-10 rounded-full" style={{ backgroundColor: color }}></div>
                  <div>
                    <div className="font-bold text-sm mb-0.5" style={{ color }}>{CATEGORY_FULL_LABELS[schedule.category]}</div>
                    <div className="text-xs text-text-secondary font-medium tracking-wide flex items-center gap-2">
                      <span className="bg-bg-base px-1.5 py-0.5 rounded border border-white/5">{formatTime(schedule.startHour, schedule.startMinute)} - {formatTime(schedule.endHour, schedule.endMinute)}</span>
                      <span>•</span>
                      <span>{formatDays(schedule.days)}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() =>
                    updateRule<CategoryScheduleRule>('categorySchedule', (rule) => ({
                      ...rule,
                      schedules: rule.schedules.filter((_, scheduleIndex) => scheduleIndex !== index),
                    }))
                  }
                  className="p-2 text-text-muted hover:text-status-crit hover:bg-status-crit/10 rounded-lg transition-colors border border-transparent hover:border-status-crit/20 opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label="Delete schedule"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            );
          })}

          {scheduleRule.schedules.length === 0 && (
            <div className="text-center p-8 border border-dashed border-bg-border rounded-xl text-text-muted text-sm glass-panel">
              No schedules configured. Add one below to automate group sleeping.
            </div>
          )}
        </div>

        <button
          disabled
          className="w-full glass-button py-3 border border-dashed border-bg-border text-text-secondary font-bold text-sm rounded-xl hover:text-white hover:border-white/20 transition-all opacity-50 cursor-not-allowed"
        >
          + Add New Schedule (coming soon)
        </button>
      </Card>

      <div className="flex justify-between items-center mt-8 pt-6 border-t border-bg-border/60">
        <button
          onClick={handleReset}
          className="px-4 py-2 text-sm font-bold text-status-crit border border-status-crit/30 bg-status-crit/5 hover:bg-status-crit/10 rounded-lg transition-colors"
        >
          Reset to Defaults
        </button>
        <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
          <CheckCircleIcon className="w-4 h-4 opacity-50" /> All rules auto-save instantly
        </div>
      </div>
    </div>
  );
}
