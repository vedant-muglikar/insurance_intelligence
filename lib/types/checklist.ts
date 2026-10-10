// ─── Hospitalization Preparation Checklist ──────────────────────────────────

export type ChecklistStage = 'before' | 'during' | 'claim'
export type ChecklistPriority = 'high' | 'medium' | 'low'
export type ChecklistTaskStatus = 'pending' | 'completed'

/**
 * How strongly a task is grounded in the policy:
 *  - policy_requirement: the cited clause itself uses obligation wording (must/shall/required…)
 *  - policy_term:        derived from a clause (limit, waiting period, exclusion) but not stated as an obligation
 *  - recommendation:     general good practice, not taken from the policy wording
 */
export type RequirementLevel = 'policy_requirement' | 'policy_term' | 'recommendation'

export type RiskAlertType =
  | 'pre_authorization'
  | 'waiting_period'
  | 'room_rent'
  | 'exclusion_or_limit'
  | 'missing_documents'
  | 'claim_requirement'
  | 'verification'

export interface ClauseReference {
  ruleId?: string
  page: number | null
  section?: string
  quote: string
  /** Evidence quote was found on the cited page */
  verified: boolean
}

/** Generated content of a task — derived only from extracted policy data and the user's scenario */
export interface ChecklistTaskDefinition {
  key: string
  stage: ChecklistStage
  title: string
  explanation: string
  whyItMatters: string
  recommendedAction: string
  priority: ChecklistPriority
  requirementLevel: RequirementLevel
  references: ClauseReference[]
  /** Set when the supporting clause is low-confidence, unverified or unreadable */
  needsVerification: boolean
  verificationNote?: string
  /** Task expects a supporting document to be attached */
  documentType?: string
  /** Suggested date computed from a policy deadline + scenario dates (YYYY-MM-DD) */
  suggestedDueDate?: string
  dueDateBasis?: string
  /** Pending tasks of this type surface as smart risk alerts */
  alertType?: RiskAlertType
  /** Task was personalised from the treatment scenario */
  scenarioSpecific?: boolean
}

export interface ChecklistAttachment {
  id: string
  taskKey: string
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export interface ChecklistTask extends ChecklistTaskDefinition {
  status: ChecklistTaskStatus
  /** User-chosen due date (overrides suggestedDueDate) */
  dueDate?: string | null
  completedAt?: string | null
  /** No longer produced by the current policy/scenario, kept because it has progress or files */
  stale?: boolean
  attachments: ChecklistAttachment[]
}

/** Subset of the Preflight Estimator scenario used for personalisation */
export interface ChecklistScenario {
  treatment: string
  age?: number
  roomType?: string
  stayDurationDays?: number
  policyStartDate?: string
  proposedAdmissionDate?: string
  isNetworkHospital?: boolean
  declaredPED?: string[]
}

/** Subset of the existing preflight CoverageResult the checklist consumes (never recomputes) */
export interface ChecklistPreflightSignals {
  status?: 'eligible' | 'conditional' | 'not_eligible' | 'cannot_determine'
  waitingPeriodDetails?: {
    requiredMonths: number
    completionDate?: string
    isActive: boolean
    pageNumber?: number | null
    ruleEvidence?: string
  }
  ledger?: Array<{
    ruleId?: string
    ruleName: string
    ruleType: string
    deductionAmount: number
    impact: string
    evidence?: { page: number | null; section?: string; quote: string }
  }>
}

export interface ChecklistMeta {
  id: string
  policyKey: string
  insurer?: string | null
  planName?: string | null
  fileName?: string | null
  scenario?: ChecklistScenario | null
  createdAt: string
  updatedAt: string
}

export interface ChecklistState {
  checklist: ChecklistMeta
  tasks: ChecklistTask[]
}

export interface RiskAlert {
  id: string
  type: RiskAlertType
  severity: 'high' | 'medium'
  title: string
  risk: string
  nextAction: string
  taskKeys: string[]
  references: ClauseReference[]
  requirementLevel: RequirementLevel
}
