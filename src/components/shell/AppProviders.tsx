"use client";

// ---------------------------------------------------------------------------
// Mounts the global, route-independent shell chrome: command palette,
// shortcuts overlay, sync drawer, and the keyboard router ("?" to open
// shortcuts, G+letter to navigate, N to create on list routes).
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { uiStore } from "@/lib/state/uiStore";
import { ServiceWorkerRegister } from "../ServiceWorkerRegister";
import { Toaster } from "../Toaster";

// Code-split: the palette and overlays are not needed for first paint of any
// route, so they are not part of the initial per-route bundle.
const CommandPalette = dynamic(() => import("../CommandPalette").then((m) => m.CommandPalette), { ssr: false });
const ShortcutsOverlay = dynamic(() => import("../ShortcutsOverlay").then((m) => m.ShortcutsOverlay), { ssr: false });
const SyncDrawer = dynamic(() => import("../SyncDrawer").then((m) => m.SyncDrawer), { ssr: false });

export function AppProviders({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    let pendingG = false;
    let gTimeout: ReturnType<typeof setTimeout> | undefined;

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        uiStore.togglePalette(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        uiStore.toggleSyncDrawer(true);
        return;
      }
      if (typing) return;

      if (event.key === "?") {
        event.preventDefault();
        uiStore.toggleShortcuts(true);
        return;
      }
      if (event.key === "Escape") {
        uiStore.closeAll();
        return;
      }
      if (event.key.toLowerCase() === "g") {
        pendingG = true;
        clearTimeout(gTimeout);
        gTimeout = setTimeout(() => (pendingG = false), 800);
        return;
      }
      if (pendingG) {
        pendingG = false;
        const routes: Record<string, string> = {
          d: "/dashboard",
          o: "/objectives",
          a: "/approvals",
          s: "/scenarios",
          u: "/audit",
        };
        const href = routes[event.key.toLowerCase()];
        if (href) {
          event.preventDefault();
          router.push(href);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return (
    <>
      <ServiceWorkerRegister />
      {children}
      <CommandPalette />
      <ShortcutsOverlay />
      <SyncDrawer />
      <Toaster />
    </>
  );
}
