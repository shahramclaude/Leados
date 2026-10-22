// SSRF guard for any feature that fetches a user-supplied URL (webhook test,
// import-from-URL, etc.). Defense in depth: scheme allowlist + literal
// private/loopback/link-local range block + DNS-resolved-address re-check
// (so `http://attacker-controlled-dns-name/` that resolves to 169.254.169.254
// is also blocked, not just IP literals).
import "server-only";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export interface SsrfCheckResult {
  ok: boolean;
  reason?: string;
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function isPrivateIPv4(ip: string): boolean {
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o))) return true; // fail closed
  const [a, b] = octets;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this" network
  if (a === 169 && b === 254) return true; // link-local / cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT 100.64.0.0/10
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique local
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // fe80::/10 link-local
  if (lower.startsWith("::ffff:")) return isPrivateIPv4(lower.replace("::ffff:", ""));
  return false;
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

/** Validate a user-supplied URL before any outbound fetch is issued.
 * Performs a real DNS lookup so hostname-based SSRF (DNS rebinding to an
 * internal address) is also caught, not just IP literals. */
export async function checkUrlForSsrf(rawUrl: string): Promise<SsrfCheckResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "not_a_valid_url" };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: `protocol_not_allowed:${url.protocol}` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "userinfo_not_allowed" };
  }
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: "blocked_hostname" };
  }

  const ipVersion = isIP(hostname);
  if (ipVersion === 4 && isPrivateIPv4(hostname)) return { ok: false, reason: "private_ip_literal" };
  if (ipVersion === 6 && isPrivateIPv6(hostname)) return { ok: false, reason: "private_ip_literal" };

  if (ipVersion === 0) {
    // Hostname, not a literal — resolve and check the real address so DNS
    // rebinding / internal-hostname tricks are caught too.
    try {
      const resolved = await lookup(hostname);
      if (resolved.family === 4 && isPrivateIPv4(resolved.address)) {
        return { ok: false, reason: "resolves_to_private_ip" };
      }
      if (resolved.family === 6 && isPrivateIPv6(resolved.address)) {
        return { ok: false, reason: "resolves_to_private_ip" };
      }
    } catch {
      return { ok: false, reason: "dns_resolution_failed" };
    }
  }

  return { ok: true };
}
