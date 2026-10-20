import { requireSession } from "@/lib/platform/session";
import { errorToResponse } from "@/lib/platform/authz";
import {
  createFindingForSession,
  listFindingsForSession,
  resolveFindingForSession,
} from "@/lib/app/findings";
import type { FindingInput } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const findings = await listFindingsForSession(session);
    return Response.json({ findings });
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = (await request.json()) as FindingInput;
    const { finding, wasExisting } = await createFindingForSession(session, body);
    return Response.json({ finding, wasExisting }, { status: wasExisting ? 200 : 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const body = (await request.json()) as { id: string; expectedUpdatedAt: string };
    const result = await resolveFindingForSession(session, body.id, body.expectedUpdatedAt);
    if (result.outcome === "not_found") {
      return Response.json({ error: "Finding not found" }, { status: 404 });
    }
    if (result.outcome === "conflict") {
      return Response.json({ outcome: "conflict", finding: result.finding }, { status: 409 });
    }
    return Response.json({ outcome: "updated", finding: result.finding });
  } catch (err) {
    return errorToResponse(err);
  }
}
