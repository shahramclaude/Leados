import { listPlaybooks } from "@/lib/playbooks";
import { computeEffectiveness } from "@/lib/playbooksEngine";
import { listCandidates } from "@/lib/playbooksIntelligence";
import PlaybooksBoard from "./PlaybooksBoard";

export const dynamic = "force-dynamic";

export default async function PlaybooksPage() {
  const [rows, candidates] = await Promise.all([listPlaybooks(), listCandidates()]);
  const playbooks = await Promise.all(
    rows.map(async (p) => ({
      id: p.id,
      key: p.key,
      title: p.title,
      description: p.description,
      status: p.status,
      version: p.version,
      steps: p.steps as { order: number; title: string; description?: string; owner?: string }[],
      effectiveness: await computeEffectiveness(p.id),
    }))
  );

  return (
    <main className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold text-slate-950">Playbooks</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Executable checklists with trigger conditions, steps, owners, and measured effectiveness. Mined from
          retrospectives as suggestions only — a human always decides whether a candidate becomes a real playbook.
          Invocable from here, or by the automation kernel.
        </p>
      </header>
      <PlaybooksBoard
        playbooks={playbooks}
        candidates={candidates.map((c) => ({
          id: c.id,
          suggestedTitle: c.suggestedTitle,
          rationale: c.rationale,
          status: c.status,
          suggestedSteps: c.suggestedSteps as { order: number; title: string; description?: string; owner?: string }[],
        }))}
      />
    </main>
  );
}
