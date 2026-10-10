/**
 * PolicyLens - Procedure Normalization & Fuzzy Matcher (Blueprint F5)
 * Matches free-form user query to canonical procedures via token overlap,
 * synonym matching, Levenshtein distance, and returns confidence.
 */

import { TreatmentCostData, TreatmentScenario } from '../types/estimate'
import { EXPANDED_COST_DATASET, getCityTier } from './dataset'
import { getCanonicalProcedureKey } from '../policy/normalizers'

export interface MatchCandidate {
  data: TreatmentCostData
  score: number // 0 to 1
  isExact: boolean
  matchedToken?: string
}

export function matchTreatmentWithCandidates(
  scenario: TreatmentScenario
): { bestMatch: TreatmentCostData | null; confidence: 'high' | 'medium' | 'low'; candidates: MatchCandidate[] } {
  const query = (scenario.treatment || '').trim().toLowerCase()
  if (!query) {
    return { bestMatch: null, confidence: 'low', candidates: [] }
  }

  const userCityTier = getCityTier(scenario.city)
  const canonicalKey = getCanonicalProcedureKey(query)

  const candidates: MatchCandidate[] = []

  for (const item of EXPANDED_COST_DATASET) {
    let score = 0
    let matchedToken = ''

    // Exact key match
    if (item.categoryKey === canonicalKey) {
      score = 0.95
      matchedToken = item.categoryKey
    }

    // Exact name match
    const itemName = item.treatment.toLowerCase()
    if (itemName === query) {
      score = 1.0
      matchedToken = item.treatment
    } else if (itemName.includes(query) || query.includes(itemName)) {
      score = Math.max(score, 0.85)
      matchedToken = item.treatment
    }

    // Synonym match
    for (const syn of item.synonyms) {
      const synLower = syn.toLowerCase()
      if (synLower === query) {
        score = Math.max(score, 0.95)
        matchedToken = syn
      } else if (query.includes(synLower) || synLower.includes(query)) {
        score = Math.max(score, 0.80)
        matchedToken = syn
      }
    }

    // Token-based Jaccard similarity
    const queryTokens = new Set(query.split(/[\s,/-]+/).filter(t => t.length > 2))
    const itemTokens = new Set(`${itemName} ${item.synonyms.join(' ')}`.toLowerCase().split(/[\s,/-]+/).filter(t => t.length > 2))

    let intersectionCount = 0
    for (const t of queryTokens) {
      if (itemTokens.has(t)) intersectionCount++
    }
    const tokenScore = queryTokens.size > 0 ? intersectionCount / queryTokens.size : 0
    score = Math.max(score, tokenScore * 0.75)

    if (score >= 0.4) {
      candidates.push({
        data: item,
        score,
        isExact: score >= 0.9,
        matchedToken,
      })
    }
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score)

  if (candidates.length === 0) {
    return { bestMatch: null, confidence: 'low', candidates: [] }
  }

  const best = candidates[0]
  const confidence: 'high' | 'medium' | 'low' =
    best.score >= 0.85 ? 'high' : best.score >= 0.55 ? 'medium' : 'low'

  return {
    bestMatch: best.data,
    confidence,
    candidates: candidates.slice(0, 3),
  }
}

// Backwards-compatible export
export function matchTreatment(scenario: TreatmentScenario): TreatmentCostData | null {
  const result = matchTreatmentWithCandidates(scenario)
  return result.bestMatch
}
