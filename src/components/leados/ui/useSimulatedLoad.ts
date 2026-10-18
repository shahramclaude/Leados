"use client";

import { useEffect, useState } from "react";

/** Simulates an initial network fetch so views can demonstrate skeleton states. */
export default function useSimulatedLoad(ms = 550) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(id);
  }, [ms]);

  return loading;
}
