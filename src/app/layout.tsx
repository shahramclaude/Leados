import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppContextProvider } from "@/lib/AppContext";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "Leados \u2014 Cognitive Workspace",
  description: "Leadership intelligence cockpit: people, strategy, finance, execution, and signal orchestration.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0c10] text-slate-100 antialiased">
        <AppContextProvider>
          <Shell>{children}</Shell>
        </AppContextProvider>
      </body>
    </html>
  );
}
