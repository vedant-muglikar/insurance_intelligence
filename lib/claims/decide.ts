/**
 * What the matches for one bill item add up to. The adjudicator and the matcher evaluation both call this, so the
 * evaluation scores the same decision the ledger acts on.
 *
 * Rules, in order:
 *  - matches a matcher marked unsupported are ignored;
 *  - an exclusion and a coverage clause together: a clearly stronger one (by the matcher's margin) wins, otherwise the item is a conflict;
 *  - a clause whose exception or condition the item touches is conditional, and cannot decide on its own;
 *  - anything that cannot be decided goes to a reviewer. Nothing is guessed.
 */

import type { ClauseMatch } from './types'

export type Outcome = 'exclude' | 'cover' | 'review' | 'none'

export interface Decision {
  outcome: Outcome
  /** Why the item needs a reviewer, when outcome is review. */
  reviewReason: 'conflict' | 'conditional' | null
  exclusion?: ClauseMatch
  coverage?: ClauseMatch
  /** True when any usable clause about exclusion, limit, room or coverage matched. */
  anyClause: boolean
}

export const DEFAULT_CONFLICT_MARGIN = 2

export function decideOutcome(matches: ClauseMatch[], margin = DEFAULT_CONFLICT_MARGIN): Decision {
  const live = matches.filter((m) => m.verification?.status !== 'unsupported')
  const relevant = live.filter((m) => ['exclusion', 'limit', 'room', 'coverage'].includes(m.role))
  let exclusion = live.find((m) => m.role === 'exclusion' && m.rule.usability !== 'needs_human_review')
  let coverage = live.find((m) => m.role === 'coverage')
  const anyClause = relevant.length > 0

  if (exclusion && coverage) {
    if (exclusion.score - coverage.score >= margin) coverage = undefined
    else if (coverage.score - exclusion.score >= margin) exclusion = undefined
  }
  if (exclusion && coverage) return { outcome: 'review', reviewReason: 'conflict', exclusion, coverage, anyClause }
  const one = exclusion ?? coverage
  if (one) {
    if (one.verification?.status === 'conditional') return { outcome: 'review', reviewReason: 'conditional', exclusion, coverage, anyClause }
    return { outcome: exclusion ? 'exclude' : 'cover', reviewReason: null, exclusion, coverage, anyClause }
  }
  return { outcome: anyClause ? 'cover' : 'none', reviewReason: null, anyClause }
}
