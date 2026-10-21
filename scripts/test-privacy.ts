// Acceptance gate (3): two-user privacy tests.
//
// Declared policy under test (see docs/FAIRNESS.md §2):
//  - A manager cannot read HR-only fields.
//  - An employee CANNOT read their manager's private 1:1 prep notes about
//    them, even though they can read the shared agenda/notes for the same
//    1:1 — this is the "user cannot read own [manager-authored] notes"
//    policy declared for this implementation.
//  - A manager cannot read another manager's reports, and cannot read any
//    employee's GDPR-style transparency report (self+HR only).
import "dotenv/config";
import { db, pool } from "../src/db";
import { oneOnOnes } from "../src/db/schema";
import { eq, and } from "drizzle-orm";
import {
  canReadHrOnlyFields,
  canReadOneOnOnePrivateNotes,
  canReadTransparencyReport,
  AccessDeniedError,
  type Actor,
} from "../src/lib/accessControl";
import { getPersonAggregate } from "../src/lib/peopleIntel";
import { getOneOnOne } from "../src/lib/oneOnOne";
import { getTransparencyReport } from "../src/lib/transparency";

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
  if (!pass) failures++;
}

async function expectDenied(fn: () => Promise<unknown>, name: string) {
  try {
    await fn();
    check(name, false, "expected AccessDeniedError, none thrown");
  } catch (e) {
    check(name, e instanceof AccessDeniedError, e instanceof AccessDeniedError ? undefined : String(e));
  }
}

async function main() {
  console.log("=== Two-user privacy / repository-layer scoping tests ===");

  const manager: Actor = { id: "mgr_dana", globalRole: "manager" };
  const otherManager: Actor = { id: "mgr_jordan", globalRole: "manager" };
  const employee: Actor = { id: "emp_priya", globalRole: "employee" };
  const hr: Actor = { id: "hr_casey", globalRole: "hr" };

  // 1. Manager cannot read HR-only fields; HR can.
  check("Manager cannot read HR-only fields (predicate)", canReadHrOnlyFields(manager) === false);
  check("HR can read HR-only fields (predicate)", canReadHrOnlyFields(hr) === true);

  // 2. Cross-team manager cannot read another manager's report's aggregate.
  await expectDenied(
    () => getPersonAggregate(otherManager, "emp_priya"),
    "A manager who does not manage this person is denied read access to their aggregate",
  );
  try {
    await getPersonAggregate(manager, "emp_priya");
    check("The actual manager of this person CAN read their aggregate", true);
  } catch (e) {
    check("The actual manager of this person CAN read their aggregate", false, String(e));
  }

  // 3. Employee cannot read their manager's private 1:1 prep notes about them,
  //    even though they can read the same 1:1's shared content.
  const [oneOnOne] = await db
    .select()
    .from(oneOnOnes)
    .where(and(eq(oneOnOnes.managerId, "mgr_dana"), eq(oneOnOnes.employeeId, "emp_priya")))
    .limit(1);
  if (!oneOnOne) throw new Error("Seed data missing: expected a 1:1 between mgr_dana and emp_priya");

  check(
    "Predicate: employee cannot read manager's private prep notes about them",
    canReadOneOnOnePrivateNotes(employee, oneOnOne) === false,
  );
  check("Predicate: the authoring manager CAN read their own private notes", canReadOneOnOnePrivateNotes(manager, oneOnOne) === true);
  check("Predicate: HR CAN read private notes (duty of care)", canReadOneOnOnePrivateNotes(hr, oneOnOne) === true);

  const asEmployee = await getOneOnOne(employee, oneOnOne.id);
  check("Integration: employee's fetched 1:1 doc has privateNotes redacted to null", asEmployee.privateNotes === null);
  check("Integration: employee's fetched 1:1 doc still includes shared notes", Array.isArray(asEmployee.sharedNotes));

  const asManager = await getOneOnOne(manager, oneOnOne.id);
  check("Integration: manager's fetched 1:1 doc includes their own private notes", asManager.privateNotes !== null);

  await expectDenied(
    () => getOneOnOne(otherManager, oneOnOne.id),
    "A manager not party to this 1:1 is denied read access entirely",
  );

  // 4. Transparency report is self+HR only — a manager (even the actual
  // manager of this person) must not be able to read it.
  await expectDenied(
    () => getTransparencyReport(manager, "emp_priya"),
    "A manager cannot read an employee's transparency report (self+HR only policy)",
  );
  try {
    await getTransparencyReport(employee, "emp_priya");
    check("The employee CAN read their own transparency report", true);
  } catch (e) {
    check("The employee CAN read their own transparency report", false, String(e));
  }
  try {
    await getTransparencyReport(hr, "emp_priya");
    check("HR CAN read an employee's transparency report", true);
  } catch (e) {
    check("HR CAN read an employee's transparency report", false, String(e));
  }
  check(
    "Predicate: executives cannot read individual transparency reports",
    canReadTransparencyReport({ id: "exec_taylor", globalRole: "executive" }, "emp_priya") === false,
  );

  console.log(`\n${failures === 0 ? "ALL PRIVACY TESTS PASSED" : `${failures} PRIVACY TEST(S) FAILED`}`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
