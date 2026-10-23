import { NextResponse } from "next/server";
import { getAllParts } from "@/lib/coverage";

export async function GET() {
  const parts = await getAllParts();
  const gaps = parts.filter(
    (p) =>
      p.seedStatus !== "canonical" ||
      p.currentStatus === "missing" ||
      p.currentStatus === "partial" ||
      p.currentStatus === "legacy_quarantined",
  );
  return NextResponse.json({ gaps });
}
