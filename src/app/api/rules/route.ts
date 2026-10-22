import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rules } from "@/db/schema";
import { getTenantBySlug, resolveTenantSlug } from "@/lib/tenant";
import type { RuleOperator } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const slug = await resolveTenantSlug(request);
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: `unknown tenant '${slug}'` }, { status: 404 });

  const rows = await db.select().from(rules).where(eq(rules.tenantId, tenant.id)).orderBy(rules.id);
  return Response.json({ tenant: tenant.slug, rules: rows });
}

interface CreateRuleBody {
  name?: string;
  field?: string;
  operator?: RuleOperator;
  value?: string;
  weight?: number;
}

const VALID_OPERATORS: RuleOperator[] = ["gte", "lte", "eq", "truthy"];

export async function POST(request: Request) {
  const slug = await resolveTenantSlug(request);
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: `unknown tenant '${slug}'` }, { status: 404 });

  const body = (await request.json().catch(() => null)) as CreateRuleBody | null;
  if (
    !body?.name ||
    !body?.field ||
    !body?.operator ||
    !VALID_OPERATORS.includes(body.operator) ||
    body.value === undefined ||
    typeof body.weight !== "number"
  ) {
    return Response.json(
      { error: "name, field, operator (gte|lte|eq|truthy), value, weight are required" },
      { status: 400 },
    );
  }

  const [rule] = await db
    .insert(rules)
    .values({
      tenantId: tenant.id,
      name: body.name,
      field: body.field,
      operator: body.operator,
      value: body.value,
      weight: body.weight,
    })
    .returning();

  return Response.json({ rule }, { status: 201 });
}
