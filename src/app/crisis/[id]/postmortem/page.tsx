import PostMortemClient from "./PostMortemClient";

export default async function PostMortemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostMortemClient crisisId={id} />;
}
