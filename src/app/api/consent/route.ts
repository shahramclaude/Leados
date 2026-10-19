import { resolveViewer } from "@/lib/platform/auth";
import { recordConsent } from "@/lib/app/people/consent";
import { TRANSPARENCY_NOTICE_VERSION } from "@/lib/domain/people/privacy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const viewer = resolveViewer(request);
  const body = await request.json().catch(() => null);
  if (!body?.personId || !body?.scope || typeof body?.granted !== "boolean") {
    return Response.json({ error: "personId, scope, and granted(boolean) are required." }, { status: 400 });
  }

  const result = await recordConsent(
    viewer,
    body.personId,
    body.scope,
    body.noticeVersion ?? TRANSPARENCY_NOTICE_VERSION,
    body.granted,
  );
  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : 400;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json({ record: result.record }, { status: 201 });
}
