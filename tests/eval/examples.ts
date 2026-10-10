/**
 * Labelled bill-line to clause examples. Labels say what a careful reviewer would conclude from the line and the
 * clause library (tests/eval/clauses.ts), written before any matcher was scored.
 *
 *   exclude  an exclusion clause applies and nothing stops it
 *   cover    a coverage or limit clause applies
 *   review   a person must decide: two clauses disagree, or the clause has a carve-out the line touches
 *   none     no clause in the library speaks to this line
 *
 * `gold` lists the clauses that justify the label (any one of them counts as correct). Empty for none.
 * `split`: dev examples were used to choose thresholds; test examples were not.
 */

import type { Outcome } from '@/lib/claims/decide'

export type { Outcome }
export type Kind = 'paraphrase' | 'exclusion' | 'carve-out' | 'conflict' | 'clear-winner' | 'missing-evidence' | 'keyword-trap'

export interface Example {
  id: string
  kind: Kind
  split: 'dev' | 'test'
  text: string
  outcome: Outcome
  gold: string[]
}

const e = (id: string, kind: Kind, split: 'dev' | 'test', text: string, outcome: Outcome, ...gold: string[]): Example => ({ id, kind, split, text, outcome, gold })

export const EXAMPLES: Example[] = [
  // Same meaning, different words from the clause.
  e('pa01', 'paraphrase', 'dev', 'Nitrile exam hand coverings, box of 100', 'exclude', 'E1'),
  e('pa02', 'paraphrase', 'test', 'N95 respirators for OT staff', 'exclude', 'E1'),
  e('pa03', 'paraphrase', 'dev', 'IV cannula 20G with injection port', 'exclude', 'E1'),
  e('pa04', 'paraphrase', 'test', 'Case paper and medical record creation charge', 'exclude', 'E3'),
  e('pa05', 'paraphrase', 'dev', 'Cable TV and phone rental during stay', 'exclude', 'E4'),
  e('pa06', 'paraphrase', 'test', 'Blood tests done 12 days before admission for the same illness', 'cover', 'C2'),
  e('pa07', 'paraphrase', 'dev', 'Follow-up consultation 40 days after discharge for the same illness', 'cover', 'C3'),
  e('pa08', 'paraphrase', 'test', 'Hospital van used to bring the patient to casualty', 'cover', 'C4'),
  e('pa09', 'paraphrase', 'dev', 'Hemodialysis session, 4 hours, discharged same evening', 'cover', 'C5'),
  e('pa10', 'paraphrase', 'test', 'Panchakarma therapy, inpatient, at a recognised Ayush hospital', 'cover', 'C6'),
  e('pa11', 'paraphrase', 'dev', 'Kidney retrieval surgery cost for the donor', 'cover', 'C7'),
  e('pa12', 'paraphrase', 'test', 'Titanium bone plates and screws', 'cover', 'C1'),
  e('pa13', 'paraphrase', 'dev', 'Absorbable surgical thread, 3 packs', 'cover', 'C1'),
  e('pa14', 'paraphrase', 'test', 'Single private AC suite, 3 nights at Rs 8,000', 'cover', 'C8'),

  // Plain exclusions.
  e('ex01', 'exclusion', 'dev', 'Rhinoplasty for appearance enhancement', 'exclude', 'E2'),
  e('ex02', 'exclusion', 'test', 'Stem cell infusion for knee arthritis', 'exclude', 'E6'),
  e('ex03', 'exclusion', 'dev', 'Reading glasses supplied at discharge', 'exclude', 'E9'),
  e('ex04', 'exclusion', 'test', 'Hearing amplification device fitted', 'exclude', 'E9'),
  e('ex05', 'exclusion', 'dev', 'Root canal treatment and tooth scaling, outpatient', 'exclude', 'E5'),
  e('ex06', 'exclusion', 'test', 'Multivitamin syrup for take-home use', 'exclude', 'E8'),
  e('ex07', 'exclusion', 'dev', 'Admission kit with blanket, slippers and toiletries', 'exclude', 'E4', 'E3', 'E1'),

  // The clause excludes it, but names an exception the line touches.
  e('cd01', 'carve-out', 'dev', 'Plastic surgery to repair facial burns after a road accident', 'review', 'E2'),
  e('cd02', 'carve-out', 'test', 'Gastric sleeve surgery, patient BMI 33', 'review', 'E7'),
  e('cd03', 'carve-out', 'dev', 'Dental extraction after a fall, admitted overnight', 'review', 'E5'),
  e('cd04', 'carve-out', 'test', 'Vitamin K injection prescribed during the inpatient stay', 'review', 'E8'),
  e('cd05', 'carve-out', 'test', 'Breast reconstruction following cancer surgery', 'review', 'E2'),

  // An exclusion and a coverage clause both fit. A person decides.
  e('cf01', 'conflict', 'dev', 'Disposable surgical drape and gown pack for the operation', 'review', 'E1', 'C1'),
  e('cf02', 'conflict', 'test', 'Single-use trocar used in laparoscopy', 'review', 'E1', 'C1'),
  e('cf03', 'conflict', 'dev', 'Suture removal kit', 'review', 'E1', 'C1'),
  e('cf04', 'conflict', 'test', 'Disposable skin stapler used to close the wound', 'review', 'E1', 'C1'),
  e('cf05', 'conflict', 'dev', 'Dental implant fixture placed after an accident, admitted', 'review', 'E5', 'C1'),

  // Two clauses touch the line, but one is clearly the right one.
  e('cw01', 'clear-winner', 'test', 'Cosmetic breast implant', 'exclude', 'E2'),
  e('cw02', 'clear-winner', 'dev', 'Ambulance to carry the kidney donor between hospitals', 'cover', 'C4', 'C7'),

  // Nothing in the library speaks to the line.
  e('ms01', 'missing-evidence', 'dev', 'Surgeon professional fee', 'none'),
  e('ms02', 'missing-evidence', 'test', 'Anaesthesia charges', 'none'),
  e('ms03', 'missing-evidence', 'dev', 'Operation theatre charges', 'none'),
  e('ms04', 'missing-evidence', 'test', 'HbA1c laboratory test', 'none'),
  e('ms05', 'missing-evidence', 'dev', 'Nursing care, per day', 'none'),
  e('ms06', 'missing-evidence', 'test', 'Two units of packed red blood cells', 'none'),
  e('ms07', 'missing-evidence', 'dev', 'MRI knee, plain', 'none'),

  // Shares words with a clause but the clause does not say it.
  e('tr01', 'keyword-trap', 'test', 'Implant removal follow-up review visit', 'none'),
  e('tr02', 'keyword-trap', 'dev', 'Room disinfection charge', 'none'),
  e('tr03', 'keyword-trap', 'test', 'Patient diet meals during admission', 'none'),
]
