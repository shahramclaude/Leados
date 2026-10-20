// Next.js instrumentation hook (stable since Next 15). This is the single
// boot path for the server runtime: it runs once, before any request is
// served, in both `next dev` and `next start`. We use it to fail fast on
// missing configuration instead of surfacing a confusing error from deep
// inside a Drizzle call on the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateConfig } = await import("@/lib/platform/config");
    validateConfig();
  }
}
