import { generatePostMeetingArtifacts, listArtifacts } from "@/lib/meeting/pipeline";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const artifacts = await listArtifacts(id);
  return Response.json({ artifacts });
}

// Triggers the post-meeting generation step: verbatim transcript -> drafted,
// cited artifacts. Nothing here commits a Decision/Task yet.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await generatePostMeetingArtifacts(id);
  return Response.json(result, { status: 201 });
}
