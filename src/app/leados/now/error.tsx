"use client";

import { useEffect, useMemo } from "react";
import { ErrorState } from "@/components/leados/ui/States";

export default function CockpitError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const errorId = useMemo(() => error.digest ?? `cockpit-${Date.now().toString(36)}`, [error.digest]);

  useEffect(() => {
    console.error("[cockpit]", errorId, error);
  }, [error, errorId]);

  return (
    <ErrorState
      title="Cockpit couldn't load"
      description="We couldn't reach the decision data. Retry, or share the error id with the platform team."
      errorId={errorId}
      onRetry={reset}
    />
  );
}
