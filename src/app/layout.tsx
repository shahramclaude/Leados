import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import "./globals.css";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import { dirFor } from "@/i18n/locales";
import { LocaleProvider } from "@/components/providers/LocaleProvider";
import { A11yProvider } from "@/components/providers/A11yProvider";
import { OfflineBanner } from "@/components/OfflineBanner";
import { InstallPrompt } from "@/components/InstallPrompt";
import { KeyboardShortcutsOverlay } from "@/components/KeyboardShortcutsOverlay";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { createTranslator } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const locale = normalizeLocale(store.get(LOCALE_COOKIE)?.value);
  const t = createTranslator(locale);
  return {
    title: t("app.name"),
    description: "LEADOS — leadership intelligence for any organization, in any language, on any device.",
    applicationName: t("app.name"),
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/icons/icon-192.png",
      apple: "/icons/icon-192.png",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#4f46e5",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const locale = normalizeLocale(store.get(LOCALE_COOKIE)?.value);
  const dir = dirFor(locale);

  return (
    <html lang={locale} dir={dir}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <LocaleProvider initialLocale={locale}>
          <A11yProvider>
            <OfflineBanner />
            {children}
            <InstallPrompt />
            <KeyboardShortcutsOverlay />
            <ServiceWorkerRegistration />
          </A11yProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
