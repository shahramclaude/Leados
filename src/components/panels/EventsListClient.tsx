"use client";

import type { RowComponentProps } from "react-window";
import { VirtualList } from "@/components/ui/VirtualList";
import { useNowTick, formatRelativeTime } from "@/hooks/useNowTick";
import type { EventDTO } from "@/lib/data/types";

interface RowProps {
  events: EventDTO[];
  now: number;
}

function EventRow({ index, events, now, style }: RowComponentProps<RowProps>) {
  const event = events[index];
  return (
    <div style={style} className="flex items-center justify-between gap-3 border-b border-slate-100 px-1 py-2 text-sm dark:border-slate-800">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900 dark:text-slate-100">{event.title}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          {event.domain} · {event.type}
        </p>
      </div>
      <span className="shrink-0 text-xs text-slate-400">{formatRelativeTime(event.createdAt, now)}</span>
    </div>
  );
}

export function EventsListClient({ events, degraded }: { events: EventDTO[]; degraded?: boolean }) {
  const now = useNowTick();
  return (
    <div className="flex flex-col gap-2">
      {degraded ? (
        <p className="rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Showing partial data — some events could not be loaded.
        </p>
      ) : null}
      <VirtualList
        rowCount={events.length}
        rowHeight={56}
        rowComponent={EventRow}
        rowProps={{ events, now }}
        height={320}
        emptyLabel="No recent events."
        aria-label="Recent events"
      />
    </div>
  );
}
