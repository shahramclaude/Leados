import { Card, SectionTitle } from "../components/shared";

const ITEMS = [
  "Is labeled as automated in the audit trail.",
  "Is reversible by the user (or labeled as irreversible if not).",
  "Never writes events without user confirmation — except undo, which removes a just-written event inside a 60-second window (undo IS the confirmation for the original action).",
  "Never modifies existing events in the log (the log is immutable except for the 60-second undo window).",
  "Is surfaced as a suggestion or nudge, not a background action.",
  'Is comprehensible to a non-technical leader ("Your 1:1 cadence setting might be off", not a dotted internal-field path).',
];

export function ContractView() {
  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub="Every automation action implemented in this delivery (src/automation/*) follows these six rules by construction.">
          The Automation Contract
        </SectionTitle>
        <ol className="space-y-2">
          {ITEMS.map((t, i) => (
            <li key={i} className="flex gap-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <span className="font-semibold text-indigo-600">{i + 1}.</span>
              {t}
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <SectionTitle>Module map (this delivery)</SectionTitle>
        <ul className="space-y-1 text-sm text-slate-700">
          <li><code className="text-indigo-700">src/automation/prefill.ts</code> — base prefill(ctx,P) + smartPrefill() enrichment.</li>
          <li><code className="text-indigo-700">src/automation/maintenance.ts</code> — runMaintenance(), Tasks 1–6.</li>
          <li><code className="text-indigo-700">src/automation/templates.ts</code> — TEMPLATES, the six event bundles.</li>
          <li><code className="text-indigo-700">src/automation/schedule.ts</code> — suggestSchedule(), collectCadenceFindings().</li>
          <li><code className="text-indigo-700">src/automation/hygiene.ts</code> — dataHygiene(), read-only exports.</li>
          <li><code className="text-indigo-700">src/automation/importAutomation.ts</code> — importSuggestions() (simulated merge).</li>
          <li><code className="text-indigo-700">src/automation/backup.ts</code> — backupStatus() system-reminder finding.</li>
          <li><code className="text-indigo-700">src/automation/undo.ts</code> + <code className="text-indigo-700">store.ts</code> — undo.last() semantics, single writer, localStorage persistence.</li>
        </ul>
        <p className="mt-4 text-xs text-slate-500">
          There is no literal <code>LEADOS._mod.automation = 'js/automation.js'</code> registration here: that pattern was not found anywhere in the real
          repo, and this delivery is a React/TypeScript module tree, not a vanilla IIFE loaded by a hand-written index.html. See the Provenance tab and
          AI-SESSION-LOG.md for the full reasoning.
        </p>
      </Card>
    </div>
  );
}
