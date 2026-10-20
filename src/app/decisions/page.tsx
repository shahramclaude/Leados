import { createDecision, listDecisions, updateDecisionBelief } from "@/lib/app/decisions";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function createAction(formData: FormData) {
  "use server";
  await createDecision({
    title: String(formData.get("title") ?? ""),
    context: String(formData.get("context") ?? ""),
  });
  revalidatePath("/decisions");
}

async function updateBeliefAction(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  await updateDecisionBelief(id, {
    successes: Number(formData.get("successes") ?? 0),
    failures: Number(formData.get("failures") ?? 0),
  });
  revalidatePath("/decisions");
}

export default async function DecisionsPage() {
  const page = await listDecisions(new URLSearchParams({ limit: "50" }));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Decisions</h1>

      <form action={createAction} className="ld-surface grid gap-3 rounded-xl border p-6">
        <input
          name="title"
          required
          placeholder="Decision title"
          data-testid="decision-title"
          className="rounded-lg border px-3 py-2"
        />
        <input name="context" placeholder="Context" className="rounded-lg border px-3 py-2" />
        <button
          type="submit"
          data-testid="submit-decision"
          className="rounded-lg px-4 py-2 font-medium text-white"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Create decision
        </button>
      </form>

      <ul className="space-y-3" data-testid="decisions-list">
        {page.items.map((decision) => (
          <li key={decision.id} className="ld-surface space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">{decision.title}</p>
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                belief {(decision.beliefMean * 100).toFixed(1)}% · {decision.status}
              </span>
            </div>
            <form action={updateBeliefAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={decision.id} />
              <input
                name="successes"
                type="number"
                min={0}
                defaultValue={1}
                className="w-24 rounded-lg border px-2 py-1 text-sm"
                aria-label="successes"
              />
              <input
                name="failures"
                type="number"
                min={0}
                defaultValue={0}
                className="w-24 rounded-lg border px-2 py-1 text-sm"
                aria-label="failures"
              />
              <button
                type="submit"
                data-testid={`update-belief-${decision.id}`}
                className="rounded-lg border px-3 py-1 text-sm"
              >
                Update belief
              </button>
            </form>
          </li>
        ))}
        {page.items.length === 0 && <p>No decisions yet.</p>}
      </ul>
    </div>
  );
}
