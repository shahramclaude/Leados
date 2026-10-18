import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', className)}>{children}</div>;
}

export function SectionHeading({ eyebrow, title, desc }: { eyebrow?: string; title: string; desc?: string }) {
  return (
    <div className="mb-4">
      {eyebrow && <div className="text-xs font-semibold uppercase tracking-wider text-indigo-500">{eyebrow}</div>}
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
    </div>
  );
}

const badgeVariants: Record<string, string> = {
  valid: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  degraded: 'bg-amber-100 text-amber-700 ring-amber-200',
  invalidated: 'bg-rose-100 text-rose-700 ring-rose-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  info: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
};

export function Badge({ variant = 'neutral', children }: { variant?: keyof typeof badgeVariants; children: ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', badgeVariants[variant])}>{children}</span>;
}

export function ProgressBar({ value, colorClass = 'bg-indigo-500' }: { value: number; colorClass?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cn('h-full rounded-full transition-all', colorClass)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Labeled({ text }: { text: string }) {
  return <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">{text}</p>;
}
