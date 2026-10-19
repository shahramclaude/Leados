export interface ApiErrorBody {
  error: string;
  code: string;
}

export function jsonError(status: number, code: string, message: string): Response {
  const body: ApiErrorBody = { error: message, code };
  return Response.json(body, { status });
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function logDuration(route: string, start: number): void {
  console.log(`[${route}] ${Date.now() - start}ms`);
}

/**
 * Safely parses a request body as JSON, returning null (never throwing) if
 * the body is empty or not valid JSON. Callers must still run isPlainObject
 * (or a stricter shape guard) before trusting the result.
 */
export async function safeParseJson(req: Request): Promise<unknown> {
  const raw = await req.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined; // sentinel for "invalid JSON", distinct from "empty body"
  }
}
