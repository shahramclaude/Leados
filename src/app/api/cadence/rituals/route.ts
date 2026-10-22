import { NextResponse } from "next/server";
import { createRitual, listRituals } from "@/lib/cadence/graph";
import { resolveOrgId } from "@/lib/cadence/resolveOrg";
import type { ArtifactRef, RitualAnchor, RitualKind, SignalRef } from "@/lib/cadence/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = await resolveOrgId(url.searchParams);
  const rituals = await listRituals(orgId);
  return NextResponse.json({ orgId, rituals });
}

interface CreateRitualBody {
  orgId?: string;
  kind: RitualKind;
  name: string;
  participantRoles: string[];
  inputs: SignalRef[];
  outputs: ArtifactRef[];
  durationMinutes: number;
  quorum: number;
  timezone: string;
  anchor: RitualAnchor;
  dependsOnRitualId?: string | null;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json()) as CreateRitualBody;
  const orgId = body.orgId ?? (await resolveOrgId(url.searchParams));

  if (!body.name || !body.kind || !body.anchor) {
    return NextResponse.json({ error: "name, kind, and anchor are required" }, { status: 400 });
  }

  const ritual = await createRitual({
    orgId,
    kind: body.kind,
    name: body.name,
    participantRoles: body.participantRoles ?? [],
    inputs: body.inputs ?? [],
    outputs: body.outputs ?? [],
    durationMinutes: body.durationMinutes ?? 30,
    quorum: body.quorum ?? 1,
    timezone: body.timezone ?? "UTC",
    anchor: body.anchor,
    dependsOnRitualId: body.dependsOnRitualId ?? null,
    active: true,
  });
  return NextResponse.json({ ritual }, { status: 201 });
}
