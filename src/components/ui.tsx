import type { ReactNode } from "react";

// LEADOS design-system primitives. Every primitive consumes the token
// custom-properties defined in globals.css — no raw hex/px values here.

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-card)] shadow-[var(--shadow-1)] ${
        padded ? "p-6" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-600)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-[31px] font-semibold leading-tight text-[var(--text-primary)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[15px] text-[var(--text-secondary)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-[var(--n-100)] text-[var(--n-700)] border-[var(--n-200)]",
  success: "bg-[var(--success-surface)] text-[var(--success-text)] border-[var(--success-border)]",
  warning: "bg-[var(--warning-surface)] text-[var(--warning-text)] border-[var(--warning-border)]",
  danger: "bg-[var(--danger-surface)] text-[var(--danger-text)] border-[var(--danger-border)]",
  info: "bg-[var(--info-surface)] text-[var(--info-text)] border-[var(--info-border)]",
  brand: "bg-[var(--brand-50)] text-[var(--brand-700)] border-[var(--brand-200)]",
} as const;

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTones;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--radius-full)] border px-2.5 py-0.5 text-[13px] font-medium ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

const riskToneMap: Record<string, keyof typeof badgeTones> = {
  T0: "neutral",
  T1: "info",
  T2: "brand",
  T3: "warning",
  T4: "warning",
  T5: "danger",
};

export function RiskBadge({ tier }: { tier: string }) {
  return <Badge tone={riskToneMap[tier] ?? "neutral"}>Risk {tier}</Badge>;
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const tone: keyof typeof badgeTones = pct >= 75 ? "success" : pct >= 50 ? "warning" : "danger";
  return <Badge tone={tone}>{pct}% confidence</Badge>;
}

export function StatBlock({
  label,
  value,
  unit,
  delta,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  tone?: keyof typeof badgeTones;
}) {
  return (
    <Card>
      <p className="m-0 text-[13px] font-medium uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-[31px] font-semibold leading-none text-[var(--text-primary)]">
        {value}
        {unit ? <span className="ml-1 text-[16px] font-normal text-[var(--text-secondary)]">{unit}</span> : null}
      </p>
      {delta ? (
        <div className="mt-3">
          <Badge tone={tone}>{delta}</Badge>
        </div>
      ) : null}
    </Card>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] bg-[var(--surface-sunken)] px-6 py-10 text-center">
      <p className="m-0 text-[16px] font-semibold text-[var(--text-primary)]">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-md text-[14px] text-[var(--text-secondary)]">{description}</p> : null}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  type = "button",
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const variants: Record<string, string> = {
    primary:
      "bg-[var(--brand-600)] text-white hover:bg-[var(--brand-700)] disabled:bg-[var(--n-300)]",
    secondary:
      "bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--n-100)]",
    danger: "bg-[var(--danger-text)] text-white hover:opacity-90",
    ghost: "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--n-100)]",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-3.5 py-2 text-[14px] font-medium transition-colors duration-[var(--motion-fast)] disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-2 w-full overflow-hidden rounded-[var(--radius-full)] bg-[var(--n-200)]">
      <div
        className="h-full rounded-[var(--radius-full)] bg-[var(--brand-600)] transition-[width] duration-[var(--motion-slow)] ease-[var(--ease-out-quint)]"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
