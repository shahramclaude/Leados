/**
 * Central API mutation/read boundary for declared seats. Unknown methods fail
 * closed. The undeclared local operator keeps the existing workflow. This is
 * not authentication: the browser owner can switch seats or read localStorage.
 */
import { activeSeat, buildSeats, canAct, canSee, recordPeople } from './seat.js';
import { responsibleNodeId } from './chain.js';
import { matrixLineScopeFor } from './matrix.js';
import { PAUSE_PERMIT_RIGHTS } from './pausePermitRegistry.js';
import { CHANGE_SATURATION_RIGHTS } from './changeSaturationRegistry.js';
import { AAR_CORROBORATION_RIGHTS } from './aarCorroborationRegistry.js';
import { STANDARD_WORK_RIGHTS } from './standardWorkRegistry.js';
import { routeVerdict } from './seatRegistry.js';
import { validateMissionCommands } from './mission.js';
import { captureBriefCase } from './missionCaptureBrief.js';
import { postureFor } from './disclosure.js';
import { DISCLOSURE_POSTURES } from './disclosureRegistry.js';
import { activeIdentitySession } from './identitySession.js';

const groups = [
  ['log-feedback', 'addFeedback'],
  ['log-oneonone', 'updatePerson logOneOnOne oneOnOneLineClaim oneOnOneLineRelease toggleMeetingAction addMeetingAction updateFeedback completeFollowUp saveGrowthPlan updateGrowthPlan addWillAction toggleWillAction carryWillAction dropWillAction logGrowthReview addRecognition setReadiness createReview updateReflection updateAssessment refreshReviewEvidence completeReview reopenReview createOnboardingPlan updateOnboardingPlan addOnboardingCheckpoint toggleOnboardingCheckpoint removeOnboardingCheckpoint addOnboardingStakeholder toggleOnboardingStakeholder removeOnboardingStakeholder recordOnboardingReview addManagerSupportCommitment toggleManagerSupportCommitment completeOnboardingPlan reopenOnboardingPlan addPerformanceConcern updatePerformanceConcern addPerformanceObservation removePerformanceObservation recordPerformanceConversation recordPerformanceSupport adoptPerformancePlan reviewPerformancePlan withdrawPerformanceConcern deletePerformanceConcern'],
  // ADR-0147: Matrix Multi-Line Review Stewardship. Asking a line and answering
  // for a line are ordinary review work at the manager altitude (the same window
  // as `createReview`/`completeReview`); the actions additionally enforce that the
  // asking seat reaches the person and that the ANSWERING seat is the manager who
  // holds the line, so a peer cannot answer for somebody else's line. The scan
  // changes no declaration and is declared here so an operator can retry a cap.
  ['ask-review-input', 'reviewStewardshipAsk reviewStewardshipRead reviewStewardshipCandidates'],
  ['answer-review-input', 'reviewStewardshipAnswer reviewStewardshipScan'],
  // ADR-0185: the Matrix review read remains a separate, seat-scoped adapter;
  // requesting is span-reach checked and responding is the line holder's own act.
  ['read-change-impact-review', 'changeImpactReviewBoard changeImpactReviewCandidates changeImpactReviewBriefText changeImpactReviewCsvRows changeImpactReviewAttentionCount'],
  ['request-change-impact-review', 'changeImpactReviewRequest'],
  ['respond-change-impact-review', 'changeImpactReviewRespond'],
  // ADR-0186: the Cross-Line Change Saturation Ledger. Declaring what a change
  // puts on a person is the act of the manager whose line put it there (the action
  // additionally enforces that the seat HOLDS the named line), and bounding the
  // capacity a person or a pool will absorb is a separate right because it is a
  // separate human's sentence. Neither can perform the other, and the aggregate
  // read plus the scan are declared so an operator can always retry a deferred ask.
  [CHANGE_SATURATION_RIGHTS.DECLARE, 'changeSaturationDeclareDemand changeSaturationWithdrawDemand'],
  [CHANGE_SATURATION_RIGHTS.GOVERN, 'changeSaturationDeclareCeiling changeSaturationRetireCeiling changeSaturationScan changeSaturationSetConventions'],
  // ADR-0188: cross-line after-action corroboration. Reading the register is its
  // own right; asking a line to answer is the act of a manager who reaches the
  // participants; ANSWERING is the requested holder's own act and the action
  // re-checks that the seat IS that holder; adopting a lesson is a separate
  // first-person statement a holder makes about their own line. Governing the
  // conventions is separate again. The scan is declared so an operator can retry
  // a capped commit rather than waiting for the next write.
  [AAR_CORROBORATION_RIGHTS.READ, 'aarCorroborationReport aarCorroborationBriefText aarCorroborationCsvRows aarCorroborationAttentionCount'],
  [AAR_CORROBORATION_RIGHTS.REQUEST, 'aarCorroborationRequest aarCorroborationCandidates'],
  [AAR_CORROBORATION_RIGHTS.RESPOND, 'aarCorroborationRespond'],
  [AAR_CORROBORATION_RIGHTS.ADOPT, 'aarLessonAdopt'],
  [AAR_CORROBORATION_RIGHTS.GOVERN, 'aarCorroborationScan aarCorroborationSetConventions'],
  // ADR-0190: Leader Standard Work & Tiered Daily Management. Reading, declaring
  // and recording are open to every altitude — the ACTION narrows each act to
  // the person it belongs to (a check is the owner's alone; a tier act is the
  // addressed leader's alone). Governing the conventions is rank 3–5.
  [STANDARD_WORK_RIGHTS.READ, 'standardWorkReport standardWorkBriefText standardWorkCsvRows standardWorkAttentionCount'],
  [STANDARD_WORK_RIGHTS.DECLARE, 'standardWorkDeclareRoutine standardWorkRetireRoutine standardWorkCandidates'],
  [STANDARD_WORK_RIGHTS.RECORD, 'standardWorkRecordCheck standardWorkTierAct'],
  [STANDARD_WORK_RIGHTS.GOVERN, 'standardWorkScan standardWorkSetConventions'],
  // ADR-0150: Matrix Onboarding Completeness. Writing a line's onboarding brief is
  // the act of the manager who holds that line (the action narrows it to them), and
  // acknowledging one is the PERSON's own act (the action narrows that too). They
  // are separate rights on the spine because they are separate humans' statements,
  // and neither can perform the other. The three aggregate reads and the scan are
  // declared here so a real operator can always retry a deferred obligation.
  // ADR-0153: the role-clarity read surface. `roleClarityRead` and
  // `roleClarityBoard` are seat-checked inside the action (the same right that
  // authorises reading the briefs authorises reading the comparison of them), so
  // they live on the brief right; the aggregate reads live in SAFE_READS below.
  ['brief-onboarding-line', 'onboardingMatrixBriefLine onboardingMatrixDeclineLine onboardingMatrixRead onboardingMatrixCandidates onboardingMatrixScan roleClarityRead roleClarityBoard'],
  ['acknowledge-onboarding-line', 'onboardingMatrixAcknowledge'],
  ['log-conflict', 'addConflict updateConflict agreeConflict completeConflictAction followUpConflict resolveConflict escalateConflict reopenConflict'],
  ['open-case', 'addCase updateCase requestMitigationReview syncCaseAutomations resolveCase recordCaseActuals reopenCase deleteCase linkCaseEntity removeMissingCaseMitigation refreshCaseAutomation'],
  ['open-decision', 'addDecision updateDecision decideDecision reviewDecision withdrawBundleDecision addGoal updateGoal checkInGoal addKeyResult removeKeyResult'],
  ['delegate', 'addDelegation updateDelegation checkInDelegation completeDelegation returnDelegation redelegateReturnedOutcome setActionOwner'],
  ['test-assumption', 'addPremise updatePremise recordPremiseEvidence reviewPremise recordPremiseOutcome withdrawBundlePremise'],
  ['prepare-comms', 'approveCommsDraft editCommsDraft markCommsDraftSent dismissCommsDraft missionCaptureBriefDraft missionCaptureBriefEdit missionCaptureBriefApprove missionCaptureBriefSent missionCaptureBriefDismiss missionCaptureBriefBulkDraft'],
  ['set-disclosure-floor', 'setMissionFloor'],
  ['offer-authority', 'proposeMandate acceptMandate deliverMandate verifyMandate returnMandate revokeMandate scanMandates'],
  ['approve-capital', 'addBudgetLine updateBudgetLine recordBudgetActual releaseBudgetLine deleteBudgetLine'],
  ['coordinate-intervention', 'createActionBundle updateActionBundle saveActionBundlePreview commitActionBundle withdrawActionBundle archiveActionBundle missionCapturePrepare missionCapturePrepareMerge missionCaptureDismissMerge saveMissionCapturePreview missionCaptureCommit missionCaptureDismiss missionCaptureWithdraw executionScan setExecutionAutoPropagate'],
  ['prepare-agenda', 'agendaFile agendaWithdraw agendaScan'],
  // ADR-0140: declaring a second reporting line. Every method is declared
  // (deny-by-default); the action additionally enforces that the declaring seat
  // is one of the two managers the line joins, or the span above both of them,
  // so a peer cannot grant itself a report inside another span.
  // ADR-0149: recording a home-line change is a SEPARATE right from declaring a
  // second line. Declaring an additional line ADDS accountability; MOVING a home
  // line REWRITES the tree every other module rolls up through, so it is its own
  // gated act, and the action additionally requires the seat to be one of the two
  // managers involved or the span above both — a peer cannot restructure another
  // span.
  ['record-structure-change', 'structureRecordMove structureImportDesign structureSeedCurrent structureScan structureHistoryCandidates'],
  ['declare-matrix-line', 'matrixDeclareLine matrixRetuneLine matrixEndLine matrixSetConventions matrixReport matrixBriefText matrixCsvRows matrixCoordinationReport matrixCoordinationScan matrixSodReview matrixSettings matrixCandidates lineConsentRead lineConsentCandidates lineConsentScan matrixRecordIntake matrixRerouteIntake matrixIntakeReport matrixIntakeCandidates matrixHorizonReport matrixHorizonScan matrixDependencyCycleReport matrixInterfaceAlignmentReport'],
  ['govern-dependency-cycles', 'matrixDependencyCycleScan matrixDependencyCycleSetConventions'],
  // ADR-0189: scanning the product–organisation interface alignment matrix and
  // setting its conventions. The pure read sits on `declare-matrix-line` and in
  // SAFE_READS; the scan (which runs the shared spine) and the conventions stay
  // on this declared right.
  ['govern-interface-alignment', 'matrixInterfaceAlignmentScan matrixInterfaceAlignmentSetConventions'],
  // ADR-0148: answering a declared share is TWO first-person acts, split on the
  // spine rather than in prose. `accept-matrix-line` is the manager's own
  // answer (accept or decline the line they were given); it is open at every
  // leadership rank because a project lead with no home-line reports is exactly
  // who gets handed a line. `acknowledge-matrix-line` is the PERSON's own act —
  // the hours are theirs — and the action refuses any seat that is not that
  // person (or the operator view). Neither can answer for the other.
  ['accept-matrix-line', 'lineConsentAccept lineConsentDecline'],
  ['acknowledge-matrix-line', 'lineConsentAcknowledge'],
  // ADR-0157: a line has a TERM, and both sides answer inside it. Re-affirming or
  // releasing is the line's own manager's answer and is enforced in the action;
  // accepting or objecting is the PERSON's own act, and the action refuses any
  // seat that is not that person (or the operator view). The read paths and the
  // deferred-work retry sit on the same declared right as the register they read,
  // so an action whose right was never declared cannot be refused for every seat
  // by accident.
  ['reaffirm-matrix-line', 'lineReaffirm lineRelease lineReaffirmationRead lineReaffirmationCandidates lineReaffirmationScan'],
  ['answer-line-reaffirmation', 'lineReaffirmationAccept lineReaffirmationObject'],
  // ADR-0159: Frozen Authority Re-Affirmation. Standing behind or referring a
  // drifted frozen decision is strictly checked in the action against live
  // matrix RAPID authority (`canSettleAuthority`).
  ['reaffirm-frozen-authority', 'authorityReaffirmStandBehind authorityReaffirmRefer authorityContinuityScan'],
  // ADR-0162: Matrix Management-Interface Operating Agreements. First-person
  // counterpart standing, unique joint-apex validation and active forum checks
  // are enforced inside `matrixInterfaceActions`.
  ['affirm-matrix-interface', 'matrixInterfaceAffirm matrixInterfaceRetire matrixInterfaceScan'],
  ['govern-matrix-interface', 'matrixInterfaceSetConventions'],
  // ADR-0174: Standing Delegation-of-Authority Schedule & Limit Conformance.
  ['declare-doa-limit', 'doaDeclareLimit doaRetireLimit doaPriceDecision doaScan'],
  ['govern-doa-schedule', 'doaSetConventions'],
  // ADR-0175: recording a dated remedy for a recurring matrix pattern. The action
  // narrows it to a span-level seat, refuses a pattern the seat cannot see, and
  // refuses a second active remedy for the same pattern.
  ['declare-matrix-remedy', 'matrixRemedyDeclare'],
  ['govern-oneonone-lines', 'oneOnOneLineSetConventions oneOnOneLineScan'],
  // ADR-0176: re-running RULE-HLC-01 is director+. Declaring or withdrawing a
  // line plan deliberately has NO seat-scoped adapter: it names managers in
  // more than one span, so it stays in the full-access operator view.
  ['attribute-delegation-line', 'delegationLineAttribute'],
  ['govern-delegation-lines', 'delegationLineScan'],
  // ADR-0181: classifying an ask is open at every leadership rank, because the
  // frontline lead who hands the work out is exactly who knows what kind it is;
  // the action narrows it to a seat that REACHES the person (span or declared
  // line) and refuses the person's own seat. Re-running RULE-NPW-01 and changing
  // the conventions is director+.
  ['classify-work-turn', 'workTurnClassify'],
  ['govern-work-turns', 'workTurnScan workTurnSetConventions'],
  // ADR-0182: granting or withdrawing a permit for a silenced automatic control
  // is director+ (it governs the whole workspace's automatic behaviour). The
  // ACTION further narrows it: a seat that is not the full-access operator must
  // BE the single seat above every reporting line, so no line manager can
  // silence a control that reads another manager's work.
  ['permit-automation-pause', 'pausePermitGrant pausePermitRevoke'],
  ['govern-automation-pauses', 'pausePermitScan pausePermitSetConventions'],
  ['govern-hiring-lines', 'hiringLineScan'],
  // ADR-0184: recording a dated workforce move is a manager act against a person
  // they reach — the ACTION narrows it to that person's span or declared lines,
  // and refuses anybody else. Declaring or retiring the intended shape of the
  // workforce is director+ (it is a plan for the whole workspace), and so are
  // the convention setter and the scan.
  ['record-workforce-move', 'workforceFlowRecordMove workforceFlowWithdrawMove'],
  ['govern-workforce-plan', 'workforceFlowDeclareTarget workforceFlowRetireTarget workforceFlowScan workforceFlowSetConventions'],
  // ADR-0177: a transfer price is a TWO-KEY act. Proposing, confirming and
  // retiring are open at every leadership rank because a project lead with no
  // home-line reports is exactly who borrows; the action narrows each to the
  // seat's OWN side of the pair (the lender key by the lending manager, the
  // borrower key by the borrowing manager), so no seat can sign for its
  // counterpart. Re-running RULE-TPL-01 and setting the conventions is director+.
  ['agree-transfer-price', 'transferPricePropose transferPriceConfirm transferPriceRetire'],
  ['govern-transfer-prices', 'transferPriceScan transferPriceSetConventions'],
  // ADR-0152: settling an obligation an ENDED line left behind. Recording the
  // remedy is the manager's own act (the action narrows it to a seat that reaches
  // the person, and a carry must name a live line holder); the scan changes no
  // declaration and is declared here so a real operator can retry a deferred ask.
  ['close-line-obligation', 'lineExitRemedy lineExitScan lineExitRead'],
  // ADR-0143: the Cross-Line Priority Arbitration. Opening a case, disposing of a
  // demand and recording the measured recommendation are the parties' and the
  // span's work; recording the BINDING precedence is a separate right
  // (`agree-arbitration`) because it is the only act that issues obligations, and
  // `answer-arbitration` is each named party's own first-person act, enforced in
  // the action. Every method is declared; an unknown name still fails closed.
  ['open-arbitration', 'priorityOpenCase priorityTreatDemand priorityPropose prioritySetConventions'],
  ['agree-arbitration', 'priorityAgreePrecedence priorityWithdraw'],
  ['answer-arbitration', 'priorityRecordAnswer'],
  // ADR-0144: declaring a line charter is the line's own act, open at every
  // leadership rank and enforced in the action (the seat must reach the line on
  // the tree or a declared line). Ruling on a contradiction is a director-and-
  // above act, because a resequence issues an obligation to somebody else's
  // line; re-declaring the audit's conventions is split out so it can require a
  // full-access rank-4+ seat.
  ['declare-line-mandate', 'contradictionDeclareMandate contradictionWithdrawMandate contradictionReport contradictionBriefText contradictionCsvRows contradictionCandidates'],
  ['review-contradiction', 'contradictionReview contradictionScan contradictionReviews'],
  ['set-contradiction-conventions', 'contradictionSetConventions'],
  // ADR-0121: declaring who answers for a duty when the seat holder is absent.
  // Every method is declared (deny-by-default); the action additionally enforces
  // that the declaring seat HOLDS the duty or sits above it in the same branch,
  // and refuses an ineligible candidate with the printed reason.
  ['declare-duty-cover', 'dutyCoverageDesignate dutyCoverageRevoke dutyCoverageScan'],
  // ADR-0122: the Dated Absence Plan. Declaring one's own absence window is a
  // self-service act at every altitude; the plan read is a SAFE_READ below. The
  // action additionally enforces that the declared window is valid and does not
  // overlap an absence the seat already holds.
  ['declare-duty-absence', 'dutyAbsenceDeclare dutyAbsenceRevoke dutyAbsenceScan'],
  // ADR-0127: cover acknowledgement. The answer is the named cover's own act; the
  // action refuses any other seat, and both reads are seat-scoped adapters that
  // never widen a peer's inbox or a peer's outgoing asks.
  ['answer-duty-standby', 'dutyStandbyAcknowledge dutyStandbyDecline dutyStandbyRevoke dutyStandbyScan dutyStandbySetConventions'],
  // ADR-0128: explicit rehearsal records. Recording, revoking and scanning are
  // declared commands (deny-by-default under a seat); the action additionally
  // enforces that the recording seat holds the duty, IS the cover, or sits
  // above the holder in the same reporting chain. The ledger read is a
  // seat-scoped SAFE_READ below.
  ['attest-duty-rehearsal', 'dutyRehearsalRecord dutyRehearsalRevoke dutyRehearsalScan'],
  // ADR-0129: the Branch Reading hand-off. Asking, withdrawing, publishing,
  // declining and revoking are all declared commands (deny-by-default under a
  // seat); the handlers additionally enforce that the ask goes ONE level down to
  // a direct branch and that only the branch the ask named can answer it, so a
  // requester can never publish their own reading or answer for a peer.
  ['request-branch-reading', 'branchReadingRequest branchReadingWithdraw'],
  ['answer-branch-reading', 'branchReadingPublish branchReadingDecline branchReadingRevoke'],
  ['declare-seat', 'setActiveSeat scanSeats'],
  // ADR-0087: the Board Room. Every method is declared; an unknown name still
  // fails closed. Committing a pack is the chief's right; reading it is enterprise.
  ['declare-board-line', 'boardOpenMemo boardDeclareClaim boardRemoveClaim boardLook boardCommit boardSupersede boardSetConventions boardScan'],
  // ADR-0086: freezing the disclosed pack is its own rank-5 right (ADR-0076).
  ['freeze-board-summary', 'boardFreeze'],
  // ADR-0081: reviewed altitude routing. Every method is declared; an unknown
  // name still fails closed. Reads are safe; writes pass the person/span gate.
  ['route-intake', 'routingSaveDraft routingConfirm routingDismiss routingGrade routingScan routingSetConventions'],
  // ADR-0083: the Concordance Terminal. Every method is declared; an unknown
  // name still fails closed. A round may only be opened and read inside the
  // leader's own span.
  ['close-expectation-round', 'concordanceOpenRound concordanceSubmit concordanceWithdraw concordanceScan concordanceSetConventions'],
  // ADR-0082: the Sealed Spine. sealScan writes only an audit event (a
  // verified read with a trace); the pure reads are SAFE_READS below. Enabling
  // or pausing sealing is operator-only and stays fail-closed under a seat.
  ['audit-seal', 'sealScan'],
  // ADR-0084: the Operating Model. Declarations and priced items only. Every
  // method is declared; an unknown name still fails closed.
  ['author-operating-model', 'omDeclareSplit omRemoveSplit omDeclareEdge omRemoveEdge omPriceItem omRemoveItem omSetNorms operatingModelScan'],
  // ADR-0084: Hoshin Kanri & Catchball Cascade reviewed commands. Each handler
  // additionally enforces subtree + bilateral receiver consent inside catchballActions.
  ['negotiate-catchball', 'catchballPropose catchballCounter catchballAccept catchballCheckin catchballSettle catchballWithdraw catchballUpdateSettings catchballScan'],
  // ADR-0089: scoped reads are safe adapters; freeze/scan are the only writes.
  ['govern-strategy-cycle', 'strategyCycleFreeze strategyCycleScan'],
  // ADR-0088: the Escalation Economy. Every method is declared; an unknown name
  // still fails closed. Settlement is additionally receiver-only and the
  // escalator can never settle their own escalation, because a self-reported
  // escalation yield is worthless.
  ['record-escalation', 'escalationLog escalationReceive escalationSettle escalationReturnDown escalationUpdateSettings escalationScan'],
  ['commit-intervention-rate', 'escalationDeclareCommitment escalationGradeCommitment'],
  // ADR-0089: the action enforces exact party/LCA checks. Carryover retains
  // the existing executive capital right rather than peer-negotiation power.
  ['negotiate-catchball', 'valueStreamContractPropose valueStreamContractCounter valueStreamContractAccept valueStreamContractCheckin valueStreamContractSettle valueStreamContractWithdraw valueStreamUpdateSettings valueStreamScan'],
  ['approve-capital', 'valueStreamReallocate'],
  // ADR-0087: the Operating Cadence Clock reviewed commands. A forum can only be
  // declared, edited or sat by a seat that chairs it or outranks it; attendance
  // cannot conscript a peer span. The reads are SAFE_READS below.
  ['run-cadence', 'cadenceDeclareForum cadenceUpdateForum cadenceLogSession cadenceFreezeReading cadenceGradeReading cadenceScan cadenceSetConventions'],
  // ADR-0086: the Disclosure Compiler. Asking for a bounded release and ending
  // one are open at every altitude because either side of the contract may sit
  // at any altitude; the action checks the pair, the class, the floor and the
  // cap. Consent is the only command that creates authority, and it is refused
  // to the requester by the action itself.
  ['request-disclosure', 'disclosureRequest disclosureScan'],
  ['consent-disclosure', 'disclosureConsent disclosureRefuse disclosureRevoke'],
  // ADR-0088: the Federated Envoy. Composing a packet publishes this span's
  // declared artefacts outward; ingesting one writes attested copies inward.
  // Both are declared commands (deny-by-default), and the handlers additionally
  // enforce the sending span and the receiving altitude inside envoyActions.
  ['exchange-packets', 'envoyCompose envoyIngest envoyVerify envoySetConventions envoyScan'],
  // ADR-0090: the Programme Federation Reading. Freeze/scan/conventions are
  // declared commands (deny-by-default under a seat); the reads are SAFE_READS
  // below. The handlers additionally enforce the seat scope and the rank window
  // on the window and floors.
  ['govern-federation', 'federationFreeze federationScan federationSetConventions'],
  // ADR-0099: the Freeze-Line Continuity Audit shares the federation governance
  // right — freezing or scanning a scoped hierarchy measurement.
  ['govern-federation', 'freezeLineFreeze freezeLineScan'],
  // ADR-0100: measuring the ladder and grading a due reading are declared commands
  // at every altitude (deny-by-default under a seat). Adopting or restoring a
  // ladder is a separate right because it re-prices every span's escalation clock,
  // and the action additionally requires the workspace leader's own seat.
  ['calibrate-span', 'spanCalibrationFreeze spanCalibrationGrade spanCalibrationScan spanCalibrationSetConventions'],
  ['adopt-ladder', 'spanCalibrationAdopt spanCalibrationRestoreLadder'],
  // ADR-0101: recording a reputational act is every altitude's business — the
  // ledger is built from the acts a span actually performed. Offering a guarantee
  // or declaring a repair is the same act (a dated promise) and shares the right.
  // Re-declaring the conventions re-prices every obstacle in the workspace, so it
  // is director+ and the handler additionally requires a full-access seat.
  ['record-reputation-act', 'reputationRecordAct reputationScan'],
  ['offer-reputation-guarantee', 'reputationOpenPosition reputationClosePosition reputationWithdrawPosition'],
  ['govern-reputation', 'reputationSetConventions'],
  // ADR-0102: the Hindsight Lock. Freezing an information set or scanning the
  // audit is a declared command at every altitude; the conventions that define
  // what counts as a sound process are director+ and checked in the action.
  // The reads are seat-scoped SAFE_READS below.
  ['record-decision-lock', 'hindsightLock hindsightScan'],
  ['govern-hindsight', 'hindsightSetConventions'],
  // ADR-0103: the Epistemic Ledger. Declaring, answering, dismissing and
  // freezing a belief are declared commands at every altitude (capability and
  // span are checked in the action); the conventions that move every unknown and
  // every kappa are director+ and additionally require a full-access seat. The
  // reads are seat-scoped SAFE_READS below.
  ['record-epistemic-unknown', 'epistemicDeclare epistemicAnswer epistemicDismiss epistemicObserve epistemicScan'],
  ['govern-epistemic', 'epistemicSetConventions'],
  // ADR-0104: the Diligence Ledger. A consultation is a dated act at every
  // altitude (capability and span are checked in the action); the conventions
  // that move every frontier, interval and grade are rank 4-5 and additionally
  // require a full-access seat. Reads are seat-scoped SAFE_READS below.
  ['record-diligence-consult', 'diligenceConsult diligenceForecast diligenceScan'],
  ['govern-diligence', 'diligenceSetConventions'],
  // ADR-0121: re-declaring the exercise window and concentration threshold
  // re-prices every duty line at once, so it is rank 4-5 with a full-access seat.
  ['govern-duty-cover', 'dutyCoverageSetConventions'],
  ['record-fit', 'fitScan fitClassify'],
  ['govern-fit', 'fitSetConventions'],
  // ADR-0109 / ADR-0111: the Jurisdiction Compiler's writes and scoped reads.
  ['record-jurisdiction', 'jurScan jurAnchorWork jurDriftScan'],
  ['govern-jurisdiction', 'jurSetConventions'],
  // ADR-0092: the Differencing Defender. Publishing is an act every altitude
  // performs, so the command right is open at every rank (the action enforces the
  // span and the arithmetic decides what may be published); the conventions that
  // bound everyone else's publications are director+ and checked in the action.
  // The reads are SAFE_READS below — they are already seat-scoped.
  ['publish-aggregate', 'differencesPublish differencesWithdraw differencesPlan differencesScan differencesCreateRecoveryDecision'],
  // ADR-0094: pre-registering a bet, grading its frozen cohort and setting the
  // conventions are declared commands. An explicit scan always grades; the
  // automatic pass is pausable by convention. Reads are seat-scoped SAFE_READS.
  ['declare-prospective', 'prospectiveDeclare prospectiveScan prospectiveSetConventions'],
  // ADR-0095: declaring, adopting and scanning a robust allocation are declared
  // commands at every altitude; the conventions are director+ (checked in the
  // action). Reads are seat-scoped SAFE_READS.
  ['declare-robust-allocation', 'robustAllocationDeclare robustAllocationAdopt robustAllocationScan robustAllocationSetConventions'],
  // ADR-0098: the chair may open/commit/settle a round, every eligible span
  // may submit its own sealed bid, and director+ governs shared conventions.
  ['chair-clearing-round', 'clearingOpenRound clearingWithdrawRound clearingCommit clearingSettle clearingScan'],
  ['submit-clearing-bid', 'clearingSubmitBid'],
  ['govern-clearing', 'clearingSetConventions'],
  ['govern-differencing', 'differencesSetConventions'],
  // ADR-0087: the Attested Commit. Session management is self-service at every
  // altitude (your own seat only, enforced in identityActions); governing the
  // boundary — enforcement on/off, revoking a credential — is director+.
  ['attest-seat-identity', 'identityEnroll identityUnlock identityLock identityRotate identityScan identityCheckpoint identityTouch'],
  ['govern-attestation', 'identitySetSettings identityRevoke'],
  // ADR-0107: every altitude may scan its own learning ledger and pre-register
  // one reviewed probability; moving every ledger's conventions is director+
  // and additionally requires the full-access root seat in the action.
  ['record-outcome-learning', 'outcomeScan setOutcomeAutoLearn outcomeDeclarePrior'],
  ['govern-outcome-learning', 'outcomeSetConventions'],
  // ADR-0118: the Portfolio Rehearsal Comparison. The ONLY write is recording an
  // arbitration between two rehearsed responses — a VP/chief command (the action
  // re-checks the rank, because this right is also reachable through the
  // undeclared operator view). Reads are scoped adapters and safe.
  ['compare-responses', 'recordPortfolioComparison'],
];
export const API_RIGHTS = Object.freeze(Object.fromEntries(groups.flatMap(([right, names]) => names.split(' ').map((name) => [name, right]))));
const FIRST_ID_COLLECTION = Object.freeze({
  updatePerson: 'people', archivePerson: 'people', restorePerson: 'people',
  logOneOnOne: 'oneOnOnes', oneOnOneLineClaim: 'oneOnOnes', oneOnOneLineRelease: 'oneOnOnes', toggleMeetingAction: 'oneOnOnes', addMeetingAction: 'oneOnOnes',
  updateFeedback: 'feedback', completeFollowUp: 'feedback',
  updateCase: 'cases', resolveCase: 'cases', recordCaseActuals: 'cases', reopenCase: 'cases', deleteCase: 'cases', refreshCaseAutomation: 'cases', syncCaseAutomations: 'cases', requestMitigationReview: 'cases', linkCaseEntity: 'cases', removeMissingCaseMitigation: 'cases',
  updateDecision: 'decisions', decideDecision: 'decisions', reviewDecision: 'decisions', withdrawBundleDecision: 'decisions',
  updateDelegation: 'delegations', checkInDelegation: 'delegations', completeDelegation: 'delegations', returnDelegation: 'delegations', redelegateReturnedOutcome: 'delegations',
  addBudgetLine: 'budgets', updateBudgetLine: 'budgets', recordBudgetActual: 'budgets', releaseBudgetLine: 'budgets', deleteBudgetLine: 'budgets',
  addPremise: 'premises', updatePremise: 'premises', recordPremiseEvidence: 'premises', reviewPremise: 'premises', recordPremiseOutcome: 'premises', withdrawBundlePremise: 'premises',
  approveCommsDraft: 'commsDrafts', editCommsDraft: 'commsDrafts', markCommsDraftSent: 'commsDrafts', dismissCommsDraft: 'commsDrafts',
  missionCaptureRead: 'missionCaptures', saveMissionCapturePreview: 'missionCaptures', missionCaptureCommit: 'missionCaptures', missionCaptureDismiss: 'missionCaptures', missionCaptureWithdraw: 'missionCaptures', missionCaptureReceipt: 'missionCaptures',
  createActionBundle: 'cases', updateActionBundle: 'actionBundles', saveActionBundlePreview: 'actionBundles', commitActionBundle: 'actionBundles', withdrawActionBundle: 'actionBundles', archiveActionBundle: 'actionBundles',
});

export const SAFE_READS = new Set(['boardAttentionCount', 'boardBriefText', 'boardContinuity', 'boardContinuityText', 'boardCsvRows', 'boardMemoText', 'boardPreview', 'boardRead', 'cadenceAttentionCount', 'cadenceBriefText', 'cadenceCsvRows', 'cadencePreviewForum', 'cadenceRead', 'carryoverAttentionCount', 'carryoverBriefText', 'carryoverCsvRows', 'carryoverReleasePreview', 'carryoverReport', 'catchballBriefText', 'catchballCsvRows', 'catchballPreviewFeasibility', 'catchballRead', 'concordanceAttentionCount', 'concordanceBriefText', 'concordanceCsvRows', 'concordanceRead', 'concordanceStats', 'disclosureAttentionCount', 'disclosureBriefText', 'disclosureCsvRows', 'disclosureGrantRead', 'disclosureGrants', 'disclosureRead', 'envoyAttentionCount', 'envoyBriefText', 'envoyCsvRows', 'envoyIdentity', 'envoyPacketText', 'envoyPreview', 'envoyRead', 'escalationBriefText', 'escalationCsvRows', 'escalationRead', 'escalationStats', 'differencesAttentionCount', 'differencesBriefText', 'differencesCsvRows', 'differencesRead', 'federationAttentionCount', 'federationBriefText', 'federationCsvRows', 'federationRead',
'freezeLineAttentionCount', 'freezeLineBriefText', 'freezeLineConventions', 'freezeLineCsvRows', 'freezeLineReport',
'spanCalibrationAttentionCount', 'spanCalibrationBriefText', 'spanCalibrationConventions', 'spanCalibrationCsvRows', 'spanCalibrationReport', 'spanCalibrationSettings', 'spanCalibrationSignals',
'reputationAttentionCount', 'reputationBriefText', 'reputationConventions', 'reputationCounterfactual', 'reputationCsvRows', 'reputationPriceAsk', 'reputationReport', 'reputationSignals',
'hindsightAttentionCount', 'hindsightBriefText', 'hindsightConventions', 'hindsightCsvRows', 'hindsightReport', 'hindsightSettings',
'epistemicAttentionCount', 'epistemicBriefText', 'epistemicConventions', 'epistemicCsvRows', 'epistemicPreview', 'epistemicReport', 'epistemicSettings',
'diligenceAttentionCount', 'diligenceBriefText', 'diligenceConventions', 'diligenceCsvRows', 'diligencePreview', 'diligenceReport', 'diligenceSettings',
'dutyCoverageAttentionCount', 'dutyCoverageBriefText', 'dutyCoverageCandidates', 'dutyCoverageCsvRows', 'dutyCoverageReport', 'dutyCoverageSettings',
// ADR-0122: the absence plan's read surface. Registered here because a module
// whose reads are absent from SAFE_READS is unreadable under enforcement while
// its writes are still gated — the planning half of the feature would vanish
// exactly when a real organisation turned enforcement on.
'dutyAbsencePlan',
// ADR-0127: the acknowledgement board's read surface. Registered here for the
// same reason as every module above — a read absent from SAFE_READS is unreadable
// under enforcement while its writes are still gated, which would hide the ask
// from exactly the person being asked.
'dutyStandbyForMe', 'dutyStandbyBoard', 'dutyStandbySettings',
// ADR-0128: the rehearsal ledger's read surface. Registered here for the same
// reason as every module above — a read absent from SAFE_READS is unreadable
// under enforcement while its writes are still gated, which would hide the
// rehearsal evidence from exactly the plan panel that grades it.
'dutyRehearsalList',
// ADR-0129: both chairs of the hand-off in one seat-scoped read. Registered for
// the same reason as every module above — a read absent from SAFE_READS is
// unreadable under enforcement while its writes are still gated, which would
// hide the ask from exactly the branch leader being asked.
'branchReadingBoard',
// ADR-0108: the Decision-Fit Ledger's read surface. Registered here because a
// module whose reads are absent from SAFE_READS is unreadable under enforcement
// while its writes are still gated — the reading half of the feature would
// vanish exactly when a real organisation turned enforcement on.
'fitAttentionCount', 'fitBrief', 'fitCsvRows', 'fitRollUp',
// ADR-0109: the Jurisdiction Compiler's seat-scoped read surface. Registered
// here because a module whose reads are absent from SAFE_READS is unreadable
// under enforcement while its writes are still gated.
'jurRead', 'jurHygiene', 'jurBriefText', 'jurCsvRows', 'jurConventions', 'jurAttentionCount', 'jurSpanRollUp', 'jurBook', 'jurRedrawRehearse',
// ADR-0115: the seat-scoped cross-week drift reads. The verdict itself is
// derived from RULE-JUR-04's frozen readings, so a read absent from SAFE_READS
// would make the VP/chief surface vanish exactly when enforcement is on.
'jurDriftRead', 'jurDriftCsvRows', 'jurDriftBriefText',
// ADR-0113: the agenda ledger's read surface. Registered for the same reason as
// the modules above — a read absent from SAFE_READS is unreadable under
// enforcement while its writes are still gated.
'agendaRead', 'agendaPlan', 'agendaRollUp', 'agendaBriefText', 'agendaCsvRows', 'agendaAttentionCount', 'agendaSettings',
// ADR-0118: the comparison ledger's read surface. Registered for the same reason
// as the modules above — a read absent from SAFE_READS is unreadable under
// enforcement while its write is still gated, which would hide the ledger from
// exactly the seats that recorded it. Both reads are seat-scoped adapters.
'comparisonRead', 'comparisonCandidates', 'comparisonBrief',
'outcomeAttentionCount', 'outcomeBriefText', 'outcomeConventions', 'outcomeCsvRows', 'outcomeRead', 'outcomeReceipt', 'outcomeSignals',
'prospectiveAttentionCount', 'prospectiveBriefText', 'prospectiveCsvRows', 'prospectiveRead', 'robustAllocationAttentionCount', 'robustAllocationBriefText', 'robustAllocationCsvRows', 'robustAllocationRead', 'clearingAttentionCount', 'clearingBriefText', 'clearingCsvRows', 'clearingRead', 'clearingSolvePreview', 'identityAttentionCount', 'identityBriefText', 'identityCompareCheckpoint', 'identityCsvRows', 'identityRead', 'identityVerify', 'budgetExposureBriefText', 'budgetExposureRead', 'budgetExposureText', 'mandateBriefText', 'mandateRead', 'missionArchive', 'missionBriefText', 'missionCommit', 'missionCreateIntervention', 'missionFreezeBrief', 'missionHandoffText', 'missionOpenCase', 'missionRead', 'missionScan', 'missionExecutionReceipt', 'missionCaptureAnalyze', 'missionCaptureMergeCandidates', 'missionCaptureRead', 'missionCaptureReceipt', 'missionCaptureBriefRead', 'missionCaptureBriefPreview', 'missionCaptureBriefCandidates', 'missionCaptureBriefBulkPreview', 'missionWithdraw', 'operatingModelAttentionCount', 'operatingModelBriefText', 'operatingModelCsvRows', 'operatingModelNorms', 'operatingModelRead', 'operatingModelWorkTypes', 'previewMandate', 'routingAnalyze', 'routingAttentionCount', 'routingBriefText', 'routingCalibration', 'routingCsvRows', 'routingRead', 'saveMissionPreview', 'sealBriefText', 'sealRead', 'sealVerify', 'seatBriefText', 'seatRead', 'setActiveSeat', 'strategyCycleBriefText', 'strategyCycleCsvRows', 'strategyCycleRead', 'valueStreamBriefText', 'valueStreamCsvRows', 'valueStreamRead', 'valueStreamReallocationPreview',
// ADR-0140: the Matrix Accountability Ledger's read surface. Registered for the
// same reason as every module above: a read absent from SAFE_READS is
// unreadable under enforcement while its writes are still gated, which would
// hide the ledger from exactly the seats that declared it. The report is built
// under the acting seat, so a seat sees only its own span.
'matrixReport', 'matrixBriefText', 'matrixCsvRows', 'matrixCoordinationReport', 'matrixSettings', 'matrixCandidates',
// ADR-0179: the Matrix Forward Allocation Horizon's read surface. Registered
// for the same reason as every module above — a read absent from SAFE_READS is
// unreadable under enforcement while its writes are still gated, which would
// hide the forward reading from exactly the seat that declared its lines. The
// report is built under the acting seat inside `buildLineHorizon` (today's
// wall, exactly as the live ledger draws it); `matrixHorizonScan` is a WRITE
// (it runs the shared spine) and is therefore NOT a safe read — it stays on
// the declared `declare-matrix-line` right.
'matrixHorizonReport',
// ADR-0173: the demand-variance read surface. Same reasoning as every module
// above — a read absent from SAFE_READS is unreadable under enforcement while
// its writes are still gated, which would hide the ledger from exactly the
// seats that declared it.
'matrixDemandVarianceReport',
// ADR-0183: the dependency feedback-cycle register's read surface. A pure read
// absent from SAFE_READS would be unreadable under enforcement while the
// matrix writes stay gated — hiding the coupled blocks from exactly the
// director/VP seat that has to convene the joint forum.
'matrixDependencyCycleReport',
// ADR-0189: the product–organisation interface alignment matrix's read
// surface. A pure read absent from SAFE_READS would be unreadable under
// enforcement while the matrix writes stay gated — hiding the misalignment
// from exactly the seat that has to convene the two holders.
'matrixInterfaceAlignmentReport',
// ADR-0143: the arbitration register's read surface. Registered for the same
// reason as every module above — a read absent from SAFE_READS is unreadable
// under enforcement while its writes are still gated, which would hide the case
// from exactly the two lines and the person it was opened for. The report is
// built under the acting seat and scoped on the tree OR a declared line.
'priorityReport', 'priorityBriefText', 'priorityCsvRows', 'prioritySettings', 'priorityCandidates',
// ADR-0144: the contradiction audit's read surface. Registered for the same
// reason as every module above — a read absent from SAFE_READS is unreadable
// under enforcement while its writes are still gated. The report is built under
// the acting seat: a scoped seat compares only the lines it can reach, and the
// charter rows it cannot reach are counted out rather than summed over a part.
'contradictionReport', 'contradictionBriefText', 'contradictionCsvRows', 'contradictionCandidates',
// ADR-0147: the review-stewardship read surface. Registered for the same reason
// as every module above — a read absent from SAFE_READS is unreadable under
// enforcement while its writes are still gated, which would hide the outstanding
// ask from exactly the line holder being asked. `reviewStewardshipRead` and
// `reviewStewardshipCandidates` are declared commands (they are seat-checked
// against the person), so only the three aggregate/packet reads live here.
'reviewStewardshipBoard', 'reviewStewardshipBriefText', 'reviewStewardshipCsvRows',
// ADR-0148: the line-consent read surface. Registered for the same reason as
// every module above — a read absent from SAFE_READS is unreadable under
// enforcement while its writes are still gated. `lineConsentRead` and
// `lineConsentCandidates` are declared commands on the read right (they are
// seat-scoped inside the read model), so only the aggregate reads live here.
'lineConsentBoard', 'lineConsentBriefText', 'lineConsentCsvRows',
// ADR-0149: the structure-history read surface. Registered for the same reason as
// every module above — a read absent from SAFE_READS is unreadable under
// enforcement while its writes are still gated, which would hide the drift from
// exactly the manager being asked to reconcile it. `structureHistoryReport`,
// `structureHistoryBriefText` and `structureHistoryCsvRows` are declared commands
// on the read right (they are seat-scoped inside the read model), so only the
// aggregate reads live here.
'structureHistoryBoard', 'structureHistoryBrief', 'structureHistoryCsv',
// ADR-0150: the matrix-onboarding read surface. Registered for the same reason as
// every module above — a read absent from SAFE_READS is unreadable under
// enforcement while its writes are still gated, which would hide a never-briefed
// line from exactly the manager who must write it. `onboardingMatrixRead`,
// `onboardingMatrixCandidates` and `onboardingMatrixScan` are declared commands on
// the brief right (they are seat-scoped inside the read model), so only the
// aggregate reads live here.
'onboardingMatrixBoard', 'onboardingMatrixBriefText', 'onboardingMatrixCsv',
// ADR-0153: the role-clarity read surface. Registered for the same reason as every
// module above — a read absent from SAFE_READS is unreadable under enforcement
// while the briefs it compares are still gated. `roleClarityRead` and
// `roleClarityBoard` are declared commands on the brief right (they are
// seat-checked inside the action), so only the aggregate reads live here.
'roleClarityAggregate', 'roleClarityBriefText', 'roleClarityCsv', 'roleClarityAttentionCount',
// ADR-0152: the line-exit read surface. Registered for the same reason as every
// module above — a read absent from SAFE_READS is unreadable under enforcement
// while its writes are still gated, which would hide an orphaned obligation from
// exactly the manager who has to settle it. `lineExitRead` is a declared command
// on the remedy right (it is seat-checked inside the action), so only the
// aggregate reads live here.
'lineExitBoard', 'lineExitBriefText', 'lineExitCsvRows', 'lineExitAttentionCount',
// ADR-0154: the matrix-merit parity read surface. Registered for the same reason
// as every module above — a read absent from SAFE_READS is unreadable under
// enforcement while the merit cycle it reads is still gated. The reading is
// aggregate-plus-cycle scoped and the export carries no identity at all; it
// writes nothing, settles no authority and stores no figure.
'meritParityReport', 'meritParityBriefText', 'meritParityCsv', 'meritParityAttentionCount',
// ADR-0156 / ADR-0159: the authority-continuity and drift-settlement read surface.
// Seat-scoped inside `buildAuthorityContinuity` (outside-span names withheld).
'authorityContinuityReport', 'authorityContinuityBriefText', 'authorityContinuityCsvRows', 'authorityContinuityAttentionCount',
// ADR-0162: Matrix Management-Interface Operating-Agreement read surface.
// Seat-scoped inside `buildMatrixInterfaceReport` and aggregate-only in brief/CSV.
'matrixInterfaceReport', 'matrixInterfaceBriefText', 'matrixInterfaceCsvRows', 'matrixInterfaceAttentionCount', 'matrixInterfaceCandidates',
// ADR-0185: every read is still seat-checked inside the action factory. Raw
// request and response collections are held out of declared-seat projection;
// this adapter carries only the caller's own line, their own requests, or their
// rank-3+ span's current multi-line impact rows.
'changeImpactReviewBoard', 'changeImpactReviewCandidates', 'changeImpactReviewBriefText', 'changeImpactReviewCsvRows', 'changeImpactReviewAttentionCount',
// ADR-0174: Standing Delegation-of-Authority Schedule read surface.
'doaReport', 'doaBriefText', 'doaCsvRows', 'doaAttentionCount', 'doaCandidates',
// A seat-scoped report; aggregate-only cells are withheld by the adapter.
'oneOnOneLineReport',
// ADR-0176: seat-scoped inside `buildHiringLines` (out-of-span managers and
// candidate names withheld; undeclared requisitions read only by the operator).
'hiringLineReport',
// ADR-0178: seat-scoped cross-line ask attribution report.
'delegationLineReport',
// ADR-0181: seat-scoped inside `buildWorkTurns` — people and pools outside the
// seat are counted, never listed, and the altitude disclosure ladder decides
// whether names, leaders or counts are returned.
'workTurnReport',
// ADR-0182: seat-scoped inside `buildPausePermits` — the altitude disclosure
// ladder decides whether switch keys, authorisers and reason text are returned,
// or counts only.
'pausePermitReport',
// ADR-0177: the chargeback statement is scoped INSIDE the read model — a seat
// reads the line accounts it reaches and every piece that names one of them;
// the rest is counted as withheld and names outside the seat are withheld.
'transferPriceReport',
// ADR-0184: the stock-flow plan is scoped INSIDE the read model — the visible
// person population bounds the acts read, and the altitude disclosure ladder
// decides whether level rows, rates and the projection are returned or counts
// only. A withheld row is a printed reason, never a zero.
'workforceFlowReport',
// ADR-0186: the saturation board is scoped INSIDE the read model — people outside
// the seat are counted, never listed, and the altitude disclosure ladder decides
// whether names, pools and clearances come back or counts only. A withheld figure
// is a printed reason, never a zero.
'changeSaturationReport', 'changeSaturationBands',
// ADR-0188: the corroboration board is scoped INSIDE the read model — a manager
// seat receives only the reviews and answers it reaches, and a seat with no span
// gets totals and no rows. A withheld figure is a printed reason, never a zero.
'aarCorroborationReport', 'aarCorroborationBriefText', 'aarCorroborationAttentionCount',
// ADR-0190: the standard-work board is scoped INSIDE the read model — a seat
// receives its own routines, those owed to it and those it holds a line over;
// everything else is counts with a printed reason.
'standardWorkReport', 'standardWorkBriefText', 'standardWorkAttentionCount', 'standardWorkCandidates']);
const refusal = (reason) => ({ ok: false, code: 'scope-refusal', error: reason, field: 'scope' });

/** ADR-0087: under enforcement, boundary-management commands stay reachable
 * without a credential (you must be able to enroll, unlock, or turn
 * enforcement back off); everything else that writes is refused until a seat
 * credential session is unlocked. Prevention at the boundary; RULE-IDN-02 is
 * the detection layer for anything that reaches the store another way. */
const IDENTITY_ENFORCEMENT_EXEMPT = new Set([
  'setActiveSeat', 'updateSettings',
  'identityEnroll', 'identityUnlock', 'identityLock', 'identityRotate',
  'identityRevoke', 'identitySetSettings', 'identityScan', 'identityCheckpoint', 'identityTouch',
]);

function payloadPeople(args) {
  const out = new Set();
  function walk(value, depth = 0) {
    if (depth > 7 || !value || typeof value !== 'object') return;
    for (const id of recordPeople(value)) out.add(id);
    for (const v of Object.values(value)) if (v && typeof v === 'object') walk(v, depth + 1);
  }
  walk(args); return [...out];
}
function bundleSourceAllowed(state, sourceId, seat, built) {
  const c = (state.cases || []).find((r) => r.id === sourceId);
  if (!c) return false;
  if (canSee(c, 'cases', seat, built).allow === 'full') return true;
  return seat.rank >= 3 && responsibleNodeId(built.chain, recordPeople(c)) === seat.id;
}
// A director/VP/chief who adopted an LCA-owned case may review its specific
// outbox drafts even when the generic unit-detail ceiling would show counts
// only. The capture and its case are the explicit provenance boundary; never
// widen a peer's outbox or grant unrestricted case editing.
function adoptedCaseBriefAllowed(state, message, seat, built) {
  if (!message?.caseId || seat.rank < 3) return false;
  return (state.missionCaptures || []).some((capture) => capture.ownerSeatId === seat.id
    && capture.status === 'adopted' && capture.caseId === message.caseId
    && captureBriefCase(state, capture, seat, built).ok);
}
function bundleFor(state, name, args) {
  if (name === 'createActionBundle') return args[0];
  const id = name === 'saveActionBundlePreview' ? args[0] : args[0];
  return (state.actionBundles || []).find((b) => b.id === id);
}

const MATRIX_LINE_SCOPED = new Set([
  // Only logging is widened to an active direct line. Its handler separately
  // stamps the seat and forbids settling another line's unowned commitments.
  'logOneOnOne', 'addFeedback',
  'cadenceDeclareForum', 'cadenceUpdateForum', 'cadenceLogSession',
  'jurAnchorWork',
  'priorityOpenCase', 'priorityTreatDemand', 'priorityPropose', 'priorityAgreePrecedence', 'priorityRecordAnswer', 'priorityWithdraw',
  'contradictionDeclareMandate', 'contradictionWithdrawMandate',
  'dutyCoverageDesignate', 'dutyCoverageRevoke',
  // ADR-0185: request input names an impacted person who may reach the active
  // seat only through a declared Matrix line; the action re-checks both tree
  // and line scope before it records anything.
  'changeImpactReviewRequest',
  // ADR-0186: declaring a demand names a person the declaring seat may reach only
  // through a declared Matrix line; the action re-checks the line holder itself.
  'changeSaturationDeclareDemand',
  // ADR-0188: a corroboration request names participants reachable only through a
  // declared Matrix line; the action re-checks the holder against the frozen set.
  'aarCorroborationRequest',
  // ADR-0190: declaring a routine may name a person the declaring seat reaches
  // only through a dotted line; the action re-checks the line holder itself.
  'standardWorkDeclareRoutine',
]);

/** Exact method allowlist + rank + record/person scope. No arbitrary API names. */
export function guardApiCall(state, name, args, nowMs = undefined) {
  if (!state.settings?.activeSeatId) return { ok: true };
  let built; let seat;
  // ADR-0141: the gate and the seat must agree about what a declared line
  // carries. If the gate resolved the seat without the lines, a line-only
  // manager resolved to the read-only fallback and every call was refused.
  const gateNow = Number.isFinite(nowMs) ? new Date(nowMs) : undefined;
  try {
    const lineScope = matrixLineScopeFor(state, { ...(gateNow ? { now: gateNow } : {}), settings: state.settings });
    built = buildSeats(state, { ...(gateNow ? { now: gateNow } : {}), settings: state.settings, ...(lineScope ? { lineScope } : {}) });
    seat = activeSeat(built);
  } catch { return refusal('The operating seat could not be resolved. No record was read or changed.'); }
  if (seat.readOnly && name !== 'setActiveSeat') return refusal('The operating seat is unresolved. Declare a valid seat first.');
  if (SAFE_READS.has(name)) return { ok: true, seat, built };
  // ADR-0089: fail-closed authorship enforcement. A workspace that claims
  // attestation enforcement refuses unattested writes at the API boundary.
  // The session clock must be the caller's injected clock — comparing a
  // fixture-timed session against the wall clock here made the gate expire
  // sessions that were still live in their own time base.
  if (state.settings?.identityEnforced === true && !activeIdentitySession(nowMs ?? Date.now()) && !IDENTITY_ENFORCEMENT_EXEMPT.has(name)) {
    return refusal('This workspace enforces attested commits: every write must carry a seat credential signature. Unlock a seat credential first (Identity Ledger → Unlock), or turn enforcement off there — the refusal is the boundary doing its job, not an error.');
  }
  // Module automation pauses are reviewed settings adapters. Seat identity and
  // disclosure floors still require their own rank-gated commands.
  if (name === 'updateSettings') {
    const patch = args[0];
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return refusal('Settings updates must be a declared patch object.');
    const keys = Object.keys(patch);
    if (keys.some((k) => !k.endsWith('AutoPropagate'))) return refusal('Under a declared seat, settings updates are limited to module automation pauses. Use the rank-gated seat/disclosure commands for identity and disclosure.');
    // ADR-0182: a pause taken HERE is not a permit. It is still allowed — this
    // is how every control in the app has always been switched off, and
    // blocking it would break a leader's hand rather than govern it. But the
    // 2nd argument is now a PERMIT: pass one and the register records the
    // authoriser, the reason, the compensating measure and the end date in the
    // same commit; omit it and the pause reads `unpermitted`, is printed as
    // such, and RULE-PMP-01 escalates it. The register refuses to let a silence
    // be anonymous; it does not refuse the silence.
    if (args[1] !== undefined && args[1] !== null) {
      if (typeof args[1] !== 'object' || Array.isArray(args[1])) return refusal('The permit beside an automation pause must be a declared object.');
      const keysToPause = keys.filter((k) => patch[k] === false);
      if (keysToPause.length !== 1) return refusal('A permit authorises the silence of exactly ONE switch. Pause one control per permit, so one authoriser answers for it.');
      const permitKey = args[1].key;
      if (permitKey !== undefined && permitKey !== keysToPause[0]) return refusal('The permit names a different switch than the one being paused. One pause, one authority, named the same.');
      if (seat.readOnly) return refusal('Resolve the operating seat before permitting a pause.');
      const rank = canAct(PAUSE_PERMIT_RIGHTS.GRANT, seat);
      if (!rank.allow) return refusal(rank.reason);
    }
    return { ok: true, seat, built };
  }
  if (name.startsWith('missionCapture') || name === 'saveMissionCapturePreview') {
    const id = ['missionCapturePrepare', 'missionCapturePrepareMerge', 'missionCaptureDismissMerge'].includes(name) ? args[0]?.captureId : args[0];
    if (id && typeof id === 'string' && !(state.missionCaptures || []).some((c) => c.id === id && c.ownerSeatId === seat.id)) return refusal('Only the preparing seat may read or change this capture. Its resulting work rolls up through the disclosure ladder, not its note.');
  }
  const right = API_RIGHTS[name];
  if (!right) return refusal(`“${name}” has no reviewed seat-scoped adapter. Use Mission Control, or explicitly hand over to the local operator view for the legacy workspace.`);
  const verdict = canAct(right, seat);
  if (!verdict.allow) return refusal(verdict.reason);
  const captureCommand = name.startsWith('missionCapture') || name === 'saveMissionCapturePreview';
  const collection = captureCommand ? null : FIRST_ID_COLLECTION[name]; // captureCommand has its stricter preparing-seat gate above.
  if (collection && typeof args[0] === 'string' && !['addCase', 'addDecision', 'addDelegation', 'addPremise', 'createActionBundle'].includes(name)) {
    if (collection === 'actionBundles') {
      const b = bundleFor(state, name, args);
      if (!b) return refusal('The intervention no longer exists.');
      const c = (state.cases || []).find((r) => r.id === b.sourceId);
      if (!c || !bundleSourceAllowed(state, b.sourceId, seat, built)) return refusal('The intervention source is outside this seat’s detail boundary.');
    } else {
      const record = (state[collection] || []).find((r) => r.id === args[0]);
      const adoptedBrief = collection === 'commsDrafts' && adoptedCaseBriefAllowed(state, record, seat, built);
      if (!record || (canSee(record, collection, seat, built).allow !== 'full' && !adoptedBrief)) return refusal('The target record is missing or outside this seat’s detail boundary.');
      if (!recordPeople(record).length && !seat.isLeader && !adoptedBrief) {
        const inScopedBundle = (state.actionBundles || []).some((b) => b.outputs?.some((o) => o.id === record.id)
          && (state.cases || []).some((c) => c.id === b.sourceId && canSee(c, 'cases', seat, built).allow === 'full'));
        if (!inScopedBundle) return refusal('Unowned work belongs to the enterprise root. A subordinate seat cannot mutate it without a scoped source contract.');
      }
      if (collection === 'budgets' && !record.ownerId && !seat.isLeader) return refusal('An unowned budget envelope belongs to the enterprise root, not to every executive.');
    }
  }
  // Only proposal may name a peer subtree at the generic boundary. The mixin
  // then requires active party membership and resolves the exact LCA mediator.
  const reviewedPeerProposal = name === 'valueStreamContractPropose';
  const inBoundary = (id) => seat.scope.has(id)
    || (MATRIX_LINE_SCOPED.has(name) && Boolean(seat.lineScope?.has(id)));
  const unknown = reviewedPeerProposal ? [] : payloadPeople(args).filter((id) => !inBoundary(id));
  if (unknown.length) return refusal('The request names a person outside the operating span. Escalate through the common leader instead of crossing a peer boundary.');
  if (['createActionBundle', 'updateActionBundle', 'saveActionBundlePreview', 'commitActionBundle', 'withdrawActionBundle', 'archiveActionBundle'].includes(name)) {
    const b = bundleFor(state, name, args);
    if (!b || !Array.isArray(b.commands)) return refusal('A reviewed intervention is required.');
    if (!bundleSourceAllowed(state, b.sourceId, seat, built)) return refusal('The intervention source is outside this seat’s operating span.');
    const rankVerdict = validateMissionCommands(b.commands, seat.rank);
    if (!rankVerdict.ok) return refusal(rankVerdict.error);
    for (const command of b.commands) {
      if (command.ownerId && !seat.scope.has(command.ownerId)) return refusal('An intervention owner is outside the operating span.');
      if (command.budgetId) {
        const budget = (state.budgets || []).find((r) => r.id === command.budgetId);
        if (!budget || canSee(budget, 'budgets', seat, built).allow !== 'full' || (!budget.ownerId && !seat.isLeader)) return refusal('The budget envelope is outside this seat’s authority.');
      }
    }
  }
  return { ok: true, seat, built };
}
export function guardApi(api, store, { now = null } = {}) {
  return Object.fromEntries(Object.entries(api).map(([name, fn]) => [name, (...args) => {
    if (store.writeBlockReason) return { ok: false, error: store.writeBlockReason };
    const nowMs = typeof now === 'function' ? Number(now()) : undefined;
    const verdict = guardApiCall(store.state, name, args, nowMs);
    return verdict.ok ? fn(...args) : verdict;
  }]));
}

/**
 * ADR-0088: the Escalation Economy completed its seat-scoped read audit — its
 * read model filters records to the operating subtree and withholds item detail
 * above the manager rank, so a declared seat may open it directly. It joins
 * main's reviewed-surface list rather than the older hand-written allowlist.
 */
/**
 * The route gate. ADR-0076 refused every route that had not completed a
 * hand-written read audit; ADR-0086 replaces that allowlist with the compiled
 * disclosure posture, so a screen is open because a manifest declares it and the
 * compiler could place it, and it is refused with the compiler's own reason when
 * it cannot.
 *
 * Without a compiled state (no `built`, no `state`) the gate stays on the old,
 * narrow allowlist. A caller that forgets to compile does not get a wider
 * boundary — it gets the smallest one that has ever shipped.
 */
export function workspaceRouteVerdict(route, seat, options = {}) {
  if (!seat || seat.fullAccess) return routeVerdict(route, seat);
  if (seat.readOnly) return routeVerdict(route, seat);
  const { state = null, built = null, now = new Date(), settings = null, compiled = null } = options;
  const entry = compiled?.entries?.[route]
    || (state && built ? postureFor(state, seat, built, route, { now, settings }) : null);
  if (entry) {
    if (entry.posture === DISCLOSURE_POSTURES.WITHHELD) {
      return { allow: false, reason: entry.reason, posture: entry.posture, label: entry.label };
    }
    return {
      allow: true,
      reason: entry.reason || '',
      posture: entry.posture,
      detail: entry.posture === DISCLOSURE_POSTURES.DETAIL,
      label: entry.label,
      grantedBy: entry.grantedBy || null,
      grantedSpanId: entry.grantedSpanId || null,
    };
  }
  // ADR-0081/0082's reviewed surfaces stay open on the legacy path.
  if (['mission', 'today', 'seat', 'routing', 'seal', 'catchball', 'strategy-cycle', 'board', 'disclosure', 'cadence', 'envoy', 'federation'].includes(route)) return { allow: true, reason: 'Reviewed scoped surface.' };
  if (['mission', 'today', 'seat', 'routing', 'seal', 'catchball', 'board', 'disclosure', 'operating-model'].includes(route)) return { allow: true, reason: 'Reviewed scoped surface.' };
  if (['mission', 'today', 'seat', 'routing', 'seal', 'catchball', 'board', 'disclosure', 'cadence'].includes(route)) return { allow: true, reason: 'Reviewed scoped surface.' };
  // ADR-0081/0082/0087/0088/0089's reviewed surfaces stay open on the legacy path.
  if (['mission', 'today', 'seat', 'routing', 'seal', 'catchball', 'board', 'disclosure', 'cadence', 'carryover', 'identity'].includes(route)) return { allow: true, reason: 'Reviewed scoped surface.' };
  if (['clearing'].includes(route)) return { allow: true, reason: 'Reviewed scoped Clearinghouse surface.' };
  if (['mission', 'today', 'seat', 'routing', 'seal', 'catchball', 'board', 'disclosure', 'cadence', 'escalation'].includes(route)) return { allow: true, reason: 'Reviewed scoped surface.' };
  if (['mission', 'today', 'seat', 'routing', 'seal', 'catchball', 'valuestream', 'board', 'disclosure', 'cadence', 'carryover'].includes(route)) return { allow: true, reason: 'Reviewed scoped surface.' };
  return { allow: false, reason: 'No compiled disclosure posture is available for this route, so it is withheld. Open the Disclosure Console, or explicitly hand over to the local operator view.' };
}
