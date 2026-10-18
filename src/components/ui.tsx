import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border border-slate-200 bg-white p-5 shadow-sm', className)}>{children}</div>;
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

const TAG_STYLES: Record<string, string> = {
  ASSUMED: 'bg-amber-100 text-amber-800 border-amber-200',
  EVIDENCED: 'bg-sky-100 text-sky-800 border-sky-200',
  CONFIRMED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  HYPOTHETICAL: 'bg-violet-100 text-violet-800 border-violet-200',
  ORIGINAL: 'bg-slate-100 text-slate-700 border-slate-200',
  'DISCLOSED GAP': 'bg-rose-100 text-rose-800 border-rose-200',
  VERIFIED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  UNVERIFIED: 'bg-rose-100 text-rose-800 border-rose-200',
};

export function Tag({ kind }: { kind: string }) {
  return (
    <span className={cn('inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide', TAG_STYLES[kind] || 'bg-slate-100 text-slate-700 border-slate-200')}>
      {kind}
    </span>
  );
}

export function RiskPill({ level }: { level: string }) {
  const styles: Record<string, string> = {
    HIGH: 'bg-rose-600 text-white',
    ELEVATED: 'bg-orange-500 text-white',
    MODERATE: 'bg-amber-400 text-slate-900',
    LOW: 'bg-emerald-500 text-white',
  };
  return <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', styles[level] || 'bg-slate-300')}>{level}</span>;
}

export function Callout({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'amber' | 'rose' }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-50 border-slate-200 text-slate-600',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    rose: 'bg-rose-50 border-rose-200 text-rose-800',
  };
  return <div className={cn('rounded-lg border px-3 py-2 text-xs leading-relaxed', tones[tone])}>{children}</div>;
}
