import CrisisRoomClient from "./CrisisRoomClient";

export default async function CrisisRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CrisisRoomClient crisisId={id} />;
}
