import { useEffect, useState } from "react";

export function useHashRoute(defaultRoute: string): [string, (r: string) => void] {
  const [route, setRoute] = useState(() => (window.location.hash ? window.location.hash.slice(1) : defaultRoute));

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash ? window.location.hash.slice(1) : defaultRoute);
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.hash = defaultRoute;
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [defaultRoute]);

  const navigate = (r: string) => {
    window.location.hash = r;
  };

  return [route, navigate];
}
