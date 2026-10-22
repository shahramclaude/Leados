// Minimal shared-secret guard for ops-only endpoints (maintenance toggle,
// incident banner, fault-injection drill endpoints). Not a full auth system —
// documented as a known limitation (see Phase 5 "what we did not do").
import { NextRequest, NextResponse } from "next/server";

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "dev-admin-token";

export function requireAdmin(req: NextRequest): NextResponse | null {
  const token = req.headers.get("x-admin-token");
  if (token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: "unauthorized", hint: "set x-admin-token header" }, { status: 401 });
  }
  return null;
}
