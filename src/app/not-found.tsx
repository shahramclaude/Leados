import Link from "next/link";
import { EmptyState, Button } from "@/components/leados/ui";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <EmptyState
        icon="🧭"
        title="Page not found"
        description="That route doesn't exist in LEADOS. Jump back to today's view or use ⌘K to search."
        action={
          <Link href="/now">
            <Button>Go to Today</Button>
          </Link>
        }
      />
    </div>
  );
}
