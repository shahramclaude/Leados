import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const SAFE_FILE_NAME = /^conformity-bundle-[A-Za-z0-9_-]+\.json$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const file = url.searchParams.get("file");

  if (!file || !SAFE_FILE_NAME.test(file)) {
    return Response.json({ error: "Invalid or missing file name." }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "exports", file);
  if (!fs.existsSync(filePath)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const content = fs.readFileSync(filePath, "utf8");
  return new Response(content, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${file}"`,
    },
  });
}
