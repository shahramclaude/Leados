import { SectionLabel } from "./primitives";

// ─────────────────────────────────────────────────────────────
// ComingSoon — technical placeholder for routes not yet wired to
// an intelligence layer. Deliberately terse; this is a workspace,
// not a marketing surface.
// ─────────────────────────────────────────────────────────────
export function ComingSoon({ name, plannedPart }: { name: string; plannedPart: string }) {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-[color:var(--border-default)] bg-[color:var(--bg-card)] p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border-default)] font-mono text-lg text-[color:var(--text-accent)]">
          ⟟
        </div>
        <SectionLabel className="justify-center">{name}</SectionLabel>
        <div className="mt-2 font-mono text-sm text-[color:var(--text-secondary)]">
          Intelligence layer not yet instrumented for this module.
        </div>
        <div className="mt-3 inline-block rounded border border-[color:var(--border-default)] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
          Scheduled — {plannedPart}
        </div>
      </div>
    </div>
  );
}
