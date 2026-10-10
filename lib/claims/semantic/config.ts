/**
 * Thresholds for the semantic matcher. Chosen on the development split of the labelled set
 * (npm run eval:matcher -- --tune) and frozen here. The test split is never used to choose them.
 */

export interface SemanticConfig {
  /** Candidates below this similarity are not returned at all. */
  retrieveFloor: number
  /** The best passage must reach this to count as support for the clause. */
  supportThreshold: number
  /** The clause must also stand out from the item's scores against all clauses by this many standard deviations. A flat spread means nothing really matches. */
  minPeak: number
  /** An item this close to a clause's exception or condition makes the match conditional. */
  conditionThreshold: number
  /** An exclusion or coverage match must beat the other kind by this much, or the item is a conflict. */
  margin: number
  topK: number
  /** Subtract the mean of the clause passages before comparing. Removes the shared direction all medical text has. */
  center: boolean
}

export const DEFAULT_SEMANTIC_CONFIG: SemanticConfig = {
  retrieveFloor: 0,
  supportThreshold: 0.1,
  conditionThreshold: 0.3,
  margin: 0.06,
  topK: 5,
  center: true,
  minPeak: 2,
}
