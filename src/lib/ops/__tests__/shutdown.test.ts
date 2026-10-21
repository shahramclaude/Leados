// Graceful-shutdown drill (unit-level): proves the drain coordinator waits
// for in-flight jobs to finish/checkpoint before reporting done, and closes
// registered stream connections. Documented honestly as a unit test of the
// coordinator, not a live SIGTERM against a running container — see
// docs/RUNBOOKS.md's graceful-shutdown section for the full caveat.
import { beforeEach, describe, expect, it } from "vitest";
import { beginTrackingJob, finishTrackingJob, drain, isDraining, registerStreamCloser, resetForTests } from "../shutdown";

describe("graceful shutdown coordinator", () => {
  beforeEach(() => resetForTests());

  it("reports not draining before drain() is called", () => {
    expect(isDraining()).toBe(false);
  });

  it("waits for an in-flight job to finish before completing the drain", async () => {
    beginTrackingJob("job-1");
    setTimeout(() => finishTrackingJob("job-1"), 100);
    const result = await drain({ graceMs: 2000, pollMs: 10 });
    expect(isDraining()).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.jobsRemaining).toBe(0);
    expect(result.waitedMs).toBeGreaterThanOrEqual(90);
  });

  it("times out and reports remaining jobs if the grace period elapses first", async () => {
    beginTrackingJob("stuck-job");
    const result = await drain({ graceMs: 150, pollMs: 10 });
    expect(result.ok).toBe(false);
    expect(result.jobsRemaining).toBe(1);
    finishTrackingJob("stuck-job");
  });

  it("closes every registered stream on drain", async () => {
    let closed = 0;
    registerStreamCloser(() => {
      closed += 1;
    });
    registerStreamCloser(() => {
      closed += 1;
    });
    await drain({ graceMs: 100 });
    expect(closed).toBe(2);
  });
});
