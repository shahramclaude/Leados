import { causalInsight } from "@/lib/intelligence/intelligence";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeConfounder = searchParams.get("includeConfounder") !== "false";
  const finding = causalInsight(includeConfounder);
  return Response.json({ finding });
}
