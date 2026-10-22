/**
 * Runs once per server instance start. Registers the built-in extensions
 * (metric connectors / notification channels / playbook step types) so the
 * registries are populated before any route handler needs them.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerBuiltinExtensions } = await import("./lib/extensions/builtins");
    registerBuiltinExtensions();
  }
}
