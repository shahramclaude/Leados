// Product-wide legal-advice disclaimer, following the shared disclaimer-component pattern (Part 02).
// Every legal-intelligence surface must render this, consistently, near the top of the page.
import { LEGAL_DISCLAIMER_TEXT } from "@/lib/legal/clauseTypes";

export function LegalDisclaimerBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="note"
      aria-label="Legal advice disclaimer"
      className={
        compact
          ? "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          : "rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      }
    >
      <span className="font-semibold">Not legal advice. </span>
      {LEGAL_DISCLAIMER_TEXT.replace("LEADOS Legal Intelligence is decision support, not legal advice. ", "")}
    </div>
  );
}
