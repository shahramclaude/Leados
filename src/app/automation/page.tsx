import { listRuns, runAutomation } from "@/lib/app/automation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function runAction(formData: FormData) {
  "use server";
  await runAutomation({
    kind: "monte_carlo_forecast",
    base: Number(formData.get("base")),
    volatility: Number(formData.get("volatility")),
    trials: Number(formData.get("trials")),
    seed: Number(formData.get("seed")),
  });
  revalidatePath("/automation");
}

export default async function AutomationPage() {
  const page = await listRuns(new URLSearchParams({ limit: "20" }));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Automation Runs</h1>

      <form action={runAction} className="ld-surface grid gap-3 rounded-xl border p-6 sm:grid-cols-2">
        <input
          name="base"
          type="number"
          defaultValue={1000}
          placeholder="Base value"
          data-testid="automation-base"
          className="rounded-lg border px-3 py-2"
        />
        <input
          name="volatility"
          type="number"
          step="0.01"
          defaultValue={0.15}
          placeholder="Volatility (0-1)"
          className="rounded-lg border px-3 py-2"
        />
        <input
          name="trials"
          type="number"
          defaultValue={1000}
          placeholder="Trials"
          className="rounded-lg border px-3 py-2"
        />
        <input
          name="seed"
          type="number"
          defaultValue={1}
          placeholder="Seed"
          className="rounded-lg border px-3 py-2"
        />
        <button
          type="submit"
          data-testid="run-automation"
          className="rounded-lg px-4 py-2 font-medium text-white sm:col-span-2"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Run Monte Carlo forecast
        </button>
      </form>

      <ul className="space-y-2" data-testid="runs-list">
        {page.items.map((run) => (
          <li key={run.id} className="ld-surface rounded-xl border p-4">
            <p className="font-medium">
              #{run.id} · {run.kind} · seed {run.seed} · {run.trials} trials
            </p>
            <pre className="mt-2 overflow-x-auto text-xs" style={{ color: "var(--muted)" }}>
              {JSON.stringify(run.result, null, 2)}
            </pre>
          </li>
        ))}
        {page.items.length === 0 && <p>No automation runs yet.</p>}
      </ul>
    </div>
  );
}
