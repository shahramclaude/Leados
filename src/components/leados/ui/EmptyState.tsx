import type { ReactNode } from "react";
import { Button } from "./Button";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; href: string };
}

/** Empty states always name a concrete next step — never a bare "No data." */
export function EmptyState({ icon, title, description, action, secondaryAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-[var(--space-3)] rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] px-[var(--space-6)] py-[var(--space-10)] text-center">
      {icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-muted)]" aria-hidden>
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-[var(--space-1)]">
        <h3 className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)]">{title}</h3>
        <p className="max-w-[var(--measure-prose)] text-[var(--text-xs)] text-[var(--text-muted)]">{description}</p>
      </div>
      <div className="flex items-center gap-[var(--space-3)]">
        {action && (
          <Button size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
        {secondaryAction && (
          <a href={secondaryAction.href} className="text-[var(--text-xs)] font-medium text-[var(--accent-default)] hover:underline">
            {secondaryAction.label}
          </a>
        )}
      </div>
    </div>
  );
}
