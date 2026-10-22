// Structured JSON logger (one JSON object per line on stdout/stderr).
//
// Every log line carries: timestamp, level, service, msg, correlationId,
// traceId (when bound), plus arbitrary redacted metadata. No console-noise
// strings — this is the single logging surface for the app; routes,
// orchestrator-equivalents, agent runs, and query helpers all go through it.
import { getCorrelationContext } from "./context";
import { redact } from "./redact";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = (process.env.LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

function write(level: LogLevel, service: string, msg: string, fields?: LogFields) {
  if (!shouldLog(level)) return;
  const ctx = getCorrelationContext();
  const line = {
    timestamp: new Date().toISOString(),
    level,
    service,
    msg,
    correlationId: ctx?.correlationId ?? fields?.correlationId ?? null,
    traceId: ctx?.traceId ?? fields?.traceId ?? null,
    ...redact(fields ?? {}),
  };
  const json = JSON.stringify(line);
  if (level === "error" || level === "warn") {
    process.stderr.write(json + "\n");
  } else {
    process.stdout.write(json + "\n");
  }
}

export function createLogger(service: string) {
  return {
    debug: (msg: string, fields?: LogFields) => write("debug", service, msg, fields),
    info: (msg: string, fields?: LogFields) => write("info", service, msg, fields),
    warn: (msg: string, fields?: LogFields) => write("warn", service, msg, fields),
    error: (msg: string, fields?: LogFields) => write("error", service, msg, fields),
    child: (bound: LogFields) => {
      const base = createLogger(service);
      return {
        debug: (msg: string, fields?: LogFields) => base.debug(msg, { ...bound, ...fields }),
        info: (msg: string, fields?: LogFields) => base.info(msg, { ...bound, ...fields }),
        warn: (msg: string, fields?: LogFields) => base.warn(msg, { ...bound, ...fields }),
        error: (msg: string, fields?: LogFields) => base.error(msg, { ...bound, ...fields }),
      };
    },
  };
}

export const logger = createLogger("leados");
