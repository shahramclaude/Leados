import { rehearseCaseMitigation } from './caseRehearsal.js';

self.onmessage = ({ data }) => {
  const { state, caseId, input, now } = data;
  self.postMessage(rehearseCaseMitigation(state, caseId, input, { now: new Date(now) }));
};
