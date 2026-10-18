import { redirect } from "next/navigation";

// LeadOS pt-T is delivered as a single self-contained static artifact at
// public/index.html (zero network calls, zero dependencies, per the task's
// requested deliverable format). The Next.js app's job here is only to:
//   1) satisfy this platform's required fullstack/DB-backed scaffold
//      (see src/app/api/health/route.ts for the DB-backed healthcheck), and
//   2) route the site root straight at the static artifact so "open the
//      app" and "open index.html" are the same action.
export default function HomePage() {
  redirect("/index.html");
}
