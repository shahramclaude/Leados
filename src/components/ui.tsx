import { ReactNode } from 'react';
import { cn } from '../utils/cn';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', className)}>{children}</div>;
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'indigo' | 'amber' | 'rose' | 'emerald' }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600',
    indigo: 'bg-indigo-100 text-indigo-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  };
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  className,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  className?: string;
  type?: 'button' | 'submit';
}) {
  const variants: Record<string, string> = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-500',
    secondary: 'bg-slate-900 text-white hover:bg-slate-800',
    ghost: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    danger: 'bg-rose-50 text-rose-700 hover:bg-rose-100',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn('rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', variants[variant], className)}
    >
      {children}
    </button>
  );
}

export function SectionHeading({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{eyebrow}</p>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
      {desc && <p className="max-w-3xl text-sm text-slate-500">{desc}</p>}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-slate-600">{children}</label>;
}

export const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
