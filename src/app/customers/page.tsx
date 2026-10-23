import { db } from "@/db";
import * as s from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Card, Badge, HonestyBadge } from "@/components/Shell";
import { churnProbabilityFromHealth, weightedHealthScore } from "@/lib/calculations";

export const dynamic = "force-dynamic";

async function recomputeHealth(formData: FormData) {
  "use server";
  const accountId = Number(formData.get("accountId"));
  const adoption = Number(formData.get("adoption"));
  const engagement = Number(formData.get("engagement"));
  const support = Number(formData.get("support"));
  const outcome = Number(formData.get("outcome"));
  const result = weightedHealthScore([
    { name: "adoption", value: adoption, weight: 0.3 },
    { name: "engagement", value: engagement, weight: 0.25 },
    { name: "support", value: support, weight: 0.25 },
    { name: "outcome", value: outcome, weight: 0.2 },
  ]);
  await db.insert(s.healthScores).values({
    accountId,
    score: String(result.score),
    band: result.band,
    adoption: String(adoption),
    engagement: String(engagement),
    support: String(support),
    outcome: String(outcome),
    explainTop3: result.explainTop3,
  });
  revalidatePath("/customers");
}

export default async function CustomersPage() {
  const accounts = await db.select().from(s.accounts);
  const healthRows = await db.select().from(s.healthScores).orderBy(desc(s.healthScores.computedAt));
  const latestHealthByAccount = new Map<number, (typeof healthRows)[number]>();
  for (const h of healthRows) {
    if (!latestHealthByAccount.has(h.accountId)) latestHealthByAccount.set(h.accountId, h);
  }
  const churnWarnings = await db.select().from(s.churnWarnings).orderBy(desc(s.churnWarnings.probability));
  const voiceItems = await db.select().from(s.voiceItems).orderBy(desc(s.voiceItems.createdAt));

  const healthyCount = [...latestHealthByAccount.values()].filter((h) => h.band === "healthy").length;
  const atRiskCount = [...latestHealthByAccount.values()].filter((h) => h.band === "at-risk" || h.band === "critical").length;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">Part 93</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Customer Success &amp; Product Intelligence</h1>
        <p className="mt-1 text-sm text-slate-600">
          Evidence-locked health scores (every score ships its top-3 explain factors), churn early-warning, and voice-of-customer.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="Healthy accounts"><p className="text-2xl font-semibold text-emerald-600">{healthyCount}</p></Card>
        <Card title="At-risk / critical accounts"><p className="text-2xl font-semibold text-rose-600">{atRiskCount}</p></Card>
        <Card title="Open churn warnings"><p className="text-2xl font-semibold">{churnWarnings.length}</p></Card>
      </div>

      <Card title="Account health (latest score per account, explainable)">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr><th className="py-1.5">Account</th><th>Score</th><th>Band</th><th>Churn probability (model)</th><th>Top factors</th></tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const h = latestHealthByAccount.get(a.id);
              const churnP = h ? churnProbabilityFromHealth(Number(h.score)) : null;
              return (
                <tr key={a.id} className="border-t border-slate-100 align-top">
                  <td className="py-1.5">{a.name}<div className="text-xs text-slate-400">{a.segment}</div></td>
                  <td>{h ? Number(h.score).toFixed(1) : "—"}</td>
                  <td>{h ? <Badge tone={h.band === "healthy" ? "green" : h.band === "watch" ? "indigo" : h.band === "at-risk" ? "amber" : "red"}>{h.band}</Badge> : "—"}</td>
                  <td>
                    {churnP !== null ? (
                      <span>
                        {(churnP * 100).toFixed(1)}% <HonestyBadge label="association" />
                      </span>
                    ) : "—"}
                  </td>
                  <td className="text-xs text-slate-500">{h ? h.explainTop3.join("; ") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="Recompute a health score (weighted-sum formula, disclosed weights: 30/25/25/20)">
        <form action={recomputeHealth} className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <select name="accountId" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input name="adoption" type="number" min="0" max="100" placeholder="Adoption 0-100" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="engagement" type="number" min="0" max="100" placeholder="Engagement 0-100" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="support" type="number" min="0" max="100" placeholder="Support 0-100" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="outcome" type="number" min="0" max="100" placeholder="Outcome 0-100" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <button className="col-span-full rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 sm:col-span-1">Recompute</button>
        </form>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Churn early-warnings">
          <ul className="space-y-2 text-sm">
            {churnWarnings.map((c) => {
              const acc = accounts.find((a) => a.id === c.accountId);
              return (
                <li key={c.id} className="rounded-lg border border-slate-100 p-2">
                  <p className="font-medium">{acc?.name ?? `#${c.accountId}`} &mdash; {(Number(c.probability) * 100).toFixed(0)}% <HonestyBadge label={c.honestyLabel} /></p>
                  <p className="text-xs text-slate-500">lead time {c.leadTimeDays}d · {c.driver}</p>
                </li>
              );
            })}
            {churnWarnings.length === 0 && <p className="text-sm text-slate-500">No warnings.</p>}
          </ul>
        </Card>
        <Card title="Voice of customer">
          <ul className="space-y-2 text-sm">
            {voiceItems.map((v) => (
              <li key={v.id} className="rounded-lg border border-slate-100 p-2">
                <p>&ldquo;{v.text}&rdquo;</p>
                <p className="mt-1 text-xs text-slate-500">
                  {v.source} · topic: {v.topic} · sentiment {Number(v.sentiment).toFixed(2)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
