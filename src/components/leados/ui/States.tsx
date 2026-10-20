import type { ReactNode } from "react";
import { Button } from "./Button";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

/** Always answers "what do I do next" — never a bare "no data" message. */
export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[var(--radius-md)] border border-dashed border-border-subtle p-10 text-center">
      <div aria-hidden="true" className="text-3xl text-text-muted">
        {icon ?? "◌"}
      </div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="max-w-[48ch] text-sm text-text-secondary">{description}</p>
      {actionLabel && onAction ? (
        <Button size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  description?: string;
  errorId: string;
  onRetry?: () => void;
}

export function ErrorState({ title = "Something went wrong", description, errorId, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[var(--radius-md)] border border-status-danger/30 bg-[color-mix(in_srgb,var(--status-danger-bg)_100%,transparent)] p-10 text-center"
    >
      <div aria-hidden="true" className="text-3xl text-status-danger">
        ✕
      </div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="max-w-[48ch] text-sm text-text-secondary">
        {description ?? "The request failed. You can retry, or share the error id below with support."}
      </p>
      <p className="font-mono text-xs text-text-muted" data-numeric="true">
        Error ID: {errorId}
      </p>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
