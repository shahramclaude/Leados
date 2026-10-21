import { createHash } from "crypto";

export function computeEtag(payload: unknown): string {
  const hash = createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  return `"${hash}"`;
}

export function isNotModified(req: Request, etag: string): boolean {
  const inm = req.headers.get("if-none-match");
  if (!inm) return false;
  return inm
    .split(",")
    .map((t) => t.trim())
    .includes(etag);
}
