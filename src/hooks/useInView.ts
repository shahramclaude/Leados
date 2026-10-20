"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Lazily mounts expensive panels (charts, network graph, heatmap) only once
 * they scroll into the viewport, using IntersectionObserver. Once visible it
 * stays mounted (no mount/unmount thrash while scrolling).
 */
export function useInView<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px", threshold: 0.01, ...options },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, options]);

  return { ref, inView };
}
