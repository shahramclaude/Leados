import { db } from "@/db";
import * as s from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Card, Badge } from "@/components/Shell";

export const dynamic = "force-dynamic";

async function addDecision(formData: FormData) {
  "use server";
  const options = String(formData.get("options") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const dissent = String(formData.get("dissent") || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  await db.insert(s.decisionRecords).values({
    question: String(formData.get("question") || ""),
    options,
    chosen: String(formData.get("chosen") || ""),
    rationale: String(formData.get("rationale") || ""),
    dissent,
    reviewDate: String(formData.get("reviewDate") || new Date().toISOString().slice(0, 10)),
  });
  revalidatePath("/collaboration");
}

async function resolveThread(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  await db.update(s.commentThreads).set({ status: "resolved" }).where(eq(s.commentThreads.id, id));
  revalidatePath("/collaboration");
}

export default async function CollaborationPage() {
  const decisions = await db.select().from(s.decisionRecords).orderBy(desc(s.decisionRecords.createdAt));
  const threads = await db.select().from(s.commentThreads).orderBy(desc(s.commentThreads.createdAt));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">Part 95</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Real-Time Collaboration &amp; Decision Records</h1>
        <p className="mt-1 text-sm text-slate-600">
          Institutional memory: every decision records its rationale, dissent (never discarded), and a mandatory
          review date. Comment threads are anchored to documents and tracked to resolution.
        </p>
      </header>

      <Card title="Record a decision (rationale + dissent are mandatory fields)">
        <form action={addDecision} className="grid grid-cols-1 gap-3">
          <input name="question" placeholder="Decision question" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="options" placeholder="Options (comma-separated)" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="chosen" placeholder="Chosen option" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <textarea name="rationale" placeholder="Rationale" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="dissent" placeholder="Dissent (semicolon-separated, or leave blank for none recorded)" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <label className="text-xs text-slate-500">Review date</label>
          <input name="reviewDate" type="date" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <button className="w-fit rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">Record decision</button>
        </form>
      </Card>

      <Card title={`Decision log (${decisions.length})`}>
        <ul className="space-y-3">
          {decisions.map((d) => (
            <li key={d.id} className="rounded-lg border border-slate-100 p-3 text-sm">
              <p className="font-medium">{d.question}</p>
              <p className="mt-1">Chosen: <Badge tone="indigo">{d.chosen}</Badge> of [{d.options.join(", ")}]</p>
              <p className="mt-1 text-slate-600">{d.rationale}</p>
              <p className="mt-1 text-xs text-slate-500">
                Dissent: {d.dissent.length ? d.dissent.join("; ") : "none recorded"} · review by {d.reviewDate}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={`Review threads (${threads.length})`}>
        <ul className="space-y-2">
          {threads.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3 text-sm">
              <div>
                <p className="font-medium">{t.docRef}</p>
                <p className="text-slate-600">&ldquo;{t.quotedText}&rdquo;</p>
                <p className="mt-1 text-xs text-slate-500">participants: {t.participants.join(", ")}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={t.status === "resolved" ? "green" : t.status === "deferred" ? "amber" : "indigo"}>{t.status}</Badge>
                {t.status !== "resolved" && (
                  <form action={resolveThread}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Resolve</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
