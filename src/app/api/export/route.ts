// /api/export — exports strategic artifacts in a renderer-agnostic format.
// `format=markdown` returns the board pack's publication-ready markdown
// directly (PDF-ready: any markdown-to-PDF renderer can consume it
// unmodified); `format=json` returns the full structured pack plus
// metadata for programmatic consumption (e.g. feeding a slide generator).
import { jsonError } from "@/lib/api";
import { buildBoardPack } from "@/lib/boardPackService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "board-pack";
    const format = searchParams.get("format") ?? "json";

    if (type !== "board-pack") {
      return jsonError(`Unsupported export type "${type}". Supported: board-pack.`);
    }

    const { pack, inputsSnapshot, periodLabel } = await buildBoardPack(new Date());

    if (format === "markdown") {
      return new Response(pack.markdown, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="board-pack-${periodLabel}.md"`,
        },
      });
    }

    return Response.json({ type, periodLabel, inputsSnapshot, pack });
  } catch (err) {
    return jsonError((err as Error).message, 500);
  }
}
