import { db } from "@/db";
import { evolutionLoops, fitnessSnapshots } from "@/db/schema";
import { estimateCounterfactual, type TimePoint } from "@/lib/fitness/counterfactual";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/fitness/counterfactual?loopId=123
 *
 * Splits the historical fitness snapshot series into "before" and "after" the
 * loop's execution date and estimates what fitness would have been without
 * the intervention (pre-period linear-trend extrapolation — declared proxy,
 * see caveat in the response). Compares against the loop's recorded actual
 * delta where available.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const loopIdParam = searchParams.get("loopId");

    const snapshots = await db.select().from(fitnessSnapshots).orderBy(asc(fitnessSnapshots.periodEnd));
    if (snapshots.length < 2) {
      return Response.json({ ok: false, error: "Need at least 2 fitness snapshots to estimate a counterfactual." }, { status: 400 });
    }

    const series: (TimePoint & { periodEnd: string })[] = snapshots.map((s, i) => ({
      t: i,
      value: Number(s.fitness),
      periodEnd: s.periodEnd,
    }));

    let splitIndex = Math.max(1, Math.floor(series.length / 2));
    let loop = null;
    if (loopIdParam) {
      const [found] = await db.select().from(evolutionLoops).where(eq(evolutionLoops.id, Number(loopIdParam)));
      loop = found ?? null;
      if (loop?.executedAt) {
        const executedDate = loop.executedAt.toISOString().slice(0, 10);
        const idx = series.findIndex((p) => p.periodEnd >= executedDate);
        if (idx > 0) splitIndex = idx;
      }
    }

    const pre = series.slice(0, splitIndex);
    const post = series.slice(splitIndex);
    if (post.length === 0) {
      return Response.json({ ok: false, error: "No post-intervention periods available yet." }, { status: 400 });
    }

    const result = estimateCounterfactual(pre, post);

    return Response.json({
      ok: true,
      loop,
      splitPeriodEnd: series[splitIndex]?.periodEnd ?? null,
      result,
      comparedToRecorded:
        loop?.actualDelta != null
          ? {
              recordedActualDelta: Number(loop.actualDelta),
              recordedCounterfactualDelta: loop.counterfactualDelta != null ? Number(loop.counterfactualDelta) : null,
              freshEstimatedEffect: result.estimatedEffect,
            }
          : null,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "counterfactual failed" }, { status: 500 });
  }
}
