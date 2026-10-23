import { submitReport } from "@/lib/safeChannel/store";

export const dynamic = "force-dynamic";

// Intentionally does NOT read x-actor-id/x-actor-role: reports can be filed
// by anyone, including outside the management chain, with no identity
// requirement at all.
export async function POST(req: Request) {
  const body = await req.json();
  if (!body.category || !body.body) {
    return Response.json({ error: '"category" and "body" are required' }, { status: 400 });
  }

  const result = await submitReport({
    category: body.category,
    body: body.body,
    reporterIdentity: body.reporterIdentity || undefined,
  });

  return Response.json(
    {
      caseRef: result.caseRef,
      lookupSecret: result.lookupSecret,
      note:
        "Save this case reference and lookup secret now — they are shown only once and are the only way to " +
        "check status anonymously. Your identity (if provided) is encrypted at rest and viewable only by the " +
        "ombudsman or ethics officer roles; every access to it is logged and unauthorized attempts are alerted.",
    },
    { status: 201 },
  );
}
