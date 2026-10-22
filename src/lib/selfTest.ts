// Synthetic smoke checks used by the composite health model.
import { logger } from "./logger";

const log = logger.child({ component: "selfTest" });

export interface SelfTestResult {
  ok: boolean;
  latencyMs: number;
  detail: string;
}

/**
 * LLM reachability check. If `LLM_HEALTHCHECK_URL` is configured we do a real
 * network round trip with a short timeout. Otherwise we are honest about it:
 * no external LLM is wired up in this checkout, so we report a "stubbed"
 * status rather than pretending a check happened.
 */
export async function checkLlmReachability(): Promise<SelfTestResult> {
  const url = process.env.LLM_HEALTHCHECK_URL;
  const start = Date.now();
  if (!url) {
    return {
      ok: true,
      latencyMs: 0,
      detail: "no LLM_HEALTHCHECK_URL configured — reporting stubbed-ok, not a real reachability probe",
    };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, { signal: controller.signal, method: "GET" });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    return { ok: res.ok, latencyMs, detail: `HTTP ${res.status}` };
  } catch (err) {
    log.warn("llm_reachability_failed", { error: String(err) });
    return { ok: false, latencyMs: Date.now() - start, detail: String(err) };
  }
}
