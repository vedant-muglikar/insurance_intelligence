'use client';

import React, { useState, useMemo } from 'react';
import { PolicyRule } from '@/lib/types/policy';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  ArrowRight,
  Info,
  Zap,
  TriangleAlert,
  CircleDot,
  BadgeAlert,
  FileText,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { formatINR } from '@/lib/policy/normalizers';

export interface CoverageRiskAnalyzerProps {
  policyRules?: PolicyRule[];
  policyName?: string;
}

interface BillItem {
  id: string;
  description: string;
  category: string;
  amount: number;
}

type RiskLevel =
  | 'Likely Covered'
  | 'Partially Covered'
  | 'Not Covered'
  | 'Verify First';

interface AnalyzedItem extends BillItem {
  riskLevel: RiskLevel;
  explanation: string;
  policyCitation?: string;
  policySection?: string;
  policyPage?: number | null;
  recommendation: string;
  missingInfo?: string;
}

const CATEGORIES = [
  { value: 'room', label: 'Room / Bed Charges' },
  { value: 'icu', label: 'ICU / CCU Charges' },
  { value: 'surgery', label: 'Surgery / Procedures' },
  { value: 'doctor', label: 'Doctor / Consultation Fees' },
  { value: 'medicines', label: 'Medicines / Pharmacy' },
  { value: 'consumables', label: 'Consumables / Disposables' },
  { value: 'diagnostics', label: 'Diagnostics / Imaging' },
  { value: 'implant', label: 'Implants / Devices' },
  { value: 'ambulance', label: 'Ambulance / Transport' },
  { value: 'other', label: 'Other / Administrative' },
];

const RISK_CONFIG: Record<
  RiskLevel,
  {
    color: string;
    bg: string;
    border: string;
    glow: string;
    dot: string;
    icon: React.ReactNode;
    label: string;
    short: string;
  }
> = {
  'Likely Covered': {
    color: '#4ade80',
    bg: 'rgba(74,222,128,0.08)',
    border: 'rgba(74,222,128,0.25)',
    glow: '0 0 20px rgba(74,222,128,0.15)',
    dot: '#4ade80',
    icon: <CheckCircle2 size={16} />,
    label: 'Likely Covered',
    short: 'COVERED',
  },
  'Partially Covered': {
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.08)',
    border: 'rgba(251,191,36,0.25)',
    glow: '0 0 20px rgba(251,191,36,0.15)',
    dot: '#fbbf24',
    icon: <AlertTriangle size={16} />,
    label: 'Partially Covered',
    short: 'PARTIAL',
  },
  'Not Covered': {
    color: '#f87171',
    bg: 'rgba(248,113,113,0.08)',
    border: 'rgba(248,113,113,0.28)',
    glow: '0 0 20px rgba(248,113,113,0.18)',
    dot: '#f87171',
    icon: <ShieldAlert size={16} />,
    label: 'Not Covered',
    short: 'EXCLUDED',
  },
  'Verify First': {
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.08)',
    border: 'rgba(96,165,250,0.25)',
    glow: '0 0 20px rgba(96,165,250,0.15)',
    dot: '#60a5fa',
    icon: <HelpCircle size={16} />,
    label: 'Verify First',
    short: 'VERIFY',
  },
};

function analyzeItem(item: BillItem, policyRules: PolicyRule[]): AnalyzedItem {
  let riskLevel: RiskLevel = 'Likely Covered';
  let explanation =
    'This charge appears to fall under standard covered inpatient expenses.';
  let policyCitation: string | undefined;
  let policySection: string | undefined;
  let policyPage: number | null | undefined;
  let recommendation =
    'Keep original invoices and payment receipts. Ensure valid prescription / order from treating doctor.';
  let missingInfo: string | undefined;

  const exclusions = policyRules.filter((r) => r.category === 'exclusion');
  const roomRules = policyRules.filter((r) => r.category === 'room_rent');
  const icuRules = policyRules.filter((r) => r.category === 'icu_limit');
  const subLimits = policyRules.filter((r) => r.category === 'sub_limit');
  const coPay = policyRules.filter((r) => r.category === 'co_payment');
  const waitingPeriods = policyRules.filter(
    (r) => r.category === 'waiting_period'
  );

  const match = (rule: PolicyRule, ...terms: string[]) =>
    terms.some(
      (t) =>
        rule.rule_name.toLowerCase().includes(t.toLowerCase()) ||
        rule.description.toLowerCase().includes(t.toLowerCase())
    );

  const descLower = item.description.toLowerCase();

  if (item.category === 'consumables') {
    const found = exclusions.find((e) =>
      match(e, 'consumable', 'disposable', 'gloves', 'non-medical', 'ppe', item.description)
    );
    riskLevel = 'Not Covered';
    explanation =
      'Consumables, disposables, and non-medical items (gloves, syringes, PPE kits, cotton, etc.) are listed as non-payable items under IRDAI regulations and most standard health policies.';
    recommendation =
      'Ask the hospital for a detailed breakup of consumables. Confirm whether any add-on rider covers consumables. Budget these as out-of-pocket expenses.';
    if (found) {
      policyCitation = found.evidence_text || found.description;
      policySection = found.section_name || found.rule_name;
      policyPage = found.page_number;
    } else {
      policyCitation =
        'IRDAI standard non-payable items list (circular ref: IRDA/HLT/REG/CIR/099/04/2016)';
      missingInfo =
        'No explicit consumables clause found in uploaded policy. Applying IRDAI default.';
    }
  } else if (item.category === 'room') {
    const found = roomRules[0];
    if (found) {
      riskLevel = 'Partially Covered';
      explanation = `Your policy enforces a room rent cap (${found.rule_name}: ${found.value}). If you choose a room above this limit, all related charges — surgeon fees, nursing, diagnostics — will be proportionately reduced. This cascading deduction can significantly increase your out-of-pocket amount.`;
      recommendation =
        'Choose a room strictly within the eligible category. Request a room upgrade only if the hospital confirms no proportionate deduction will apply.';
      policyCitation = found.evidence_text || found.description;
      policySection = found.section_name || found.rule_name;
      policyPage = found.page_number;
    } else {
      riskLevel = 'Verify First';
      explanation =
        'No explicit room rent limit was found in your policy extract. Many policies have implicit 1% of Sum Insured limits. Verify with your insurer or TPA.';
      recommendation =
        'Call your TPA helpline and confirm room eligibility in writing before checking in.';
      missingInfo =
        'Room rent clause not explicitly extracted. Policy may have an implicit limit.';
    }
  } else if (item.category === 'icu') {
    const found = icuRules[0];
    if (found) {
      riskLevel = 'Partially Covered';
      explanation = `ICU/CCU charges may be subject to a separate daily cap under your policy (${found.rule_name}: ${found.value}).`;
      recommendation =
        'Confirm ICU eligibility with TPA at admission. If ICU is medically necessary, charges above limit will be deducted from payable amount.';
      policyCitation = found.evidence_text || found.description;
      policySection = found.section_name || found.rule_name;
      policyPage = found.page_number;
    } else {
      riskLevel = 'Likely Covered';
      explanation =
        'ICU charges are generally covered as part of hospitalisation. No explicit ICU cap was found in the extracted policy clauses.';
      recommendation =
        'Ensure ICU admission is medically necessary and approved by TPA.';
    }
  } else if (item.category === 'surgery') {
    const limitFound = subLimits.find((r) =>
      match(r, item.description, 'surgery', 'procedure', 'operation')
    );
    const waitFound = waitingPeriods.find((r) =>
      match(r, item.description, 'surgery', 'procedure')
    );
    if (limitFound) {
      riskLevel = 'Partially Covered';
      explanation = `A sub-limit applies to this procedure category: ${limitFound.rule_name} — ${limitFound.value}. Charges beyond this cap will be borne by the patient.`;
      recommendation =
        'Get a pre-authorisation letter from TPA. Ask the hospital to provide a procedure-specific cost estimate and check if it falls within the sub-limit.';
      policyCitation = limitFound.evidence_text || limitFound.description;
      policySection = limitFound.section_name || limitFound.rule_name;
      policyPage = limitFound.page_number;
    } else if (waitFound) {
      riskLevel = 'Verify First';
      explanation = `A waiting period may apply for this procedure/condition: ${waitFound.rule_name} — ${waitFound.value}. If the admission date falls within the waiting period, this claim may be rejected entirely.`;
      recommendation =
        'Verify the policy inception date and confirm waiting period has lapsed. Obtain written confirmation from insurer before admission.';
      policyCitation = waitFound.evidence_text || waitFound.description;
      policySection = waitFound.section_name || waitFound.rule_name;
      policyPage = waitFound.page_number;
    } else {
      riskLevel = 'Likely Covered';
      explanation =
        'Surgery and procedure costs are generally fully covered up to the sum insured when medically necessary and performed at a network hospital.';
      recommendation =
        "Ensure the diagnosis, procedure code (ICD-10 / CPT), and surgeon's details are clearly documented on the discharge summary.";
    }
  } else if (item.category === 'doctor') {
    const coPayRule = coPay[0];
    if (coPayRule) {
      riskLevel = 'Partially Covered';
      explanation = `Your policy has a co-payment clause (${coPayRule.rule_name}: ${coPayRule.value}). You will bear this percentage of all admissible charges including doctor fees.`;
      recommendation =
        'Factor in the co-payment when planning finances. Co-payment applies to every admissible item, not just this charge.';
      policyCitation = coPayRule.evidence_text || coPayRule.description;
      policySection = coPayRule.section_name || coPayRule.rule_name;
      policyPage = coPayRule.page_number;
    } else {
      riskLevel = 'Likely Covered';
      explanation =
        'Surgeon and specialist fees are standard covered expenses under inpatient hospitalisation benefits.';
      recommendation =
        'Ensure the treating doctor is empanelled with the TPA / insurer network for cashless claims.';
    }
  } else if (item.category === 'medicines') {
    const found = exclusions.find((e) =>
      match(e, 'medicine', 'pharmacy', 'drugs', 'outpatient')
    );
    if (found) {
      riskLevel = 'Partially Covered';
      explanation =
        'Only medicines consumed during the inpatient stay are covered. Pre-/post-hospitalisation medicines follow separate limits (usually 30 days before, 60 days after).';
      recommendation =
        "Retain all pharmacy bills with doctor's prescription. Separate in-hospital and outpatient pharmacy bills clearly before submitting claims.";
      policyCitation = found.evidence_text || found.description;
      policySection = found.section_name || found.rule_name;
      policyPage = found.page_number;
    } else {
      riskLevel = 'Likely Covered';
      explanation =
        'Medicines administered during hospitalisation are covered. Pre-hospitalisation medication may be covered up to 30 days prior.';
      recommendation =
        'Keep pharmacy bills dated within the hospitalisation period. Pre-auth for high-cost medications may be required.';
    }
  } else if (item.category === 'implant') {
    const found = subLimits.find((r) =>
      match(r, 'implant', 'prosthesis', 'device', 'stent', 'lens', item.description)
    );
    if (found) {
      riskLevel = 'Partially Covered';
      explanation = `Implants and devices often have a defined sub-limit: ${found.rule_name} — ${found.value}. Amounts beyond this are non-payable.`;
      recommendation =
        'Always get prior approval from TPA for implants. Provide MRP of the device, brand name, and clinical justification.';
      policyCitation = found.evidence_text || found.description;
      policySection = found.section_name || found.rule_name;
      policyPage = found.page_number;
    } else {
      riskLevel = 'Verify First';
      explanation =
        'Implants are often covered but require prior approval and documentation. No specific implant clause was found in extracted policy rules.';
      recommendation =
        'Obtain prior written approval from TPA. Provide device details (brand, MRP, clinical indication) before implantation.';
      missingInfo =
        'Implant sub-limit not explicitly extracted. Verify directly with insurer.';
    }
  } else if (item.category === 'ambulance') {
    const found = subLimits.find((r) => match(r, 'ambulance', 'transport'));
    if (found) {
      riskLevel = 'Partially Covered';
      explanation = `Ambulance charges are covered but with a cap: ${found.rule_name} — ${found.value}.`;
      recommendation =
        'Retain the ambulance provider invoice. Amount exceeding the cap will be non-payable.';
      policyCitation = found.evidence_text || found.description;
      policySection = found.section_name || found.rule_name;
      policyPage = found.page_number;
    } else {
      riskLevel = 'Verify First';
      explanation =
        'Ambulance charges are usually covered with a per-trip limit. No specific clause was extracted from the policy.';
      recommendation =
        'Confirm ambulance coverage and limit with TPA. Standard coverage is ₹1,500–₹5,000 per hospitalisation.';
      missingInfo = 'Ambulance limit not found in extracted clauses.';
    }
  } else if (
    item.category === 'other' ||
    descLower.includes('registration') ||
    descLower.includes('admin') ||
    descLower.includes('service charge') ||
    descLower.includes('attendant')
  ) {
    riskLevel = 'Not Covered';
    explanation =
      'Registration fees, admission charges, administrative charges, and attendant expenses are typically excluded from standard health insurance policies.';
    recommendation =
      'These charges are typically payable out-of-pocket. Request the hospital billing desk to waive or reduce administrative surcharges where possible.';
    policyCitation = 'Standard IRDAI non-payable list — administrative charges';
  } else {
    riskLevel = 'Verify First';
    explanation =
      'This item could not be automatically matched to a specific policy clause. Manual verification with TPA is required.';
    recommendation =
      "Submit the line item description to your insurer's customer care for pre-authorisation clarity before the procedure.";
    missingInfo = 'No matching policy clause found for this item.';
  }

  return {
    ...item,
    riskLevel,
    explanation,
    policyCitation,
    policySection,
    policyPage,
    recommendation,
    missingInfo,
  };
}

// ─── Animated dot ─────────────────────────────────────────────────────────────
function PulseDot({ color }: { color: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10 }}>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: color,
          opacity: 0.35,
          animation: 'ping 1.6s cubic-bezier(0,0,0.2,1) infinite',
        }}
      />
      <span
        style={{
          position: 'relative',
          display: 'inline-flex',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: color,
        }}
      />
    </span>
  );
}

// ─── Risk Badge ────────────────────────────────────────────────────────────────
function RiskBadge({ level }: { level: RiskLevel }) {
  const cfg = RISK_CONFIG[level];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 99,
        border: `1px solid ${cfg.border}`,
        background: cfg.bg,
        color: cfg.color,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: cfg.color }}>{cfg.icon}</span>
      {cfg.short}
    </span>
  );
}

// ─── Summary bar ──────────────────────────────────────────────────────────────
function RiskSummaryBar({ items }: { items: AnalyzedItem[] }) {
  const counts = useMemo(() => {
    const c: Record<RiskLevel, number> = {
      'Likely Covered': 0,
      'Partially Covered': 0,
      'Not Covered': 0,
      'Verify First': 0,
    };
    items.forEach((i) => c[i.riskLevel]++);
    return c;
  }, [items]);

  const totalAtRisk = useMemo(
    () =>
      items
        .filter((i) => i.riskLevel !== 'Likely Covered')
        .reduce((s, i) => s + i.amount, 0),
    [items]
  );

  const totalBill = useMemo(() => items.reduce((s, i) => s + i.amount, 0), [items]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 10,
        marginBottom: 20,
      }}
    >
      {(
        [
          'Likely Covered',
          'Partially Covered',
          'Not Covered',
          'Verify First',
        ] as RiskLevel[]
      ).map((level) => {
        const cfg = RISK_CONFIG[level];
        const count = counts[level];
        return (
          <div
            key={level}
            style={{
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span style={{ color: cfg.color }}>{cfg.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: cfg.color, fontWeight: 700 }}>{cfg.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'white', lineHeight: 1.1 }}>
                {count}
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginLeft: 4 }}>
                  item{count !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* At-risk total */}
      <div
        style={{
          gridColumn: '1 / -1',
          background: 'rgba(248,113,113,0.06)',
          border: '1px solid rgba(248,113,113,0.2)',
          borderRadius: 12,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BadgeAlert size={18} style={{ color: '#f87171' }} />
          <div>
            <div style={{ fontSize: 11, color: '#f87171', fontWeight: 700 }}>Total At-Risk Amount</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>
              Items requiring attention or likely not covered
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f87171' }}>
            {formatINR(totalAtRisk)}
          </div>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            {totalBill > 0 ? `${Math.round((totalAtRisk / totalBill) * 100)}% of bill` : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Analyzed Item Card ────────────────────────────────────────────────────────
function ItemResultCard({ item, index }: { item: AnalyzedItem; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const cfg = RISK_CONFIG[item.riskLevel];

  return (
    <div
      style={{
        border: `1px solid ${cfg.border}`,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: expanded ? cfg.glow : 'none',
        transition: 'box-shadow 0.3s ease',
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          background: cfg.bg,
          border: 'none',
          cursor: 'pointer',
          gap: 10,
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {/* Left accent bar */}
          <div
            style={{
              width: 4,
              height: 36,
              borderRadius: 4,
              background: cfg.color,
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'white',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.description || 'Unnamed Item'}
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#64748b',
                marginTop: 2,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <span>{CATEGORIES.find((c) => c.value === item.category)?.label}</span>
              <span style={{ color: '#334155' }}>·</span>
              <span style={{ color: '#94a3b8', fontWeight: 600 }}>{formatINR(item.amount)}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RiskBadge level={item.riskLevel} />
          <span style={{ color: '#475569' }}>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div style={{ background: '#0a0f1a', padding: '0 16px 16px' }}>
          {/* Risk explanation */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              marginTop: 12,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#475569',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 5,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <CircleDot size={11} style={{ color: cfg.color }} />
              Why this risk level?
            </div>
            <p style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.65, margin: 0 }}>
              {item.explanation}
            </p>
          </div>

          {/* Policy citation */}
          {item.policyCitation && (
            <div
              style={{
                marginTop: 10,
                padding: '10px 14px',
                borderRadius: 10,
                background: '#060c18',
                border: '1px solid rgba(100,116,139,0.25)',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#475569',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 5,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <FileText size={11} style={{ color: '#60a5fa' }} />
                  Policy Clause
                </span>
                {item.policyPage && (
                  <span style={{ color: '#334155' }}>Page {item.policyPage}</span>
                )}
              </div>
              {item.policySection && (
                <div
                  style={{
                    fontSize: 10,
                    color: '#60a5fa',
                    marginBottom: 4,
                    fontWeight: 600,
                  }}
                >
                  § {item.policySection}
                </div>
              )}
              <blockquote
                style={{
                  fontSize: 11,
                  color: '#94a3b8',
                  fontStyle: 'italic',
                  borderLeft: '2px solid rgba(96,165,250,0.4)',
                  paddingLeft: 8,
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                "{item.policyCitation}"
              </blockquote>
            </div>
          )}

          {/* Missing info note */}
          {item.missingInfo && (
            <div
              style={{
                marginTop: 10,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(251,191,36,0.06)',
                border: '1px solid rgba(251,191,36,0.2)',
                display: 'flex',
                gap: 7,
                alignItems: 'flex-start',
              }}
            >
              <Info size={12} style={{ color: '#fbbf24', marginTop: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#fcd34d', lineHeight: 1.5 }}>
                {item.missingInfo}
              </span>
            </div>
          )}

          {/* Recommended action */}
          <div
            style={{
              marginTop: 10,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(52,211,153,0.06)',
              border: '1px solid rgba(52,211,153,0.2)',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <ArrowRight size={13} style={{ color: '#34d399', marginTop: 1, flexShrink: 0 }} />
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#34d399',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 3,
                }}
              >
                Recommended Action
              </div>
              <p style={{ fontSize: 12, color: '#a7f3d0', margin: 0, lineHeight: 1.6 }}>
                {item.recommendation}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function CoverageRiskAnalyzer({
  policyRules = [],
  policyName,
}: CoverageRiskAnalyzerProps) {
  const [items, setItems] = useState<BillItem[]>([
    { id: '1', description: 'Room Rent (Private AC)', category: 'room', amount: 8000 },
    {
      id: '2',
      description: 'Surgeon Fee',
      category: 'surgery',
      amount: 45000,
    },
    {
      id: '3',
      description: 'Gloves, Syringes, PPE Kits',
      category: 'consumables',
      amount: 3500,
    },
  ]);
  const [analyzed, setAnalyzed] = useState(false);
  const [analyzedItems, setAnalyzedItems] = useState<AnalyzedItem[]>([]);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { id: Date.now().toString(), description: '', category: 'other', amount: 0 },
    ]);
    setAnalyzed(false);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setAnalyzed(false);
  };

  const changeItem = (id: string, field: keyof BillItem, value: any) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    );
    setAnalyzed(false);
  };

  const runAnalysis = () => {
    const results = items
      .filter((i) => i.description.trim())
      .map((i) => analyzeItem(i, policyRules));
    setAnalyzedItems(results);
    setAnalyzed(true);
  };

  return (
    <div style={{ padding: '20px 24px', minHeight: '100%' }}>
      {/* ─── Hero Banner ──────────────────────────────────────────────────── */}
      <div
        style={{
          background:
            'linear-gradient(135deg, rgba(248,113,113,0.12) 0%, rgba(251,191,36,0.08) 50%, rgba(96,165,250,0.08) 100%)',
          border: '1px solid rgba(248,113,113,0.25)',
          borderRadius: 16,
          padding: '20px 24px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'rgba(248,113,113,0.15)',
              border: '1px solid rgba(248,113,113,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f87171',
              flexShrink: 0,
            }}
          >
            <ShieldAlert size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#f87171',
                  padding: '2px 8px',
                  borderRadius: 99,
                  background: 'rgba(248,113,113,0.15)',
                  border: '1px solid rgba(248,113,113,0.3)',
                }}
              >
                Coverage Risk Analyzer
              </span>
              <PulseDot color="#f87171" />
            </div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'white' }}>
              Which bill items won't be covered?
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
              Cross-references each bill item against{' '}
              <strong style={{ color: '#93c5fd' }}>
                {policyName || 'your uploaded policy'}
              </strong>{' '}
              — citing exact clauses and pages.
            </p>
          </div>
        </div>

        {/* Legend pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(Object.keys(RISK_CONFIG) as RiskLevel[]).map((level) => {
            const cfg = RISK_CONFIG[level];
            return (
              <span
                key={level}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 9px',
                  borderRadius: 99,
                  border: `1px solid ${cfg.border}`,
                  background: cfg.bg,
                  color: cfg.color,
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                {cfg.icon}
                {cfg.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* ─── Main layout ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '340px 1fr',
          gap: 20,
          alignItems: 'start',
        }}
      >
        {/* ─── Left: Item Input Panel ──────────────────────────────────────── */}
        <div
          style={{
            background: '#0d1624',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14,
            overflow: 'hidden',
            position: 'sticky',
            top: 20,
          }}
        >
          {/* Panel header */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Zap size={14} style={{ color: '#fbbf24' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>
              Bill Line Items
            </span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                color: '#475569',
                background: '#1e2d3d',
                padding: '2px 8px',
                borderRadius: 6,
              }}
            >
              {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Items list */}
          <div
            style={{
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              maxHeight: 500,
              overflowY: 'auto',
            }}
          >
            {items.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  background: '#111827',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 10,
                  padding: '10px 11px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Item {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#334155',
                      padding: 2,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: 4,
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.color = '#f87171')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.color = '#334155')
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Item name (e.g. Surgeon Fee)"
                  value={item.description}
                  onChange={(e) => changeItem(item.id, 'description', e.target.value)}
                  style={{
                    background: '#0d1624',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 7,
                    padding: '7px 10px',
                    fontSize: 12,
                    color: 'white',
                    outline: 'none',
                    width: '100%',
                  }}
                />

                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    value={item.category}
                    onChange={(e) => changeItem(item.id, 'category', e.target.value)}
                    style={{
                      flex: 1,
                      background: '#0d1624',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 7,
                      padding: '7px 8px',
                      fontSize: 11,
                      color: '#94a3b8',
                      outline: 'none',
                    }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    placeholder="₹ Amount"
                    value={item.amount || ''}
                    onChange={(e) => changeItem(item.id, 'amount', Number(e.target.value))}
                    style={{
                      width: 90,
                      background: '#0d1624',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 7,
                      padding: '7px 8px',
                      fontSize: 12,
                      color: 'white',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div
            style={{
              padding: '10px 12px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={addItem}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.04)',
                border: '1px dashed rgba(255,255,255,0.12)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 12,
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = 'white';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.3)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = '#64748b';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)';
              }}
            >
              <Plus size={13} /> Add Item
            </button>

            <button
              type="button"
              onClick={runAnalysis}
              disabled={items.filter((i) => i.description.trim()).length === 0}
              style={{
                flex: 2,
                background: 'linear-gradient(135deg, #f87171, #dc2626)',
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 700,
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: '0 4px 20px rgba(248,113,113,0.35)',
                opacity: items.filter((i) => i.description.trim()).length === 0 ? 0.4 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              <Search size={13} />
              Analyze Coverage Risk
            </button>
          </div>
        </div>

        {/* ─── Right: Results ──────────────────────────────────────────────── */}
        <div>
          {!analyzed ? (
            /* Empty state */
            <div
              style={{
                minHeight: 400,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1.5px dashed rgba(255,255,255,0.08)',
                borderRadius: 14,
                padding: 40,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: 'rgba(248,113,113,0.1)',
                  border: '1px solid rgba(248,113,113,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                  color: '#f87171',
                }}
              >
                <ShieldAlert size={26} />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: 'white' }}>
                Coverage Risk Report
              </h3>
              <p style={{ fontSize: 13, color: '#475569', maxWidth: 320, margin: 0, lineHeight: 1.6 }}>
                Add your hospital bill items and click{' '}
                <strong style={{ color: '#f87171' }}>Analyze Coverage Risk</strong> to see which
                charges your policy covers, partially covers, or excludes — with exact clause
                citations.
              </p>

              {/* Risk legend preview */}
              <div
                style={{
                  marginTop: 24,
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                {(Object.keys(RISK_CONFIG) as RiskLevel[]).map((level) => {
                  const cfg = RISK_CONFIG[level];
                  return (
                    <span
                      key={level}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '5px 10px',
                        borderRadius: 99,
                        border: `1px solid ${cfg.border}`,
                        background: cfg.bg,
                        color: cfg.color,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {cfg.icon}
                      {cfg.label}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              {/* Summary cards */}
              <RiskSummaryBar items={analyzedItems} />

              {/* Item cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {analyzedItems.map((item, idx) => (
                  <ItemResultCard key={item.id} item={item} index={idx} />
                ))}
              </div>

              {/* Disclaimer */}
              <div
                style={{
                  marginTop: 16,
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: 'rgba(96,165,250,0.06)',
                  border: '1px solid rgba(96,165,250,0.15)',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}
              >
                <Sparkles size={14} style={{ color: '#60a5fa', marginTop: 1, flexShrink: 0 }} />
                <p style={{ fontSize: 11, color: '#7dd3fc', margin: 0, lineHeight: 1.6 }}>
                  <strong style={{ color: '#93c5fd' }}>AI-Assisted Analysis.</strong> This is a
                  pre-admission risk signal, not a guarantee of claim approval. Final settlement is
                  at the TPA's discretion based on the original policy wording. Always obtain
                  written pre-authorisation before proceeding with high-cost procedures.
                </p>
              </div>

              {/* Re-analyze button */}
              <button
                type="button"
                onClick={() => setAnalyzed(false)}
                style={{
                  marginTop: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontSize: 12,
                  color: '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'color 0.15s',
                }}
              >
                ← Edit items & re-analyze
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Ping animation keyframe */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
