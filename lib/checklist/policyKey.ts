import type { PolicyAnalysisResult } from '@/lib/types/policy'

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)

/**
 * Stable identity used to associate a saved checklist with a policy:
 *  - uploaded PDFs: the SHA-256 of the file (re-uploading the same PDF restores progress)
 *  - demo presets / results without a hash: insurer + plan name + page count
 */
export function getPolicyKey(result: PolicyAnalysisResult): string {
  if (result.document_hash && /^[a-f0-9]{64}$/i.test(result.document_hash)) {
    return `pdf:${result.document_hash.toLowerCase()}`
  }
  const name = slug(`${result.overview.insurer || ''} ${result.overview.plan_name || ''}`) || 'policy'
  return `sample:${name.padEnd(6, '-')}-${result.total_pages}p`
}
