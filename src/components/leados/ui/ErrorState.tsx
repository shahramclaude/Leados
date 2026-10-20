import { Button } from "./Button";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  errorId: string;
  onRetry?: () => void;
}

/** Every error surface carries a stable error id (so a user can quote it to
 * support/ops) and, where the failure is plausibly transient, a retry
 * action. No dead ends. */
export function ErrorState({ title = "Something went wrong", description = "The request failed. You can retry, or share the error id below if it keeps happening.", errorId, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-[var(--space-3)] rounded-[var(--radius-lg)] border border-[var(--status-danger)] bg-[var(--status-danger-subtle)] px-[var(--space-6)] py-[var(--space-8)] text-center"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--status-danger)]" aria-hidden>
        ✕
      </div>
      <div className="flex flex-col gap-[var(--space-1)]">
        <h3 className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)]">{title}</h3>
        <p className="max-w-[var(--measure-prose)] text-[var(--text-xs)] text-[var(--text-secondary)]">{description}</p>
        <p className="font-mono-nums text-[var(--text-xs)] text-[var(--text-muted)]">Error ID: {errorId}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
