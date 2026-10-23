import { db } from "@/db";
import * as s from "@/db/schema";
import { desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Card, Badge, HonestyBadge } from "@/components/Shell";
import { movingAverageForecast } from "@/lib/calculations";

export const dynamic = "force-dynamic";

async function addOpportunity(formData: FormData) {
  "use server";
  await db.insert(s.opportunities).values({
    name: String(formData.get("name") || ""),
    account: String(formData.get("account") || ""),
    amountUsd: String(formData.get("amountUsd") || "0"),
    stage: String(formData.get("stage") || "prospect"),
    probability: String(formData.get("probability") || "0.1"),
    closeDate: String(formData.get("closeDate") || new Date().toISOString().slice(0, 10)),
    owner: String(formData.get("owner") || "unassigned"),
  });
  revalidatePath("/revenue");
}

const STAGE_ORDER = ["prospect", "qualify", "propose", "negotiate", "closed-won", "closed-lost"];

export default async function RevenuePage() {
  const opps = await db.select().from(s.opportunities).orderBy(desc(s.opportunities.createdAt));
  const forecasts = await db.select().from(s.revenueForecasts).orderBy(desc(s.revenueForecasts.createdAt));

  const open = opps.filter((o) => o.stage !== "closed-won" && o.stage !== "closed-lost");
  const pipelineValue = open.reduce((a, o) => a + Number(o.amountUsd), 0);
  const weightedPipeline = open.reduce((a, o) => a + Number(o.amountUsd) * Number(o.probability), 0);

  const closedWonAmounts = opps.filter((o) => o.stage === "closed-won").map((o) => Number(o.amountUsd));
  const liveForecast = closedWonAmounts.length >= 2 ? movingAverageForecast(closedWonAmounts, 6) : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">Part 92</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Go-to-Market &amp; Revenue Operations</h1>
        <p className="mt-1 text-sm text-slate-600">
          Pipeline hygiene, probability-weighted forecasting, and a distribution-valued (P10/P50/P90) revenue forecast &mdash;
          never a single point estimate.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="Open pipeline">
          <p className="text-2xl font-semibold">${pipelineValue.toLocaleString()}</p>
          <p className="text-xs text-slate-500">{open.length} open opportunities</p>
        </Card>
        <Card title="Probability-weighted pipeline">
          <p className="text-2xl font-semibold">${Math.round(weightedPipeline).toLocaleString()}</p>
          <p className="mt-1"><HonestyBadge label="estimated" /></p>
        </Card>
        <Card title="Stored forecast (P10 / P50 / P90)">
          {forecasts[0] ? (
            <div>
              <p className="text-sm">
                ${Number(forecasts[0].p10).toLocaleString()} &mdash; ${Number(forecasts[0].p50).toLocaleString()} &mdash; $
                {Number(forecasts[0].p90).toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-slate-500">method: {forecasts[0].method}</p>
              <p className="mt-1"><HonestyBadge label={forecasts[0].honestyLabel} /></p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No forecast stored yet.</p>
          )}
        </Card>
      </div>

      {liveForecast && (
        <Card title="Live-recomputed forecast from closed-won history (moving-average, disclosed formula)">
          <p className="text-sm">
            P10 ${liveForecast.p10.toLocaleString()} · P50 ${liveForecast.p50.toLocaleString()} · P90 ${liveForecast.p90.toLocaleString()}
          </p>
        </Card>
      )}

      <Card title="Add opportunity">
        <form action={addOpportunity} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input name="name" placeholder="Opportunity name" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="account" placeholder="Account" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="owner" placeholder="Owner" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="amountUsd" type="number" step="0.01" placeholder="Amount (USD)" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <select name="stage" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            {STAGE_ORDER.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
          <input name="probability" type="number" step="0.01" min="0" max="1" placeholder="Probability (0-1)" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="closeDate" type="date" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">Add opportunity</button>
        </form>
      </Card>

      <Card title={`Pipeline (${opps.length})`}>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr>
              <th className="py-1.5">Name</th>
              <th>Account</th>
              <th>Stage</th>
              <th>Amount</th>
              <th>Probability</th>
              <th>Close date</th>
              <th>Owner</th>
            </tr>
          </thead>
          <tbody>
            {opps.map((o) => (
              <tr key={o.id} className="border-t border-slate-100">
                <td className="py-1.5">{o.name}</td>
                <td>{o.account}</td>
                <td><Badge tone={o.stage === "closed-won" ? "green" : o.stage === "closed-lost" ? "red" : "indigo"}>{o.stage}</Badge></td>
                <td>${Number(o.amountUsd).toLocaleString()}</td>
                <td>{(Number(o.probability) * 100).toFixed(0)}%</td>
                <td>{o.closeDate}</td>
                <td>{o.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
