"use client";

import Link from "next/link";
import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  forwardRef,
} from "react";
import { cn } from "./utils";
import { severityLabel, severityVar, type Severity } from "./tokens";

/* ============================== Button ============================== */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-active shadow-xs",
  secondary:
    "bg-surface-raised text-text-primary border border-border hover:bg-surface-sunken active:bg-border-subtle",
  ghost: "bg-transparent text-text-primary hover:bg-surface-raised active:bg-surface-sunken",
  danger: "bg-severity-critical text-on-accent hover:brightness-110 active:brightness-95",
};

const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-body-sm gap-1.5 rounded-md",
  md: "h-9.5 px-4 text-body-sm gap-2 rounded-md",
  lg: "h-11 px-5 text-body gap-2 rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, iconLeft, iconRight, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors",
        "duration-[var(--motion-fast)] ease-[var(--ease-standard)] disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariantClasses[variant],
        buttonSizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Spinner className="h-3.5 w-3.5" />
      ) : (
        iconLeft && (
          <span aria-hidden="true" className="-ml-0.5 flex">
            {iconLeft}
          </span>
        )
      )}
      {children}
      {!loading && iconRight ? (
        <span aria-hidden="true" className="-mr-0.5 flex">
          {iconRight}
        </span>
      ) : null}
    </button>
  );
});

export const LinkButton = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: ButtonVariant; size?: ButtonSize }
>(function LinkButton({ href, variant = "primary", size = "md", className, children, ...props }, ref) {
  return (
    <Link
      ref={ref}
      href={href}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors",
        "duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        buttonVariantClasses[variant],
        buttonSizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
});

/* ============================== IconButton ============================== */

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", variant = "ghost", active, className, children, ...props },
  ref,
) {
  const dim = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-11 w-11" : "h-9.5 w-9.5";
  return (
    <button
      ref={ref}
      type={props.type ?? "button"}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center justify-center rounded-md transition-colors",
        "duration-[var(--motion-fast)] ease-[var(--ease-standard)] disabled:cursor-not-allowed disabled:opacity-50",
        dim,
        active ? "bg-accent-subtle text-accent-subtle-text" : buttonVariantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

/* ============================== Spinner ============================== */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ============================== Badge / Tag ============================== */

export function Badge({
  severity = "neutral",
  children,
  className,
}: {
  severity?: Severity;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-semibold",
        className,
      )}
      style={{ backgroundColor: severityVar[severity].subtle, color: severityVar[severity].fg }}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: severityVar[severity].fg }} />
      {children}
      <span className="sr-only"> — {severityLabel[severity]}</span>
    </span>
  );
}

export function Tag({
  children,
  onRemove,
  className,
}: {
  children: ReactNode;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 py-0.5 text-caption font-medium text-text-secondary",
        className,
      )}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${typeof children === "string" ? children : "tag"}`}
          className="ml-0.5 rounded-sm text-text-tertiary hover:text-text-primary"
        >
          ✕
        </button>
      ) : null}
    </span>
  );
}

/* ============================== Skeleton ============================== */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("leados-skeleton rounded-md", className)} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/* ============================== Empty / Error states ============================== */

export function EmptyState({
  icon = "🗂️",
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <span aria-hidden="true" className="text-3xl">
        {icon}
      </span>
      <div>
        <p className="text-body font-semibold text-text-primary">{title}</p>
        {description ? <p className="mt-1 max-w-sm text-body-sm text-text-secondary">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-lg border border-severity-critical/30 bg-severity-critical-subtle px-6 py-10 text-center"
    >
      <span aria-hidden="true" className="text-3xl">
        ⚠️
      </span>
      <div>
        <p className="text-body font-semibold text-text-primary">{title}</p>
        {description ? <p className="mt-1 max-w-sm text-body-sm text-text-secondary">{description}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/* ============================== ProgressBar ============================== */

export function ProgressBar({
  value,
  max = 100,
  label,
  severity = "info",
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  severity?: Severity;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn("w-full", className)}>
      {label ? (
        <div className="mb-1.5 flex items-center justify-between text-caption text-text-secondary">
          <span>{label}</span>
          <span className="font-mono tabular-nums">{Math.round(pct)}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className="h-full rounded-full transition-[width] duration-[var(--motion-slower)] ease-[var(--ease-decelerate)]"
          style={{ width: `${pct}%`, backgroundColor: severityVar[severity].fg }}
        />
      </div>
    </div>
  );
}

/* ============================== StatTile ============================== */

export function StatTile({
  label,
  value,
  delta,
  deltaTone = "neutral",
  caption,
  icon,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaTone?: "good" | "critical" | "neutral";
  caption?: string;
  icon?: ReactNode;
}) {
  const deltaColor =
    deltaTone === "good" ? "text-severity-good" : deltaTone === "critical" ? "text-severity-critical" : "text-text-tertiary";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <p className="text-caption font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
        {icon ? (
          <span aria-hidden="true" className="text-text-tertiary">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="text-h3 font-semibold tabular-nums text-text-primary">{value}</p>
      {(delta || caption) && (
        <p className="text-caption text-text-tertiary">
          {delta ? <span className={cn("font-semibold", deltaColor)}>{delta}</span> : null}
          {delta && caption ? " · " : null}
          {caption}
        </p>
      )}
    </div>
  );
}

/* ============================== GaugeArc ============================== */

export function GaugeArc({
  value,
  max = 100,
  size = 120,
  severity = "info",
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  severity?: Severity;
  label?: string;
}) {
  const pct = Math.min(1, Math.max(0, value / max));
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = Math.PI; // 180deg (left)
  const endAngle = Math.PI + pct * Math.PI;
  const arcPoint = (angle: number) => [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  const [x1, y1] = arcPoint(startAngle);
  const [x2, y2] = arcPoint(endAngle);
  const [xf, yf] = arcPoint(Math.PI * 2);
  const largeArc = pct > 0.5 ? 1 : 0;

  return (
    <figure className="flex flex-col items-center gap-1">
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`} role="img" aria-label={`${label ?? "Gauge"}: ${Math.round(pct * 100)}%`}>
        <path d={`M ${x1} ${y1} A ${r} ${r} 0 1 1 ${xf} ${yf}`} fill="none" stroke="var(--chart-grid)" strokeWidth={10} strokeLinecap="round" />
        <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`} fill="none" stroke={severityVar[severity].fg} strokeWidth={10} strokeLinecap="round" />
        <text x={cx} y={cy + 4} textAnchor="middle" className="fill-text-primary" style={{ font: "600 1rem var(--font-sans)" }}>
          {Math.round(pct * 100)}%
        </text>
      </svg>
      {label ? <figcaption className="text-caption text-text-tertiary">{label}</figcaption> : null}
    </figure>
  );
}

/* ============================== ProgressRing ============================== */

export function ProgressRing({
  value,
  max = 100,
  size = 56,
  stroke = 6,
  severity = "info",
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  severity?: Severity;
  label?: string;
}) {
  const pct = Math.min(1, Math.max(0, value / max));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label ?? "Progress"}: ${Math.round(pct * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-grid)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={severityVar[severity].fg}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dashoffset] duration-[var(--motion-slower)] ease-[var(--ease-decelerate)]"
      />
      <text x="50%" y="50%" dy="0.35em" textAnchor="middle" className="fill-text-primary" style={{ font: "600 0.75rem var(--font-sans)" }}>
        {Math.round(pct * 100)}
      </text>
    </svg>
  );
}

/* ============================== Panel ============================== */

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  as: Component = "section",
  padded = true,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "section" | "div";
  padded?: boolean;
}) {
  return (
    <Component className={cn("rounded-lg border border-border bg-surface-raised shadow-xs", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <div>
            {title ? <h3 className="text-body font-semibold text-text-primary">{title}</h3> : null}
            {description ? <p className="mt-0.5 text-body-sm text-text-tertiary">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      )}
      <div className={padded ? "p-4" : undefined}>{children}</div>
    </Component>
  );
}

/* ============================== PageHeader ============================== */

export interface Breadcrumb {
  label: string;
  href?: string;
}

export function PageHeader({
  breadcrumbs,
  title,
  description,
  primaryAction,
  secondaryActions,
  tabs,
}: {
  breadcrumbs?: Breadcrumb[];
  title: string;
  description?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-border-subtle pb-5">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-caption text-text-tertiary">
            {breadcrumbs.map((crumb, i) => (
              <li key={crumb.label} className="flex items-center gap-1.5">
                {i > 0 ? (
                  <span aria-hidden="true">/</span>
                ) : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="rounded hover:text-text-primary hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={i === breadcrumbs.length - 1 ? "page" : undefined}>{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h1 font-semibold tracking-tight text-text-primary">{title}</h1>
          {description ? <p className="mt-1.5 max-w-2xl text-body text-text-secondary">{description}</p> : null}
        </div>
        {(primaryAction || secondaryActions) && (
          <div className="flex shrink-0 items-center gap-2">
            {secondaryActions}
            {primaryAction}
          </div>
        )}
      </div>
      {tabs}
    </header>
  );
}

export function VisuallyHidden({ children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className="sr-only" {...props}>
      {children}
    </span>
  );
}
