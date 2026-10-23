import { useState } from 'react';
import { SectionIntro, DemoNotice, Card, CardHeader, Badge } from '../components/ui';
import { designTokens } from '../data/sampleData';
import type { DesignTokenRow } from '../types';

const themes: { key: keyof Pick<DesignTokenRow, 'light' | 'dark' | 'highContrast'>; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'highContrast', label: 'High contrast' },
];

export default function DesignTokens() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'highContrast'>('light');

  return (
    <div className="space-y-6">
      <SectionIntro
        title="Token compiler: one source, three themes"
        description="Light / dark / high-contrast are authored per token — never a color inversion. Every row below ships only if its contrast ratio clears the WCAG floor at compile time."
      />
      <DemoNotice />

      <Card>
        <CardHeader
          eyebrow="Live token explorer"
          title="Theme matrix"
          right={
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {themes.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTheme(t.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none ${
                    theme === t.key ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="px-5 py-2 font-medium">Token</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Semantic</th>
                <th className="px-3 py-2 font-medium">Value ({themes.find((t) => t.key === theme)?.label})</th>
                <th className="px-3 py-2 font-medium">Swatch</th>
                <th className="px-3 py-2 font-medium">Contrast vs bg</th>
              </tr>
            </thead>
            <tbody>
              {designTokens.map((t) => (
                <tr key={t.name} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                  <td className="px-5 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{t.name}</td>
                  <td className="px-3 py-3 text-slate-500">{t.kind}</td>
                  <td className="px-3 py-3 text-slate-500">{t.semantic}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-700 dark:text-slate-200">{t[theme]}</td>
                  <td className="px-3 py-3">
                    {t.kind === 'color' ? (
                      <span className="inline-block h-5 w-9 rounded border border-slate-200 dark:border-slate-700" style={{ backgroundColor: t[theme] }} />
                    ) : (
                      <span className="text-xs text-slate-300">n/a</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {t.kind === 'color' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 dark:text-slate-300">{t.contrastVsBg.toFixed(1)}:1</span>
                        <Badge tone={t.contrastPass ? 'pass' : 'fail'}>{t.contrastPass ? 'compiles' : 'blocked'}</Badge>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400 dark:border-slate-800">
          Contrast ratios here are illustrative placeholders. A real compiler computes WCAG relative-luminance ratios
          at build time and refuses to emit any pair under 4.5:1 (3:1 for large text) — see the Grand Gate tab for the
          gate statement and acceptance threshold.
        </p>
      </Card>
    </div>
  );
}
