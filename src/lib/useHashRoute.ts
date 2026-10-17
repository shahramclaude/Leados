import { useEffect, useState } from "react";

export function useHashRoute(defaultRoute = "/today"): [string, (route: string) => void] {
  const [route, setRoute] = useState<string>(() => window.location.hash.replace(/^#/, "") || defaultRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.replace(/^#/, "") || defaultRoute);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [defaultRoute]);

  const navigate = (next: string) => {
    window.location.hash = next;
  };

  return [route, navigate];
}
