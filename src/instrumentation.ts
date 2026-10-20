// Runs once when the Next.js server starts (Node runtime only). We use it to
// drive the webhook retry/backoff loop so deliveries that failed actually
// get retried without requiring an external cron in local/dev/demo mode.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const globalForTimers = globalThis as typeof globalThis & {
    __leadosWebhookRetryTimer?: ReturnType<typeof setInterval>;
  };

  if (globalForTimers.__leadosWebhookRetryTimer) return;

  const { processDueRetries } = await import("@/lib/platform/webhooks");

  globalForTimers.__leadosWebhookRetryTimer = setInterval(() => {
    processDueRetries().catch((err) => console.error("webhook retry loop failed", err));
  }, 5_000);
}
