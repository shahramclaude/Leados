import { db } from "@/db";
import * as s from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Card, Badge, HonestyBadge } from "@/components/Shell";

export const dynamic = "force-dynamic";

async function addAppeal(formData: FormData) {
  "use server";
  await db.insert(s.appeals).values({
    subjectRef: String(formData.get("subjectRef") || ""),
    challenger: String(formData.get("challenger") || ""),
    claim: String(formData.get("claim") || ""),
  });
  revalidatePath("/trust");
}

async function resolveAppeal(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  const status = String(formData.get("status"));
  const resolution = String(formData.get("resolution") || "");
  await db.update(s.appeals).set({ status, resolution }).where(eq(s.appeals.id, id));
  revalidatePath("/trust");
}

function daysSince(d: string | Date) {
  return Math.round((Date.now() - new Date(d).getTime()) / 86400000);
}

export default async function TrustPage() {
  const metrics = await db.select().from(s.metricRegistry);
  const cards = await db.select().from(s.modelCards);
  const appeals = await db.select().from(s.appeals).orderBy(desc(s.appeals.createdAt));

  const staleCards = cards.filter((c) => daysSince(c.lastReviewed) > 180);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">Part 97</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Trust &amp; Explainability Center</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every number displayed in this console resolves to a registry entry with a disclosed formula, an owner,
          and an honesty label. Model/ruleset cards expire after 180 days.
        </p>
      </header>

      <Card title="Reconstructability: metric registry">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr><th className="py-1.5">Metric key</th><th>Surface</th><th>Formula</th><th>Owner</th><th>Honesty</th><th>Last reviewed</th></tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="py-1.5 font-mono text-xs">{m.metricKey}</td>
                <td>{m.route}</td>
                <td className="text-xs text-slate-600">{m.formula}</td>
                <td>{m.owner}</td>
                <td><HonestyBadge label={m.honestyLabel} /></td>
                <td>{m.lastReviewed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title={`Model / ruleset cards (${cards.length}, ${staleCards.length} stale)`}>
        <ul className="space-y-2 text-sm">
          {cards.map((c) => (
            <li key={c.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{c.name}</p>
                <div className="flex gap-2">
                  <Badge tone="indigo">{c.kind}</Badge>
                  {daysSince(c.lastReviewed) > 180 && <Badge tone="red">stale review</Badge>}
                </div>
              </div>
              <p className="mt-1 text-slate-600">{c.purpose}</p>
              <p className="mt-1 text-xs text-slate-500">Known limits: {c.knownLimits}</p>
              <p className="mt-1 text-xs text-slate-400">owner {c.owner} · reviewed {c.lastReviewed}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="File an appeal against a number or recommendation">
        <form action={addAppeal} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input name="subjectRef" placeholder="Subject (e.g. churn-warning:globex-logistics)" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="challenger" placeholder="Your name" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="claim" placeholder="What's wrong with it?" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:col-span-1" />
          <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">File appeal</button>
        </form>
      </Card>

      <Card title={`Appeals (${appeals.length})`}>
        <ul className="space-y-2 text-sm">
          {appeals.map((a) => (
            <li key={a.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium font-mono text-xs">{a.subjectRef}</p>
                <Badge tone={a.status === "open" ? "amber" : a.status === "overturned" ? "red" : a.status === "upheld" ? "green" : "indigo"}>{a.status}</Badge>
              </div>
              <p className="mt-1 text-slate-600">&ldquo;{a.claim}&rdquo; &mdash; {a.challenger}</p>
              {a.resolution && <p className="mt-1 text-xs text-slate-500">Resolution: {a.resolution}</p>}
              {a.status === "open" && (
                <form action={resolveAppeal} className="mt-2 flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={a.id} />
                  <select name="status" className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                    <option value="upheld">upheld</option>
                    <option value="overturned">overturned</option>
                    <option value="partially">partially</option>
                  </select>
                  <input name="resolution" placeholder="Resolution note / system change" className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                  <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Resolve</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
