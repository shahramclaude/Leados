// Tiny hash router. Original, minimal, no dependency.
import { useCallback, useEffect, useState } from "react";

function currentHash(fallback: string) {
  const h = window.location.hash.replace(/^#/, "");
  return h || fallback;
}

export function useHashRoute(fallback: string): [string, (next: string) => void] {
  const [route, setRoute] = useState(() => currentHash(fallback));

  useEffect(() => {
    const onHashChange = () => setRoute(currentHash(fallback));
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.hash = fallback;
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [fallback]);

  const navigate = useCallback((next: string) => {
    window.location.hash = next;
  }, []);

  return [route, navigate];
}
