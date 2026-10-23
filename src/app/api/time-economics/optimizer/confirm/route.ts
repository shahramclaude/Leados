// POST /api/time-economics/optimizer/confirm
//
// T2 CONFIRMATION GATE: this is the ONLY path that turns a scheduling
// suggestion into a real calendar event, and it requires an explicit,
// separate human action (`confirm: true` in the body) distinct from the
// /suggest call. There is no code path from `suggest` straight to a
// booked meeting.
import {
  getActorFromRequest,
  getSchedulingSuggestion,
  confirmSchedulingSuggestion,
  rejectSchedulingSuggestion,
} from "@/lib/time-economics/repo";
import { db } from "@/db";
import { calendarEvents, eventAttendees } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const actor = await getActorFromRequest(req);
  if (!actor) return Response.json({ error: "Missing or invalid x-user-id" }, { status: 401 });

  const body = await req.json();
  const { suggestionId, action, chosenSlot } = body ?? {};

  if (!suggestionId || !["confirm", "reject"].includes(action)) {
    return Response.json({ error: "suggestionId and action ('confirm'|'reject') are required" }, { status: 400 });
  }

  const suggestion = await getSchedulingSuggestion(suggestionId);
  if (!suggestion) return Response.json({ error: "Suggestion not found" }, { status: 404 });
  if (suggestion.status !== "proposed") {
    return Response.json({ error: `Suggestion already ${suggestion.status}` }, { status: 409 });
  }

  if (action === "reject") {
    const updated = await rejectSchedulingSuggestion(suggestionId, actor.id);
    return Response.json({ suggestion: updated });
  }

  // action === "confirm" — the explicit T2 step.
  if (body.confirm !== true) {
    return Response.json(
      { error: "T2 gate: confirm action requires an explicit `confirm: true` flag in the request body — this cannot be inferred." },
      { status: 400 },
    );
  }
  if (!chosenSlot || !chosenSlot.start || !chosenSlot.end) {
    return Response.json({ error: "chosenSlot { start, end } is required" }, { status: 400 });
  }

  const updated = await confirmSchedulingSuggestion(suggestionId, actor.id, chosenSlot);
  if (!updated) return Response.json({ error: "Failed to confirm suggestion" }, { status: 500 });

  const payload = updated.payload as {
    title: string;
    requiredUserIds: string[];
    optionalUserIds: string[];
  };

  const [event] = await db
    .insert(calendarEvents)
    .values({
      orgId: updated.orgId,
      title: payload.title,
      topic: "",
      startTime: new Date(chosenSlot.start),
      endTime: new Date(chosenSlot.end),
      isRecurring: false,
      organizerId: actor.id,
    })
    .returning();

  const attendeeRows = [
    ...payload.requiredUserIds.map((userId) => ({ eventId: event.id, userId, required: true })),
    ...payload.optionalUserIds.map((userId) => ({ eventId: event.id, userId, required: false })),
  ];
  if (attendeeRows.length > 0) {
    await db.insert(eventAttendees).values(attendeeRows);
  }

  return Response.json({
    suggestion: updated,
    bookedEvent: event,
    note: "Booking recorded only because of this explicit confirm call (T2 gate). The optimizer itself never writes a calendar event.",
  });
}
