import { exportLeadsCsv } from "@/lib/export";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  const result = await exportLeadsCsv();

  if (format === "file") {
    return new Response(result.csvText, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.manifestId}.csv"`,
        "X-Export-Checksum-Sha256": result.checksumSha256,
        "X-Export-Row-Count": String(result.rowCount),
      },
    });
  }

  return Response.json(result);
}
