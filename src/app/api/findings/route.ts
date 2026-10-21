import "@/lib/kernel/bootstrap";
import { db } from "@/db";
import { kernelFindings } from "@/db/schema";
import { desc } from "drizzle-orm";
import { openFinding } from "@/lib/kernel/severity";
import type { Actor } from "@/lib/kernel/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const findings = await db.select().from(kernelFindings).orderBy(desc(kernelFindings.createdAt));
  return Response.json({ findings });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    severity?: 1 | 2 | 3 | 4 | 5;
    title?: string;
    description?: string;
    domain?: string;
    actorId?: string;
  };
  if (!body.severity || !body.title || !body.description || !body.domain) {
    return Response.json({ error: "severity, title, description, domain are required" }, { status: 400 });
  }
  const actor: Actor = { kind: "agent", id: body.actorId ?? "api:findings" };
  const finding = await openFinding({ severity: body.severity, title: body.title, description: body.description, domain: body.domain }, actor);
  return Response.json({ finding }, { status: 201 });
}
