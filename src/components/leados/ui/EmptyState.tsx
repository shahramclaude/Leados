import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  illustration?: ReactNode;
}

function DefaultIllustration() {
  return (
    <svg width="96" height="72" viewBox="0 0 96 72" fill="none" aria-hidden>
      <rect x="10" y="10" width="30" height="30" rx="4" stroke="var(--border-default)" strokeWidth="1.5" />
      <circle cx="70" cy="22" r="14" stroke="var(--border-default)" strokeWidth="1.5" />
      <path d="M20 54l18-18M56 50l20-20" stroke="var(--accent-indigo)" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="44" y="44" width="22" height="22" rx="4" stroke="var(--accent-blue)" strokeWidth="1.5" />
    </svg>
  );
}

export default function EmptyState({ title, description, actionLabel, onAction, illustration }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed px-6 py-14 text-center" style={{ borderColor: "var(--border-default)" }}>
      {illustration ?? <DefaultIllustration />}
      <div>
        <p className="font-medium" style={{ color: "var(--text-primary)", fontSize: "var(--fs-base)" }}>
          {title}
        </p>
        {description && (
          <p className="mx-auto mt-1 max-w-sm" style={{ color: "var(--text-secondary)", fontSize: "var(--fs-sm)" }}>
            {description}
          </p>
        )}
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="rounded-lg px-3.5 py-2 font-medium transition-colors focus-visible:outline-none"
          style={{ backgroundColor: "var(--accent-blue)", color: "#fff", fontSize: "var(--fs-sm)" }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
