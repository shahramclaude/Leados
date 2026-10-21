"use client";

// Thin client-component wrapper so the realtime-connecting NotificationTray
// can be `next/dynamic`-loaded with `ssr: false` (that flag is only legal
// inside a Client Component boundary). This is the actual "lazy-loaded
// realtime client" referenced in the performance floor requirement — the
// stream connection code is not part of the server-rendered Now surface's
// initial bundle/paint.

import dynamic from "next/dynamic";

const NotificationTray = dynamic(() => import("@/components/NotificationTray"), {
  ssr: false,
  loading: () => <div className="h-10 w-10 rounded-full bg-slate-100" />,
});

export default function LazyNotificationTray() {
  return <NotificationTray />;
}
