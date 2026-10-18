import { useEffect, useState, useCallback } from "react";

export function useHashRoute(defaultRoute: string): [string, (r: string) => void] {
  const read = () => (window.location.hash ? window.location.hash.slice(1) : defaultRoute);
  const [route, setRoute] = useState(read);

  useEffect(() => {
    const onHashChange = () => setRoute(read());
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.hash = defaultRoute;
    return () => window.removeEventListener("hashchange", onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = useCallback((r: string) => {
    window.location.hash = r;
  }, []);

  return [route, navigate];
}
