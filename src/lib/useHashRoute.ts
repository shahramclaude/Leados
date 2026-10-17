// src/lib/useHashRoute.ts
// Tiny hash router so routes literally look like "#/intelligence",
// matching the pt-L brief's own route naming ("In #/intelligence, a new
// section: THERMODYNAMICS"). ORIGINAL to this sandbox session.
import { useEffect, useState } from "react";

export function useHashRoute(defaultRoute: string) {
  const read = () => (window.location.hash ? window.location.hash.slice(1) : defaultRoute);
  const [route, setRoute] = useState(read());

  useEffect(() => {
    const onHashChange = () => setRoute(read());
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.hash = defaultRoute;
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (r: string) => {
    window.location.hash = r;
  };

  return [route, navigate] as const;
}
