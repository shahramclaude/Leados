import { db } from "@/db";
import { getAllRules } from "@/lib/ruleStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const rules = await getAllRules(db);
  return Response.json(
    rules.map((r) => ({
      key: r.key,
      name: r.name,
      domain: r.domain,
      baseSeverity: r.baseSeverity,
      weight: r.weight,
    })),
  );
}
