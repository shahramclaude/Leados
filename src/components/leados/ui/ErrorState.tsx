export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl border px-6 py-10 text-center"
      style={{ borderColor: "var(--sev5)", backgroundColor: "color-mix(in srgb, var(--sev5) 8%, var(--bg-elevated))" }}
    >
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: "color-mix(in srgb, var(--sev5) 20%, transparent)", color: "var(--sev5)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 3l9 16H3l9-16Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12 10v4M12 17v.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <p style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg border px-3.5 py-1.5 font-medium transition-colors focus-visible:outline-none"
          style={{ borderColor: "var(--sev5)", color: "var(--sev5)", fontSize: "var(--fs-sm)" }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
