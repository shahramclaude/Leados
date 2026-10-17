import { useCallback, useEffect, useState } from "react";

export function useHashRoute(defaultRoute: string): [string, (r: string) => void] {
  const [route, setRoute] = useState<string>(() => window.location.hash.replace("#", "") || defaultRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.replace("#", "") || defaultRoute);
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.hash = defaultRoute;
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [defaultRoute]);

  const navigate = useCallback((r: string) => {
    window.location.hash = r;
  }, []);

  return [route, navigate];
}
