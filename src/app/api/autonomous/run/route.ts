import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { persistAutonomousRun } from "@/lib/autonomousPersist";

export const dynamic = "force-dynamic";

/** Validate the caller against CRON_SECRET, when one is configured. */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured — fail safe to "open" only in non-production so
    // local development keeps working; always set CRON_SECRET in production.
    return process.env.NODE_ENV !== "production";
  }
  const header = req.headers.get("x-cron-secret");
  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null;
  return header === secret || bearer === secret;
}

/** POST /api/autonomous/run — intended to be hit by an external scheduler (cron). */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await persistAutonomousRun(db, new Date());
    return NextResponse.json(result);
  } catch (err) {
    console.error("autonomous run failed", err);
    return NextResponse.json({ error: "Autonomous run failed" }, { status: 500 });
  }
}


