// Contract tests: validate real route handler responses against the exact
// zod schemas that generate api-spec.json/yaml (src/lib/openapi/schemas.ts).
// Because both the spec and this test import the same schema objects, a
// response shape can't drift from the published spec without this test
// catching it.
import { beforeEach, describe, expect, it } from "vitest";
import {
  AutomationRunSchema,
  BoardPackSchema,
  DecisionSchema,
  EventRecordSchema,
  FindingSchema,
  HealthSchema,
  pageSchema,
} from "@/lib/openapi/schemas";
import { GET as HEALTH } from "@/app/api/health/route";
import { GET as LIST_EVENTS, POST as CREATE_EVENT } from "@/app/api/events/route";
import { GET as LIST_FINDINGS, POST as CREATE_FINDING } from "@/app/api/findings/route";
import { GET as LIST_DECISIONS, POST as CREATE_DECISION } from "@/app/api/decisions/route";
import { POST as RUN_AUTOMATION } from "@/app/api/automation/run/route";
import { GET as GET_BOARDPACK } from "@/app/api/boardpack/route";
import { resetDatabase } from "../setup/db";

const AUTH = { authorization: "Bearer leados-dev-token" };
const jsonHeaders = { "content-type": "application/json", ...AUTH };

describe("API contract (spec <-> live response)", () => {
  beforeEach(resetDatabase);

  it("GET /api/health matches HealthSchema", async () => {
    const body = await (await HEALTH()).json();
    expect(HealthSchema.safeParse(body).success).toBe(true);
  });

  it("GET /api/events matches Page<EventRecord>", async () => {
    const body = await (await LIST_EVENTS(new Request("http://localhost/api/events"))).json();
    expect(pageSchema(EventRecordSchema).safeParse(body).success).toBe(true);
  });

  it("POST /api/events (201) matches EventRecordSchema", async () => {
    const res = await CREATE_EVENT(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ type: "system.ping", version: 1, payload: { message: "hi" } }),
      }),
    );
    const body = await res.json();
    const result = EventRecordSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it("GET /api/findings matches Page<Finding>, POST matches FindingSchema", async () => {
    const createRes = await CREATE_FINDING(
      new Request("http://localhost/api/findings", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ title: "T", impact: 5, confidence: 5, effort: 5 }),
      }),
    );
    expect(FindingSchema.safeParse(await createRes.json()).success).toBe(true);

    const listBody = await (await LIST_FINDINGS(new Request("http://localhost/api/findings"))).json();
    expect(pageSchema(FindingSchema).safeParse(listBody).success).toBe(true);
  });

  it("GET /api/decisions matches Page<Decision>, POST matches DecisionSchema", async () => {
    const createRes = await CREATE_DECISION(
      new Request("http://localhost/api/decisions", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ title: "T" }),
      }),
    );
    expect(DecisionSchema.safeParse(await createRes.json()).success).toBe(true);

    const listBody = await (await LIST_DECISIONS(new Request("http://localhost/api/decisions"))).json();
    expect(pageSchema(DecisionSchema).safeParse(listBody).success).toBe(true);
  });

  it("POST /api/automation/run matches AutomationRunSchema", async () => {
    const res = await RUN_AUTOMATION(
      new Request("http://localhost/api/automation/run", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ kind: "monte_carlo_forecast", base: 100, volatility: 0.1, trials: 50, seed: 1 }),
      }),
    );
    expect(AutomationRunSchema.safeParse(await res.json()).success).toBe(true);
  });

  it("GET /api/boardpack matches BoardPackSchema", async () => {
    const body = await (await GET_BOARDPACK()).json();
    expect(BoardPackSchema.safeParse(body).success).toBe(true);
  });
});
