import { getAllGroupReadiness } from "@/lib/change/dashboard";

export const dynamic = "force-dynamic";

/**
 * Group Readiness Cards. Aggregate-only; any group below the k-anonymity
 * threshold comes back with `readiness.ok === false` and no score at all —
 * there is no "small group" code path that leaks a number.
 */
export async function GET() {
  const views = await getAllGroupReadiness(new Date());
  return Response.json({ ok: true, groups: views });
}
