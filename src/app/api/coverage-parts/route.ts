import { NextRequest, NextResponse } from "next/server";
import { getAllParts } from "@/lib/coverage";

export async function GET(request: NextRequest) {
  const statusFilter = request.nextUrl.searchParams.get("status");
  const seedFilter = request.nextUrl.searchParams.get("seed");

  let parts = await getAllParts();

  if (statusFilter) {
    parts = parts.filter((p) => p.currentStatus === statusFilter);
  }
  if (seedFilter) {
    parts = parts.filter((p) => p.seedStatus === seedFilter);
  }

  return NextResponse.json({ parts });
}
