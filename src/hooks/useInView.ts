"use client";
// src/hooks/useInView.ts
//
// Pure Web API (IntersectionObserver) lazy-mount hook. Spec: "charts
// outside the viewport are not rendered until scrolled into view." Once a
// panel has been shown once it stays mounted (avoids re-running force
// layouts / histograms on every scroll tick). Used to defer mounting
// dynamic-imported chart/network/metrics panels below the fold.
import { useEffect, useRef, useState } from "react";

export function useInView<T extends HTMLElement>(rootMargin = "200px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootMargin]);

  return { ref, inView };
}
