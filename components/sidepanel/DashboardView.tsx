import React, { useMemo } from 'react';
import type { TabSnapshot } from '../../types/tab';
import type { MemorySnapshot, MemoryHistory } from '../../types/memory';
import { formatBytesFull } from '../../lib/utils';
import { CATEGORY_COLORS, CATEGORY_FULL_LABELS, ALL_CATEGORIES } from '../../lib/constants';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { TabCategory } from '../../types/tab';
import { CpuChipIcon, ChartPieIcon } from '@heroicons/react/24/outline';

interface Props {
  snapshots: TabSnapshot[];
  latestMemory: MemorySnapshot | null;
  history: MemoryHistory;
}

function StatCard({ label, value, sub, colorClass = 'text-text-primary' }: { label: string; value: string | number; sub?: string; colorClass?: string }) {
  return (
    <div className="glass-panel border-bg-border rounded-xl p-4 flex-1 relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="text-xs text-text-secondary font-medium tracking-wide mb-1 relative z-10">{label}</div>
      <div className={`text-2xl font-bold ${colorClass} relative z-10`}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-1 relative z-10">{sub}</div>}
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel border-bg-border rounded-lg p-2.5 text-xs shadow-xl backdrop-blur-md">
      <div className="text-text-secondary mb-1.5 font-medium">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color }} className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }}></span>
          <span className="font-semibold">{p.name}:</span> {formatBytesFull(p.value)}
        </div>
      ))}
    </div>
  );
}

export default function DashboardView({ snapshots, latestMemory, history }: Props) {
  const totalTabs = snapshots.length;

  const { activeTabs, sleepingTabs, activeMemory, estimatedSavedMemory, totalManagedMemory, savedPercent } = useMemo(() => {
    const activeTabs = snapshots.filter(s => !s.info.discarded);
    const sleepingTabs = snapshots.filter(s => s.info.discarded);

    const activeMemory = activeTabs.reduce((sum, s) => sum + (s.metrics.memoryBytes ?? 0), 0);
    const estimatedSavedMemory = sleepingTabs.length * 65 * 1024 * 1024; // ~65MB per sleeping tab
    const totalManagedMemory = activeMemory + estimatedSavedMemory;
    const savedPercent = totalManagedMemory > 0 ? (estimatedSavedMemory / totalManagedMemory) * 100 : 0;
    return { activeTabs, sleepingTabs, activeMemory, estimatedSavedMemory, totalManagedMemory, savedPercent };
  }, [snapshots]);

  // Prepare chart data from history (last 30 snapshots)
  const chartData = history.snapshots.slice(-30).map((snap, i) => ({
    time: `${i * 2} m`,
    total: snap.totalTabMemoryBytes,
  }));

  // Category distribution
  const catCounts: Partial<Record<TabCategory, number>> = {};
  for (const snap of snapshots) {
    const cat = snap.metrics.category;
    catCounts[cat] = (catCounts[cat] ?? 0) + 1;
  }

  return (
    <div className="p-4 md:p-6 lg:max-w-4xl lg:mx-auto space-y-4">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Memory Managed */}
        <div className="glass-card rounded-2xl p-4 md:p-5 relative overflow-hidden group hover:border-accent-blue/30 transition-colors">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent-blue/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-accent-blue/10 transition-colors"></div>
          <div className="flex items-start justify-between mb-3 relative z-10">
            <div className="w-10 h-10 rounded-xl bg-bg-elevated flex items-center justify-center text-accent-blue">
              <CpuChipIcon className="w-5 h-5" />
            </div>
            <div className={`px-2.5 py-1 rounded-full text-xs font-bold border ${savedPercent > 0 ? 'bg-status-ok/10 text-status-ok border-status-ok/20' : 'bg-status-warn/10 text-status-warn border-status-warn/20'}`}>
              {savedPercent > 0 ? 'Optimized' : 'Normal'}
            </div>
          </div>
          <div className="relative z-10">
            <div className="text-text-secondary text-sm font-medium mb-1" title="Per-tab memory is estimated from tab metadata and known site patterns.">Estimated Tab Memory</div>
            <div className="text-3xl font-black text-white tracking-tight">{formatBytesFull(totalManagedMemory)}</div>
          </div>
        </div>

        {/* Estimated Memory Saved */}
        <div className="glass-card rounded-2xl p-4 md:p-5 relative overflow-hidden group hover:border-status-ok/30 transition-colors">
          <div className="absolute top-0 right-0 w-32 h-32 bg-status-ok/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-status-ok/20 transition-colors"></div>
          <div className="flex items-start justify-between mb-3 relative z-10">
            <div className="w-10 h-10 rounded-xl bg-status-ok/10 flex items-center justify-center text-status-ok">
              <ChartPieIcon className="w-5 h-5" />
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-status-ok drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">{savedPercent.toFixed(0)}% est. saved</div>
              <div className="text-[10px] text-text-secondary mt-0.5">{sleepingTabs.length} tabs asleep</div>
            </div>
          </div>
          <div className="relative z-10">
            <div className="text-text-secondary text-sm font-medium mb-1 flex items-center gap-1.5">
              Estimated Memory Saved
              <span className="w-2 h-2 rounded-full bg-status-ok shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></span>
            </div>
            <div className="text-3xl font-black text-status-ok tracking-tight drop-shadow-[0_0_12px_rgba(16,185,129,0.2)]">{formatBytesFull(estimatedSavedMemory)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          {/* Memory Trend Chart */}
          <div className="glass-panel border-bg-border rounded-xl p-5">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4">Estimated Memory Trend (last hour)</h3>
            {chartData.length > 1 ? (
              <div className="-ml-3">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => formatBytesFull(v)} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                    <Line type="monotone" dataKey="total" stroke="#38bdf8" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: '#38bdf8' }} name="Estimated Tab Memory" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[160px] flex items-center justify-center text-xs text-text-muted">
                Collecting data... (refreshes every minute)
              </div>
            )}
          </div>

          {/* Estimated Memory Saved vs Active */}
          <div className="glass-panel border-bg-border rounded-xl p-5">
            <div className="flex justify-between items-end mb-3">
              <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest">Estimated Memory Distribution</h3>
              <span className="text-sm font-semibold text-text-primary">{savedPercent.toFixed(0)}% est. saved</span>
            </div>

            <div className="h-2.5 w-full bg-bg-elevated rounded-full overflow-hidden flex border border-white/5">
              <div className="h-full bg-status-ok transition-all duration-1000 ease-out" style={{ width: `${savedPercent}%` }} />
              <div className="h-full bg-accent-blue transition-all duration-1000 ease-out" style={{ width: `${100 - savedPercent}%` }} />
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 text-[10px] font-medium text-text-secondary">
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-status-ok shadow-[0_0_4px_rgba(16,185,129,0.6)]"></span>Est. saved {formatBytesFull(estimatedSavedMemory)}</div>
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent-blue"></span>Est. active {formatBytesFull(activeMemory)}</div>
            </div>
          </div>
        </div>

        {/* Category Distribution */}
        <div className="glass-panel border-bg-border rounded-xl p-5 flex flex-col h-full">
          <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4">Category Distribution</h3>

          <div className="flex-1 flex flex-col justify-center space-y-3">
            {ALL_CATEGORIES
              .filter(cat => catCounts[cat])
              .sort((a, b) => (catCounts[b] ?? 0) - (catCounts[a] ?? 0))
              .map(cat => {
                const count = catCounts[cat] ?? 0;
                const pct = totalTabs > 0 ? (count / totalTabs) * 100 : 0;
                const color = CATEGORY_COLORS[cat];
                return (
                  <div key={cat} className="group relative">
                    <div className="flex justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></span>
                        <span className="text-text-primary font-medium group-hover:text-white transition-colors">{CATEGORY_FULL_LABELS[cat]}</span>
                      </div>
                      <span className="text-text-secondary">{count} tabs</span>
                    </div>
                    <div className="h-1.5 w-full bg-bg-elevated rounded-full overflow-hidden border border-white/5">
                      <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })
            }
            {totalTabs === 0 && (
              <div className="text-center text-text-muted text-sm py-8 border border-dashed border-bg-border rounded-lg">
                No classified tabs yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
