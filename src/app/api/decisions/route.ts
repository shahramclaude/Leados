import { NextRequest } from "next/server";
import { db } from "@/db";
import { leadosDecisionLog, leadosDecisions } from "@/db/schema";
import type { DecisionData, DecisionOption } from "@/lib/decisionTypes";
import { computeDecisionVelocity } from "@/lib/decisionEngine";
import { and, desc, eq, gte, lte } from "drizzle-orm";

export const dynamic = "force-dynamic";

function randomOptionId(): string {
  return `opt_${Math.random().toString(36).slice(2, 10)}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  const status = searchParams.get("status");
  const ownerId = searchParams.get("owner");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const conditions = [];
  if (domain) conditions.push(eq(leadosDecisions.domain, domain));
  if (status) conditions.push(eq(leadosDecisions.status, status));
  if (ownerId) conditions.push(eq(leadosDecisions.ownerId, Number(ownerId)));
  if (from) conditions.push(gte(leadosDecisions.createdAt, new Date(from)));
  if (to) conditions.push(lte(leadosDecisions.createdAt, new Date(to)));

  const rows = await db
    .select()
    .from(leadosDecisions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(leadosDecisions.createdAt));

  const now = new Date();
  const decisions = rows.map((row) => ({
    ...row,
    ageDays: Math.max(0, Math.round((now.getTime() - new Date(row.createdAt).getTime()) / (24 * 60 * 60 * 1000))),
    optionsCount: (row.options as DecisionOption[] | null)?.length ?? 0,
  }));

  const velocity = computeDecisionVelocity(rows, now);

  const allRows = await db
    .select({ domain: leadosDecisions.domain, ownerId: leadosDecisions.ownerId, data: leadosDecisions.data })
    .from(leadosDecisions);
  const domains = Array.from(new Set(allRows.map((r) => r.domain))).sort();
  const ownerMap = new Map<number, string>();
  for (const r of allRows) {
    if (r.ownerId != null) {
      const name = (r.data as DecisionData | null)?.ownerName ?? `Owner #${r.ownerId}`;
      ownerMap.set(r.ownerId, name);
    }
  }
  const owners = Array.from(ownerMap.entries()).map(([id, name]) => ({ id, name }));

  return Response.json({ decisions, velocity, domains, owners });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, description, domain, deadline, confidenceAtDecision, options, ownerId, ownerName, stakeholders, expectedOutcome } = body ?? {};

  if (!title || typeof title !== "string") {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  if (!Array.isArray(options) || options.length === 0) {
    return Response.json({ error: "at least one option is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const normalizedOptions: DecisionOption[] = options.map((o: Partial<DecisionOption>, idx: number) => ({
    id: o.id || randomOptionId(),
    label: o.label || `Option ${idx + 1}`,
    description: o.description || "",
    cost: Number(o.cost ?? 5),
    impact: Number(o.impact ?? 5),
    reversibility: Number(o.reversibility ?? 5),
    speed: Number(o.speed ?? 5),
    risk: Number(o.risk ?? 5),
    createdAt: o.createdAt || now,
  }));

  const data: DecisionData = {
    ownerName: ownerName || undefined,
    stakeholderNames: Array.isArray(body.stakeholderNames) ? body.stakeholderNames : undefined,
  };

  const [row] = await db
    .insert(leadosDecisions)
    .values({
      title,
      description: description ?? "",
      domain: domain || "general",
      status: "open",
      options: normalizedOptions,
      confidenceAtDecision: confidenceAtDecision != null ? Number(confidenceAtDecision) : null,
      expectedOutcome: expectedOutcome ?? null,
      ownerId: ownerId != null ? Number(ownerId) : null,
      stakeholders: Array.isArray(stakeholders) ? stakeholders.map((s: number) => Number(s)) : null,
      deadline: deadline || null,
      data,
    })
    .returning();

  await db.insert(leadosDecisionLog).values({
    decisionId: row.id,
    action: "created",
    actor: ownerName || "system",
    before: null,
    after: row,
  });

  return Response.json({ decision: row }, { status: 201 });
}
