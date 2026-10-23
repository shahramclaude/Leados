import { NextResponse } from "next/server";
import { seedDemoData } from "@/lib/collective/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await seedDemoData();
    return NextResponse.json({ seeded: true, ...result });
  } catch (err) {
    return NextResponse.json({ seeded: false, error: (err as Error).message }, { status: 500 });
  }
}
