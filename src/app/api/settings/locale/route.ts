import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, isAppLocale } from "@/i18n/locales";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { locale } = body as { locale?: string };
  if (!isAppLocale(locale)) {
    return NextResponse.json({ error: "validation", message: "Unsupported locale." }, { status: 400 });
  }
  const response = NextResponse.json({ locale });
  response.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return response;
}
