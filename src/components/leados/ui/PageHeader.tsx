import type { ReactNode } from "react";
import Link from "next/link";
import { cx } from "./cx";

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  breadcrumb: Breadcrumb[];
  title: string;
  description?: string;
  /** Exactly one primary action per page, per the IA contract — secondary
   * actions should live in a DropdownMenu instead of multiplying buttons. */
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  tabs?: ReactNode;
}

export function PageHeader({ breadcrumb, title, description, primaryAction, secondaryActions, tabs }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-[var(--space-4)] border-b border-[var(--border-subtle)] pb-[var(--space-4)]">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-[var(--space-1)] text-[var(--text-xs)] text-[var(--text-muted)]">
          {breadcrumb.map((crumb, i) => (
            <li key={crumb.label} className="flex items-center gap-[var(--space-1)]">
              {i > 0 && <span aria-hidden>/</span>}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-[var(--text-primary)] hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={i === breadcrumb.length - 1 ? "page" : undefined} className={cx(i === breadcrumb.length - 1 && "text-[var(--text-secondary)]")}>
                  {crumb.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-[var(--space-4)]">
        <div className="flex flex-col gap-[var(--space-1)]">
          <h1 className="text-[var(--text-xl)] font-semibold tracking-tight text-[var(--text-primary)]">{title}</h1>
          {description && <p className="max-w-[var(--measure-prose)] text-[var(--text-sm)] text-[var(--text-muted)]">{description}</p>}
        </div>
        <div className="flex items-center gap-[var(--space-2)]">
          {secondaryActions}
          {primaryAction}
        </div>
      </div>
      {tabs}
    </header>
  );
}
