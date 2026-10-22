// Minimal deterministic property-test helper (avoids adding fast-check as a
// dependency for a handful of PERT identity checks). Generates a fixed grid
// of (a, m, b) triples with a <= m <= b, which is all the PERT identities
// require to be exercised meaningfully.
function range(start: number, end: number, step: number): number[] {
  const out: number[] = [];
  for (let v = start; v <= end; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export function forEachTriple(fn: (a: number, m: number, b: number) => void): void {
  const as = range(0, 10, 2.5);
  const spreadsToM = range(0, 5, 2.5);
  const spreadsToB = range(0.5, 8, 2.5);
  let count = 0;
  for (const a of as) {
    for (const dm of spreadsToM) {
      for (const db of spreadsToB) {
        const m = a + dm;
        const b = m + db;
        fn(a, m, b);
        count++;
      }
    }
  }
  if (count === 0) throw new Error("fastcheckLite generated zero cases");
}

export default { forEachTriple };
