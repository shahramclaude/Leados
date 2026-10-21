import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { LOCALE_META, type AppLocale } from "@/i18n/locales";
import { A11Y_COOKIE, parseA11yCookie } from "@/lib/a11yPrefs";
import { SKIP_LINK_TARGET_ID } from "@/lib/a11y";

export const metadata: Metadata = {
  title: "LEADOS",
  description: "One operating picture for people leadership, in every language your org speaks.",
  manifest: "/manifest.webmanifest",
  applicationName: "LEADOS",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "LEADOS" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = (await getLocale()) as AppLocale;
  const messages = await getMessages();
  const cookieStore = await cookies();
  const a11y = parseA11yCookie(cookieStore.get(A11Y_COOKIE)?.value);
  const dir = LOCALE_META[locale]?.dir ?? "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      data-theme={a11y.highContrast ? "high-contrast" : "default"}
      style={{ ["--text-scale" as string]: a11y.textScale }}
    >
      <body className="antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <a href={`#${SKIP_LINK_TARGET_ID}`} className="skip-link touch-target">
            Skip to main content
          </a>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
