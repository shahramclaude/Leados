import { NextResponse } from "next/server";
import { getWhitepaperMarkdown } from "@/lib/docs";

export const dynamic = "force-dynamic";

export async function GET() {
  const markdown = await getWhitepaperMarkdown();
  return NextResponse.json({ markdown });
}
