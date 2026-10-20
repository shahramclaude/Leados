// Structured JSON logger. Every line written to stdout is a single JSON
// object so it can be shipped by any log collector (Docker's json-file
// driver, Vector, Fluent Bit, CloudWatch agent, ...) without a vendor SDK.
import { getCorrelationId } from "./requestContext";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const SERVICE_NAME = "leados";

function write(level: LogLevel, message: string, fields?: LogFields) {
  const line = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    correlationId: getCorrelationId(),
    message,
    ...fields,
  };

  const serialized = JSON.stringify(line);

  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(serialized);
  } else if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(serialized);
  } else {
    // eslint-disable-next-line no-console
    console.log(serialized);
  }
}

export const logger = {
  debug: (message: string, fields?: LogFields) => write("debug", message, fields),
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields),
};
