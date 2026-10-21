import type { AsyncError } from "@/lib/state/asyncState";

export function ErrorState({
  error,
  onRetry,
  correlationId,
}: {
  error: AsyncError;
  onRetry: () => void;
  correlationId?: string;
}) {
  return (
    <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
      <p className="text-sm font-semibold text-rose-800">{plainLanguage(error.code)}</p>
      <p className="mt-1 text-sm text-rose-700">{error.message}</p>
      <div className="mt-4 flex items-center gap-3">
        {error.retryable && (
          <button
            onClick={onRetry}
            className="rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
          >
            Try again
          </button>
        )}
        <code className="text-xs text-rose-500">ref: {correlationId ?? error.correlationId ?? "n/a"}</code>
      </div>
    </div>
  );
}

function plainLanguage(code: AsyncError["code"]) {
  switch (code) {
    case "NETWORK":
      return "You appear to be offline.";
    case "TIMEOUT":
      return "The server took too long to respond.";
    case "VALIDATION":
      return "Some of the information needs fixing.";
    case "VERSION_CONFLICT":
      return "Someone else changed this since you loaded it.";
    case "NOT_FOUND":
      return "This item no longer exists.";
    case "SERVER":
      return "The server had a problem handling this.";
    default:
      return "Something unexpected happened.";
  }
}
