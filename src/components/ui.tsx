import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm shadow-slate-200/50 backdrop-blur-sm',
        'dark:border-slate-800 dark:bg-slate-900/60',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
      <div>
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-500">{eyebrow}</p>
        )}
        <h3 className="mt-0.5 font-serif text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {description && <p className="mt-1 max-w-prose text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {right}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'pass' | 'fail' | 'warn' | 'info' | 'critical';
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    pass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    fail: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    warn: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    info: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    critical: 'bg-rose-600 text-white',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium', tones[tone])}>
      {children}
    </span>
  );
}

export function StatPill({ label, value, sub, tone = 'neutral' }: { label: string; value: string; sub?: string; tone?: 'neutral' | 'pass' | 'fail' | 'warn' | 'info' }) {
  const ring: Record<string, string> = {
    neutral: 'ring-slate-200 dark:ring-slate-700',
    pass: 'ring-emerald-200 dark:ring-emerald-800',
    fail: 'ring-rose-200 dark:ring-rose-800',
    warn: 'ring-amber-200 dark:ring-amber-800',
    info: 'ring-indigo-200 dark:ring-indigo-800',
  };
  return (
    <div className={cn('rounded-xl bg-white/70 px-4 py-3 ring-1 dark:bg-slate-900/50', ring[tone])}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-serif text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export function SectionIntro({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-serif text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}

export function DemoNotice() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-500/10 dark:text-amber-300">
      <span className="mt-0.5 text-base">⚠️</span>
      <p>
        <strong className="font-semibold">Illustrative console.</strong> All figures on this page are hand-authored
        sample data for demonstration — not live measurements from a real eval runner, CI pipeline, or production
        system. Wire the data layer to real sources before trusting any number here.
      </p>
    </div>
  );
}

export function ProgressBar({ value, tone = 'info' }: { value: number; tone?: 'info' | 'warn' | 'fail' | 'pass' }) {
  const colors: Record<string, string> = {
    info: 'bg-indigo-500',
    warn: 'bg-amber-500',
    fail: 'bg-rose-500',
    pass: 'bg-emerald-500',
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div className={cn('h-full rounded-full transition-[width] duration-500', colors[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
