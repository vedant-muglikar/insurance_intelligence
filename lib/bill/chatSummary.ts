/**
 * Plain-text summaries of a bill audit for the chat. Everything here is built from the deterministic audit
 * output with ordinary string code, so the spoken and written summary can never contain a number the audit
 * did not produce.
 */

import { formatINR } from '@/lib/policy/normalizers'
import type { HospitalBill, HospitalBillLineItem } from '@/lib/types/bill'
import type { AuditFinding, BillAuditResult } from '@/lib/types/audit'

const SEVERITY_RANK = { high: 0, medium: 1, info: 2 } as const

export function sortFindings(findings: AuditFinding[]): AuditFinding[] {
  return [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

export function billSummary(bill: HospitalBill, items: HospitalBillLineItem[], audit: BillAuditResult): string {
  const total = bill.totalBilledAmount || audit.lineItemSum
  const sorted = sortFindings(audit.findings)
  const serious = sorted.filter((f) => f.severity === 'high').length

  let out = `Your bill comes to ${formatINR(total)} across ${items.length} charge${items.length === 1 ? '' : 's'}. `
  if (sorted.length === 0) {
    out += 'I found nothing to flag.'
  } else {
    out += `I flagged ${sorted.length} thing${sorted.length === 1 ? '' : 's'} to check${serious ? `, ${serious} serious` : ''}. `
    out += `First: ${sorted[0].title}.`
  }
  if (bill.extractionMethod === 'vision') out += ' I read this from a photo, so please check the amounts.'
  return out
}

/** Compact facts handed to the chat model so follow-up questions about the bill are answered from the audit. */
export function billContextText(bill: HospitalBill, items: HospitalBillLineItem[], audit: BillAuditResult): string {
  const lines: string[] = [
    'BILL FACTS. These come from a deterministic audit of the uploaded hospital bill. Quote them exactly, never recalculate or guess, and say so plainly if the bill does not show something.',
  ]
  const head = [
    bill.hospitalName && `Hospital: ${bill.hospitalName}`,
    bill.billNumber && `Bill no: ${bill.billNumber}`,
    bill.admissionDate && `Admitted: ${bill.admissionDate}`,
    bill.dischargeDate && `Discharged: ${bill.dischargeDate}`,
    bill.diagnosis && `Diagnosis on bill: ${bill.diagnosis}`,
  ].filter(Boolean)
  lines.push(...(head as string[]))
  lines.push(`Stated total: ${formatINR(bill.totalBilledAmount)}. Itemised lines add up to ${formatINR(audit.lineItemSum)}.`)
  if (bill.extractionMethod === 'vision') lines.push('The bill was read from a photo, so amounts may contain reading errors.')

  const byCat = new Map<string, number>()
  for (const i of items) byCat.set(i.category, (byCat.get(i.category) ?? 0) + i.amount)
  lines.push('Totals by category: ' + [...byCat.entries()].map(([c, v]) => `${c} ${formatINR(v)}`).join('; '))

  lines.push('Findings:')
  sortFindings(audit.findings).slice(0, 15).forEach((f, n) => {
    lines.push(`${n + 1}. [${f.severity}, ${f.domain}] ${f.title}: ${f.explanation.slice(0, 200)} Suggested: ${f.suggestedAction.slice(0, 120)}`)
  })
  if (audit.findings.length === 0) lines.push('None.')

  lines.push('Charges:')
  for (const i of items.slice(0, 60)) lines.push(`- ${i.description} | ${i.category} | ${i.quantity} x ${formatINR(i.unitPrice)} = ${formatINR(i.amount)}`)

  return lines.join('\n').slice(0, 7000)
}
