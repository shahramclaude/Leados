"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CommandPalette, type Command } from "./CommandPalette";

/**
 * Globally listens for Cmd/Ctrl+K. The CommandPalette component (and its
 * bundle) is only dynamically `import()`-ed the first time it's actually
 * invoked, so the ~few KB of palette code never loads for the majority of
 * sessions that never open it. Commands are defined here (client-side) since
 * they need live browser/router callbacks that can't cross the server/client
 * boundary as props.
 */
export function CommandPaletteLauncher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const PaletteComponent = CommandPalette;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);


  const scrollTo = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const commands: Command[] = [
    { id: "goto-metrics", label: "Go to Metrics", hint: "section", run: scrollTo("panel-metrics") },
    { id: "goto-forecast", label: "Go to Forecast", hint: "section", run: scrollTo("panel-forecast") },
    { id: "goto-network", label: "Go to Network", hint: "section", run: scrollTo("panel-network") },
    { id: "goto-notifications", label: "Go to Notifications", hint: "section", run: scrollTo("panel-notifications") },
    {
      id: "simulate-event",
      label: "Simulate a new event (invalidates forecast cache)",
      hint: "POST /api/events",
      run: () => {
        if (busy) return;
        setBusy(true);
        fetch("/api/events", { method: "POST", body: JSON.stringify({}) })
          .then(() => router.refresh())
          .finally(() => setBusy(false));
      },
    },
    { id: "refresh", label: "Refresh dashboard data", hint: "router.refresh()", run: () => router.refresh() },
  ];

  if (!open || !PaletteComponent) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 hover:bg-slate-50"
      >
        ⌘K Commands
      </button>
    );
  }

  const Palette = PaletteComponent;
  return <Palette commands={commands} onClose={() => setOpen(false)} />;
}

export default CommandPaletteLauncher;
