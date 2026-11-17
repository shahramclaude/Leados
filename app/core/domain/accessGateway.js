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
import { PRIORITY_BALLOT_RIGHTS } from './priorityRankingRegistry.js';
import { GOAL_COMMITMENT_RIGHTS } from './goalCommitmentRegistry.js';
import { GOAL_ATTAINMENT_RIGHTS } from './goalAttainmentRegistry.js';
import { INVESTMENT_CASE_RIGHTS } from './investmentCaseRegistry.js';
import { CAPITAL_RATIONING_RIGHTS } from './capitalRationingRegistry.js';
import { WORK_REST_RIGHTS } from './workRestRegistry.js';
import { WORK_NIGHT_RIGHTS } from './workNightRegistry.js';
import { CONFLICT_RECUSAL_RIGHTS } from './conflictRecusalRegistry.js';
import { STANDARD_WAIVER_RIGHTS } from './standardWaiverRegistry.js';
import { STANDARD_REVISION_RIGHTS } from './standardRevisionRegistry.js';
import { FLEX_BUDGET_RIGHTS } from './flexBudgetRegistry.js';
import { VALUE_BRIDGE_RIGHTS } from './valueBridgeRegistry.js';
import { SPEAK_UP_RIGHTS } from './speakUpRegistry.js';
import { SYNERGY_RIGHTS } from './synergyRegistry.js';
import { EV_RIGHTS } from './earnedValueRegistry.js';
import { RA_RIGHTS } from './riskAppetiteRegistry.js';
// ADR-0238: the distributed-work equity register's two rights.
import { DWE_RIGHTS } from './distributedEquityRegistry.js';
import { WPA_RIGHTS } from './workplaceAdjustmentRegistry.js';
import { LWK_RIGHTS } from './loneWorkingRegistry.js';
import { VOI_RIGHTS } from './voiceRegistry.js';
import { MIC_RIGHTS } from './incidentCommandRegistry.js';
// ADR-0229: the capability sourcing register's four rights.
import { SRC_RIGHTS } from './sourcingRegistry.js';
import { VY_RIGHTS } from './vyRegistry.js';
import { IBP_RIGHTS } from './ibpRegistry.js';
import { INC_RIGHTS } from './incentiveRegistry.js';
import { DWM_RIGHTS } from './dutyMeansRegistry.js';
import { SHO_RIGHTS } from './shiftHandoverRegistry.js';
import { KZT_RIGHTS } from './suggestionRegistry.js';
import { AFR_RIGHTS } from './assuranceRegistry.js';
import { PBG_RIGHTS } from './probationRegistry.js';
import { UDT_RIGHTS } from './undertakingRegistry.js';
import { RQR_RIGHTS } from './rqRegistry.js';
// ADR-0228: the decision-domain sensing register's four rights.
import { DSN_RIGHTS } from './domainSenseRegistry.js';
import { PRV_RIGHTS } from './portfolioReviewRegistry.js';
import { SWP_RIGHTS } from './workStopRegistry.js';
import { MHH_RIGHTS } from './mgrHandoverRegistry.js';
import { JUST_CULTURE_RIGHTS } from './justCultureRegistry.js';
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
  ['read-skill-coverage', 'skillCoverageReport'],
  ['declare-skill-coverage', 'skillDeclareTask skillRetireTask skillRecordQualification'],
  // ADR-0201: skill-constrained simultaneous station coverage. Reading is open
  // to every altitude (the reader narrows rows to the seat's reach); declaring a
  // window or station is narrowed by the ACTION to the holder's own span, and an
  // availability statement is the person's own act or their line holder's,
  // printed as such. Governing the ask window and disclosure floor is rank 3–5.
  ['read-station-coverage', 'stationCoverageReport stationCoverageCsvRows stationCoverageBriefText'],
  ['declare-station-coverage', 'stationCoverageDeclareWindow stationCoverageRetireWindow stationCoverageDeclareStation stationCoverageRetireStation stationCoverageDeclareEnable stationCoverageRetireEnable stationCoverageDeclareWindowEnable stationCoverageRetireWindowEnable'],
  ['declare-station-availability', 'stationCoverageDeclareAvailability stationCoverageWithdrawAvailability'],
  ['govern-station-coverage', 'stationCoverageSetConventions'],
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
  ['declare-matrix-line', 'matrixDeclareLine matrixRetuneLine matrixEndLine matrixSetConventions matrixReport matrixBriefText matrixCsvRows matrixCoordinationReport matrixCoordinationScan matrixSodReview matrixSettings matrixCandidates lineConsentRead lineConsentCandidates lineConsentScan matrixRecordIntake matrixRerouteIntake matrixIntakeReport matrixIntakeCandidates matrixHorizonReport matrixHorizonScan matrixDependencyCycleReport matrixInterfaceAlignmentReport matrixPriorityCandidates'],
  ['govern-dependency-cycles', 'matrixDependencyCycleScan matrixDependencyCycleSetConventions'],
  // ADR-0189: scanning the product–organisation interface alignment matrix and
  // setting its conventions. The pure read sits on `declare-matrix-line` and in
  // SAFE_READS; the scan (which runs the shared spine) and the conventions stay
  // on this declared right.
  ['govern-interface-alignment', 'matrixInterfaceAlignmentScan matrixInterfaceAlignmentSetConventions'],
  // ADR-0191: the pure priority-ballot read sits on the read right and in
  // SAFE_READS; opening a round and casting a ballot are declared commands under
  // their own rights, and the scan/conventions stay on the governing right.
  [PRIORITY_BALLOT_RIGHTS.READ, 'matrixPriorityReport matrixPriorityBriefText matrixPriorityCsvRows matrixPriorityAttentionCount'],
  [PRIORITY_BALLOT_RIGHTS.DECLARE, 'matrixPriorityDeclareRound matrixPriorityWithdrawRound'],
  [PRIORITY_BALLOT_RIGHTS.CAST, 'matrixPriorityCastBallot'],
  [PRIORITY_BALLOT_RIGHTS.GOVERN, 'matrixPriorityScan matrixPrioritySetConventions'],
  // ADR-0193: the pure goal-commitment read sits on the read right and in
  // SAFE_READS; declaring, re-baselining and releasing a commitment are
  // first-person commands under their own rights, narrowed by the ACTION to the
  // line the actor holds, and the scan/conventions stay on the governing right.
  [GOAL_COMMITMENT_RIGHTS.READ, 'matrixGoalCommitmentReport matrixGoalCommitmentBriefText matrixGoalCommitmentCsvRows matrixGoalCommitmentAttentionCount'],
  [GOAL_COMMITMENT_RIGHTS.DECLARE, 'matrixGoalCommitmentDeclare matrixGoalCommitmentRebaseline matrixGoalCommitmentCandidates'],
  [GOAL_COMMITMENT_RIGHTS.RELEASE, 'matrixGoalCommitmentRelease'],
  [GOAL_COMMITMENT_RIGHTS.GOVERN, 'matrixGoalCommitmentScan matrixGoalCommitmentSetConventions'],
  // ADR-0206: the goal-attainment register. Its pure reads sit on the read right
  // and in SAFE_READS; CLOSING a period and ACKNOWLEDGING a restatement are the
  // acts of the altitude that reports the figure upward (director and above), and
  // the scan/conventions stay on the governing right. Nothing here edits a goal.
  [GOAL_ATTAINMENT_RIGHTS.READ, 'matrixGoalAttainmentReport matrixGoalAttainmentBriefText matrixGoalAttainmentCsvRows matrixGoalAttainmentAttentionCount'],
  [GOAL_ATTAINMENT_RIGHTS.CLOSE, 'matrixGoalAttainmentClose matrixGoalAttainmentAcknowledge matrixGoalAttainmentCandidates'],
  [GOAL_ATTAINMENT_RIGHTS.GOVERN, 'matrixGoalAttainmentScan matrixGoalAttainmentSetConventions'],
  // ADR-0208: the investment case register. Its pure reads sit on the read right
  // and in SAFE_READS. DECLARING a case (and withdrawing it before a decision) is
  // the proposer's act. RATIFYING and REVIEWING are decision control: the rank
  // window is director and above, and the ACTION additionally refuses the case's
  // own benefit owner and any seat that does not hold that owner in its tree or
  // on a declared line. The scan/conventions stay on the governing right.
  [INVESTMENT_CASE_RIGHTS.READ, 'investmentCaseReport investmentCaseBriefText investmentCaseCsvRows investmentCaseAttentionCount'],
  [INVESTMENT_CASE_RIGHTS.DECLARE, 'investmentCaseDeclare investmentCaseWithdraw investmentCasePreview investmentCaseCandidates'],
  [INVESTMENT_CASE_RIGHTS.RATIFY, 'investmentCaseDecide investmentCaseReview'],
  [INVESTMENT_CASE_RIGHTS.GOVERN, 'investmentCaseScan investmentCaseSetConventions'],
  // ADR-0211: the capital-rationing register. Its pure reads sit on the read right
  // and in SAFE_READS. Declaring a ceiling is the enterprise altitude's act;
  // declaring a relation is a director's act AND the ACTION refuses any seat that
  // does not hold BOTH cases' benefit owners.
  [CAPITAL_RATIONING_RIGHTS.READ, 'capitalRationingReport capitalRationingBriefText capitalRationingCsvRows capitalRationingAttentionCount'],
  [CAPITAL_RATIONING_RIGHTS.DECLARE_CEILING, 'capitalRationingCandidates capitalRationingDeclareCeiling capitalRationingRetireCeiling'],
  [CAPITAL_RATIONING_RIGHTS.DECLARE_RELATION, 'capitalRationingDeclareRelation capitalRationingRetireRelation'],
  [CAPITAL_RATIONING_RIGHTS.GOVERN, 'capitalRationingScan capitalRationingSetConventions'],
  // ADR-0209: reading the work/rest ledger is open at every altitude and scoped
  // by the reader. ROSTERING — a shift, its actual times or cancellation, a
  // coverage attestation — is the act of whoever holds the LINE the work is for,
  // a frontline lead included; the rank window only admits the seat, and the
  // ACTION re-proves the line and refuses a manager who merely sees the person.
  // Declaring which limits apply is governance and starts at the director.
  [WORK_REST_RIGHTS.READ, 'workRestReport workRestBriefText workRestCsvRows workRestAttentionCount'],
  [WORK_REST_RIGHTS.ROSTER, 'workRestCandidates workRestPreviewShift workRestDeclareShift workRestAmendShift workRestAttestCoverage workRestWithdrawCoverage'],
  [WORK_REST_RIGHTS.POLICY, 'workRestDeclarePolicy workRestRetirePolicy'],
  [WORK_REST_RIGHTS.GOVERN, 'workRestScan workRestSetConventions'],
  [WORK_NIGHT_RIGHTS.READ, 'workNightReport workNightBriefText workNightCsvRows workNightAttentionCount'],
  [WORK_NIGHT_RIGHTS.ROSTER, 'workNightCandidates workNightPreviewBreak workNightRecordBreak'],
  [WORK_NIGHT_RIGHTS.POLICY, 'workNightDeclarePolicy workNightRetirePolicy'],
  [WORK_NIGHT_RIGHTS.GOVERN, 'workNightScan workNightSetConventions'],
  // ADR-0210: declaring an interest is the person's own first-person act (or a
  // seat recording a disclosure it received, printed as such); deciding how it
  // is handled is a director+ act the ACTION refuses to the holder themselves.
  // The pure reads are SAFE_READS below.
  [CONFLICT_RECUSAL_RIGHTS.READ, 'conflictRecusalReport conflictRecusalBriefText conflictRecusalCsvRows conflictRecusalAttentionCount'],
  [CONFLICT_RECUSAL_RIGHTS.DECLARE, 'conflictRecusalDeclareInterest conflictRecusalWithdrawInterest conflictRecusalDeclareNoInterest conflictRecusalWithdrawNoInterest conflictRecusalCandidates conflictRecusalNoInterestCandidates'],
  [CONFLICT_RECUSAL_RIGHTS.DECIDE, 'conflictRecusalRecordStanding'],
  [CONFLICT_RECUSAL_RIGHTS.GOVERN, 'conflictRecusalDeclareRule conflictRecusalRetireRule conflictRecusalScan conflictRecusalSetConventions'],
  // ADR-0212: the temporary standard waiver register. Every read is a pure,
  // seat-scoped adapter and sits in SAFE_READS. Asking is the routine owner's
  // own act (the ACTION narrows it); answering is the line holder's (the ACTION
  // re-resolves the line and refuses anybody else, including the requester);
  // closing is the owner's or the authoriser's act. The scan and the conventions
  // stay on the governing right.
  [STANDARD_WAIVER_RIGHTS.READ, 'standardWaiverReport standardWaiverBriefText standardWaiverCsvRows standardWaiverAttentionCount'],
  [STANDARD_WAIVER_RIGHTS.REQUEST, 'standardWaiverCandidates standardWaiverRequest'],
  [STANDARD_WAIVER_RIGHTS.AUTHORISE, 'standardWaiverAnswer standardWaiverRevoke'],
  [STANDARD_WAIVER_RIGHTS.DECIDE, 'standardWaiverDecide'],
  [STANDARD_WAIVER_RIGHTS.GOVERN, 'standardWaiverScan standardWaiverSetConventions'],
  // ADR-0237: the standard-work revision register. The report is a pure read that
  // re-proves the read right and projects by seat inside the reader. Approving a
  // revision is the holder of the line the routine is owed under; briefing is the
  // approver's own act. The action re-proves the line and the owner on every call.
  [STANDARD_REVISION_RIGHTS.READ, 'standardRevisionReport'],
  [STANDARD_REVISION_RIGHTS.APPROVE, 'standardRevisionCandidates standardRevisionApprove'],
  [STANDARD_REVISION_RIGHTS.BRIEF, 'standardRevisionBrief'],
  // ADR-0213: the flexible-budget variance statement. Its pure reads sit on the
  // read right; declaring a standard and recording actuals each re-prove, inside
  // the action, that the seat holds the budget holder (and is not the holder,
  // for a standard).
  [FLEX_BUDGET_RIGHTS.READ, 'flexBudgetReport flexBudgetBriefText flexBudgetCsvRows flexBudgetAttentionCount flexBudgetCandidates'],
  [FLEX_BUDGET_RIGHTS.DECLARE, 'flexBudgetDeclarePlan flexBudgetRetirePlan'],
  [FLEX_BUDGET_RIGHTS.RECORD, 'flexBudgetRecordActuals flexBudgetWithdrawActuals'],
  [FLEX_BUDGET_RIGHTS.GOVERN, 'flexBudgetSetConventions'],
  // ADR-0214: the enterprise value bridge. Equity value is ENTERPRISE material
  // (rank 4+). Recording a reading is an executive act; claiming a leg re-proves
  // inside the action that the seat holds the claimant through its tree or a
  // declared line; the staleness window is the chief's to set.
  [VALUE_BRIDGE_RIGHTS.READ, 'valueBridgeReport valueBridgeBriefText valueBridgeCsvRows valueBridgeAttentionCount valueBridgeCandidates'],
  [VALUE_BRIDGE_RIGHTS.RECORD, 'valueBridgeRecordReading valueBridgeWithdrawReading'],
  [VALUE_BRIDGE_RIGHTS.CLAIM, 'valueBridgeClaimLever valueBridgeWithdrawClaim'],
  [VALUE_BRIDGE_RIGHTS.GOVERN, 'valueBridgeSetConventions'],
  // ADR-0215: the speak-up register. Raising is open at EVERY rank — the person
  // who needs this most has the least authority to open a screen — and the action
  // narrows it to a named reporter the seat actually holds, or to an unnamed
  // record. Answering is the named receiver's alone and is re-proved against the
  // live graph inside every act. The windows and the scan are governance.
  //
  // NOTE ON THE PAYLOAD BOUNDARY. This module deliberately names parties a seat
  // does not hold: the subject of a concern is usually an ANCESTOR, and a register
  // that could only record concerns about one's own reports would be useless
  // exactly where it matters. The action is therefore the boundary: it proves the
  // reporter, and it proves the receiver impartial across the whole reporting
  // graph, refusing any receiver that holds either party. The generic
  // "names a person outside your span" refusal below does not see these fields
  // because they are not the sharing vocabulary (`personId`/`managerId`) — the
  // exemption is explicit here rather than an accident of naming.
  [SPEAK_UP_RIGHTS.READ, 'speakUpReport speakUpBriefText speakUpCsvRows speakUpAttentionCount speakUpCandidates'],
  [SPEAK_UP_RIGHTS.RAISE, 'speakUpRaiseConcern speakUpWithdrawConcern'],
  [SPEAK_UP_RIGHTS.ANSWER, 'speakUpAcknowledge speakUpRecordOutcome speakUpRecordWatch speakUpCloseConcern'],
  [SPEAK_UP_RIGHTS.GOVERN, 'speakUpScan speakUpSetConventions'],
  // ADR-0218: the Just Culture Decision Record. Reading is open at every rank and
  // the record class (individual) decides the detail. Opening, deciding, revising
  // and withdrawing are the act of the manager on the deciding line; concurring is
  // the act of another line the person holds. Each action re-proves that line
  // against the live matrix, so a peer cannot answer for somebody else's line.
  [JUST_CULTURE_RIGHTS.READ, 'justCultureReport justCultureAttentionCount justCultureCandidates'],
  [JUST_CULTURE_RIGHTS.DECIDE, 'justCultureOpen justCultureDecide justCultureWithdraw'],
  [JUST_CULTURE_RIGHTS.CONCUR, 'justCultureConcur'],
  // ADR-0216: the deal thesis & synergy realization register. Reading it is
  // enterprise material (rank 4+, matching the record class) — a deal's economics
  // are the owners' money. Declaring a deal or a promise is the executive act
  // that signs it, and the ACTION further refuses a seat that does not HOLD the
  // owner it names: one line does not promise another line's saving. Recording a
  // reading is open by rank and split inside the action — a `verified` reading is
  // refused to the owner and to any seat that is not ABOVE the owner on a line.
  [SYNERGY_RIGHTS.READ, 'synergyReport synergyBriefText synergyCsvRows synergyAttentionCount synergyCandidates'],
  [SYNERGY_RIGHTS.DECLARE, 'synergyDeclareDeal synergyDeclareClaim synergyWithdrawClaim'],
  [SYNERGY_RIGHTS.RECORD, 'synergyWithdrawReading synergyRecordCost'],
  // The write this rank-gated list cannot express: a claimed reading is open to
  // the promise's OWN owner at any altitude, and to everybody else only with the
  // recording right. The gateway therefore admits the call through the open
  // right and synergyActions.synergyRecordReading narrows it — it re-resolves the
  // seat, checks the owner, and exercises RECORD for every other path.
  [SYNERGY_RIGHTS.SELF_REPORT, 'synergyRecordReading'],
  [SYNERGY_RIGHTS.GOVERN, 'synergyScan synergySetConventions'],
  // ADR-0217: the earned-value delivery register. Reading it is portfolio
  // material (rank 3+) — a programme's curve is the director's own. Declaring a
  // case or its baseline names an owner and real money; the ACTION narrows it to
  // a seat that HOLDS the owner. Recording a reading or an actual is evidence:
  // open by rank, split inside the action by who may reach the case, which
  // shares the declared method admits, and which cut-offs are real. The
  // conventions and the scan are the chief's.
  [EV_RIGHTS.READ, 'earnedValueReport earnedValueBriefText earnedValueCsvRows earnedValueAttentionCount earnedValueCandidates'],
  [EV_RIGHTS.DECLARE, 'earnedValueDeclareCase earnedValueAddPackage earnedValueRebaselinePackage earnedValueRemovePackage earnedValueWithdrawCase'],
  [EV_RIGHTS.RECORD, 'earnedValueRecordReading earnedValueWithdrawReading earnedValueRecordActual earnedValueWithdrawActual'],
  [EV_RIGHTS.GOVERN, 'earnedValueScan earnedValueSetConventions'],
  // ADR-0219: the enterprise risk-appetite register. Reading it is portfolio
  // material (rank 3+). Declaring a tolerance is an executive act (rank 4+);
  // declaring the retained exposure of one live risk is a director's act,
  // narrowed inside the action to a seat that HOLDS the case owner and refuses
  // the owner themselves — the hand that carries the consequence does not write
  // the number. The scan is the declarer's act because it files the asks.
  [RA_RIGHTS.READ, 'riskAppetiteReport riskAppetiteAttentionCount riskAppetiteCandidates riskAppetiteConcentration'],
  [RA_RIGHTS.DECLARE, 'riskAppetiteDeclareStatement riskAppetiteRetireStatement riskAppetiteScan'],
  [RA_RIGHTS.CARRY, 'riskAppetiteDeclareRisk riskAppetiteWithdrawRisk'],
  // ADR-0238: the distributed-work equity register. Reading is individual
  // material, open at every rank — the READER discloses per-person rows only
  // below the executive altitude and counts above it. Declaring a window for
  // another person or a sitting is a leader's act narrowed inside the action to
  // a seat that HOLDS the person (or the chair); the conventions and the scan
  // are the declarer's acts because the conventions bound every verdict.
  [DWE_RIGHTS.READ, 'distributedEquityReport distributedEquityAttentionCount'],
  // ADR-0241: the workplace adjustment register. Reading is INDIVIDUAL material
  // and open at rank 1 — a person must be able to read their own limitation and
  // whether the workplace put it in place — while the READER withholds
  // person-level rows above rank 3. Every write is a leader act narrowed inside
  // the action to a seat that HOLDS the person through the span or a declared
  // line; lifting a restriction additionally requires a recorded review, which
  // no rank can bypass.
  [WPA_RIGHTS.READ, 'workplaceAdjustmentReport workplaceAdjustmentAttention workplaceAdjustmentCandidates'],
  [WPA_RIGHTS.DECLARE, 'workplaceAdjustmentDeclareRestriction workplaceAdjustmentWithdrawRestriction workplaceAdjustmentRecordAdjustment workplaceAdjustmentMarkOperational workplaceAdjustmentRetireAdjustment workplaceAdjustmentAcknowledgeLine workplaceAdjustmentRecordReview workplaceAdjustmentSetConventions workplaceAdjustmentScan'],
  // ADR-0242: the lone-working register. Reading is open at rank 1 — a person
  // must be able to read their own deployment and whether anybody is watching —
  // while the READER withholds person-level rows above rank 3. Every write is a
  // leader act narrowed inside the action to a seat that HOLDS the person; the
  // deployed person may record their own contact and close-out, and nobody may
  // declare themselves alone.
  [LWK_RIGHTS.READ, 'loneWorkingReport loneWorkingAttention loneWorkingCandidates'],
  [LWK_RIGHTS.DECLARE, 'loneWorkingDeclareDeployment loneWorkingCheckIn loneWorkingEscalate loneWorkingCloseDeployment loneWorkingSetConventions loneWorkingScan'],
  // ADR-0243: the employee-voice register. Reading is open at rank 1 — every
  // person the body represents may see what was put to it and what it advised —
  // while the READER withholds subjects, names and written advice above rank 3.
  // Every write is a leader act narrowed inside the action: an item is opened only
  // against a line this seat holds, and a decision only by the JOINT APEX above the
  // affected lines, never by one of them.
  [VOI_RIGHTS.READ, 'voiceReport voiceAttention voiceCandidates'],
  [VOI_RIGHTS.DECLARE, 'voiceDeclareBody voiceDeclareMember voiceOpenItem voiceSupplyDocument voiceHoldSitting voiceRecordMinutes voiceRecordAdvice voiceReplyToAdvice voiceRecordDecision voiceSetConventions voiceScan'],
  [DWE_RIGHTS.DECLARE, 'distributedEquityDeclareWindow distributedEquityWithdrawWindow distributedEquityDeclareSitting distributedEquityRetractSitting distributedEquitySetConventions distributedEquityScan'],
  // ADR-0240: the incident command register. Reading is registered as safe and
  // therefore bypasses the gateway's rank check — so the read right is re-proved
  // inside the action, exactly as every register in this workspace re-proves it.
  // Commanding is a rank 2+ act; the party-to-the-incident test, the strict reach
  // above every line lead and the "only the holder may hand over or release" rule
  // are enforced inside the action against the live reporting graph.
  [MIC_RIGHTS.READ, 'incidentReport incidentAttentionCount incidentCandidates'],
  [MIC_RIGHTS.COMMAND, 'incidentDeclare incidentAssignLine incidentAcceptLine incidentAssumeCommand incidentTransferCommand incidentChangeSeverity incidentRecordNotification incidentResolve incidentStandDown incidentSetConventions incidentScan'],
  // ADR-0229: the capability sourcing & firm-boundary register. Reading is
  // portfolio material (rank 3+). Recording an option is the leader who HOLDS
  // the capability (rank 2+), narrowed inside the action to a line the case
  // names and refused for the seat that will decide it. Deciding the boundary
  // question is the chief altitude's own act (rank 5), proved against the joint
  // apex the reporting graph computes. Grading the frozen assumptions is an
  // independent review (rank 4+), refused for the decider and the recorder.
  [SRC_RIGHTS.READ, 'sourcingReport sourcingAttentionCount sourcingCandidates sourcingReadModel'],
  [SRC_RIGHTS.RECORD, 'sourcingDeclareCase sourcingWithdrawCase sourcingRecordOption sourcingScan'],
  [SRC_RIGHTS.DECIDE, 'sourcingDecide'],
  [SRC_RIGHTS.GRADE, 'sourcingGrade'],
  // ADR-0230: Vroom–Yetton–Jago Decision-Participation Selector. Reading is
  // open at manager altitude; declaring is open at every altitude; answering
  // the diagnostics narrows to a seat holding a touched line; selecting the
  // style is director-and-above.
  [VY_RIGHTS.READ, 'vyReport sourcingVyScan'],
  [VY_RIGHTS.DECLARE, 'declareVyDecision withdrawVyDecision'],
  [VY_RIGHTS.ANSWER, 'recordVyAnswers'],
  [VY_RIGHTS.SELECT, 'selectVyStyle recordVyCommitmentOutcome'],
  // ADR-0228: the decision-domain sensing register (Cynefin). Reading a sensed
  // domain is manager-grade material (rank 2+). Declaring a decision is a
  // director-and-above act; assessing is a declared panel member's act on
  // their declared line, narrowed inside the action; committing a mode is the
  // owner's act, likewise narrowed inside the action.
  [DSN_RIGHTS.READ, 'domainSenseReport domainSenseAttentionCount domainSenseCandidates'],
  [DSN_RIGHTS.DECLARE, 'domainDeclare domainScan'],
  [DSN_RIGHTS.ASSESS, 'domainAssess'],
  [DSN_RIGHTS.COMMIT, 'domainCommit'],
  // ADR-0231: the integrated business plan / S&OP cycle register. Reading a plan
  // of record is portfolio material (rank 3+). Recording demand and capacity is
  // the line holder's act (rank 2+), narrowed INSIDE the action to a cycle whose
  // line they hold — the gateway cannot narrow it, the action must. Framing an
  // option is director+; approving is the executive step at rank 4+ and is
  // refused for the seat that framed the options; grading is the process owner's.
  [IBP_RIGHTS.READ, 'ibpReport ibpAttentionCount ibpCandidates ibpReadModel'],
  [IBP_RIGHTS.DECLARE, 'ibpDeclareCycle ibpWithdrawCycle ibpScan'],
  [IBP_RIGHTS.RECORD, 'ibpRecordDemand ibpRecordCapacity'],
  [IBP_RIGHTS.FRAME, 'ibpFrameOption'],
  [IBP_RIGHTS.DECIDE, 'ibpApprovePlan'],
  [IBP_RIGHTS.GRADE, 'ibpGradeDemand'],
  // ADR-0220: the variable-pay design & incentive integrity register. Reading it
  // is open at the manager altitude because a team envelope is a manager's own
  // instrument; the row class and the span filter decide what is printed.
  // Designing is narrowed inside the action to a seat that HOLDS the funding
  // line. Verification is narrowed further — above the line, never the owner,
  // never a beneficiary — and recovery is an executive act.
  [INC_RIGHTS.READ, 'incentiveReport incentiveAttentionCount incentiveCandidates'],
  [INC_RIGHTS.DESIGN, 'incentiveDeclarePlan incentiveRetirePlan incentiveAddMeasure incentiveScan'],
  [INC_RIGHTS.VERIFY, 'incentiveRecordReading'],
  [INC_RIGHTS.AWARD, 'incentiveRecordAward'],
  [INC_RIGHTS.RECOVER, 'incentiveRecordRecovery'],
  // ADR-0221: the Duty-Without-Means Register. Reads are open from frontline
  // upward and re-proved inside the action; writes prove carrier/demanding/
  // controlling/joint-apex standing against the live matrix graph.
  [DWM_RIGHTS.READ, 'dutyMeansReport dutyMeansAttentionCount dutyMeansCandidates'],
  [PRV_RIGHTS.READ, 'portfolioReport portfolioAttentionCount portfolioCandidates'],
  [PRV_RIGHTS.DECLARE, 'portfolioDeclareUnit portfolioScan'],
  [PRV_RIGHTS.REVIEW, 'portfolioRecordReview'],
  [PRV_RIGHTS.VERDICT, 'portfolioRecordVerdict portfolioRetireUnit portfolioCompleteExit'],
  [PRV_RIGHTS.TRACK, 'portfolioRecordMilestone'],
  [DWM_RIGHTS.DECLARE, 'dutyMeansDeclareDuty dutyMeansRetireDuty dutyMeansAddRequirement dutyMeansScan'],
  [DWM_RIGHTS.SUPPLY, 'dutyMeansRecordAct'],
  [DWM_RIGHTS.GOVERN, 'dutyMeansGovernGap'],
  // ADR-0223: the Shift Handover & Two-Key Readback Ledger. Both the brief and
  // the readback are FIRST-PERSON acts at every altitude; the action refuses any
  // seat that is not the outgoing operator (declare/cancel) or the declared
  // incoming operator (readback) — nobody turns a key for somebody else. Reads
  // are open from the frontline upward and re-proved inside the action.
  [SHO_RIGHTS.READ, 'shiftHandoverReport shiftHandoverAttentionCount shiftHandoverBriefGrant'],
  [SHO_RIGHTS.DECLARE, 'shiftHandoverDeclare shiftHandoverCancel shiftHandoverScan'],
  [SHO_RIGHTS.READBACK, 'shiftHandoverReadback'],
  // ADR-0227: the Frontline Improvement-Suggestion Ledger. Every act is
  // first-person: the action refuses any seat that is not the named person for
  // the act — the submitter (declare), a route member (triage), the owner
  // (claim), the submitter or a route member and never the owner (confirm).
  // Reads are open from the frontline upward and re-proved inside the action.
  [KZT_RIGHTS.READ, 'suggestionReport suggestionAttentionCount suggestionCandidates'],
  [KZT_RIGHTS.DECLARE, 'suggestionDeclare suggestionScan'],
  [KZT_RIGHTS.TRIAGE, 'suggestionTriage'],
  [KZT_RIGHTS.CLAIM, 'suggestionClaim'],
  [KZT_RIGHTS.CONFIRM, 'suggestionConfirm'],
  // ADR-0232: the Assurance Finding & Remediation Register. Every act is
  // first-person and re-proved inside the action: the holder assigns on their
  // own accountable line, the named owner asserts, a seat strictly above the
  // owner verifies, and an executive who does not own the remediation accepts
  // the residual risk. Reads are open from the frontline upward.
  [AFR_RIGHTS.READ, 'assuranceFindingReport assuranceFindingAttentionCount assuranceFindingCandidates'],
  [AFR_RIGHTS.DECLARE, 'assuranceFindingDeclare assuranceFindingScan'],
  [AFR_RIGHTS.REMEDIATE, 'assuranceFindingAssign assuranceFindingAssert'],
  [AFR_RIGHTS.VERIFY, 'assuranceFindingVerify'],
  [AFR_RIGHTS.ACCEPT, 'assuranceFindingAccept'],
  // ADR-0233: the Probation Confirmation Gate Register. Every act is
  // first-person and re-proved inside the action: the joiner's HOME manager
  // opens, asks, extends, decides and notifies the gate, and a declared
  // line's evidence is that line's own holder's act. The joiner reads their
  // own gate. Reads are open from the frontline upward, narrowed to the grant.
  [PBG_RIGHTS.READ, 'probationGateReport probationGateAttentionCount probationGateCandidates'],
  [PBG_RIGHTS.DECLARE, 'probationGateDeclare probationGateScan'],
  [PBG_RIGHTS.ASK, 'probationGateAsk'],
  [PBG_RIGHTS.SUBMIT, 'probationGateSubmit'],
  [PBG_RIGHTS.DECIDE, 'probationGateExtend probationGateDecide probationGateNotify'],
  // ADR-0234: the Undertaking & Outward-Commitment Closure Register. Every act
  // is first-person and re-proved inside the action: an executive declares and
  // reports, a line's holder delivers, a seat strictly above the holder tests,
  // and a due day moves only where the instrument and the counterparty allow.
  [UDT_RIGHTS.READ, 'undertakingReport undertakingAttentionCount undertakingCandidates'],
  [UDT_RIGHTS.DECLARE, 'undertakingDeclare undertakingScan'],
  [UDT_RIGHTS.ASSIGN, 'undertakingAssign'],
  [UDT_RIGHTS.DELIVER, 'undertakingDeliver'],
  [UDT_RIGHTS.VERIFY, 'undertakingVerify'],
  [UDT_RIGHTS.REPORT, 'undertakingReportClosure undertakingNotify undertakingExtend'],
  // ADR-0235: the Information-Request & Examination Response Register. Every act
  // is first-person and re-proved inside the action: a manager records the demand,
  // a named producer certifies their own line, a seat that is party to NOTHING on
  // the request reviews it and rules on its privilege claim, and only the
  // receiving executive releases — while a compelled instrument's day never moves.
  [RQR_RIGHTS.READ, 'informationRequestReport informationRequestAttentionCount informationRequestCandidates'],
  [RQR_RIGHTS.RECEIVE, 'informationRequestReceive informationRequestScan'],
  [RQR_RIGHTS.ASSIGN, 'informationRequestAssign'],
  [RQR_RIGHTS.PRODUCE, 'informationRequestProduce'],
  [RQR_RIGHTS.REVIEW, 'informationRequestReview'],
  [RQR_RIGHTS.RELEASE, 'informationRequestRelease informationRequestRespond informationRequestExtend informationRequestRestateClock'],
  // ADR-0224: stop-work holds may be raised at frontline rank; mitigation is
  // work-lead-controlled, assessment is Director+ and tied to every frozen
  // joint apex, and restart is only an affected operator's second key.
  [SWP_RIGHTS.READ, 'workStopReport workStopAttentionCount workStopCandidates'],
  [SWP_RIGHTS.DECLARE, 'workStopDeclare workStopScan'],
  [SWP_RIGHTS.MITIGATE, 'workStopMitigate'],
  [SWP_RIGHTS.ASSESS, 'workStopAssess'],
  [SWP_RIGHTS.OPERATOR, 'workStopOperatorDecision'],
  // ADR-0225: managerial transitions are declared at director rank; the brief
  // is the outgoing manager's own act (or a manager above them); the
  // acceptance and the dispute are the successor's own keys; the release is
  // the governor's act.
  [MHH_RIGHTS.READ, 'mgrHandoverReport mgrHandoverAttentionCount mgrHandoverCandidates'],
  [MHH_RIGHTS.DECLARE, 'mgrHandoverDeclare mgrHandoverScan'],
  [MHH_RIGHTS.BRIEF, 'mgrHandoverBrief'],
  [MHH_RIGHTS.ACCEPT, 'mgrHandoverAccept'],
  [MHH_RIGHTS.RELEASE, 'mgrHandoverRelease'],
  [MHH_RIGHTS.DISPUTE, 'mgrHandoverDispute'],
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
  // ADR-0196: each side can speak only for its own line. The action narrows a
  // source proposal, receiving answer and withdrawal to that current holder;
  // the operator view is labelled as a scribed statement rather than identity.
  ['propose-work-reassignment', 'workReassignmentPropose'],
  ['answer-work-reassignment', 'workReassignmentAccept workReassignmentDecline'],
  ['withdraw-work-reassignment', 'workReassignmentWithdraw'],
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
  // ADR-0194: re-running RULE-CBP-01 and setting the posting conventions ride
  // the SAME chargeback governance right — one ledger, one governor.
  ['govern-transfer-prices', 'transferPriceScan transferPriceSetConventions chargebackPostingScan chargebackPostingSetConventions'],
  // ADR-0194: posting a period chargeback statement — and reversing one — is a
  // VP+ act, deliberately above the director rank that governs the scan: the
  // posting binds the WHOLE workspace statement, not one span, and the figures
  // are the statement engine's own (the action refuses typed amounts; it only
  // accepts envelope bindings and a note). ADR-0202: acknowledging a drift
  // rides the SAME right — accepting that a restated period fact still stands
  // is the same class of judgement as creating it, and is refused below VP.
  ['post-chargeback', 'chargebackPost chargebackReversePosting chargebackAcknowledgeDrift'],
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
  // ADR-0082 / ADR-0205: sealScan writes only a traceable audit event; archive
  // creation is deliberately absent from seat rights and is operator-only.
  // Pure chain/archive status and read-only archive verification are SAFE_READS.
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

export const SAFE_READS = new Set(['boardAttentionCount', 'boardBriefText', 'boardContinuity', 'boardContinuityText', 'boardCsvRows', 'boardMemoText', 'boardPreview', 'boardRead', 'cadenceAttentionCount', 'cadenceBriefText', 'cadenceCsvRows', 'cadencePreviewForum', 'cadenceRead', 'carryoverAttentionCount', 'carryoverBriefText', 'carryoverCsvRows', 'carryoverReleasePreview', 'carryoverReport', 'catchballBriefText', 'catchballCsvRows', 'catchballPreviewFeasibility', 'catchballRead', 'conflictRecusalAttentionCount', 'conflictRecusalBriefText', 'conflictRecusalCsvRows', 'conflictRecusalReport', 'conflictRecusalNoInterestCandidates',
// ADR-0211: the capital-rationing register's pure read surface. Registered here
// because a module whose reads are absent from SAFE_READS is unreadable under
// enforcement while its writes are still gated — the funded set would vanish
// exactly when a real organisation turned enforcement on.
'capitalRationingAttentionCount', 'capitalRationingBriefText', 'capitalRationingCsvRows', 'capitalRationingReport',
// ADR-0212: the standard-waiver register's pure read surface. Registered here
// because a module whose reads are absent from SAFE_READS is unreadable under
// enforcement while its writes are still gated — the register would vanish
// exactly when a real organisation turned enforcement on.
// ADR-0213: the variance statement's pure read surface — each re-proves the
// read right and projects by seat inside the action.
'flexBudgetAttentionCount', 'flexBudgetBriefText', 'flexBudgetCandidates', 'flexBudgetCsvRows', 'flexBudgetReport', 'valueBridgeAttentionCount', 'valueBridgeBriefText', 'valueBridgeCandidates', 'valueBridgeCsvRows', 'valueBridgeReport',
// ADR-0215: the speak-up register's pure read surface. Every one of these
// re-proves the read right and projects by seat INSIDE the action, so a seat
// outside a concern's span receives counts, never a description. Registered here
// because a module whose reads are absent from SAFE_READS is unreadable under
// enforcement while its writes are still gated — the register would vanish
// exactly when a real organisation turned enforcement on.
// ADR-0218: the Just Culture register's pure read surface. Each re-derives its
// figures and grants or withholds detail through the seat engine inside the reader.
'justCultureReport', 'justCultureAttentionCount', 'justCultureCandidates',
'speakUpReport', 'speakUpBriefText', 'speakUpCsvRows', 'speakUpAttentionCount', 'speakUpCandidates',
// ADR-0216: the synergy register's pure read surface. Every one of these
// re-proves the read right inside the action. Registered here because a module
// whose reads are absent from SAFE_READS is unreadable under enforcement while
// its writes are still gated — the register would vanish exactly when a real
// organisation turned enforcement on.
'synergyReport', 'synergyBriefText', 'synergyCsvRows', 'synergyAttentionCount', 'synergyCandidates',
// ADR-0217: the earned-value register's pure read surface. Every one of these
// re-proves the read right inside the action. Registered here because a module
// whose reads are absent from SAFE_READS is unreadable under enforcement while
// its writes are still gated — the register would vanish exactly when a real
// organisation turned enforcement on.
'earnedValueReport', 'earnedValueBriefText', 'earnedValueCsvRows', 'earnedValueAttentionCount', 'earnedValueCandidates',
// ADR-0219: the risk-appetite register's pure read surface. Every one of these
// re-proves the read right inside the action. Registered here because a module
// whose reads are absent from SAFE_READS is unreadable under enforcement while
// its writes are still gated — the register would vanish exactly when a real
// organisation turned enforcement on.
'riskAppetiteReport', 'riskAppetiteAttentionCount', 'riskAppetiteCandidates', 'riskAppetiteConcentration',
// ADR-0238: the distributed-work equity register's pure read surface. Both
// re-prove the read right inside the action, exactly as the risk-appetite
// register re-proves it.
'distributedEquityReport', 'distributedEquityAttentionCount',
// ADR-0240: the incident command register's pure read surface. Every one of
// these re-proves the read right inside the action, because a module whose
// reads are absent from SAFE_READS is unreadable under enforcement while its
// writes are still gated.
'incidentReport', 'incidentAttentionCount', 'incidentCandidates',
// ADR-0241: the workplace adjustment register's pure read surface. Every one of
// these re-proves the read right inside the action, exactly as the distributed-
// work and incident registers do — a module whose reads are absent from
// SAFE_READS is unreadable under enforcement while its writes are still gated,
// so a person's own limitation would vanish the moment enforcement was turned on.
'workplaceAdjustmentReport', 'workplaceAdjustmentAttention', 'workplaceAdjustmentCandidates',
// ADR-0242: the lone-working register's pure read surface. Every one of these
// re-proves the read right inside the action, because a module whose reads are
// absent from SAFE_READS is unreadable under enforcement while its writes are
// still gated — and where a named human being is alone at this minute would
// vanish the moment enforcement was turned on.
'loneWorkingReport', 'loneWorkingAttention', 'loneWorkingCandidates',
// ADR-0243: the employee-voice register's pure read surface. Every one of these
// re-proves the read right inside the action, because a module whose reads are
// absent from SAFE_READS is unreadable under enforcement while its writes are
// still gated — and what a named body advised would vanish the moment enforcement
// was turned on.
'voiceReport', 'voiceAttention', 'voiceCandidates',
// ADR-0229: the capability sourcing register's pure read surface. Every one of
// these re-proves the read right inside the action, because a module whose
// reads are absent from SAFE_READS is unreadable under enforcement while its
// writes are still gated.
'sourcingReport', 'sourcingAttentionCount', 'sourcingCandidates', 'sourcingReadModel', 'sourcingSeesCase', 'sourcingMarkers', 'sourcingReadCents',
// ADR-0230: the Vroom–Yetton–Jago decision-participation register's pure read
// surface. Every one of these re-proves the read right inside the action.
'vyReport', 'sourcingVyScan',
// ADR-0231: the integrated business plan's pure read surface. Every one of
// these re-proves the read right INSIDE the action, because a module whose reads
// are absent from SAFE_READS is unreadable under enforcement while its writes
// are still gated — the plan of record would vanish exactly when a real
// organisation turned enforcement on.
'ibpReport', 'ibpAttentionCount', 'ibpCandidates', 'ibpReadModel', 'ibpSeesCycle', 'ibpMarkers', 'ibpReadUnits', 'ibpReadCents',
// ADR-0220: the variable-pay register's pure read surface. Every one of these
// re-proves the read right inside the action. Registered here because a module
// whose reads are absent from SAFE_READS is unreadable under enforcement while
// its writes are still gated — the register would vanish exactly when a real
// organisation turned enforcement on.
'incentiveReport', 'incentiveAttentionCount', 'incentiveCandidates',
'dutyMeansReport', 'dutyMeansAttentionCount', 'dutyMeansCandidates',
// ADR-0223: the shift-handover ledger's pure read surface. Every one of these
// re-proves the read right inside the action. Registered here because a module
// whose reads are absent from SAFE_READS is unreadable under enforcement while
// its writes are still gated.
'shiftHandoverReport', 'shiftHandoverAttentionCount', 'shiftHandoverBriefGrant',
// ADR-0227: the improvement-suggestion ledger's pure read surface. Every one
// of these re-proves the read right inside the action.
'suggestionReport', 'suggestionAttentionCount', 'suggestionCandidates',
// ADR-0232: the assurance finding reader re-proves the right inside the action;
// the report never exposes raw collections to the generic projection.
'assuranceFindingReport', 'assuranceFindingAttentionCount', 'assuranceFindingCandidates',
// ADR-0233: the probation gate reader re-proves the right inside the action;
// the report never exposes raw collections to the generic projection.
'probationGateReport', 'probationGateAttentionCount', 'probationGateCandidates',
// ADR-0234: the undertaking reader re-proves the read right inside the action;
// the report never exposes raw collections to the generic projection.
'undertakingReport', 'undertakingAttentionCount', 'undertakingCandidates',
// ADR-0235: the information-request reader re-proves the read right inside the
// action; the report never exposes raw collections to the generic projection.
'informationRequestReport', 'informationRequestAttentionCount', 'informationRequestCandidates',
// ADR-0228: the decision-domain sensing reader re-proves the right inside the
// action; the report never exposes raw collections to the generic projection.
'domainSenseReport', 'domainSenseAttentionCount', 'domainSenseCandidates',
// ADR-0224: the stop-work reader re-proves the right inside the action; the
// report never exposes raw collections to the generic projection.
'workStopReport', 'workStopAttentionCount', 'workStopCandidates',
// ADR-0225: the managerial-handover reader re-proves the right inside the
// action; the report never exposes raw collections to the generic projection.
'mgrHandoverReport', 'mgrHandoverAttentionCount', 'mgrHandoverCandidates',
'portfolioReport', 'portfolioAttentionCount', 'portfolioCandidates',
// ADR-0237: the revision register's report re-proves its read right inside the reader.
'standardRevisionReport',
'standardWaiverAttentionCount', 'standardWaiverBriefText', 'standardWaiverCandidates', 'standardWaiverCsvRows', 'standardWaiverReport', 'concordanceAttentionCount', 'concordanceBriefText', 'concordanceCsvRows', 'concordanceRead', 'concordanceStats', 'disclosureAttentionCount', 'disclosureBriefText', 'disclosureCsvRows', 'disclosureGrantRead', 'disclosureGrants', 'disclosureRead', 'envoyAttentionCount', 'envoyBriefText', 'envoyCsvRows', 'envoyIdentity', 'envoyPacketText', 'envoyPreview', 'envoyRead', 'escalationBriefText', 'escalationCsvRows', 'escalationRead', 'escalationStats', 'differencesAttentionCount', 'differencesBriefText', 'differencesCsvRows', 'differencesRead', 'federationAttentionCount', 'federationBriefText', 'federationCsvRows', 'federationRead',
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
'prospectiveAttentionCount', 'prospectiveBriefText', 'prospectiveCsvRows', 'prospectiveRead', 'robustAllocationAttentionCount', 'robustAllocationBriefText', 'robustAllocationCsvRows', 'robustAllocationRead', 'clearingAttentionCount', 'clearingBriefText', 'clearingCsvRows', 'clearingRead', 'clearingSolvePreview', 'identityAttentionCount', 'identityBriefText', 'identityCompareCheckpoint', 'identityCsvRows', 'identityRead', 'identityVerify', 'budgetExposureBriefText', 'budgetExposureRead', 'budgetExposureText', 'mandateBriefText', 'mandateRead', 'missionArchive', 'missionBriefText', 'missionCommit', 'missionCreateIntervention', 'missionFreezeBrief', 'missionHandoffText', 'missionOpenCase', 'missionRead', 'missionScan', 'missionExecutionReceipt', 'missionCaptureAnalyze', 'missionCaptureMergeCandidates', 'missionCaptureRead', 'missionCaptureReceipt', 'missionCaptureBriefRead', 'missionCaptureBriefPreview', 'missionCaptureBriefCandidates', 'missionCaptureBriefBulkPreview', 'missionWithdraw', 'operatingModelAttentionCount', 'operatingModelBriefText', 'operatingModelCsvRows', 'operatingModelNorms', 'operatingModelRead', 'operatingModelWorkTypes', 'previewMandate', 'routingAnalyze', 'routingAttentionCount', 'routingBriefText', 'routingCalibration', 'routingCsvRows', 'routingRead', 'saveMissionPreview', 'sealArchiveStatus', 'sealArchiveVerify', 'sealBriefText', 'sealRead', 'sealVerify', 'seatBriefText', 'seatRead', 'setActiveSeat', 'strategyCycleBriefText', 'strategyCycleCsvRows', 'strategyCycleRead', 'valueStreamBriefText', 'valueStreamCsvRows', 'valueStreamRead', 'valueStreamReallocationPreview',
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
// ADR-0191: the priority-ballot read surface. Registered for the same reason as
// every module above — a read absent from SAFE_READS is unreadable under
// enforcement while its writes are still gated.
'matrixPriorityReport', 'matrixPriorityBriefText', 'matrixPriorityCsvRows', 'matrixPriorityAttentionCount',
// ADR-0193: the goal-commitment read surface. Registered for the same reason as
// every module above — a read absent from SAFE_READS is unreadable under
// enforcement while its writes are still gated, which would hide a commitment
// conflict from exactly the seat that has to settle it.
'matrixGoalCommitmentReport', 'matrixGoalCommitmentBriefText', 'matrixGoalCommitmentCsvRows', 'matrixGoalCommitmentAttentionCount',
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
// ADR-0196: the reassignment reader and privacy-scoped candidate list are
// seat-checked in their action factory. The aggregate CSV is produced from the
// same reader and never exposes its raw transfer acts.
'workReassignmentReport', 'workReassignmentCandidates',
// ADR-0182: seat-scoped inside `buildPausePermits` — the altitude disclosure
// ladder decides whether switch keys, authorisers and reason text are returned,
// or counts only.
'pausePermitReport',
// ADR-0177: the chargeback statement is scoped INSIDE the read model — a seat
// reads the line accounts it reaches and every piece that names one of them;
// the rest is counted as withheld and names outside the seat are withheld.
'transferPriceReport',
// ADR-0194: the posting ledger is scoped INSIDE the read model — accounts and
// envelope names outside the seat are counted and withheld; posting documents,
// totals and audit verdicts are workspace facts and are returned as counts.
'chargebackPostingReport',
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
'skillCoverageReport',
'stationCoverageReport', 'stationCoverageCsvRows', 'stationCoverageBriefText',
// ADR-0206: the goal-attainment register is scoped INSIDE the read model — every
// seat reads the aggregate figures, while span names and sub-floor cells are
// projected at the seat's disclosure level. A withheld figure is a printed
// reason, never a zero.
'matrixGoalAttainmentReport', 'matrixGoalAttainmentBriefText', 'matrixGoalAttainmentCsvRows', 'matrixGoalAttainmentAttentionCount',
// ADR-0208: the investment case register is scoped INSIDE the read model — a
// seat receives the cases whose benefit owner sits in its reporting tree or on a
// line it holds, and everything else as a count. A refused figure is a printed
// reason, never a zero.
'investmentCaseReport', 'investmentCaseBriefText', 'investmentCaseCsvRows', 'investmentCaseAttentionCount',
// ADR-0209: the work/rest ledger is scoped INSIDE the read model — a seat
// receives the people in its reporting tree or on a line it holds; everyone else
// is a count. Shift notes are disclosed only to a seat that holds the shift's line.
'workRestReport', 'workRestBriefText', 'workRestCsvRows', 'workRestAttentionCount',
// ADR-0226: the night-work reading is scoped INSIDE the read model — a seat
// receives the people in its reporting tree or on a line it holds; everyone
// else is a count. Breaks are disclosed only to a seat that holds the line.
'workNightReport', 'workNightBriefText', 'workNightCsvRows', 'workNightAttentionCount',
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
  // ADR-0240: declaring an incident names response-line leads and a successor
  // commander reachable only through a declared Matrix line; the action re-checks
  // every one of them against the live graph before it writes anything.
  'incidentDeclare', 'incidentAssignLine', 'incidentTransferCommand',
  // ADR-0190: declaring a routine may name a person the declaring seat reaches
  // only through a dotted line; the action re-checks the line holder itself.
  'standardWorkDeclareRoutine',
  'skillRecordQualification',
  // ADR-0171: an additional-line holder records/re-routes intake on that very
  // line; the matrix action re-proves the party and the capacity ceiling.
  'matrixRecordIntake', 'matrixRerouteIntake',
  // ADR-0196: a transfer names a receiving person who may be visible to the
  // source only through a declared matrix line. Each action independently
  // proves source/receiving-line holder authority before it writes an act.
  'workReassignmentPropose', 'workReassignmentAccept',
  'workReassignmentDecline', 'workReassignmentWithdraw',
  // ADR-0218: opening a review names the person whose conduct it concerns, who may
  // be reached only through a declared line. The action re-proves the deciding line.
  'justCultureOpen',
  // ADR-0219: declaring the retention of a risk names a case whose owner may be
  // reachable only through a declared line, and withdrawing one names a
  // declaration. Each action independently re-proves the owner's reach and
  // refuses the owner themselves.
  'riskAppetiteDeclareRisk', 'riskAppetiteWithdrawRisk',
  // ADR-0220: every variable-pay write names a funding line (and an award names a
  // person) that the acting seat may reach only through the tree or a declared
  // line. Each action independently re-proves the hold, refuses the owner's own
  // number, and refuses an award to the awarder.
  'incentiveDeclarePlan', 'incentiveRetirePlan', 'incentiveAddMeasure', 'incentiveRecordReading',
  'incentiveRecordAward', 'incentiveRecordRecovery',
  // ADR-0221: each duty-without-means write proves carrier, demanding-line,
  // controlling-line, or strict joint-apex standing against the live matrix.
  'dutyMeansDeclareDuty', 'dutyMeansRetireDuty', 'dutyMeansAddRequirement',
  'dutyMeansRecordAct', 'dutyMeansGovernGap',
  'portfolioDeclareUnit', 'portfolioRetireUnit', 'portfolioRecordReview',
  'portfolioRecordVerdict', 'portfolioRecordMilestone', 'portfolioCompleteExit',
  // ADR-0208: a declared (or previewed) case names a benefit owner the declaring
  // seat may reach only through a declared Matrix line; the action re-checks the
  // tree and the line itself before it reads or records anything.
  'investmentCaseDeclare', 'investmentCasePreview',
  // ADR-0211: a relation between two cases is declared across the matrix — the
  // seat may hold one side through a declared line — so the action re-proves that
  // it holds BOTH owners before it writes a constraint on the fund.
  'capitalRationingDeclareRelation', 'capitalRationingRetireRelation', 'capitalRationingCandidates',
  // ADR-0213: a standard names a budget holder the declaring seat may hold only
  // through a declared Matrix line. The action re-proves that hold — and that
  // the holder is not the seat itself — before it writes.
  'flexBudgetDeclarePlan',
  // ADR-0214: a value leg is claimed for a person the seat may hold only through
  // a declared Matrix line — the exact case a matrix exists for. The action
  // re-proves the hold before it writes a claim about somebody's promise.
  'valueBridgeClaimLever', 'valueBridgeWithdrawClaim',
  // ADR-0209: a shift (declared or previewed) and a coverage attestation name a
  // person the acting seat may hold only through a declared Matrix line — which
  // is exactly the case the ledger exists for. The action re-proves that the
  // seat holds the very line the shift is worked for.
  'workRestDeclareShift', 'workRestPreviewShift', 'workRestAttestCoverage',
  // ADR-0226: a break names a person and a shift of a line the acting seat may
  // hold only through a declared Matrix line. The action re-proves that the
  // seat holds the very line the shift is worked for.
  'workNightRecordBreak', 'workNightPreviewBreak',
  // ADR-0223: declaring the outgoing brief names an incoming operator who may
  // be reachable only through a declared Matrix line (night and weekend cover
  // on a shared-services line). The action re-proves both the reach and the
  // roster band before it records anything.
  'shiftHandoverDeclare',
  // ADR-0227: an acceptance names an owner who may be reachable only through a
  // declared Matrix line. The action re-proves that reach before it records a
  // decision that names them.
  'suggestionTriage',
  // ADR-0224: the affected work lead and operators may be reachable only on a
  // declared Matrix line; the action re-proves every person and snapshots every
  // right-capable joint apex before the stop is accepted.
  'workStopDeclare',
  // ADR-0225: the outgoing manager, successor and governor may be reachable
  // only on declared Matrix lines; the action re-proves every person and the
  // frozen joint seat before a transition is accepted.
  'mgrHandoverDeclare',
  // ADR-0233: a probation ask is addressed to the holder of the joiner's
  // declared Matrix line, and that holder's evidence is recorded on the very
  // line the ask was made on; either party may be reachable only through the
  // declared line. Both actions re-prove the joiner, the line and the holder
  // before they write.
  'probationGateAsk', 'probationGateSubmit',
  // ADR-0232: an assurance finding is the matrix case in its purest form. The
  // accountable holders it names (assign), the owner an assignment names
  // (assign), the owner whose fix a verifier tests (verify) and the finding an
  // acceptance closes (accept) may each be reachable only through a declared
  // Matrix line. Every one of those actions re-proves the reach, the line and
  // the independence rule itself before it writes; the gate only stops a seat
  // from naming somebody it cannot reach at all.
  'assuranceFindingDeclare', 'assuranceFindingAssign', 'assuranceFindingAssert',
  'assuranceFindingVerify', 'assuranceFindingAccept',
  // ADR-0233: a probation gate's declared lines may be reachable only through
  // declared Matrix lines. The ask names a line holder and the submit comes
  // from that holder — both re-prove the line, the joiner and the holder's own
  // identity before anything is written; the gate only stops a seat from
  // naming somebody it cannot reach at all.
  'probationGateAsk', 'probationGateSubmit',
  // ADR-0234: an undertaking names holders, testers and a counterparty, and
  // every one of those people may be reachable only through a declared Matrix
  // line. Each action re-proves the holder, the line and the independence rule
  // itself before it writes; the gate only stops a seat from naming somebody it
  // cannot reach at all.
  'undertakingDeclare', 'undertakingAssign', 'undertakingDeliver',
  'undertakingVerify', 'undertakingReportClosure', 'undertakingNotify', 'undertakingExtend',
  // ADR-0235: an information request names producers, reviewers and a receiving
  // seat, and in a matrix each may be reachable only through a declared line — the
  // production usually lands on operations, legal, finance and IT under different
  // managers. Every action re-proves the line, the producer and the independence
  // rule itself before it writes; the gate only stops a seat from naming somebody
  // it cannot reach at all.
  'informationRequestReceive', 'informationRequestAssign', 'informationRequestProduce',
  'informationRequestReview', 'informationRequestRelease', 'informationRequestRespond',
  'informationRequestExtend', 'informationRequestRestateClock',
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
