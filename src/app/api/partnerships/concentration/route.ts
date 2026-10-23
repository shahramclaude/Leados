import { partners } from "@/db/schema";
import { listRows, ok } from "@/lib/leados/crud";
import { hhi, concentrationBand } from "@/lib/leados/calc";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await listRows(partners, desc(partners.id));
  const totalRevenue = rows.reduce((sum: number, r: Record<string, unknown>) => sum + Number(r.sourcedRevenueUsd) + Number(r.influencedRevenueUsd), 0);
  const shares = rows.map((r: Record<string, unknown>) => {
    const rev = Number(r.sourcedRevenueUsd) + Number(r.influencedRevenueUsd);
    return totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0;
  });
  const hhiValue = hhi(shares);
  const top1Share = shares.length ? Math.max(...shares) : 0;
  return ok({
    hhi: Math.round(hhiValue),
    band: concentrationBand(hhiValue),
    totalRevenueUsd: totalRevenue,
    top1SharePct: Number(top1Share.toFixed(1)),
    partnerCount: rows.length,
    method: rows.length > 0 ? "measured" : "unknown",
  });
}
