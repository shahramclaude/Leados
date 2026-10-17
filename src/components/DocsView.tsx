import { AppState, Finding } from '../lib/types';
import { generateUserGuide, generateChangelog } from '../lib/docs';
import { Card, Pill, SectionHeading } from './ui';

export function DocsView({ state, findings, today }: { state: AppState; findings: Finding[]; today: string }) {
  const guide = generateUserGuide(state, findings, today);
  const changelog = generateChangelog(state);

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Part 1 — the self-documenting system"
        title="Documentation, generated from your own data"
        desc={`Generated ${guide.generatedAt.slice(0, 19).replace('T', ' ')} from ${guide.dataVersion}. Every example below is computed live — nothing here is static prose.`}
      />

      <div className="space-y-4">
        {guide.sections.map((s, i) => (
          <Card key={i}>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">{s.title}</h3>
            <p className="whitespace-pre-line text-sm text-slate-600">{s.content}</p>
          </Card>
        ))}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Self-generated changelog (from the audit trail)</h3>
        <Card className="max-h-96 overflow-auto">
          <ul className="divide-y divide-slate-100 text-sm">
            {changelog.length === 0 && <li className="py-2 text-slate-400">No audit entries yet.</li>}
            {changelog.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <span className="text-slate-700">{c.what}</span>
                <span className="flex items-center gap-2 text-xs text-slate-400">
                  <Pill tone="slate">{c.category}</Pill>
                  {c.when.slice(0, 19).replace('T', ' ')}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
