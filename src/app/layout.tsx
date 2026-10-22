import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { getOrgContext } from "@/lib/org-context";
import { listAllDemoUsers } from "@/lib/repo/devDirectory";
import { DEFAULT_LOCALE, localeDirection } from "@/lib/i18n";
import { AppProviders } from "@/components/providers/AppProviders";
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "LEADOS",
  description: "Now, People, Finance and Strategy in one installable workspace.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: ["/icons/icon-192.png", "/icons/icon-512.png"],
    apple: "/icons/icon-180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const ctx = await getOrgContext();
  const demoUsers = await listAllDemoUsers();
  const locale = ctx?.locale ?? DEFAULT_LOCALE;

  return (
    <html lang={locale} dir={localeDirection(locale)} style={{ ["--accent" as string]: ctx?.org.accentColor ?? "#2563eb" }}>
      <body className="antialiased">
        <AppProviders
          initial={{
            locale,
            accentColor: ctx?.org.accentColor ?? "#2563eb",
            terminology: ctx?.org.terminology ?? {},
            highContrastDefault: ctx?.org.highContrastDefault ?? false,
            plainLanguageDefault: ctx?.org.plainLanguageDefault ?? false,
          }}
        >
          <ServiceWorkerRegister />
          {ctx ? (
            <AppShell
              orgName={ctx.org.name}
              logoEmoji={ctx.org.logoEmoji}
              isAdmin={ctx.role === "Admin"}
              currentUserId={ctx.userId}
              demoUsers={demoUsers}
            >
              {children}
            </AppShell>
          ) : (
            children
          )}
        </AppProviders>
      </body>
    </html>
  );
}
