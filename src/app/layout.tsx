import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ViewerProvider } from "@/lib/client/viewerContext";

export const metadata: Metadata = {
  title: "LEADOS — People & Organization Intelligence",
  description: "LEADOS: an operating system for leadership intelligence. Part 5 — People & Organization Intelligence.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <ViewerProvider>{children}</ViewerProvider>
      </body>
    </html>
  );
}
