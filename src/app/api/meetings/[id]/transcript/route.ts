import { getTranscript, ingestTranscriptSegment } from "@/lib/meeting/pipeline";
import { renderSegmentForDisplay } from "@/lib/redaction/redact";

export const dynamic = "force-dynamic";

// GET returns a view-safe transcript: verbatim text only for consenting
// speakers, a redaction placeholder otherwise. The raw DB row always keeps
// what was actually said (for audit/consent-change purposes) but this
// surface never leaks it to a client.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const segments = await getTranscript(id);
  return Response.json({
    segments: segments
      .sort((a, b) => a.startMs - b.startMs)
      .map((s) => ({
        id: s.id,
        speakerName: s.speakerName,
        startMs: s.startMs,
        endMs: s.endMs,
        consentAtCapture: s.consentAtCapture,
        redacted: s.redacted,
        text: renderSegmentForDisplay(s),
      })),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { speakerParticipantId, speakerName, startMs, endMs, text } = body as Record<string, unknown>;
  if (!speakerName || !text) {
    return Response.json({ error: "speakerName and text are required" }, { status: 400 });
  }
  const segment = await ingestTranscriptSegment(id, {
    speakerParticipantId: (speakerParticipantId as string) ?? null,
    speakerName: speakerName as string,
    startMs: typeof startMs === "number" ? startMs : 0,
    endMs: typeof endMs === "number" ? endMs : 0,
    text: text as string,
  });
  return Response.json({ segment }, { status: 201 });
}
