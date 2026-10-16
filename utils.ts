// Small shared helpers. Fabricated for this demo — no equivalent verified in
// the real repo's source (store.js/engine.js use their own inline helpers).

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length,
    bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const dp: number[] = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) dp[j] = j;
  for (let i = 1; i <= al; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= bl; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[bl];
}

let seqCounter = 1000;
export function nextId(prefix: string): string {
  seqCounter += 1;
  return `${prefix}${seqCounter.toString(36)}`;
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function iso(d: Date | number | string): string {
  return new Date(d).toISOString();
}

export function daysBetween(a: string | number, b: string | number): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
}

export function fmtDate(ts: string): string {
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dayOfWeekName(ts: string): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: "long" });
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as T;
}

// View Transitions API — progressive enhancement, no-op fallback.
export function withViewTransition(fn: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(fn);
  } else {
    fn();
  }
}
