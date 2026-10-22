// scripts/lib/testKit.ts
//
// Minimal dependency-free test harness used by the `test:*` scripts. No
// jest/vitest dependency is introduced — these are plain Node processes run
// via `tsx` so `npm run verify` has the smallest possible toolchain surface.

export interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

const cases: TestCase[] = [];

export function test(name: string, fn: () => void | Promise<void>): void {
  cases.push({ name, fn });
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

export function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

export function assertClose(actual: number, expected: number, epsilon: number, message: string): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}\n  expected ~${expected} (+/- ${epsilon})\n  actual:   ${actual}`);
  }
}

export function assertThrows(fn: () => void, message: string): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(`Assertion failed (expected throw): ${message}`);
}

export async function assertRejects(fn: () => Promise<void>, message: string): Promise<void> {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(`Assertion failed (expected rejection): ${message}`);
}

export async function runAll(suiteName: string): Promise<number> {
  let pass = 0;
  let fail = 0;
  console.log(`\n=== ${suiteName} ===`);
  for (const c of cases) {
    try {
      await c.fn();
      pass += 1;
      console.log(`  ok   ${c.name}`);
    } catch (err) {
      fail += 1;
      console.log(`  FAIL ${c.name}`);
      console.log(`       ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`--- ${suiteName}: ${pass} passed, ${fail} failed (${cases.length} total) ---\n`);
  return fail === 0 ? 0 : 1;
}
