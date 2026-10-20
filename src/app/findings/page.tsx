import { createFinding, listFindings } from "@/lib/app/findings";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function createAction(formData: FormData) {
  "use server";
  await createFinding({
    title: String(formData.get("title") ?? ""),
    summary: String(formData.get("summary") ?? ""),
    impact: Number(formData.get("impact")),
    confidence: Number(formData.get("confidence")),
    effort: Number(formData.get("effort")),
  });
  revalidatePath("/findings");
}

export default async function FindingsPage() {
  const page = await listFindings(new URLSearchParams({ limit: "50" }));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Findings</h1>

      <form action={createAction} className="ld-surface grid gap-3 rounded-xl border p-6 sm:grid-cols-2">
        <input
          name="title"
          required
          placeholder="Title"
          data-testid="finding-title"
          className="rounded-lg border px-3 py-2 sm:col-span-2"
        />
        <input
          name="summary"
          placeholder="Summary"
          className="rounded-lg border px-3 py-2 sm:col-span-2"
        />
        <input
          name="impact"
          type="number"
          min={1}
          max={10}
          defaultValue={5}
          placeholder="Impact (1-10)"
          data-testid="finding-impact"
          className="rounded-lg border px-3 py-2"
        />
        <input
          name="confidence"
          type="number"
          min={1}
          max={10}
          defaultValue={5}
          placeholder="Confidence (1-10)"
          data-testid="finding-confidence"
          className="rounded-lg border px-3 py-2"
        />
        <input
          name="effort"
          type="number"
          min={1}
          max={10}
          defaultValue={5}
          placeholder="Effort (1-10)"
          data-testid="finding-effort"
          className="rounded-lg border px-3 py-2"
        />
        <button
          type="submit"
          data-testid="submit-finding"
          className="rounded-lg px-4 py-2 font-medium text-white sm:col-span-2"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Create finding
        </button>
      </form>

      <ul className="space-y-2" data-testid="findings-list">
        {page.items.map((finding) => (
          <li key={finding.id} className="ld-surface flex items-center justify-between rounded-xl border p-4">
            <div>
              <p className="font-medium">{finding.title}</p>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {finding.summary}
              </p>
            </div>
            <span className="rounded-full px-3 py-1 text-sm font-semibold" style={{ backgroundColor: "var(--bg)" }}>
              score {finding.score}
            </span>
          </li>
        ))}
        {page.items.length === 0 && <p>No findings yet.</p>}
      </ul>
    </div>
  );
}
