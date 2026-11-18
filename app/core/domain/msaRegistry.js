/**
 * app/core/domain/msaRegistry.js — the closed vocabulary of the Modern Slavery
 * & Supply-Chain Due-Diligence Statement Register (ADR-0260, Schema v212,
 * `#/modern-slavery`, `RULE-MSA-01`, CSV scope #196).
 *
 * THE DUTY, IN A CHIEF PROCUREMENT OFFICER'S WORDS. *"Our board approved a
 * modern slavery statement in June. Ask me what it rests on — which suppliers we
 * actually assessed, at which tier, on what evidence, what we found, what we
 * fixed, and whether the statement that went on the website says only what the
 * record supports — and nobody can answer. The statement is a statutory
 * document: a boilerplate claim of 'no instances identified' sitting over a
 * supply chain nobody assessed is the exact failure the regime exists to
 * prevent, and it is published in our name."*
 *
 * No surface in this workspace could answer any part of that. The sourcing
 * register (ADR-0229) prices a make/buy/partner boundary and rates no
 * supplier's labour practices; the authorisations register (ADR-0247) holds
 * operating licences; the statutory undertakings register (ADR-0234) holds
 * promises made outward. None knows which suppliers were assessed for forced
 * labour risk, what an assessment found, whether an identified instance was
 * remediated, or whether the six content elements of a published statement are
 * backed by anything at all.
 *
 * THE GAP CLAIM, QUOTED FROM THE RECORD RATHER THAN ASSERTED. A word-boundary
 * census of `app/core/domain`, `app/views`, `app/main.js`, `app/actions.js`,
 * `docs/adr/` and `ROADMAP.md` returned ZERO files for `modern slavery`,
 * `slavery statement`, `forced labour`, `supply chain due diligence` and
 * `s.54` — nothing in the 274 ADRs, nothing in the roadmap. The only adjacent
 * registers are the ones named above, each of which this ADR rejects as the
 * positive claim. Wider absence **[UNVERIFIED]**.
 *
 * THE FRAMEWORK THIS REGISTER APPLIES. The statutory content shape every modern
 * slavery reporting regime shares — UK Modern Slavery Act 2015 s.54(5), the
 * Australian Modern Slavery Act 2018 s.16, Canada's Fighting Against Forced
 * Labour and Child Labour in Supply Chains Act, the California Transparency in
 * Supply Chains Act, and the EU CSDDD due-diligence duty — plus the risk-based
 * due-diligence discipline of the OECD Due Diligence Guidance for Responsible
 * Business Conduct and the ILO indicators of forced labour:
 *
 *   - **THE PUBLICATION DEADLINE IS DECLARED, NEVER COMPUTED.** The record
 *     holds no corporate calendar and no regime's statutory instrument text. A
 *     deadline the seat cannot cite to a written basis is not a deadline; the
 *     register prints `deadline-undeclared` and files an ask rather than
 *     inventing "financial year end plus six months".
 *   - **THE STATEMENT IS SIX CONTENT ELEMENTS, EACH EVIDENCED OR NAMED AS
 *     MISSING.** Structure and supply chains, policies, due diligence, risk
 *     assessment and management, effectiveness measurement, training. Each
 *     element is derived from the record beneath it and prints `evidenced`
 *     with its count or `not-evidenced` with its reason. A statement is never
 *     "complete" because somebody ticked a box.
 *   - **THE CLAIM IS WHAT THE EVIDENCE SUPPORTS.** With no assessment on the
 *     record the register REFUSES to print any claim about instances —
 *     "no instances identified" is a finding, and a finding needs evidence.
 *     Risks without instances and instances themselves are different claims,
 *     printed apart.
 *   - **AN IDENTIFIED INSTANCE OWES A REMEDIATION ACT.** A finding of kind
 *     `instance` with no complete remediation act on the record is
 *     `remediation-open` and stays counted until the act is evidenced.
 *   - **THE SUPPLIER POPULATION IS DECLARED, AND UNASSESSED SUPPLIERS ARE
 *     PRINTED.** A supplier on the population with no assessment in the cycle
 *     is `unassessed`, never silently absent from the statement's coverage.
 *
 * WHAT THIS REGISTER ADDS THAT A SPREADSHEET CANNOT. A spreadsheet holds a
 * statement somebody drafted and a status somebody updated. This register
 * derives statement readiness from the dated evidence beneath it, refuses a
 * claim its record cannot support, prints the six elements as six separate
 * evidenced-or-missing facts, keeps identified instances open until remediation
 * is evidenced, and files a dated ask to the joint seat above every responsible
 * line when a statutory clock runs down unanswered. Five facts it expresses
 * that a typed row cannot:
 *
 *   - **A statement with no declared deadline is `deadline-undeclared`, never
 *     "no deadline".** The absence of the clock is the most dangerous state in
 *     the register, and it is printed as one.
 *   - **A deadline that passed with nothing published is `overdue-unpublished`.**
 *     The statutory failure has happened, and the register says so.
 *   - **Content evidence is per element.** Six elements, six verdicts, each
 *     with its own reason — never one reassuring word for the whole statement.
 *   - **The claim is derived, not typed.** "No instances identified" prints
 *     only when assessments on the record support it; with nothing assessed
 *     the claim is REFUSED, with its reason.
 *   - **An instance is never closed by a plan.** A `planned` remediation act
 *     is not a complete one; the finding stays `remediation-open` until an act
 *     is recorded complete with its evidence reference.
 *
 * THE SIX THINGS THAT MUST NEVER HAPPEN, AND ARE PREVENTED BY CONSTRUCTION:
 *   - **No stored state, no stored element verdict, no stored claim.** Every
 *     verdict is derived on read from the statement, its acts and the supplier
 *     evidence.
 *   - **No computed deadline.** No calendar, no "six months after year end".
 *     A deadline without a written basis is refused at the door.
 *   - **No published claim without evidence.** The register refuses a claim
 *     its assessments do not support and prints the refusal.
 *   - **No remediation closed without its evidence reference.** A complete act
 *     names the document that proves it.
 *   - **No supplier rated on a person-shaped scale and no person scored.** A
 *     supplier assessment reports the assessment's outcome; no handler, buyer
 *     or line is rated, ranked or named as a cause.
 *   - **No statement text authored here.** The register derives readiness and
 *     the supported claim; drafting the document is a human act.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A statement and a supplier each name one
 * to four responsible hands across reporting lines (a procurement lead, a
 * category manager, a compliance officer, a sustainability lead). The reader
 * resolves every ACTIVE line that holds each of them through the ONE matrix
 * engine, counts a person ONCE, and derives the joint apex over every line as
 * the seat whose authority answers for the statement. Where the record names
 * several hands the duty sits above all of them and the screen says so; it
 * never silently promotes one hand to "owner of the programme". Where a hand is
 * off the graph the row is printed as an orphan rather than dropped, because
 * deleting it would erase a live due-diligence duty from the record.
 */

export const MSA_ENGINE_VERSION = 'modern-slavery-2026.11-v1';
export const MSA_ADR = 'ADR-0260';
export const MSA_RULE_ID = 'RULE-MSA-01';
export const MSA_ROUTE = 'modern-slavery';
export const MSA_HREF = '#/modern-slavery';
export const MSA_CSV_SCOPE = 'modern-slavery-due-diligence';
export const MSA_MARKER_KIND = 'modern-slavery';
export const MSA_EVENT_PREFIX = 'msa.';

export const MSA_EVENTS = Object.freeze({
  STATEMENT_RECORDED: 'msa.statement.recorded',
  DEADLINE_DECLARED: 'msa.deadline.declared',
  APPROVAL_RECORDED: 'msa.approval.recorded',
  PUBLICATION_RECORDED: 'msa.publication.recorded',
  SUPPLIER_RECORDED: 'msa.supplier.recorded',
  ASSESSMENT_RECORDED: 'msa.assessment.recorded',
  FINDING_RECORDED: 'msa.finding.recorded',
  REMEDIATION_RECORDED: 'msa.remediation.recorded',
  TRAINING_RECORDED: 'msa.training.recorded',
  CONVENTIONS_SET: 'msa.conventions.set',
  SCANNED: 'msa.scan',
});

export const MSA_RIGHTS = Object.freeze({
  READ: 'read-modern-slavery',
  MANAGE: 'manage-modern-slavery',
});

export const MSA_SETTING_KEYS = Object.freeze({
  autoPropagate: 'msaAutoPropagate',
  privacyFloor: 'msaPrivacyFloor',
  warnHorizonDays: 'msaWarnHorizonDays',
  assessmentCycleDays: 'msaAssessmentCycleDays',
});

export const MSA_BOUNDS = Object.freeze({
  privacyFloor: { min: 2, max: 20 },
  warnHorizonDays: { min: 30, max: 730 },
  assessmentCycleDays: { min: 90, max: 3650 },
});

export const MSA_DEFAULTS = Object.freeze({
  privacyFloor: 3,
  warnHorizonDays: 90,
  assessmentCycleDays: 365,
});

export const MSA_LIMITS = Object.freeze({
  statements: 200,
  deadlines: 200,
  approvals: 200,
  publications: 200,
  suppliers: 2000,
  assessments: 8000,
  findings: 4000,
  remediations: 4000,
  training: 2000,
  markers: 400,
  /** A written basis: long enough to be a source. */
  textMin: 24,
  textMax: 600,
  /** A statement reference, an approval minute reference, an evidence reference. */
  shortMin: 3,
  shortMax: 120,
  /** An entity or supplier name: bounded and non-empty. */
  nameMin: 2,
  nameMax: 120,
  /** A country or category label as declared. Never a risk score. */
  labelMin: 2,
  labelMax: 60,
  /** An evidence document reference: long enough to identify a document. */
  instrumentMin: 8,
  idMax: 120,
  /** How many responsible hands one statement or supplier may name. */
  holdersMax: 4,
  /** Rule asking. */
  rowsShown: 80,
});

export const MSA_READ_MIN_RANK = 3;
/** A statement is a statutory, board-approved document: director / VP and above. */
export const MSA_MANAGE_MIN_RANK = 3;

/**
 * The reporting regimes. A PUBLISHED vocabulary, so the export can count by
 * regime without naming a statement. `other-declared` is a declared kind,
 * never a guess: the seat names the regime in the written basis.
 */
export const MSA_REGIMES = Object.freeze([
  Object.freeze({
    key: 'uk-msa-2015',
    label: 'UK Modern Slavery Act 2015',
    says: 'A statement under section 54 of the Modern Slavery Act 2015: approved by the board, signed by a director, published with a prominent link, and covering the six statutory content areas. The register records the declaration and the evidence; it holds no statutory instrument text and computes no deadline.',
  }),
  Object.freeze({
    key: 'au-msa-2018',
    label: 'Australian Modern Slavery Act 2018',
    says: 'A modern slavery statement under the Australian reporting requirement: covering the mandatory criteria, approved and published. The deadline is declared from the regime by the seat, never computed here.',
  }),
  Object.freeze({
    key: 'ca-fighting-forced-labour',
    label: 'Canada — Fighting Against Forced Labour',
    says: 'A report under Canada’s Fighting Against Forced Labour and Child Labour in Supply Chains Act, covering its mandatory information and attestation. The register records the evidence behind it.',
  }),
  Object.freeze({
    key: 'california-transparency',
    label: 'California Transparency in Supply Chains',
    says: 'A disclosure under the California Transparency in Supply Chains Act, covering verification, auditing, certification, accountability and training. Each of those is an evidence element in this register.',
  }),
  Object.freeze({
    key: 'eu-csddd',
    label: 'EU due-diligence directive',
    says: 'A due-diligence policy and statement under the EU corporate sustainability due-diligence regime: risk-based due diligence across the chain of activities, with a published policy and a complaint mechanism. The register records the due-diligence acts and their outcomes.',
  }),
  Object.freeze({
    key: 'other-declared',
    label: 'Other declared regime',
    says: 'A regime this vocabulary does not name. The seat declares the regime in the written basis; the register never guesses it.',
  }),
]);
export const MSA_REGIME_KEYS = Object.freeze(MSA_REGIMES.map((row) => row.key));
export const MSA_REGIME_BY_KEY = Object.freeze(Object.fromEntries(MSA_REGIMES.map((row) => [row.key, row])));

/**
 * The assessment kinds. Each is a different act of due diligence, and the
 * register never treats one as another: a signed contractual clause is not an
 * audit, and a desktop review is not a site visit.
 */
export const MSA_ASSESSMENT_KINDS = Object.freeze([
  Object.freeze({ key: 'audit', label: 'Third-party audit', says: 'An audit against a named social or labour standard, carried out by an assessor the record names. The evidence reference is the audit report.' }),
  Object.freeze({ key: 'certification', label: 'Certification', says: 'A certification the supplier holds — the evidence reference is the certificate, and its validity is the certificate’s own, never assumed.' }),
  Object.freeze({ key: 'questionnaire', label: 'Due-diligence questionnaire', says: 'A completed self-assessment questionnaire with supporting documents. A questionnaire is evidence of what the supplier says; the register records it as such.' }),
  Object.freeze({ key: 'site-visit', label: 'Site visit', says: 'A visited assessment at the supplier’s site — interviews, observation and records. The evidence reference is the visit report.' }),
  Object.freeze({ key: 'self-assessment', label: 'Self-assessment', says: 'The supplier’s own assessment against a declared framework. The weakest act in the vocabulary, and recorded as itself, never upgraded.' }),
  Object.freeze({ key: 'desktop-review', label: 'Desktop review', says: 'A documented review of public and supplied material with no site contact. A review is a real act and a real limit.' }),
  Object.freeze({ key: 'contractual-clause', label: 'Contractual clause', says: 'A signed labour-standards clause or code acknowledgement. A clause is a safeguard, not a test, and the register never counts it as proof that the standard is met.' }),
]);
export const MSA_ASSESSMENT_KIND_KEYS = Object.freeze(MSA_ASSESSMENT_KINDS.map((row) => row.key));
export const MSA_ASSESSMENT_KIND_BY_KEY = Object.freeze(Object.fromEntries(MSA_ASSESSMENT_KINDS.map((row) => [row.key, row])));

/**
 * The assessment outcomes. A closed vocabulary: an assessment ends in one of
 * these, and the register never infers an outcome from a kind or a tier.
 */
export const MSA_ASSESSMENT_OUTCOMES = Object.freeze([
  Object.freeze({ key: 'no-issues', label: 'No issues identified', says: 'The assessment identified no forced-labour indicator on the evidence it examined. This is the assessment’s finding on its own scope — never a guarantee about the supplier.' }),
  Object.freeze({ key: 'issues-found', label: 'Issues identified', says: 'The assessment identified issue(s) requiring action. Each is recorded as a finding bound to this assessment.' }),
  Object.freeze({ key: 'unable-to-assess', label: 'Unable to assess', says: 'The assessment could not reach a verdict — insufficient records, access limits or scope. This is never recorded as “no issues”.' }),
  Object.freeze({ key: 'refused-access', label: 'Access refused', says: 'The supplier refused or obstructed the assessment. Refused access is itself a risk fact and is printed as one.' }),
]);
export const MSA_ASSESSMENT_OUTCOME_KEYS = Object.freeze(MSA_ASSESSMENT_OUTCOMES.map((row) => row.key));
export const MSA_ASSESSMENT_OUTCOME_BY_KEY = Object.freeze(Object.fromEntries(MSA_ASSESSMENT_OUTCOMES.map((row) => [row.key, row])));

/**
 * The finding kinds. `instance` is the statutory weight: an identified instance
 * of modern slavery or forced labour in the chain. A `risk` or a
 * `nonconformance` is not an instance, and the vocabulary refuses to blur them.
 */
export const MSA_FINDING_KINDS = Object.freeze([
  Object.freeze({ key: 'risk', label: 'Risk indicator', says: 'A condition that indicates forced-labour risk — recruitment fees, document retention, unsuitable accommodation, restricted movement. An indicator is not an instance, and is never printed as one.' }),
  Object.freeze({ key: 'nonconformance', label: 'Nonconformance', says: 'A breach of a declared labour standard or contractual clause — a standard not met, on evidence. Still not an identified instance.' }),
  Object.freeze({ key: 'instance', label: 'Identified instance', says: 'An identified instance of modern slavery or forced labour affecting a worker in the chain. This is the finding the statement must speak to, and the one that owes a remediation act.' }),
]);
export const MSA_FINDING_KIND_KEYS = Object.freeze(MSA_FINDING_KINDS.map((row) => row.key));
export const MSA_FINDING_KIND_BY_KEY = Object.freeze(Object.fromEntries(MSA_FINDING_KINDS.map((row) => [row.key, row])));

/** The severity of a finding, as declared by the assessing hand. Never computed. */
export const MSA_SEVERITIES = Object.freeze([
  Object.freeze({ key: 'minor', label: 'Minor', says: 'A limited-scope issue with a direct path to remedy.' }),
  Object.freeze({ key: 'material', label: 'Material', says: 'An issue affecting workers or systemic controls, requiring a dated remediation act.' }),
  Object.freeze({ key: 'severe', label: 'Severe', says: 'An issue affecting workers at serious risk, requiring immediate remediation and executive visibility.' }),
]);
export const MSA_SEVERITY_KEYS = Object.freeze(MSA_SEVERITIES.map((row) => row.key));
export const MSA_SEVERITY_BY_KEY = Object.freeze(Object.fromEntries(MSA_SEVERITIES.map((row) => [row.key, row])));

/**
 * The remediation kinds. Each is a different act owed to workers or the chain,
 * and `complete` is only ever recorded against one with its evidence reference.
 */
export const MSA_REMEDIATION_KINDS = Object.freeze([
  Object.freeze({ key: 'victim-remediation', label: 'Worker remediation', says: 'Direct remediation for the affected worker(s) — repayment, restitution, restored terms, support. The outcome owed to the person, not to the contract.' }),
  Object.freeze({ key: 'fees-repaid', label: 'Fees repaid', says: 'Recruitment or placement fees repaid to workers, with the payment evidence.' }),
  Object.freeze({ key: 'repatriation', label: 'Repatriation / transfer', says: 'Safe return home or transfer to a lawful employer, with the evidence that it happened.' }),
  Object.freeze({ key: 'contract-terminated', label: 'Relationship terminated', says: 'The supplier relationship ended for the finding. Termination protects the future chain; it does not by itself remedy the worker, and the register prints both facts.' }),
  Object.freeze({ key: 'monitoring-plan', label: 'Monitoring plan', says: 'A dated monitoring or re-audit plan with a named review day. A plan is not a remedy; it is a promise of one.' }),
  Object.freeze({ key: 'policy-change', label: 'Policy / control change', says: 'A policy, contract term or control changed so the condition cannot recur.' }),
  Object.freeze({ key: 'other-declared', label: 'Other declared act', says: 'An act this vocabulary does not name, described in the written basis.' }),
]);
export const MSA_REMEDIATION_KIND_KEYS = Object.freeze(MSA_REMEDIATION_KINDS.map((row) => row.key));
export const MSA_REMEDIATION_KIND_BY_KEY = Object.freeze(Object.fromEntries(MSA_REMEDIATION_KINDS.map((row) => [row.key, row])));

/** The remediation statuses. `planned` is a promise; `complete` is an evidenced act. */
export const MSA_REMEDIATION_STATUSES = Object.freeze([
  Object.freeze({ key: 'planned', label: 'Planned', says: 'The remediation act is planned. The finding stays open: a plan is not a remedy.' }),
  Object.freeze({ key: 'complete', label: 'Complete', says: 'The remediation act is recorded complete, with the document reference that proves it. Only this closes the finding.' }),
]);
export const MSA_REMEDIATION_STATUS_KEYS = Object.freeze(MSA_REMEDIATION_STATUSES.map((row) => row.key));
export const MSA_REMEDIATION_STATUS_BY_KEY = Object.freeze(Object.fromEntries(MSA_REMEDIATION_STATUSES.map((row) => [row.key, row])));

/**
 * The statement states. Each is a DIFFERENT FACT and the headline never hides
 * the element matrix underneath. `tone` colours the badge; `says` is what the
 * screen prints.
 */
export const MSA_STATES = Object.freeze([
  Object.freeze({
    key: 'deadline-undeclared',
    label: 'Deadline undeclared',
    tone: 'bad',
    says: 'A statement is on the record and no publication deadline is declared. The register holds no corporate calendar and will not invent one: the clock that protects this organisation from a statutory failure is not on the record, and an ask is filed.',
  }),
  Object.freeze({
    key: 'overdue-unpublished',
    label: 'Overdue, unpublished',
    tone: 'bad',
    says: 'The declared publication deadline has passed and no publication is on the record. The statutory failure has happened; the register says so plainly.',
  }),
  Object.freeze({
    key: 'awaiting-publication',
    label: 'Awaiting publication',
    tone: 'warn',
    says: 'A deadline is declared and has not passed, and no publication is on the record yet. The days remaining are printed so the window is visible while it is still open.',
  }),
  Object.freeze({
    key: 'approved-unpublished',
    label: 'Approved, unpublished',
    tone: 'warn',
    says: 'The board approval is on the record and the statement is not yet published. Approval is a fact and publication is another; the register never treats one as the other.',
  }),
  Object.freeze({
    key: 'published-with-gaps',
    label: 'Published with gaps',
    tone: 'warn',
    says: 'The statement is published, but the record does not fully support it: at least one content element is unevidenced, the claim about instances was refused, or an identified finding has no complete remediation act. The gaps are printed underneath; they are never smoothed over by the headline.',
  }),
  Object.freeze({
    key: 'published',
    label: 'Published',
    tone: 'good',
    says: 'The statement is published, every content element is evidenced from the record, the claim about instances is derivable, and no finding is left without an evidenced remediation act.',
  }),
]);
export const MSA_STATE_KEYS = Object.freeze(MSA_STATES.map((row) => row.key));
export const MSA_STATE_BY_KEY = Object.freeze(Object.fromEntries(MSA_STATES.map((row) => [row.key, row])));
export const MSA_ATTENTION_STATE_KEYS = Object.freeze(['deadline-undeclared', 'overdue-unpublished', 'published-with-gaps']);

/**
 * The six content elements. Each is derived from the record beneath it and
 * printed as its own evidenced-or-missing fact — the shape every statutory
 * reporting regime shares, and the shape a single tick-box destroys.
 */
export const MSA_ELEMENTS = Object.freeze([
  Object.freeze({
    key: 'structure',
    label: 'Business & supply chains',
    says: 'The parts of the business and the supply chains the statement describes. Evidenced by a declared structure reference AND a supplier population on the record; a population with no description, or a description with no population, is not evidenced.',
  }),
  Object.freeze({
    key: 'policies',
    label: 'Policies',
    says: 'The anti-slavery policy or instrument the statement refers to. Evidenced by the declared policy reference; a statement that claims policies without naming one is not evidenced.',
  }),
  Object.freeze({
    key: 'due-diligence',
    label: 'Due diligence',
    says: 'The due diligence actually undertaken in the supply chains. Evidenced by assessments on the record bound to this statement — each with its kind, its outcome and its evidence reference. No assessment, no evidence.',
  }),
  Object.freeze({
    key: 'risk-management',
    label: 'Risk assessment & management',
    says: 'The risks assessed and how they are managed. Evidenced when every assessment with an adverse outcome carries its findings and every finding has an evidenced remediation act. Open remediation or an issues-found assessment with no finding printed underneath means this element is not evidenced.',
  }),
  Object.freeze({
    key: 'effectiveness',
    label: 'Effectiveness measurement',
    says: 'How the organisation measures the effectiveness of its efforts — the KPIs or review mechanism. Evidenced by the declared effectiveness reference; a statement that promises measurement without naming one is not evidenced.',
  }),
  Object.freeze({
    key: 'training',
    label: 'Training',
    says: 'The training about modern slavery given to staff. Evidenced by dated training records on the statement — the population covered, the delivery reference and the evidence reference.',
  }),
]);
export const MSA_ELEMENT_KEYS = Object.freeze(MSA_ELEMENTS.map((row) => row.key));
export const MSA_ELEMENT_BY_KEY = Object.freeze(Object.fromEntries(MSA_ELEMENTS.map((row) => [row.key, row])));

/**
 * The claims the record can support about instances. The register derives the
 * claim; nobody types it. `refused` is a first-class verdict: with no
 * assessment on the record, NO claim about instances is derivable, and
 * "no instances identified" is exactly the sentence that must never print.
 */
export const MSA_CLAIMS = Object.freeze([
  Object.freeze({
    key: 'refused',
    label: 'Claim refused',
    says: 'No assessment is on the record for this statement, so no claim about identified instances is derivable. "No instances identified" is a finding, and a finding needs evidence. The register refuses the claim and prints the refusal.',
  }),
  Object.freeze({
    key: 'none-identified',
    label: 'No issues identified',
    says: 'Assessments are on the record and none identified a risk indicator, a nonconformance or an instance. This is what the evidence supports — the assessments’ own scope, never a guarantee about the chain.',
  }),
  Object.freeze({
    key: 'risks-only',
    label: 'Risks identified, no instances',
    says: 'Assessments are on the record and identified risk indicator(s) or nonconformance(s), but no identified instance. The statement may say "no instances identified" only while printing the risks beside that sentence.',
  }),
  Object.freeze({
    key: 'instances-identified',
    label: 'Instances identified',
    says: 'The record carries identified instance(s) of modern slavery or forced labour in the chain. Any statement claiming "no instances identified" contradicts its own register.',
  }),
]);
export const MSA_CLAIM_KEYS = Object.freeze(MSA_CLAIMS.map((row) => row.key));
export const MSA_CLAIM_BY_KEY = Object.freeze(Object.fromEntries(MSA_CLAIMS.map((row) => [row.key, row])));

/** Refusals printed at the door. Each is a control, not a message. */
export const MSA_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  noReach: 'That person is not on a line this seat holds. One line does not declare supply-chain due diligence for another line.',
});

export const MSA_SECTION_TITLES = Object.freeze({
  statements: 'Statements',
  supply: 'Supply chain',
  findings: 'Findings & remediation',
  training: 'Training',
  method: 'Method',
});

export const MSA_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'statements_n', 'deadline_undeclared_n', 'overdue_unpublished_n',
  'awaiting_publication_n', 'approved_unpublished_n', 'published_with_gaps_n', 'published_n',
  'suppliers_n', 'assessed_n', 'unassessed_n', 'assessments_n', 'findings_n', 'instances_n',
  'remediations_n', 'remediation_open_n', 'training_n', 'elements_evidenced_n',
  'elements_missing_n', 'claim_key', 'holders_n', 'lines_n', 'privacy_floor', 'complete', 'blank_reason',
]);

/**
 * CSV #196 (ADR-0260, Schema v212). IDENTITY-FREE BY CONSTRUCTION — a due
 * diligence schedule names suppliers, countries, findings about workers and
 * remediation acts. One summary row, one row per printed statement state, and
 * one row per content element carrying its evidenced/missing counts. No
 * statement reference, entity, supplier, country, finding, remediation,
 * reference, person or day crosses the boundary. A per-state count below the
 * declared privacy floor exports BLANK with its reason, never as a small
 * number. The derived claim key is a PUBLISHED vocabulary, so a reader can see
 * what the evidence supported without attaching it to a statement.
 */
export const MSA_CSV_DESCRIPTOR = Object.freeze({
  key: MSA_CSV_SCOPE,
  label: 'Modern slavery due diligence (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'modern-slavery-due-diligence',
  description: 'One summary row, one row per printed statement state and one row per content element. Counts of statements, suppliers, assessed and unassessed suppliers, assessments, findings, identified instances, remediation acts, remediation-open findings, training records, and the evidenced/missing split of the six content elements, with the derived claim vocabulary printed as a key. No statement reference, entity, supplier, country, finding, remediation, reference, person or day is exported. A per-state count below the declared privacy floor is withheld BLANK with its reason, never printed as a small number.',
});

/** The published framework basis, printed on the method panel. Never a claim of parity. */
export const MSA_METHOD = Object.freeze({
  engine: MSA_ENGINE_VERSION,
  adr: MSA_ADR,
  frameworks: Object.freeze([
    'The statutory content shape every modern slavery reporting regime shares — UK Modern Slavery Act 2015 s.54(5), Australian Modern Slavery Act 2018 s.16, Canada’s Fighting Against Forced Labour and Child Labour in Supply Chains Act, the California Transparency in Supply Chains Act, and the EU due-diligence directive. The register binds the six content elements to the dated evidence beneath each and derives each element’s verdict on read.',
    'The publication deadline is declared, never computed. The record holds no corporate calendar and no statutory instrument text, so a deadline without a written basis is refused at the door and the statement prints `deadline-undeclared` rather than a date nobody cited.',
    'Risk-based due diligence per the OECD Due Diligence Guidance: a supplier population is declared, assessments are dated acts with declared kinds and outcomes, and an outcome is never upgraded by the kind that produced it. The ILO indicators of forced labour shape the finding vocabulary; a risk indicator is never printed as an instance.',
    'The claim about instances is derived, never typed. With no assessment on the record the claim is REFUSED: “no instances identified” is a finding and a finding needs evidence. Risks without instances and instances themselves are different claims, printed apart.',
    'An identified instance owes a remediation act. A planned act is a promise; only a complete act with its evidence reference closes the finding, and the open count is printed until then.',
    'Matrix addressing (ADR-0140/0141): a statement and a supplier name responsible hands across reporting lines, and the authority required to answer for the statement is the joint apex above every line — never a programme “owner” the record selected.',
    'Bulletproof reliability: the register proves what the record supports and refuses the rest with a printed reason. A deadline with no basis is refused, a claim with no evidence is refused, and a complete remediation with no document reference is refused.',
  ]),
  printed: Object.freeze([
    'Each statement: the entity, the financial year label and end day as declared, the regime, the declared structure, policy and effectiveness references, and the responsible hands across every reporting line.',
    'The declared publication deadline and its written basis, the days remaining or the days overdue, and whether the deadline sits inside the declared warning horizon.',
    'The six content elements as six evidenced-or-missing verdicts, each with its count and its reason.',
    'The derived claim about instances — derived, never typed — with the assessment, finding, instance and open-remediation counts behind it.',
    'Every supplier with its declared tier and country, its derived assessment state for this statement (assessed, assessed-stale, unassessed), every assessment with its kind, outcome and evidence reference, every finding with its kind and severity, and every remediation act with its status and evidence reference.',
    'The board approval and the publication act, each as its own dated fact.',
    'The joint seat above every line holding a responsible hand.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No stored state, no stored element verdict and no stored claim. Every verdict is re-derived on read.',
    'No computed deadline and no corporate calendar. A deadline without a written basis is refused at the door.',
    'No statement text is authored here. The register derives readiness and the supported claim; drafting the document is a human act.',
    'No claim about instances without an assessment to support it. The refusal is printed, never papered over.',
    'No remediation closed without its evidence reference, and no planned act counted as complete.',
    'No supplier scored on a numeric risk scale, and no buyer, handler or line rated, ranked or named as a cause.',
  ]),
});
