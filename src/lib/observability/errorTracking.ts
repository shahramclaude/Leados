// Error tracking hook with no vendor lock-in.
//
// By default this only logs locally (via the structured logger). If an
// operator sets ERROR_TRACKING_WEBHOOK_URL, captured errors are also POSTed
// as plain JSON to that URL — compatible with Sentry's "generic webhook"
// style ingestion, a Slack incoming webhook, an internal alert relay, or
// anything else that accepts `POST { message, correlationId, ... }`. No
// SDK is bundled, so swapping providers is a config change, not a code
// change.
import { getCorrelationId } from "./requestContext";
import { logger } from "./logger";

export type CapturedError = {
  message: string;
  stack?: string;
  correlationId: string;
  route?: string;
  severity: "warning" | "error" | "fatal";
  context?: Record<string, unknown>;
  timestamp: string;
};

function isEnabled(): boolean {
  return Boolean(process.env.ERROR_TRACKING_WEBHOOK_URL);
}

export async function captureError(
  error: unknown,
  options?: { route?: string; severity?: CapturedError["severity"]; context?: Record<string, unknown> },
): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));
  const payload: CapturedError = {
    message: err.message,
    stack: err.stack,
    correlationId: getCorrelationId(),
    route: options?.route,
    severity: options?.severity ?? "error",
    context: options?.context,
    timestamp: new Date().toISOString(),
  };

  logger.error("captured_error", { ...payload, stack: undefined });

  const webhookUrl = process.env.ERROR_TRACKING_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  } catch (hookError) {
    // Never let the error-reporting path crash a request; just log it.
    logger.warn("error_tracking_webhook_failed", {
      reason: hookError instanceof Error ? hookError.message : String(hookError),
    });
  }
}

export const errorTrackingStatus = {
  configured: isEnabled,
};
