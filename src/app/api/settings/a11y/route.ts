import { NextRequest, NextResponse } from "next/server";
import { A11Y_COOKIE, DEFAULT_A11Y_PREFS, parseA11yCookie } from "@/lib/a11yPrefs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const current = parseA11yCookie(request.cookies.get(A11Y_COOKIE)?.value);
  const next = {
    ...DEFAULT_A11Y_PREFS,
    ...current,
    ...body,
  };
  next.textScale = Math.min(2, Math.max(1, Number(next.textScale) || 1));
  const response = NextResponse.json(next);
  response.cookies.set(A11Y_COOKIE, JSON.stringify(next), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}
