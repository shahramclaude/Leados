import Link from "next/link";
import type { ReactNode } from "react";

export interface Crumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  breadcrumb: Crumb[];
  title: string;
  description?: string;
  /** Exactly one primary action per page — enforced by convention, not just type. */
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  tabs?: ReactNode;
}

export function PageHeader({ breadcrumb, title, description, primaryAction, secondaryActions, tabs }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 pb-5">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
          {breadcrumb.map((crumb, index) => (
            <li key={crumb.label} className="flex items-center gap-1.5">
              {index > 0 ? (
                <span aria-hidden="true" className="text-text-muted">
                  /
                </span>
              ) : null}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-text-primary hover:underline underline-offset-2">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-text-secondary">
                  {crumb.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
          {description ? <p className="mt-1 max-w-[70ch] text-sm text-text-secondary">{description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {secondaryActions}
          {primaryAction}
        </div>
      </div>
      {tabs}
    </header>
  );
}
