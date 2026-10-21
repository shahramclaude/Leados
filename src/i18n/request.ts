import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_META, isAppLocale } from "./locales";

async function resolveLocale(): Promise<string> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isAppLocale(cookieLocale)) return cookieLocale;

  const headerStore = await headers();
  const accept = headerStore.get("accept-language") ?? "";
  if (accept.toLowerCase().startsWith("da")) return "da-DK";

  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return {
    locale,
    messages,
    timeZone: LOCALE_META[locale as keyof typeof LOCALE_META]?.timeZone ?? "UTC",
  };
});
