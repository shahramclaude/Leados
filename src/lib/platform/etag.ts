// Weak ETag support for heavy reads: hash the serialized representation and
// let clients send If-None-Match to get a cheap 304.
import { createHash } from "node:crypto";

export function computeEtag(payload: unknown): string {
  const hash = createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  return `W/"${hash}"`;
}

export function matchesEtag(req: Request, etag: string): boolean {
  const ifNoneMatch = req.headers.get("if-none-match");
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(",")
    .map((tag) => tag.trim())
    .includes(etag);
}
