import type { RiskLevel } from '../../lib/peopleIntelligence';

export const RISK_COLORS: Record<RiskLevel, { bar: string; badge: string; text: string }> = {
  critical: { bar: 'bg-rose-500', badge: 'bg-rose-500/15 text-rose-300 border-rose-500/40', text: 'text-rose-400' },
  high: { bar: 'bg-amber-500', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40', text: 'text-amber-400' },
  medium: { bar: 'bg-yellow-400', badge: 'bg-yellow-400/15 text-yellow-300 border-yellow-400/40', text: 'text-yellow-300' },
  low: { bar: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', text: 'text-emerald-400' },
};

export function levelFromScore(score: number): RiskLevel {
  if (score > 0.7) return 'critical';
  if (score > 0.5) return 'high';
  if (score > 0.3) return 'medium';
  return 'low';
}

export function RiskBar({ score }: { score: number }) {
  const level = levelFromScore(score);
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="h-2 flex-1 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full ${RISK_COLORS[level].bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold w-9 text-right ${RISK_COLORS[level].text}`}>{pct}%</span>
    </div>
  );
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${RISK_COLORS[level].badge}`}>
      {level}
    </span>
  );
}

export function TrendArrow({ trend }: { trend: 'accelerating' | 'stable' | 'declining' | 'unknown' }) {
  if (trend === 'accelerating') return <span className="text-emerald-400 font-bold" title="Accelerating">↑</span>;
  if (trend === 'declining') return <span className="text-rose-400 font-bold" title="Declining">↓</span>;
  if (trend === 'stable') return <span className="text-slate-400 font-bold" title="Stable">→</span>;
  return <span className="text-slate-600 font-bold" title="Unknown">·</span>;
}

export function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function daysAgoLabel(dateStr: string | null, now: Date) {
  if (!dateStr) return '—';
  const days = Math.round((now.getTime() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}
