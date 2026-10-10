/**
 * ClaimLens OCR / Hybrid Extraction Test Suite
 *
 * Unit tests for token analysis, layout reconstruction, page classification and
 * OCR safeguards, plus integration tests that run the real pipeline (pdf-parse +
 * pdfjs-dist + sharp + Tesseract) on generated text, scanned and mixed PDFs and
 * verify page references for coverage amounts and exclusions.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildMixedPolicyPdf, buildScannedPolicyPdf, buildTextPolicyPdf } from './fixtures/generatePolicyPdfs'
import { extractPagesHybrid } from '../lib/pdf/hybrid'
import { terminatePool } from '../lib/ocr/tesseract'
import { analyzeToken, buildLayoutText, type OcrLine } from '../lib/ocr/layout'
import { assessTextLayer, classifyPage } from '../lib/ocr/pageClassifier'
import { applyOcrSafeguards, validateAndEnrichRules } from '../lib/ai/extractor'
import { compilePolicyRules } from '../lib/policy/compiler'
import { formatPageHeader } from '../lib/pdf/promptFormat'
import { hasPdfHeader } from '../lib/pdf/validation'
import { textItemsToStructuredText } from '../lib/pdf/textLayout'
import { extractPageTextLayer, openPdf } from '../lib/ocr/pdfRenderer'
import type { ExtractedPage, PolicyRule } from '../lib/types/policy'

let failures = 0
function assert(condition: boolean, message: string, detail?: unknown) {
  if (!condition) {
    failures++
    console.error(`❌ FAIL: ${message}`)
    if (detail !== undefined) console.error('   ↳', typeof detail === 'string' ? detail : JSON.stringify(detail))
    return
  }
  console.log(`✅ PASS: ${message}`)
}

const toArrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

type RawRule = Parameters<typeof validateAndEnrichRules>[0][number]
function rawRule(partial: Partial<RawRule>): RawRule {
  return {
    category: 'general',
    rule_name: 'Rule',
    value: '',
    description: '',
    status: 'covered',
    conditions: [],
    page_number: 1,
    section_name: 'General',
    evidence_text: '',
    confidence: 'high',
    ...partial,
  } as RawRule
}

function line(words: Array<[string, number, number, number?, number?]>, y: number, h = 30): OcrLine {
  // [text, x0, x1, confidence?, height?]
  const ws = words.map(([text, x0, x1, conf = 95, wh = h]) => ({
    text,
    confidence: conf,
    bbox: { x0, y0: y, x1, y1: y + wh },
  }))
  return {
    words: ws,
    bbox: { x0: ws[0].bbox.x0, y0: y, x1: ws[ws.length - 1].bbox.x1, y1: y + Math.max(...ws.map((w) => w.bbox.y1 - y)) },
  }
}

async function main() {
  console.log('\n--- Running ClaimLens OCR / Hybrid Extraction Tests ---\n')

  // ─── 1. Token analysis ────────────────────────────────────────────────────
  console.log('1. OCR token analysis (ambiguous amounts are flagged, never corrected):')
  const t1 = analyzeToken('5,0O,000', 90, 'Rs')
  assert(t1.flagged && t1.reason === 'confusable_characters' && t1.isAmount, 'Flags "Rs 5,0O,000" (letter O inside amount)')
  assert(!analyzeToken('5,00,000', 95, 'Rs').flagged, 'Accepts clean "Rs 5,00,000"')
  assert(analyzeToken('5,00,00', 95, 'Rs').reason === 'ambiguous_amount', 'Flags malformed grouping "5,00,00"')
  assert(analyzeToken('₹25,000', 70).reason === 'ambiguous_amount', 'Flags low-confidence amount "₹25,000" (70%)')
  assert(!analyzeToken('₹25,000/-', 92).flagged, 'Accepts "₹25,000/-" at 92%')
  assert(analyzeToken('2O%', 90).reason === 'confusable_characters', 'Flags "2O%" percentage')
  assert(!analyzeToken('Cataract', 95).flagged, 'Accepts high-confidence word')
  assert(analyzeToken('Catarct', 40).reason === 'low_confidence', 'Flags low-confidence word')

  // ─── 2. Layout reconstruction ─────────────────────────────────────────────
  console.log('\n2. Layout reconstruction (headings, tables, clause numbers):')
  const layout = buildLayoutText([
    line([['SECTION', 100, 260, 95, 45], ['4', 270, 290, 95, 45], ['-', 300, 310, 95, 45], ['LIMITS', 320, 450, 95, 45]], 100, 45),
    line([['4.1', 100, 150], ['Room', 160, 240], ['rent', 250, 320], ['is', 330, 360], ['capped', 370, 480], ['at', 490, 520], ['1%', 530, 580], ['of', 590, 620], ['SI.', 630, 680]], 200),
    // Two columns split into separate Tesseract lines at the same y → one table row
    line([['Cataract', 100, 260]], 260),
    line([['Rs', 700, 740], ['40,000', 750, 870]], 262),
    line([['Deductible', 100, 290]], 320),
    line([['Rs', 700, 740], ['25,0O0', 750, 870, 88]], 320),
  ])
  assert(layout.text.includes('## SECTION 4 - LIMITS'), 'Large/upper-case row becomes a heading', layout.text)
  assert(layout.text.includes('\n4.1 Room rent is capped at 1% of SI.'), 'Clause number kept at line start', layout.text)
  assert(layout.text.includes('| Cataract | Rs 40,000 |'), 'Columns split across blocks are merged into a table row', layout.text)
  assert(layout.text.includes('| Deductible | Rs 25,0O0[?] |'), 'Ambiguous amount keeps original text with [?] marker', layout.text)
  assert(layout.ambiguousAmounts.includes('Rs 25,0O0'), 'Ambiguous amount reported with its currency prefix', layout.ambiguousAmounts)
  assert(layout.tableRows === 2, 'Counts 2 table rows', layout.tableRows)
  const clauseLayout = buildLayoutText([line([['5.2', 100, 150, 41], ['Dental', 160, 260], ['treatment', 270, 420]], 100)])
  assert(clauseLayout.text === '5.2 Dental treatment', 'Low-confidence clause number is not marked inline', clauseLayout.text)
  assert(clauseLayout.uncertainTokens.some((t) => t.text === '5.2'), 'Low-confidence clause number is still reported')

  // ─── 3. Page classification ───────────────────────────────────────────────
  console.log('\n3. Per-page text-layer vs OCR detection:')
  const goodText = 'The Company shall indemnify the insured for hospitalisation expenses. '.repeat(30)
  const noImages = { imageCoverage: 0, imageCount: 0, minImageDpi: null }
  const fullScan = { imageCoverage: 1, imageCount: 1, minImageDpi: 200 }
  assert(classifyPage('', fullScan, 80).route === 'ocr', 'Empty text layer + full-page image → OCR')
  assert(classifyPage('Page 3 of 20', fullScan, 80).route === 'ocr', 'Header-only text layer → OCR')
  assert(classifyPage(goodText, noImages, 80).route === 'text_layer', 'Good text layer → existing extraction')
  assert(classifyPage(goodText.slice(0, 600), { imageCoverage: 0.5, imageCount: 1, minImageDpi: 200 }, 80).route === 'hybrid', 'Text + large image → hybrid')
  const garbled = '\u0003\u0007\u0011\u0012 \u0013\u0014\u0015 \u0016\u0017\u0018\u0019 '.repeat(10) + 'xkcd qwrtp zzxv '.repeat(5)
  assert(assessTextLayer(garbled).garbled && classifyPage(garbled, noImages, 80).route === 'ocr', 'Garbled font encoding → OCR')

  // ─── 4. Text-layer structure + validation helpers ─────────────────────────
  console.log('\n4. Text-layer structure and upload validation:')
  const structured = textItemsToStructuredText([
    { str: 'TABLE OF BENEFITS', transform: [12, 0, 0, 12, 50, 700], width: 120 },
    { str: 'Sum Insured', transform: [10, 0, 0, 10, 50, 680], width: 55 },
    { str: 'Rs 5,00,000', transform: [10, 0, 0, 10, 300, 680], width: 55 },
    { str: 'Room rent up to', transform: [10, 0, 0, 10, 50, 660], width: 70 },
    { str: '1% of SI', transform: [10, 0, 0, 10, 122, 660], width: 35 },
  ])
  assert(structured === 'TABLE OF BENEFITS\n| Sum Insured | Rs 5,00,000 |\nRoom rent up to 1% of SI', 'Text layer keeps lines and table cells', structured)
  assert(hasPdfHeader(new TextEncoder().encode('%PDF-1.7\n...')), 'Accepts PDF magic header')
  assert(!hasPdfHeader(new TextEncoder().encode('<html>not a pdf</html>')), 'Rejects non-PDF bytes renamed to .pdf')

  // ─── 5. OCR safeguards & prompt notes ─────────────────────────────────────
  console.log('\n5. OCR safeguards (uncertain values never drive estimates):')
  const ocrPage: ExtractedPage = {
    page_number: 4,
    text: '| Sum Insured | Rs 5,0O,000[?] |',
    char_count: 30,
    extraction_method: 'ocr',
    ocr: {
      confidence: 81, quality: 'fair', word_count: 120, deskew_angle: 0, dpi: 300,
      uncertain_tokens: [{ text: '5,0O,000', confidence: 62, reason: 'confusable_characters' }],
      ambiguous_amounts: ['Rs 5,0O,000'], table_rows_detected: 1, duration_ms: 1000, warnings: [],
    },
  }
  const header = formatPageHeader(ocrPage)
  assert(header.startsWith('[PAGE 4 — OCR') && header.includes('do not guess'), 'OCR page header carries provenance and do-not-guess note', header)
  assert(formatPageHeader({ page_number: 2, text: 'x', char_count: 1 }) === '[PAGE 2]', 'Text-layer page header unchanged')

  const siRule = rawRule({ category: 'sum_insured', rule_name: 'Sum Insured', value: 'Rs 5,0O,000[?]', page_number: 4, evidence_text: 'Sum Insured Rs 5,0O,000' })
  const [guarded] = validateAndEnrichRules([siRule], [ocrPage])
  assert(guarded.confidence === 'low' && guarded.status === 'unclear', 'Rule with uncertain OCR amount → low confidence, unclear', guarded)
  assert(guarded.usability === 'needs_human_review', 'Rule flagged for human review')
  assert(guarded.conditions.some((c) => c.includes('verify against the original document')), 'Rule explains why it was downgraded')
  const [compiledGuarded] = compilePolicyRules([guarded], [ocrPage])
  assert(compiledGuarded.usability !== 'executable', 'Compiler does not execute OCR-uncertain rule', compiledGuarded.usability)

  const cleanRule: PolicyRule = { ...guarded, value: 'Rs 5,00,000', evidence_text: 'Sum Insured Rs 5,00,000', confidence: 'high', status: 'covered', conditions: [], usability: undefined }
  const textPage: ExtractedPage = { page_number: 4, text: 'Sum Insured Rs 5,00,000', char_count: 23 }
  assert(applyOcrSafeguards(cleanRule, textPage) === cleanRule, 'Text-layer pages are not affected by OCR safeguards')

  // ─── 6. Integration: text, scanned, mixed PDFs ────────────────────────────
  console.log('\n6. Integration — text-based PDF (existing extraction path):')
  const fixturesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claimlens-ocr-'))
  const textPdf = await buildTextPolicyPdf()
  const scannedPdf = await buildScannedPolicyPdf()
  const mixedPdf = await buildMixedPolicyPdf()
  fs.writeFileSync(path.join(fixturesDir, 'text_policy.pdf'), textPdf)
  fs.writeFileSync(path.join(fixturesDir, 'scanned_policy.pdf'), scannedPdf)
  fs.writeFileSync(path.join(fixturesDir, 'mixed_policy.pdf'), mixedPdf)

  const text = await extractPagesHybrid(toArrayBuffer(textPdf))
  assert(text.pages.length === 3 && text.pages.every((p) => p.extraction_method === 'text_layer'), 'All pages use the text layer', text.pages.map((p) => p.extraction_method))
  assert(text.report.ocr_engine === null, 'OCR never runs for a text-based PDF')
  assert(text.pages[0].text.includes('| Sum Insured | Rs 5,00,000 |'), 'Schedule table preserved on page 1', text.pages[0].text)

  const fallbackDoc = await openPdf(textPdf)
  const fallbackText = await extractPageTextLayer(await fallbackDoc.getPage(2))
  await fallbackDoc.destroy()
  assert(fallbackText.includes('| Cataract | Rs 40,000 per eye |'), 'Fallback pdfjs text extractor produces the same structure', fallbackText)

  console.log('\n7. Integration — scanned image-only PDF:')
  const progressEvents: string[] = []
  const scanned = await extractPagesHybrid(toArrayBuffer(scannedPdf), {
    onProgress: (e) => progressEvents.push(e.type === 'page' ? `page:${e.page_number}:${e.status}` : `stage:${e.type === 'stage' ? e.stage : e.type}`),
  })
  const [s1, s2, s3, s4] = scanned.pages
  assert([s1, s2, s3].every((p) => p.extraction_method === 'ocr'), 'Pages 1–3 extracted with OCR', scanned.pages.map((p) => p.extraction_method))
  assert((s1.ocr?.confidence ?? 0) >= 80, `Page 1 OCR confidence ≥ 80% (got ${s1.ocr?.confidence}%)`)
  assert(s1.text.includes('Rs 5,00,000') && s1.text.includes('FHS/2025/0048213'), 'Sum insured and policy number read on page 1', s1.text)
  assert(/\| Cataract \| Rs 40,000 per eye \|/.test(s2.text), 'Sub-limit table row preserved on page 2', s2.text)
  assert(s2.text.includes('24 months') && s2.text.includes('36 months'), 'Waiting periods read on page 2')
  assert(Math.abs(s3.ocr?.deskew_angle ?? 0) >= 2, `Skewed page 3 was deskewed (${s3.ocr?.deskew_angle}°)`)
  assert(/Cosmetic/.test(s3.text) && /Dental/.test(s3.text), 'Faded, skewed exclusions page is readable after preprocessing', s3.text)
  assert(s4.extraction_method === 'failed' || s4.ocr?.quality === 'unreadable', 'Low-resolution page 4 detected as unreadable', s4.extraction_method)
  assert(scanned.report.pages_needing_rescan.includes(4), 'Page 4 flagged as needing a clearer scan', scanned.report.pages_needing_rescan)
  assert(!scanned.report.pages_needing_rescan.includes(1), 'Clean page 1 not flagged for rescan')
  assert(progressEvents.includes('page:2:ocr_done') && progressEvents.includes('stage:ocr'), 'Per-page OCR progress events emitted')

  console.log('\n8. Integration — mixed PDF (text + scanned + text-with-image):')
  const mixed = await extractPagesHybrid(toArrayBuffer(mixedPdf))
  assert(
    mixed.pages.map((p) => p.extraction_method).join(',') === 'text_layer,ocr,hybrid',
    'Per-page methods: text_layer, ocr, hybrid',
    mixed.pages.map((p) => p.extraction_method),
  )
  assert(mixed.pages[2].text.includes('4.2 Specific Illness Waiting Period'), 'Hybrid page keeps its text layer')
  assert(/\| Cataract \| Rs 40,000 per eye \|/.test(mixed.pages[2].text), 'Hybrid page adds the scanned table via OCR', mixed.pages[2].text)
  assert(mixed.report.hybrid_pages === 1 && mixed.report.ocr_pages === 1 && mixed.report.text_layer_pages === 1, 'Report counts each method')

  console.log('\n9. Page references for coverage amounts and exclusions:')
  // Rules in the shape the AI returns, citing the original PDF page numbers
  const citedRules = [
    rawRule({ category: 'sum_insured', rule_name: 'Sum Insured', value: 'Rs 5,00,000', page_number: 1, evidence_text: 'Sum Insured Rs 5,00,000' }),
    rawRule({ category: 'sub_limit', rule_name: 'Cataract sub-limit', value: 'Rs 40,000 per eye', page_number: 2, evidence_text: 'Cataract Rs 40,000 per eye' }),
    rawRule({ category: 'exclusion', rule_name: 'Cosmetic surgery', value: 'Not covered', status: 'not_covered', page_number: 3, evidence_text: 'Cosmetic or plastic surgery unless required after an accident' }),
    rawRule({ category: 'exclusion', rule_name: 'Dental (wrong page)', value: 'Not covered', status: 'not_covered', page_number: 1, evidence_text: 'Dental treatment unless requiring hospitalisation' }),
  ]
  const scannedRules = validateAndEnrichRules(citedRules, scanned.pages)
  assert(scannedRules[0].evidence_validated && scannedRules[0].page_number === 1, 'Scanned: sum insured verified on page 1')
  assert(scannedRules[1].evidence_validated && scannedRules[1].page_number === 2, 'Scanned: cataract sub-limit verified on page 2')
  assert(scannedRules[2].evidence_validated && scannedRules[2].page_number === 3, 'Scanned: cosmetic exclusion verified on page 3 (deskewed page)')
  assert(!scannedRules[3].evidence_validated && scannedRules[3].confidence === 'low', 'Scanned: exclusion cited on the wrong page is rejected')

  const mixedRules = validateAndEnrichRules(
    [
      rawRule({ category: 'sub_limit', rule_name: 'Cataract sub-limit', value: 'Rs 40,000 per eye', page_number: 3, evidence_text: 'Cataract Rs 40,000 per eye' }),
      rawRule({ category: 'exclusion', rule_name: 'Dental', value: 'Not covered', status: 'not_covered', page_number: 2, evidence_text: 'Dental treatment unless requiring hospitalisation' }),
      rawRule({ category: 'exclusion', rule_name: 'Dental (wrong page)', value: 'Not covered', status: 'not_covered', page_number: 3, evidence_text: 'Dental treatment unless requiring hospitalisation' }),
    ],
    mixed.pages,
  )
  assert(mixedRules[0].evidence_validated, 'Mixed: scanned-table amount verified on hybrid page 3')
  assert(mixedRules[1].evidence_validated, 'Mixed: exclusion verified on OCR page 2')
  assert(!mixedRules[2].evidence_validated, 'Mixed: exclusion cited on the wrong page is rejected')

  console.log(`\nFixture PDFs written to ${fixturesDir}`)
}

main()
  .catch((err) => {
    failures++
    console.error('❌ Test run crashed:', err)
  })
  .finally(async () => {
    await terminatePool()
    if (failures > 0) {
      console.error(`\n${failures} OCR test(s) failed.`)
      process.exit(1)
    }
    console.log('\n🎉 All OCR / hybrid extraction tests passed.')
    process.exit(0)
  })
