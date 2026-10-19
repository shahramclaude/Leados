"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/leados/ui";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // In production this would forward to an observability sink; kept local for the demo engine.
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <ErrorState title="Something broke" description="The page failed to render. You can try again." onRetry={reset} />
    </div>
  );
}
