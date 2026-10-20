import { NextRequest, NextResponse } from "next/server";
import { CSRF_COOKIE, csrfCookieOptions, generateCsrfToken } from "@/lib/csrf";

export const dynamic = "force-dynamic";

/**
 * Issues (or reuses) the CSRF cookie and returns the token so client code
 * can echo it back in the `x-csrf-token` header on mutating requests.
 */
export async function GET(req: NextRequest) {
  const existing = req.cookies.get(CSRF_COOKIE)?.value;
  const token = existing ?? generateCsrfToken();
  const res = NextResponse.json({ csrfToken: token });
  res.cookies.set(CSRF_COOKIE, token, csrfCookieOptions());
  return res;
}
