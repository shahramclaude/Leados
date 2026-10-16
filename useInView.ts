import { useEffect, useRef, useState } from "react";

/**
 * Pure Web API (IntersectionObserver) lazy-mount hook.
 * Spec: "charts outside the viewport are not rendered until scrolled into
 * view." Once a chart has been shown once we keep it mounted (avoids
 * re-computing force layouts / histograms on every scroll tick).
 */
export function useInView<T extends HTMLElement>(rootMargin = "200px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            obs.disconnect();
          }
        }
      },
      { rootMargin }
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootMargin]);

  return { ref, inView };
}
