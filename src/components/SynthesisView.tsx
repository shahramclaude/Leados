import { useMemo } from "react";
import type { Projection } from "../lib/types";
import { append, engine } from "../lib/core";
import { generateOrganizationalMoment, generateHardestQuestion, computeFiveThingsThatMatter } from "../lib/synthesis";
import { Card, Pill } from "./Shell";

interface SynthesisSnapshot {
  generatedAt: string;
  eventCountAtGeneration: number;
  moment: { text: string; mode: string; energyAssessment: string };
  fiveThings: ReturnType<typeof computeFiveThingsThatMatter>;
  hardestQuestion: { question: string; source: string; label: string };
}

export function SynthesisView({ P, today, reload }: { P: Projection; today: Date; reload: () => void }) {
  const generations = useMemo(
    () =>
      P.state.events
        .filter((e) => e.type === "synthesis.generated")
        .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
        .map((e) => ({ ts: e.ts, data: e.data as SynthesisSnapshot })),
    [P.state.events]
  );

  const latest = generations[0];
  const eventsSince = latest ? P.state.events.length - latest.data.eventCountAtGeneration : null;
  const stale = eventsSince !== null && eventsSince > 0;

  function generate() {
    const eventCountAtGeneration = P.state.events.length; // snapshot BEFORE this append
    const moment = generateOrganizationalMoment(P, today);
    const fiveThings = computeFiveThingsThatMatter(P, today);
    const hardestQuestion = generateHardestQuestion(P, today);
    append("synthesis.generated", {
      generatedAt: engine.iso(today),
      eventCountAtGeneration,
      moment: { text: moment.text, mode: moment.mode, energyAssessment: moment.energyAssessment },
      fiveThings,
      hardestQuestion,
    });
    reload();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Synthesis</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Generated on demand, never on render. Three sections —{" "}
            <span className="text-zinc-300">The Organizational Moment</span>, <span className="text-zinc-300">The Five Things That Matter</span>, and{" "}
            <span className="text-zinc-300">The One Question</span> — computed from your current event log and persisted as an append-only{" "}
            <code className="rounded bg-zinc-800 px-1 py-0.5 text-[11px]">synthesis.generated</code> record.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {latest && <Pill tone={stale ? "amber" : "emerald"}>{stale ? `${eventsSince} event(s) since last generation` : "Up to date"}</Pill>}
          <button onClick={generate} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400">
            {latest ? "Regenerate" : "Generate synthesis"}
          </button>
        </div>
      </header>

      {!latest && (
        <Card>
          <p className="text-sm text-zinc-400">No synthesis has been generated yet. Click “Generate synthesis” to compute it from the current log.</p>
        </Card>
      )}

      {latest && (
        <>
          <Card title="1 · The Organizational Moment" right={<span className="text-[11px] text-zinc-600">mode: {latest.data.moment.mode}</span>}>
            <p className="text-[15px] leading-relaxed text-zinc-200">{latest.data.moment.text}</p>
          </Card>

          <Card title="2 · The Five Things That Matter">
            <p className="mb-3 text-xs text-zinc-500">
              Ranked by leverage — domain improvement × pattern/pre-fire multipliers ÷ leadership energy cost. Not the same as top severity.
            </p>
            <ol className="space-y-3">
              {latest.data.fiveThings.map((item, i) => (
                <li key={item.finding.key} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-semibold text-emerald-400">{i + 1}</span>
                      <span className="text-sm font-medium text-zinc-100">{item.finding.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill>{item.finding.domain}</Pill>
                      <Pill tone="amber">sev {item.finding.sev}</Pill>
                      <Pill tone="emerald">leverage {item.leverage}</Pill>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">{item.leverageReason}</p>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
                    <span>Action: {item.action}</span>
                    <span>{item.estimatedImpact}</span>
                    <span>Energy cost: {item.energyCost}</span>
                  </div>
                </li>
              ))}
              {latest.data.fiveThings.length === 0 && <p className="text-sm text-zinc-500">No active findings to rank.</p>}
            </ol>
          </Card>

          <Card title="3 · The One Question">
            <p className="text-[15px] font-medium leading-relaxed text-zinc-100">{latest.data.hardestQuestion.question}</p>
            <p className="mt-3 text-xs text-zinc-500">
              Source: {latest.data.hardestQuestion.source}. {latest.data.hardestQuestion.label}
            </p>
          </Card>

          <details className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-sm text-zinc-400">
            <summary className="cursor-pointer select-none font-medium text-zinc-300">
              Generation history ({generations.length}) — append-only, regenerating adds, never edits
            </summary>
            <ul className="mt-3 space-y-2">
              {generations.map((g, i) => (
                <li key={g.ts} className="border-t border-zinc-800 pt-2 first:border-0 first:pt-0">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>#{generations.length - i}</span>
                    <span>{new Date(g.ts).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{g.data.moment.text.slice(0, 140)}…</p>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
