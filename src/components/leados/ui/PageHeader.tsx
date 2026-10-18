import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-semibold tracking-tight" style={{ color: "var(--text-primary)", fontSize: "var(--fs-2xl)" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1" style={{ color: "var(--text-secondary)", fontSize: "var(--fs-sm)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
