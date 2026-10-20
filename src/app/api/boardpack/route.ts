import { generateBoardPack, getLatestPack } from "@/lib/app/boardPack";
import { checkAuth } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const existing = await getLatestPack();
  if (existing) return Response.json(existing);
  const generated = await generateBoardPack();
  return Response.json(generated);
}

export async function POST(request: Request) {
  const auth = checkAuth(request);
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });
  const pack = await generateBoardPack();
  return Response.json(pack, { status: 201 });
}
