import { beforeEach, describe, expect, it } from "vitest";
import { POST as RUN } from "@/app/api/automation/run/route";
import { GET as LIST } from "@/app/api/automation/runs/route";
import { resetDatabase } from "../setup/db";

const AUTH = { authorization: "Bearer leados-dev-token" };

function runRequest(body: unknown, headers: Record<string, string> = AUTH) {
  return new Request("http://localhost/api/automation/run", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const validRun = { kind: "monte_carlo_forecast", base: 1000, volatility: 0.2, trials: 200, seed: 7 };

describe("/api/automation", () => {
  beforeEach(resetDatabase);

  it("happy path: triggers a Monte Carlo run and it shows up in the list", async () => {
    const res = await RUN(runRequest(validRun));
    expect(res.status).toBe(201);
    const run = await res.json();
    expect(run.kind).toBe("monte_carlo_forecast");
    expect(run.result.trials).toBe(200);

    const list = await (await LIST(new Request("http://localhost/api/automation/runs"))).json();
    expect(list.total).toBe(1);
    expect(list.items[0].id).toBe(run.id);
  });

  it("auth failure: triggering a run without a token is rejected with 401", async () => {
    const res = await RUN(runRequest(validRun, {}));
    expect(res.status).toBe(401);
  });

  it("validation failure: trials out of bounds is rejected with 400", async () => {
    const res = await RUN(runRequest({ ...validRun, trials: 0 }));
    expect(res.status).toBe(400);
  });

  it("validation failure: unsupported automation kind is rejected with 400", async () => {
    const res = await RUN(runRequest({ ...validRun, kind: "not_a_real_kind" }));
    expect(res.status).toBe(400);
  });

  it("pagination edge: list caps at the requested limit", async () => {
    for (let i = 0; i < 3; i++) {
      await RUN(runRequest({ ...validRun, seed: i }));
    }
    const page = await (await LIST(new Request("http://localhost/api/automation/runs?limit=2"))).json();
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(3);
  });
});
