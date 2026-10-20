import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/leados/ui/ThemeProvider";
import { ToastProvider } from "@/components/leados/ui/Toast";
import { UndoRedoProvider } from "@/components/leados/app/UndoRedoProvider";
import { GlobalChrome } from "@/components/leados/app/GlobalChrome";

export const metadata: Metadata = {
  title: "LEADOS",
  description: "Decision-first operating console: cockpit, understand and act in one coherent system.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <ToastProvider>
            <UndoRedoProvider>
              <GlobalChrome>{children}</GlobalChrome>
            </UndoRedoProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
