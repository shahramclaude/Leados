// Cursor pagination convention shared by every v1 list route.
// Cursor = base64url(JSON.stringify({ createdAt, id })) of the last row seen.
import { ApiError } from "./envelope";

export interface CursorPage {
  createdAt: Date;
  id: string;
}

export function encodeCursor(page: CursorPage): string {
  const json = JSON.stringify({ createdAt: page.createdAt.toISOString(), id: page.id });
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): CursorPage {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { createdAt: string; id: string };
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    throw new ApiError("BAD_REQUEST", "Invalid cursor");
  }
}

export function parseLimit(raw: string | null, fallback = 25, max = 100): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ApiError("BAD_REQUEST", "limit must be a positive integer");
  }
  return Math.min(n, max);
}

export function parseSort(
  raw: string | null,
  allowed: readonly string[],
  fallback: string,
): { field: string; direction: "asc" | "desc" } {
  if (!raw) return { field: fallback, direction: "desc" };
  const direction = raw.startsWith("-") ? "desc" : "asc";
  const field = raw.replace(/^-/, "");
  if (!allowed.includes(field)) {
    throw new ApiError("BAD_REQUEST", `sort must be one of: ${allowed.join(", ")}`, { field });
  }
  return { field, direction };
}
