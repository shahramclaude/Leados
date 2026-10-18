// ════════════════════════════════════════════════════════════════════
// Rules API — written as standard Web `Request`/`Response` handlers,
// the exact shape Next.js App Router route handlers expect
// (`export async function GET/POST/PATCH(req: Request)`), so this file
// can be dropped verbatim into `app/api/rules/route.ts` (and
// `app/api/rules/[id]/route.ts` / `app/api/rules/calibrate/route.ts`
// by splitting the branches below) in a real Next.js deployment.
//
// This sandbox is a Vite SPA with no Node server, so there is no actual
// network hop — `src/lib/rulesApiClient.ts` invokes these exact
// functions in-process with real `Request` objects, meaning the
// validation/branching logic below is genuinely exercised, not mocked.
//
//   GET    /api/rules                -> full catalog + calibration stats
//   POST   /api/rules                -> create a custom rule
//   PATCH  /api/rules/:id            -> enable/disable, update weight
//   POST   /api/rules/calibrate      -> trigger a full calibration pass
// ════════════════════════════════════════════════════════════════════
import {
  listRules,
  patchRule,
  createCustomRule,
  runFullCalibration,
  CustomRuleInput,
} from "../../../lib/ruleStore";
import { computeRuleHealthScore } from "../../../lib/autoCalibrate";
import { Rule, Domain, Severity } from "../../../lib/ruleRegistry";
import { evaluateAll, computeDomainHealth, computeAveragePrecision, FiringResult } from "../../../lib/ruleEngine";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function serializeRule(rule: Rule, firing?: FiringResult) {
  return {
    ...rule,
    healthScore: computeRuleHealthScore(rule),
    calibration: {
      ...rule.calibration,
      lastCalibrated: rule.calibration.lastCalibrated.toISOString(),
    },
    firing: firing?.firing ?? false,
    evidenceText: firing?.evidenceText ?? null,
    sparkline: firing?.sparkline ?? [],
  };
}

const VALID_DOMAINS: Domain[] = ["people", "finance", "sales", "ops", "strategy"];

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

/** GET /api/rules — full rule catalog with calibration stats. */
export async function GET(_req: Request): Promise<Response> {
  const rules = listRules();
  const results = evaluateAll(rules);
  const byId = new Map(results.map((r) => [r.rule.id, r]));
  const domainHealth = computeDomainHealth(results);

  return json({
    count: rules.length,
    activeCount: rules.filter((r) => r.enabled).length,
    firingCount: results.filter((r) => r.firing).length,
    precisionAvg: computeAveragePrecision(rules),
    domainHealth,
    rules: rules.map((r) => serializeRule(r, byId.get(r.id))),
  });
}

/**
 * POST /api/rules            -> create a custom rule
 * POST /api/rules/calibrate  -> trigger a full calibration pass
 * (Branches on pathname so one file can serve both POST routes in this
 * single-file deliverable; in Next.js these would be two folders.)
 */
export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.endsWith("/calibrate")) {
    const diff = runFullCalibration();
    return json({
      ranAt: new Date().toISOString(),
      changedCount: diff.filter(
        (d) => d.before.weight !== d.after.weight || JSON.stringify(d.before.thresholds) !== JSON.stringify(d.after.thresholds) || d.before.enabled !== d.after.enabled
      ).length,
      diff: diff.map((d) => ({
        ruleId: d.ruleId,
        ruleName: d.ruleName,
        before: d.before,
        after: d.after,
      })),
    });
  }

  let payload: Partial<CustomRuleInput>;
  try {
    payload = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const { name, domain, condition_expression, severity, tags } = payload;

  if (!name || typeof name !== "string" || name.trim().length < 3) {
    return badRequest("`name` is required (min 3 characters).");
  }
  if (!domain || !VALID_DOMAINS.includes(domain as Domain)) {
    return badRequest(`\`domain\` must be one of: ${VALID_DOMAINS.join(", ")}`);
  }
  if (!condition_expression || typeof condition_expression !== "string") {
    return badRequest("`condition_expression` is required.");
  }
  const sev = Number(severity);
  if (!Number.isInteger(sev) || sev < 1 || sev > 5) {
    return badRequest("`severity` must be an integer between 1 and 5.");
  }

  try {
    const rule = createCustomRule({
      name: name.trim(),
      domain: domain as Domain,
      condition_expression,
      severity: sev as Severity,
      tags: Array.isArray(tags) ? tags.filter((t) => typeof t === "string") : [],
    });
    return json({ rule: serializeRule(rule) }, 201);
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Invalid condition_expression.");
  }
}

/** PATCH /api/rules/:id — enable/disable, update weight. */
export async function PATCH(req: Request): Promise<Response> {
  const url = new URL(req.url, "http://localhost");
  const segments = url.pathname.split("/").filter(Boolean);
  const id = segments[segments.length - 1];
  if (!id || id === "rules") {
    return badRequest("Rule id is required in the URL path, e.g. /api/rules/P01");
  }

  let payload: Partial<Pick<Rule, "enabled" | "weight">>;
  try {
    payload = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const patch: Partial<Pick<Rule, "enabled" | "weight">> = {};
  if (typeof payload.enabled === "boolean") patch.enabled = payload.enabled;
  if (typeof payload.weight === "number" && !Number.isNaN(payload.weight)) {
    patch.weight = Math.max(0, Math.min(5, payload.weight));
  }
  if (Object.keys(patch).length === 0) {
    return badRequest("Provide at least one of: enabled (boolean), weight (number).");
  }

  const updated = patchRule(id, patch);
  if (!updated) return json({ error: `No rule found with id "${id}"` }, 404);
  return json({ rule: serializeRule(updated) });
}
