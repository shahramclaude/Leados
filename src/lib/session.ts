import { createHmac, timingSafeEqual } from "crypto";

const SESSION_COOKIE = "leados_session";
const SECRET = process.env.SESSION_SECRET || "leados-dev-secret-change-me";

export type SessionPayload = { userId: string; orgId: string };

function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("hex");
}

export function encodeSession(payload: SessionPayload): string {
  const json = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = sign(json);
  return `${json}.${sig}`;
}

export function decodeSession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [json, sig] = token.split(".");
  if (!json || !sig) return null;
  const expected = sign(json);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
