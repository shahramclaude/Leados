import Link from "next/link";
import { notFound } from "next/navigation";
import { getMeetingDetail } from "@/lib/meeting/pipeline";
import MeetingRoomClient from "@/components/meeting/MeetingRoomClient";

export const dynamic = "force-dynamic";

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getMeetingDetail(id);
  if (!detail) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link href="/meetings" className="text-xs text-slate-500 hover:underline">
        ← All meetings
      </Link>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">{detail.meeting.title}</h1>
      <p className="mt-1 text-sm text-slate-500">{new Date(detail.meeting.scheduledAt).toLocaleString()}</p>

      <MeetingRoomClient meetingId={id} initialStatus={detail.meeting.status} />
    </main>
  );
}
