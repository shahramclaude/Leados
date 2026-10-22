import { createHash } from "crypto";

/** Deterministic weak ETag from a resource's id + updatedAt (cheap, no need to hash the whole payload). */
export function computeEtag(id: string, updatedAt: Date | string): string {
  const stamp = updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt);
  const hash = createHash("sha1").update(`${id}:${stamp}`).digest("hex").slice(0, 16);
  return `"${hash}"`;
}

export function matchesIfNoneMatch(req: Request, etag: string): boolean {
  const header = req.headers.get("if-none-match");
  if (!header) return false;
  return header
    .split(",")
    .map((v) => v.trim())
    .includes(etag);
}
