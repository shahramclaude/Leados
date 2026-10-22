"use client";

// Shared client-side process selection so switching between the four Part 28
// surfaces (Overview / X-Ray / Bottleneck Board / Conformance Explorer /
// Automation ROI) keeps the same process in view. Deliberately simple
// (localStorage, no URL state) — see delivery notes "what we deliberately
// did not do".
import { useCallback, useState } from "react";

const STORAGE_KEY = "leados.processMining.selectedProcess";
const DEFAULT_PROCESS = "benchmark_flow";

function readInitialValue(): string {
  if (typeof window === "undefined") return DEFAULT_PROCESS;
  return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_PROCESS;
}

export function useSelectedProcess(): [string, (value: string) => void] {
  const [value, setValue] = useState<string>(readInitialValue);

  const update = useCallback((next: string) => {
    setValue(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return [value, update];
}
