# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Patients and their families who hold a health insurance policy and face a planned hospitalization. They want to know, before admission, how much the insurer will pay and how much they will have to cover themselves. (Confirmed with the user.)

## Product Purpose
BimaSetu (renamed from ClaimLens at the user's request) is a pre-admission coverage preflight. It converts a health insurance policy PDF into auditable coverage rules, applies them to the patient's treatment scenario, and explains the patient share of the bill. Success means a patient walks into admission knowing their likely out-of-pocket amount and which clauses drive it.

## Positioning
Two things together that a generic chatbot or insurer portal could not truthfully claim: (1) Clause-to-Rupee traceability, where every deduction is traced to policy wording with a page citation and all coverage arithmetic runs in deterministic code rather than an LLM; and (2) a modelled treatment cost range (P10/P50/P90) with stay-adjusted line items. (Confirmed with the user: "both together".)

## Operating Context
- The user uploads a policy PDF (up to 100 MB), optionally a hospital estimate PDF or its line items, then sets a treatment scenario (procedure, age, city, hospital type, room, stay, policy start and admission dates, declared pre-existing conditions).
- Output: covered versus patient share with a clause ledger, missing-information prompts, what-if comparisons, a waiting-period timeline, a pre-authorization readiness checklist, a Q&A chat over the policy, and a claim-dispute helper.
- Sign-in is via Supabase (email/password and Google). The landing page (`/`) and `/login` are public; the tool (`/app`) requires sign-in.

## Capabilities and Constraints
- Stack: Next.js (a version with breaking changes; see AGENTS.md), React 19, Tailwind 4, Supabase auth, LLM extraction with Gemini primary and OpenAI fallback, and a Python FastAPI + LightGBM quantile-regression microservice (`ml_service/`) for cost estimates.
- Cost priority order: hospital quote line items, then a user-quoted total, then the ML model, then the static benchmark (17 procedures in the ML catalog, 16 in the benchmark), then a generic fallback. The static benchmark is also the fallback when the ML service is down.
- The cost model is trained on synthetic data, so its accuracy must not be presented as real-world accuracy until retrained on real tariffs.
- Money is INR; cities, tariffs and policy terms are India-specific (observed in the code, not separately confirmed).
- The product carries a disclaimer that it is not insurer authorization, claim settlement or legal advice (existing footer copy).

## Brand Commitments
Name: BimaSetu (the user renamed the product from ClaimLens). The user asked for a dark default with a light-mode toggle, a warm (not cold or clinical) feel, and restrained motion that never slows tasks. The visual world is recorded in DESIGN.md.

## Evidence on Hand
- Real, usable: the benchmark and ML cost outputs (for example Total Knee Replacement, Mumbai, private, single room, 4 days: about ₹3.44L to ₹4.61L, typical ₹4.04L), and the evaluation report at `ml_service/ML_MODEL_EVALUATION.md` (synthetic-data caveat applies).
- Absent: no real customer testimonials, case studies, press, named customers or real insurer policies. Demo figures on the landing page and login are illustrative samples and are labelled as such.

## Product Principles
1. Never fabricate evidence: no invented testimonials, customers, accuracy claims or real-policy numbers; label samples as illustrative. (Confirmed with the user.)
2. Show the working: every rupee figure should trace to a clause, a quote line item, or a stated model range.
3. Refuse false confidence: say "cannot determine" and ask for the missing fact rather than guess.
4. Real quotes outrank estimates: a hospital's own line items always replace modelled or benchmark costs.
5. Keep the arithmetic deterministic and inspectable; language models read documents, they do not do the sums.

## Accessibility & Inclusion
No product-specific standard was stated. Current practice on the new landing and login pages: keyboard-operable controls, visible focus, reduced-motion support, and AA-level text contrast. Many users will be stressed family members, so plain language matters.
