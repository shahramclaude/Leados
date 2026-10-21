import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "reports", "calibration-latest.json");
    const content = await readFile(filePath, "utf-8");
    return new Response(content, { headers: { "content-type": "application/json" } });
  } catch {
    return Response.json(
      {
        error: "No calibration report found yet. Run `npm run eval:intelligence` to generate one.",
      },
      { status: 404 },
    );
  }
}
