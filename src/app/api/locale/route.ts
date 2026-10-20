import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import { requireSession } from "@/lib/platform/session";
import { updateUserPreferences } from "@/lib/platform/db/usersRepository";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { locale?: string };
  const locale = normalizeLocale(body.locale);
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { sameSite: "lax", path: "/" });

  try {
    const session = await requireSession();
    await updateUserPreferences(session.userId, { locale });
  } catch {
    // Not signed in yet (e.g. switching language on the login screen) — the
    // cookie alone is enough to drive rendering, no user row to persist to.
  }

  return Response.json({ locale });
}
