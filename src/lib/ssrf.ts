// SSRF guard for any feature that accepts a user-supplied URL (webhooks,
// future integrations). Defence in depth: scheme allowlist, blocked
// hostnames, and blocked IP ranges including DNS-resolved addresses (so
// "evil.example.com" that resolves to 169.254.169.254 is still caught).
import { isIP } from "node:net";
import dns from "node:dns/promises";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

function isPrivateOrReservedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 0) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true; // loopback
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("::ffff:")) {
      return isPrivateOrReservedIp(lower.replace("::ffff:", ""));
    }
    return false;
  }
  return false;
}

export type SsrfCheckResult = { ok: true } | { ok: false; reason: string };

export async function assertPublicHttpUrl(rawUrl: string): Promise<SsrfCheckResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: `scheme ${url.protocol} is not allowed` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials in URL are not allowed" };
  }
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: "hostname is blocked" };
  }
  if (isIP(hostname) && isPrivateOrReservedIp(hostname)) {
    return { ok: false, reason: "IP address is in a private/reserved range" };
  }

  if (!isIP(hostname)) {
    try {
      const records = await dns.lookup(hostname, { all: true, verbatim: true });
      for (const record of records) {
        if (isPrivateOrReservedIp(record.address)) {
          return { ok: false, reason: `hostname resolves to a private/reserved address (${record.address})` };
        }
      }
    } catch {
      return { ok: false, reason: "hostname did not resolve" };
    }
  }

  return { ok: true };
}
