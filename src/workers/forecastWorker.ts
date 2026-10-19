// src/workers/forecastWorker.ts
//
// Browser Web Worker wrapper around monteCarlo.ts's `runMonteCarlo`. The
// core math is identical to what runs on the server (src/lib/intelligence/
// monteCarlo.ts) — this file only adds the postMessage plumbing so a large
// trial count never blocks the main UI thread. Built as a Next.js/webpack
// "module worker" (`new Worker(new URL("./forecastWorker.ts", import.meta.url))`),
// see src/lib/intelligence/useForecastWorker.ts for the client-side hook
// that loads it.
import { runMonteCarlo, type MonteCarloInput } from "@/lib/intelligence/monteCarlo";

self.onmessage = async (event: MessageEvent<MonteCarloInput>) => {
  try {
    const result = await runMonteCarlo(event.data);
    (self as unknown as Worker).postMessage({ ok: true, result });
  } catch (error) {
    (self as unknown as Worker).postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
