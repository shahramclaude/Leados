// Tiny hash router. ORIGINAL to this build.
import { useEffect, useState, useCallback } from 'react';

export function useHashRoute(defaultRoute: string): [string, (r: string) => void] {
  const getRoute = () => (window.location.hash ? window.location.hash.slice(1) : defaultRoute);
  const [route, setRoute] = useState(getRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) window.location.hash = defaultRoute;
    return () => window.removeEventListener('hashchange', onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = useCallback((r: string) => {
    window.location.hash = r;
  }, []);

  return [route, navigate];
}
