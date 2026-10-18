import type { ReactNode } from "react";

export interface PanelProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  dense?: boolean;
  children?: ReactNode;
  className?: string;
}

export default function Panel({ title, subtitle, action, dense = false, children, className }: PanelProps) {
  return (
    <section
      className={`flex flex-col rounded-xl border ${className ?? ""}`}
      style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border-default)" }}
    >
      {(title || action) && (
        <header
          className="flex items-start justify-between gap-3 border-b px-4"
          style={{ borderColor: "var(--border-subtle)", paddingTop: dense ? 10 : 14, paddingBottom: dense ? 10 : 14 }}
        >
          <div className="min-w-0">
            {title && (
              <h3
                className="truncate font-semibold"
                style={{ color: "var(--text-primary)", fontSize: "var(--fs-base)" }}
              >
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 truncate" style={{ color: "var(--text-secondary)", fontSize: "var(--fs-xs)" }}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={dense ? "p-3" : "p-4"}>{children}</div>
    </section>
  );
}
