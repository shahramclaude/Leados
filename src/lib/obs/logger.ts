// Structured JSON logging. One line per event, correlationId/traceId always
// attached from the active AsyncLocalStorage context, every field passed
// through redactValue() before serialization.
import { getContext } from "./context";
import { redactValue } from "./redact";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

/** Log-level policy per environment (declared, not implicit):
 * - production: info and above (trace/debug would be too noisy & costly)
 * - staging: debug and above (need more detail while validating a release)
 * - development/test: trace and above (everything, for local debugging)
 * Overridable at any time via LOG_LEVEL for an incident ("turn up logging"). */
function defaultLevelForEnv(): LogLevel {
  const env = process.env.APP_ENV || process.env.NODE_ENV || "development";
  if (env === "production") return "info";
  if (env === "staging") return "debug";
  return "trace";
}

function configuredLevel(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL as LogLevel | undefined;
  if (fromEnv && fromEnv in LEVEL_WEIGHT) return fromEnv;
  return defaultLevelForEnv();
}

export interface LogFields {
  [key: string]: unknown;
}

function emit(level: LogLevel, msg: string, fields?: LogFields) {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[configuredLevel()]) return;
  const ctx = getContext();
  const line = {
    timestamp: new Date().toISOString(),
    level,
    msg,
    service: "leados",
    env: process.env.APP_ENV || process.env.NODE_ENV || "development",
    correlationId: ctx.correlationId,
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    route: ctx.route,
    ...((fields ? (redactValue(fields) as Record<string, unknown>) : {})),
  };
  const serialized = JSON.stringify(line);
  if (level === "error" || level === "warn") {
    // eslint-disable-next-line no-console
    console.error(serialized);
  } else {
    // eslint-disable-next-line no-console
    console.log(serialized);
  }
}

export const logger = {
  trace: (msg: string, fields?: LogFields) => emit("trace", msg, fields),
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
  currentLevel: configuredLevel,
};
