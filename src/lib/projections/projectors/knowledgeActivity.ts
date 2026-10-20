// Projector: knowledgeActivity — one row per document.
// Consumes: knowledge.doc_published, knowledge.doc_viewed, knowledge.doc_flagged_outdated.
// Entity key: docId.
import type { Projector } from "../engine";

export type KnowledgeActivityState = {
  docId: string;
  title: string;
  authorId: string;
  space: string;
  viewCount: number;
  flagged: boolean;
  flagReason: string | null;
};

const initial: KnowledgeActivityState = {
  docId: "",
  title: "",
  authorId: "",
  space: "",
  viewCount: 0,
  flagged: false,
  flagReason: null,
};

export const knowledgeActivityProjector: Projector<KnowledgeActivityState> = {
  name: "knowledgeActivity",
  interestedIn: ["knowledge.doc_published", "knowledge.doc_viewed", "knowledge.doc_flagged_outdated"],
  initial,
  apply(state, e) {
    switch (e.type) {
      case "knowledge.doc_published": {
        const p = e.payload as { docId: string; title: string; authorId: string; space: string };
        return { ...state, docId: p.docId, title: p.title, authorId: p.authorId, space: p.space };
      }
      case "knowledge.doc_viewed": {
        // Observed fact — the event carries `confidence` on the envelope
        // (not the payload) when the view was inferred rather than directly
        // logged; the projector counts it regardless, cockpit/UI can choose
        // to weight by confidence if needed later.
        return { ...state, viewCount: state.viewCount + 1 };
      }
      case "knowledge.doc_flagged_outdated": {
        const p = e.payload as { reason: string };
        return { ...state, flagged: true, flagReason: p.reason };
      }
      default:
        return state;
    }
  },
};
