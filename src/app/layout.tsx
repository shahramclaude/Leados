import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppProvider } from "@/lib/AppContext";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "Leados — Command Center",
  description: "A cognitive command center for executives: live findings, cascade risk, and hypothesis testing.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05070a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#05070a] text-[#e5e9f0] antialiased">
        <AppProvider>
          <Shell>{children}</Shell>
        </AppProvider>
      </body>
    </html>
  );
}
