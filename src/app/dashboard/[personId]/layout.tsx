import { notFound } from "next/navigation";
import { getPerson } from "@/lib/people";
import { TopNav, PersonTabs } from "@/components/TopNav";
import type { ReactNode } from "react";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const person = await getPerson(personId);
  if (!person) notFound();

  return (
    <>
      <TopNav crumb={person.name} />
      <PersonTabs personId={personId} />
      <main className="mx-auto max-w-5xl rounded-b-2xl rounded-tr-2xl border border-slate-200 bg-white px-6 py-8">
        {children}
      </main>
    </>
  );
}
