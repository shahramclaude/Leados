import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeBootstrapScript, ThemeProvider } from "@/components/leados/ui/ThemeProvider";
import { ToastProvider } from "@/components/leados/ui/Toast";
import { UndoRedoProvider } from "@/components/leados/UndoRedoProvider";
import { CommandPalette } from "@/components/leados/CommandPalette";
import { ShortcutsOverlay } from "@/components/leados/ShortcutsOverlay";

export const metadata: Metadata = {
  title: "LEADOS",
  description: "A decision-first operating cockpit — Now, Understand, Act.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <ThemeBootstrapScript />
      </head>
      <body className="antialiased">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <ThemeProvider>
          <ToastProvider>
            <UndoRedoProvider>
              {children}
              <CommandPalette />
              <ShortcutsOverlay />
            </UndoRedoProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
