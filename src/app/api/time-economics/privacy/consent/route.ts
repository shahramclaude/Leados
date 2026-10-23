// GET/POST /api/time-economics/privacy/consent
//
// Privacy toggle with audit: a person may only change their OWN consent
// settings. Individual time data defaults to self-view-only
// (shareAggregateOnly=true, allowManagerView=false) — this endpoint is
// the one place that default can be loosened, and only by the owner.
import { getActorFromRequest, getConsent, upsertConsent, logPrivacyDecision } from "@/lib/time-economics/repo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actor = await getActorFromRequest(req);
  if (!actor) return Response.json({ error: "Missing or invalid x-user-id" }, { status: 401 });
  const consent = await getConsent(actor.id);
  return Response.json({
    userId: actor.id,
    consent: consent ?? { userId: actor.id, shareAggregateOnly: true, allowManagerView: false, updatedAt: null },
  });
}

export async function POST(req: Request) {
  const actor = await getActorFromRequest(req);
  if (!actor) return Response.json({ error: "Missing or invalid x-user-id" }, { status: 401 });

  const body = await req.json();
  const { shareAggregateOnly, allowManagerView } = body ?? {};
  if (typeof shareAggregateOnly !== "boolean" || typeof allowManagerView !== "boolean") {
    return Response.json({ error: "shareAggregateOnly and allowManagerView must be booleans" }, { status: 400 });
  }

  await upsertConsent(actor.id, shareAggregateOnly, allowManagerView);
  await logPrivacyDecision(
    actor.id,
    actor.id,
    "consent_update",
    true,
    `Self-updated consent: shareAggregateOnly=${shareAggregateOnly}, allowManagerView=${allowManagerView}.`,
  );

  const consent = await getConsent(actor.id);
  return Response.json({ userId: actor.id, consent });
}
