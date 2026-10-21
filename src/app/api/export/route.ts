import { generateBoardPack, renderBoardPackMarkdown } from "@/lib/boardPack";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "board-pack";
  const format = searchParams.get("format") ?? "json";
  const periodLabel = searchParams.get("period") ?? new Date().toISOString().slice(0, 10);

  if (type !== "board-pack") {
    return Response.json({ error: `Unsupported export type: ${type}` }, { status: 400 });
  }

  const pack = await generateBoardPack(periodLabel);

  if (format === "markdown") {
    return new Response(renderBoardPackMarkdown(pack), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
  }
  return Response.json({ pack });
}
