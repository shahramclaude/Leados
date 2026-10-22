import assert from "node:assert/strict";
import { test } from "node:test";
import { nextRepInRotation } from "../src/lib/rotation";

test("nextRepInRotation returns first active rep when no prior assignment", () => {
  const reps = [
    { id: 2, active: true },
    { id: 1, active: true },
  ];
  const next = nextRepInRotation(reps, null);
  assert.equal(next?.id, 1); // ordered by id ascending, not array order
});

test("nextRepInRotation cycles to the next rep after the last one", () => {
  const reps = [
    { id: 1, active: true },
    { id: 2, active: true },
    { id: 3, active: true },
  ];
  assert.equal(nextRepInRotation(reps, 1)?.id, 2);
  assert.equal(nextRepInRotation(reps, 2)?.id, 3);
  assert.equal(nextRepInRotation(reps, 3)?.id, 1); // wraps around
});

test("nextRepInRotation skips inactive reps", () => {
  const reps = [
    { id: 1, active: true },
    { id: 2, active: false },
    { id: 3, active: true },
  ];
  assert.equal(nextRepInRotation(reps, 1)?.id, 3);
});

test("nextRepInRotation returns undefined when no active reps exist", () => {
  const reps = [{ id: 1, active: false }];
  assert.equal(nextRepInRotation(reps, null), undefined);
});

test("nextRepInRotation restarts from first active rep if last rep is unknown (e.g. removed)", () => {
  const reps = [
    { id: 1, active: true },
    { id: 2, active: true },
  ];
  assert.equal(nextRepInRotation(reps, 999)?.id, 1);
});
