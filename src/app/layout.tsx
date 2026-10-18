import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OrchestratorProvider } from "@/lib/OrchestratorProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leados Command Center",
  description: "Leadership cockpit: live org health, signals, risk and pipeline intelligence.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0c10] text-slate-100 antialiased" style={{ fontFamily: "system-ui" }}>
        {/*
          The SSE connection (src/lib/useOrchestrator.ts -> /api/events/stream)
          lives here, once, via OrchestratorProvider so every route/view
          shares one live connection instead of reconnecting per page.
        */}
        <OrchestratorProvider>{children}</OrchestratorProvider>
      </body>
    </html>
  );
}
