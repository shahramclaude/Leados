import { PeopleView } from "@/components/PeopleView";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <PeopleView personId={id} />
    </main>
  );
}
