// src/app/api/adaptation/_util.ts
//
// Shared request helpers for the adaptation API routes.

import { NextRequest, NextResponse } from "next/server";

export function requireUserId(req: NextRequest): string | null {
  const fromQuery = req.nextUrl.searchParams.get("userId");
  if (fromQuery && fromQuery.trim().length > 0) return fromQuery.trim();
  return null;
}

export function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}
