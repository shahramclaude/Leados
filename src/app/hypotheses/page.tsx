import { listHypotheses, scoreForecasters } from "@/lib/hypotheses";
import HypothesesBoard from "./HypothesesBoard";

export const dynamic = "force-dynamic";

export default async function HypothesesPage() {
  const [hypotheses, forecasters] = await Promise.all([listHypotheses(), scoreForecasters()]);

  return (
    <main className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold text-slate-950">Hypotheses</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          A prediction-market-style surface: open bets, current probability (Bayesian log-odds update per piece of
          evidence), evidence log, resolution date, and a Brier score per owner.
        </p>
      </header>
      <HypothesesBoard
        hypotheses={hypotheses.map((h) => ({
          id: h.id,
          key: h.key,
          title: h.title,
          description: h.description,
          ownerName: h.ownerName,
          category: h.category,
          priorProbability: h.priorProbability,
          currentProbability: h.currentProbability,
          status: h.status,
          resolutionDate: h.resolutionDate,
        }))}
        forecasters={forecasters}
      />
    </main>
  );
}
