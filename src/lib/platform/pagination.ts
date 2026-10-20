export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 200;

export interface CursorPayload {
  id: number;
}

export function parseLimit(searchParams: URLSearchParams): number {
  const raw = searchParams.get("limit");
  if (!raw) return DEFAULT_PAGE_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_LIMIT;
  return Math.min(parsed, MAX_PAGE_LIMIT);
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | null): CursorPayload | null {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof decoded === "object" && decoded !== null && typeof decoded.id === "number") {
      return { id: decoded.id };
    }
    return null;
  } catch {
    return null;
  }
}
