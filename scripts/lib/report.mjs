// Shared tiny helper for gate scripts: consistent pass/fail/warn reporting
// so every script in scripts/ prints output the same way and exits 0/1
// predictably for scripts/gate-all.mjs to aggregate.
export function section(title) {
  console.log(`\n=== ${title} ===`);
}

export function pass(message) {
  console.log(`  \u2713 ${message}`);
}

export function warn(message) {
  console.log(`  ! ${message}`);
}

export function fail(message) {
  console.error(`  \u2717 ${message}`);
}

export class GateFailure extends Error {}

export function assertGate(condition, message) {
  if (!condition) {
    fail(message);
    throw new GateFailure(message);
  }
  pass(message);
}
