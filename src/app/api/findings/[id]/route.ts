import { getFinding } from "@/lib/app/findings";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return Response.json({ error: "id must be an integer" }, { status: 400 });
  }
  const finding = await getFinding(numericId);
  if (!finding) {
    return Response.json({ error: "Finding not found" }, { status: 404 });
  }
  return Response.json(finding);
}
