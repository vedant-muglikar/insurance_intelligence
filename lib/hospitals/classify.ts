/**
 * Which pricing tier a hospital belongs to. OpenStreetMap rarely tags ownership, so the name is the usual signal:
 * government and municipal hospitals say so, and large corporate chains are recognisable by brand. Everything else
 * is priced as a private hospital, and the UI says the type was assumed so the user can correct it.
 */

import type { HospitalType, HospitalTypeSource } from './types'

const GOVERNMENT =
  /\b(govt\.?|government|civil hospital|district hospital|sub[- ]?district|municipal|corporation|cantonment|e\.?s\.?i\.?c?|aiims|pcmc|pmc|bmc|zilla|zp hospital|rural hospital|primary health|community health|phc|chc|railway|military|command hospital|naval|air force|sassoon|kem hospital|j\.? ?j\.? hospital|medical college)\b/i

// Brand names must start the hospital's name, so "Golden Care Hospital" is not mistaken for CARE Hospitals
const CORPORATE =
  /^\s*(apollo|fortis|manipal|max (super|health|hospital)|medanta|narayana|ruby hall|jupiter|kokilaben|sahyadri|aster|kims|columbia asia|wockhardt|lilavati|hinduja|jehangir|deenanath|aditya birla|noble hospital|motherhood|cloudnine|rainbow|care hospitals?|yashoda|nanavati|hiranandani|breach candy|sir h\.? ?n\.? reliance|bombay hospital|artemis|blk|sir ganga ram|amrita|kauvery|gleneagles|sakra|sparsh|ojas|dr\.? ?d\.? ?y\.? patil|d\.? ?y\.? patil|bharati|symbiosis|poona hospital|inamdar|surya)\b/i

export function classifyHospital(name: string, tags: Record<string, string> = {}): { type: HospitalType; source: HospitalTypeSource } {
  const operatorType = (tags['operator:type'] || '').toLowerCase()
  if (['government', 'public', 'governmental', 'community'].includes(operatorType)) return { type: 'public', source: 'osm_tag' }

  const text = [name, tags.operator, tags.description, tags['official_name']].filter(Boolean).join(' ')
  if (GOVERNMENT.test(text)) return { type: 'public', source: 'name' }
  if (CORPORATE.test(name) || (tags.operator && CORPORATE.test(tags.operator))) return { type: 'corporate', source: 'name' }
  if (['private', 'commercial', 'corporate'].includes(operatorType)) return { type: 'private', source: 'osm_tag' }
  return { type: 'private', source: 'assumed' }
}
