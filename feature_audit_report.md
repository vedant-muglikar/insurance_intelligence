# PolicyLens — Feature Audit Report
> **App:** Insurance Policy Intelligence Assistant  
> **Stack:** Next.js 16, React 19, TailwindCSS 4, pdf-parse, Gemini / OpenAI API  
> **Audited:** 2026-09-27

---

## Executive Summary

The application has a solid, well-structured foundation. The **core upload → extract → display** pipeline is fully wired, and the **conversational Q&A with page-level citations** is implemented end-to-end. The **cost estimation engine** is built but relies on a minimal synthetic dataset (4 treatments). Several key requirements from the spec — particularly around adaptive re-estimation, multi-turn memory, and robust cost data — are absent or only stub-level.

---

## ✅ Fully Implemented Features

### 1. PDF Upload & Ingestion
- **Drag-and-drop + click-to-browse** file picker ([UploadScreen.tsx](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/components/policy/UploadScreen.tsx))
- **Client-side validation**: PDF-only, 100 MB size cap, immediate error feedback
- **Animated processing timeline** with 6 labeled stages and a progress bar ([ProcessingTimeline.tsx](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/components/policy/ProcessingTimeline.tsx))
- **Page-by-page text extraction** using `pdf-parse` with a custom page renderer ([lib/pdf/extractor.ts](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/pdf/extractor.ts))
- **Scanned PDF detection**: flags documents where >70% of pages have <50 chars

### 2. AI Policy Extraction (Analyze API)
- **Dual AI backend** — automatically uses Gemini if `GOOGLE_GENERATIVE_AI_API_KEY` is set, otherwise falls back to OpenAI GPT-4o ([lib/ai/extractor.ts](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/ai/extractor.ts))
- **Dynamic Gemini model selection**: queries the API's model list, prioritises flash models, auto-blacklists unavailable models and retries up to 3 times
- **Structured JSON extraction** of all 12 policy categories:
  - `coverage`, `exclusion`, `waiting_period`, `deductible`, `co_payment`
  - `room_rent`, `icu_limit`, `sub_limit`, `eligibility`, `claim_requirement`, `sum_insured`, `general`
- **Evidence validation**: each AI-cited quote is cross-checked against the actual extracted page text (60% word-overlap threshold); unverified rules are downgraded to `low` confidence ([lib/pdf/extractor.ts#L62](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/pdf/extractor.ts#L62-L88))
- **Extraction statistics** computed per-run: totals by category and by confidence tier
- **Policy overview extraction**: insurer, plan name, sum insured, policy type

### 3. Results Dashboard — Policy Rules Viewer
- **9-tab layout** ([PolicyResults.tsx](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/components/policy/PolicyResults.tsx)): Overview, Coverage, Exclusions, Waiting Periods, Limits, Eligibility, Claim Requirements, Estimate Cost, Ask Policy
- **Per-tab rule counts** shown in tab pills
- **Searchable rule list** — live filter by name, description, or value on every rules tab
- **RuleCard** component with: rule name, description, status badge, value, conditions, confidence badge, page + section citation link ([components/policy/shared.tsx](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/components/policy/shared.tsx))
- **EvidenceViewer slide-in panel**: shows AI interpretation + original policy quote, verified/unverified badge, copy-to-clipboard button
- **Scanned PDF warning banner** on the Overview tab
- **AI Extraction Summary** card showing all category counts and processing time

### 4. Conversational Q&A (Ask Policy tab)
- **Chat UI** with user/assistant bubble layout, animated loading dots, auto-scroll ([PolicyQA.tsx](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/components/policy/PolicyQA.tsx))
- **6 suggested starter questions** shown on empty state
- **Per-answer metadata**: status badge (covered / conditionally covered / not covered / unclear), confidence badge (medium/low shown, high suppressed)
- **Per-answer citations**: clickable page + section chips that open an evidence modal with the direct policy quote
- **Citation validation**: same evidence-matching logic as extraction — invalid citations are dropped and confidence is downgraded
- **Backend route** at `/api/policy/ask` ([app/api/policy/ask/route.ts](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/app/api/policy/ask/route.ts)) — Gemini-only, sends full page text, 120s timeout

### 5. Treatment Cost Estimator (Estimate Cost tab)
- **Scenario input form** ([EstimateForm.tsx](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/components/policy/EstimateForm.tsx)): treatment name, patient age, city, hospital type, room type, stay duration, optional quoted cost
- **Three-card result display**: Total Treatment Cost range, Potentially Covered range, Estimated Out-of-Pocket range with Indian Rupee formatting
- **Policy rule evaluation** against the extracted policy data: detects exclusions by name match, reads co-pay %, deductible amount, sub-limits by treatment name, sum insured ([lib/estimate/policy.ts](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/estimate/policy.ts))
- **Coverage calculation engine**: applies deductible → sub-limit cap → co-pay in sequence ([lib/estimate/coverage.ts](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/estimate/coverage.ts))
- **Cost range calculation**: adjusts dataset values by room-type and hospital-type multipliers; uses quoted cost if provided ([lib/estimate/cost.ts](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/estimate/cost.ts))
- **Confidence metrics**: separate cost confidence (high if quoted, medium if dataset match, low otherwise) and coverage confidence (low if sum insured not extractable) ([lib/estimate/confidence.ts](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/estimate/confidence.ts))
- **Breakdown ledger**: itemises deductible, sub-limit, and co-pay deductions with labelled amounts
- **Confidence reasons list**: bullet-point explanations shown below the summary cards
- **Client-side validation** with form error messages ([lib/estimate/validation.ts](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/estimate/validation.ts))
- **City-tier lookup**: Tier 1 (7 major cities) vs Tier 2 ([lib/estimate/dataset.ts](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/estimate/dataset.ts))

### 6. Infrastructure & UX
- **State machine** (`upload → processing → results | error`) cleanly managed in [policy-lens.tsx](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/components/policy-lens.tsx)
- **Error screen** with specific failure hints (missing API key, password-protected PDF, file too large)
- **"New analysis" reset** button — clears all state and returns to upload
- **TypeScript types** fully defined for all data shapes in [lib/types/policy.ts](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/types/policy.ts) and [lib/types/estimate.ts](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/types/estimate.ts)
- **120-second API timeouts** on both routes for long AI calls

---

## ⚠️ Partially Implemented / Weak Areas

### A. Cost Dataset is Extremely Thin
**Requirement:** *"Estimates treatment cost using structured historical or synthetic cost data"*

| Problem | Detail |
|---|---|
| Only 4 treatments in the dataset | Appendectomy, Knee Replacement, Cataract Surgery, Maternity — all Tier 1 only |
| No Tier 3 city data | All entries are Tier 1; Tier 2/3 multipliers don't exist |
| No stay-duration cost scaling | `stayDurationDays` is captured in the form but **never used** in cost calculation |
| No component-level breakdown shown | `typicalComponents` (room/surgery/doctor/etc.) are defined in the type but the UI only shows totals |
| No fuzzy treatment matching | [`matching.ts`](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/estimate/matching.ts) exists but logic is a simple case-insensitive string scan — mis-spelt treatments return null and fall through to generic ₹50k–₹2L stub range |

**File:** [`lib/estimate/dataset.ts`](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/estimate/dataset.ts)

### B. Policy Rule Matching in Estimator is Naive
**File:** [`lib/estimate/policy.ts`](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/estimate/policy.ts)

- Exclusion detection only checks if `rule.rule_name.toLowerCase().includes(scenario.treatment.toLowerCase())` — a policy rule named "Pre-existing diseases" will not catch "Appendectomy" even if the treatment has a waiting period
- Sub-limit detection has the same name-substring issue
- **Waiting period evaluation is stubbed** — `isWaitPeriodActive` is always `false` in the result; the field exists in the type and the form collects treatment name, but no waiting period rules are ever checked against the scenario
- Room-rent limit logic only warns about suite rooms; it does not actually compute a prorated deduction (the `applicableRoomLimit` field is extracted but the `calculateCoverage` function never uses it)

### C. Conversational Memory / Multi-turn Context
**File:** [`lib/ai/ask.ts`](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/ai/ask.ts)

- Each question is sent to the API **in isolation** — previous messages in the chat are not included in the Gemini prompt
- The UI holds chat history visually but the backend has no conversation history; follow-up questions like "What about for seniors?" lose all prior context
- No session/conversation ID is managed

### D. OpenAI Fallback Partially Broken for Q&A
**File:** [`lib/ai/ask.ts`](file:///c:/Users/Digvijay/Documents/temp/insurance_intelligence/lib/ai/ask.ts#L56-L58)

```ts
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY!
if (!apiKey) { throw new Error('No Google Gemini API key found.') }
```
The Q&A route is **hardcoded to Gemini only** — unlike the extraction route which properly falls back to OpenAI. If only `OPENAI_API_KEY` is set, the Ask tab will throw.

---

## ❌ Missing / Not Implemented

| # | Requirement | Status |
|---|---|---|
| 1 | **Demonstrate how answer changes when more info is supplied** | ❌ Not built — no "what if" re-run with amended inputs |
| 2 | **Patient pre-existing conditions input** | ❌ No field; age is captured but not linked to waiting-period or eligibility rules |
| 3 | **Waiting period active check** against patient profile | ❌ `isWaitPeriodActive` always `false`; never surfaced in estimate output |
| 4 | **Room-rent proration deduction** | ❌ Captured in rules, mentioned in a comment, but deduction = 0 always |
| 5 | **Cost breakdown by component** (room, surgery, doctor, medicines…) | ❌ `typicalComponents` exists in types & dataset but is never shown in UI |
| 6 | **Confidence/uncertainty flags for missing info** beyond cost/coverage | ❌ No explicit "missing information" flag when key fields like sum_insured or deductible are absent; only a text reason is emitted |
| 7 | **Multi-turn conversation memory** | ❌ Each Q&A call is stateless |
| 8 | **OpenAI support in Q&A route** | ❌ Only Gemini |
| 9 | **Tier 2 / Tier 3 city cost data** | ❌ Only 4 Tier-1 treatments exist |
| 10 | **Stay-duration-scaled cost** | ❌ `stayDurationDays` collected but ignored in `estimateCost()` |
| 11 | **Fuzzy/synonym treatment matching** | ❌ Exact substring only; "knee surgery" ≠ "Knee Replacement" |
| 12 | **Export / share results** | ❌ No PDF/CSV/JSON export of extracted rules or estimates |
| 13 | **Policy comparison** (multiple uploads) | ❌ Only one policy at a time |
| 14 | **OCR for scanned PDFs** | ❌ Detected and warned, but no fallback OCR pipeline |
| 15 | **Streaming responses** for Q&A | ❌ Full response awaited; long answers feel slow |

---

## 📊 Feature Completion Summary

```
Core Extraction Pipeline          ████████████████████  100%
Policy Rules Display (UI)         ████████████████████  100%
Evidence / Citation System        █████████████████░░░   87%  (unverified shown but not fixable)
Conversational Q&A (UI+API)       ████████████████░░░░   80%  (no multi-turn memory)
Treatment Cost Estimator (logic)  ████████████░░░░░░░░   60%  (thin data, naive matching)
Confidence & Uncertainty System   ████████████░░░░░░░░   60%  (partial — missing info not flagged)
Policy ↔ Scenario Integration     ████████░░░░░░░░░░░░   40%  (exclusions & copay work; WP/room-rent don't)
Adaptive Re-estimation            ░░░░░░░░░░░░░░░░░░░░    0%
```

---

## Priority Fixes / What to Build Next

### High Priority
1. **Fix Q&A to support OpenAI fallback** — one-line fix, copy the pattern from `extractor.ts`
2. **Expand cost dataset** — add 20–30 common procedures across Tier 1/2/3 and hospital types, and scale cost by `stayDurationDays × roomCostPerDay`
3. **Implement waiting period check** — match extracted `waiting_period` rules against the scenario's treatment; surface `isWaitPeriodActive: true` prominently in the estimate
4. **Show per-component cost breakdown** — use `typicalComponents` already in the types to render a table (room, surgery, doctor, medicines, consumables, diagnostics)

### Medium Priority
5. **Add multi-turn chat context** — pass the last N messages in the Gemini prompt
6. **Fuzzy treatment matching** — use Levenshtein distance or simple token-overlap to match user input to dataset entries
7. **Room-rent proration** — implement the actual deduction when chosen room type exceeds the policy's room-rent limit
8. **"What if" re-estimation** — add a "Refine" panel that lets the user change one variable (e.g., add a quoted cost or switch hospital type) and shows the delta

### Lower Priority
9. **Missing-info flags** — show explicit banners when deductible, sum_insured, or co-pay could not be extracted
10. **Result export** — JSON download of extracted rules and estimate
11. **Streaming Q&A** — use Gemini's streaming API to reduce perceived latency
12. **OCR fallback** — integrate Tesseract.js or a cloud OCR for scanned PDFs
