/**
 * Regrouping Engine (Phase 7)
 *
 * Dedicated application-level regrouping engine that detects unusual debit/credit
 * balances (e.g. Creditors with Debit balance, Debtors with Credit balance)
 * and proposes appropriate regrouping without modifying original source data,
 * Phase 5 mappings, or Phase 6 classifications.
 *
 * Downstream reporting resolution:
 *   If RegroupingResult has status 'Applied' or 'AutoApplied' -> use its approved FSLI;
 *   otherwise -> use Phase 6 LedgerClassification.final_fsli_id.
 *
 * This module must ONLY be imported in the main process.
 */

import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import type {
  RegroupingStatus,
  RegroupingResultRecord,
  RegroupingRuleRecord,
  CreateRegroupingRuleInput,
  RegroupingAuditRecord,
  RegroupingWorkbenchRow,
  RegroupingWorkbenchSummary,
  RegroupingWorkbenchData,
  FSLIRecord,
} from './electron-api';

interface LedgerCandidateForRegrouping {
  ledgerId: string;
  ledgerName: string;
  unitId: string;
  unitName: string | null;
  entityId: string;
  financialYearId: string;
  tallyGroupName: string | null;
  parentGroupName: string | null;
  debit: number;
  credit: number;
  netBalance: number;
  balanceNature: 'Debit' | 'Credit' | 'Zero';
  // Phase 6 classification
  clsOriginalTally: string | null;
  clsApplication: string | null;
  clsChildFSLIId: string | null;
  clsChildFSLIName: string | null;
  clsParentFSLIId: string | null;
  clsParentFSLIName: string | null;
  clsFinalFSLIId: string | null;
  clsFinalFSLIName: string | null;
  clsCategory: string | null;
  // Existing regrouping result (if any)
  existingResultId: string | null;
  existingStatus: RegroupingStatus | null;
  existingApprovedFSLIId: string | null;
  existingApprovedClassification: string | null;
  existingRuleId: string | null;
}

interface DetectionProposal {
  shouldRegroup: boolean;
  proposedClassification: string | null;
  proposedFSLIId: string | null;
  proposedFSLIName: string | null;
  confidence: number;
  detectionConfidence: number;
  recommendationConfidence: number;
  reason: string;
  ruleId: string | null;
  ruleName: string | null;
  autoApply: boolean;
  initialStatus: RegroupingStatus;
}

// ── Strict Eligible-Group Gate & Safeguards ───────────────────────────────────

export interface EligibilityResult {
  eligible: boolean;
  groupCategory: 'CreditorsTrade' | 'CreditorsOthers' | 'Debtors' | 'LoansAdvancesAsset' | 'AdvanceFromCustomers' | null;
  reason?: string;
}

export function isEligibleRegroupingGroup(
  tallyGroupName: string | null,
  parentGroupName: string | null,
  ledgerName: string,
  clsFinalFSLIName?: string | null,
  clsCategory?: string | null,
): EligibilityResult {
  const g = (tallyGroupName || '').trim().toLowerCase();
  const p = (parentGroupName || '').trim().toLowerCase();
  const l = (ledgerName || '').trim().toLowerCase();
  const fsli = (clsFinalFSLIName || '').trim().toLowerCase();

  // ── Safeguard 1: Branch / Division / Interbranch / Head Office Protection ──
  // These accounts must NOT be Phase 7 candidates. They are reserved strictly for Phase 9 Consolidation.
  if (
    g.includes('branch') || g.includes('division') || g.includes('interbranch') || g.includes('inter-branch') || g.includes('inter-unit') ||
    p.includes('branch') || p.includes('division') || p.includes('interbranch') || p.includes('inter-branch') || p.includes('inter-unit') ||
    l.includes('branch') || l.includes('division') || l.includes('interbranch') || l.includes('inter-branch') || l.includes('inter-unit') ||
    l.includes('santhigiri ashram ho') || l.includes('ashram ho') || l.includes('head office') ||
    fsli.includes('branch') || fsli.includes('division')
  ) {
    return {
      eligible: false,
      groupCategory: null,
      reason: 'Branch / Division / Interbranch account protected for Phase 9 Consolidation & Interbranch Elimination',
    };
  }

  // ── Safeguard 2: Fixed Assets / PPE / CWIP Protection ─────────────────────
  // Fixed Assets must NEVER become Phase 7 regrouping candidates.
  if (
    l.includes('fixed asset') || l === 'fixed assets' || l.includes('property, plant') || l.includes('plant & machinery') ||
    l.includes('land & building') || l.includes('capital work in progress') || l.includes('cwip') ||
    g.includes('fixed asset') || p.includes('fixed asset') ||
    fsli.includes('property, plant') || fsli.includes('fixed asset') || fsli.includes('capital work-in-progress')
  ) {
    return {
      eligible: false,
      groupCategory: null,
      reason: 'Fixed Assets protected from Phase 7 regrouping (treat as mapping/data-quality issue if grouped unexpectedly)',
    };
  }

  // ── Safeguard 3: Investments Protection ───────────────────────────────────
  // Investments must NEVER become Phase 7 regrouping candidates.
  if (
    l.includes('investment') || l === 'investments' || l.includes('mutual fund') || l.includes('shares & debentures') ||
    g.includes('investment') || p.includes('investment') ||
    fsli.includes('investment')
  ) {
    return {
      eligible: false,
      groupCategory: null,
      reason: 'Investments protected from Phase 7 regrouping (treat as mapping/data-quality issue if grouped unexpectedly)',
    };
  }

  // ── Whitelist Gate 1: Sundry Creditors (Trade) ────────────────────────────
  if (
    g === 'sundry creditors (trade)' || g === 'sundry creditors - trade' || g === 'trade creditors' ||
    p === 'sundry creditors (trade)' || p === 'trade creditors' ||
    l === 'sundry creditors (trade)' || l === 'sundry creditors - trade' || l === 'trade creditors' ||
    l.includes('creditors (trade)') || l.includes('creditors - trade')
  ) {
    return { eligible: true, groupCategory: 'CreditorsTrade' };
  }

  // ── Whitelist Gate 2: Sundry Creditors (Others) ───────────────────────────
  if (
    g === 'sundry creditors (others)' || g === 'sundry creditors - others' || g === 'sundry creditors (other)' || g === 'other creditors' ||
    p === 'sundry creditors (others)' || p === 'other creditors' ||
    l === 'sundry creditors (others)' || l === 'sundry creditors - others' || l === 'sundry creditors (other)' || l === 'other creditors' ||
    l.includes('creditors (others)') || l.includes('creditors - others')
  ) {
    return { eligible: true, groupCategory: 'CreditorsOthers' };
  }

  // ── Whitelist Gate 1/2 fallback: Generic Sundry Creditors ─────────────────
  if (g === 'sundry creditors' || p === 'sundry creditors' || l === 'sundry creditors') {
    if (l.includes('(others)') || l.includes('others') || l.includes('creditors (others)')) {
      return { eligible: true, groupCategory: 'CreditorsOthers' };
    }
    return { eligible: true, groupCategory: 'CreditorsTrade' };
  }

  // ── Whitelist Gate 3: Sundry Debtors ──────────────────────────────────────
  if (
    g === 'sundry debtors' || g === 'sundry debtors (trade)' || g === 'trade debtors' || g === 'debtors' ||
    p === 'sundry debtors' || p === 'trade debtors' || p === 'debtors' ||
    l === 'sundry debtors' || l === 'sundry debtors (trade)' || l === 'trade debtors' || l === 'debtors' ||
    l.includes('sundry debtors') || l.includes('trade debtors')
  ) {
    return { eligible: true, groupCategory: 'Debtors' };
  }

  // ── Whitelist Gate 4: Loans and Advances (Asset) ──────────────────────────
  if (
    g === 'loans and advances (asset)' || g === 'loans & advances (asset)' || g === 'loans and advances - asset' || g === 'loans & advances - asset' ||
    p === 'loans and advances (asset)' || p === 'loans & advances (asset)' ||
    l === 'loans and advances (asset)' || l === 'loans & advances (asset)' || l === 'loans and advances - asset' || l === 'loans & advances - asset' ||
    l.includes('loans and advances (asset)') || l.includes('loans & advances (asset)')
  ) {
    return { eligible: true, groupCategory: 'LoansAdvancesAsset' };
  }

  // ── Whitelist Gate 5: Advance from Customers ──────────────────────────────
  if (
    g === 'advance from customers' || g === 'advances from customers' || g === 'advance from customer' || g === 'advances from customer' ||
    g === 'customer advances' || g === 'customer advance' ||
    p === 'advance from customers' || p === 'advances from customers' || p === 'customer advances' ||
    l === 'advance from customers' || l === 'advances from customers' || l === 'advance from customer' || l === 'advances from customer' ||
    l === 'customer advances' || l === 'customer advance' ||
    l.includes('advance from customers') || l.includes('advances from customers') || l.includes('advance from customer')
  ) {
    return { eligible: true, groupCategory: 'AdvanceFromCustomers' };
  }

  return {
    eligible: false,
    groupCategory: null,
    reason: 'Not in eligible regrouping groups (Sundry Creditors Trade/Others, Sundry Debtors, Loans & Advances Asset, Advance from Customers)',
  };
}

// ── Rule Matching Helper ──────────────────────────────────────────────────────

function matchesRule(
  candidate: LedgerCandidateForRegrouping,
  conditions: { type?: string; rules?: Array<{ field: string; operator: string; value: string }> },
): boolean {
  if (!conditions.rules || conditions.rules.length === 0) return false;

  for (const rule of conditions.rules) {
    let fieldValue = '';
    switch (rule.field) {
      case 'ledger_name':
        fieldValue = candidate.ledgerName;
        break;
      case 'tally_group':
        fieldValue = candidate.tallyGroupName || '';
        break;
      case 'parent_group':
        fieldValue = candidate.parentGroupName || '';
        break;
      case 'balance_nature':
        fieldValue = candidate.balanceNature;
        break;
      case 'classification':
        fieldValue = candidate.clsApplication || candidate.clsFinalFSLIName || '';
        break;
      default:
        continue;
    }

    const targetValue = rule.value || '';
    const op = rule.operator || 'equals';
    const lowerField = fieldValue.toLowerCase();
    const lowerValue = targetValue.toLowerCase();

    switch (op) {
      case 'equals':
        if (lowerField !== lowerValue) return false;
        break;
      case 'not_equals':
        if (lowerField === lowerValue) return false;
        break;
      case 'contains':
        if (!lowerField.includes(lowerValue)) return false;
        break;
      case 'not_contains':
        if (lowerField.includes(lowerValue)) return false;
        break;
      case 'starts_with':
        if (!lowerField.startsWith(lowerValue)) return false;
        break;
      case 'ends_with':
        if (!lowerField.endsWith(lowerValue)) return false;
        break;
      default:
        return false;
    }
  }

  return true;
}

// ── Core Detection Logic ──────────────────────────────────────────────────────

function detectCandidate(
  candidate: LedgerCandidateForRegrouping,
  fsliMap: Map<string, FSLIRecord>,
  fsliByCode: Map<string, FSLIRecord>,
  rules: RegroupingRuleRecord[],
): DetectionProposal {
  // If zero balance, no regrouping needed
  if (candidate.balanceNature === 'Zero' || Math.abs(candidate.netBalance) < 0.0001) {
    return {
      shouldRegroup: false,
      proposedClassification: null,
      proposedFSLIId: null,
      proposedFSLIName: null,
      confidence: 0,
      detectionConfidence: 0,
      recommendationConfidence: 0,
      reason: 'Zero balance',
      ruleId: null,
      ruleName: null,
      autoApply: false,
      initialStatus: 'Detected',
    };
  }

  // 1. Primary Eligibility Whitelist Gate & Safeguard Exclusions
  const eligibility = isEligibleRegroupingGroup(
    candidate.tallyGroupName,
    candidate.parentGroupName,
    candidate.ledgerName,
    candidate.clsFinalFSLIName,
    candidate.clsCategory,
  );

  if (!eligibility.eligible) {
    return {
      shouldRegroup: false,
      proposedClassification: null,
      proposedFSLIId: null,
      proposedFSLIName: null,
      confidence: 0,
      detectionConfidence: 0,
      recommendationConfidence: 0,
      reason: eligibility.reason || 'Ineligible regrouping group',
      ruleId: null,
      ruleName: null,
      autoApply: false,
      initialStatus: 'Detected',
    };
  }

  // 2. Check user-defined Regrouping Rules first (only for eligible groups)
  for (const rule of rules) {
    if (!rule.active) continue;
    try {
      const conditions = JSON.parse(rule.conditions);
      if (matchesRule(candidate, conditions)) {
        let targetFSLI: FSLIRecord | undefined;
        if (rule.targetFSLIId) {
          targetFSLI = fsliMap.get(rule.targetFSLIId);
        }
        const targetName = rule.targetClassification || targetFSLI?.fsliName || 'User Rule Target';
        const isAuto = rule.autoApply === true;
        const recConf = rule.confidence ?? 0.85;
        return {
          shouldRegroup: true,
          proposedClassification: targetName,
          proposedFSLIId: targetFSLI?.id || rule.targetFSLIId || null,
          proposedFSLIName: targetFSLI?.fsliName || null,
          confidence: recConf,
          detectionConfidence: 1.0,
          recommendationConfidence: recConf,
          reason: `Matched user regrouping rule: "${rule.ruleName}"`,
          ruleId: rule.id,
          ruleName: rule.ruleName,
          autoApply: isAuto,
          initialStatus: isAuto ? 'AutoApplied' : 'Detected',
        };
      }
    } catch {
      // Ignore invalid rule json
    }
  }

  // 3. Eligible Sundry Creditor with Debit Balance -> Propose Supplier Advance under Current Assets
  if (
    (eligibility.groupCategory === 'CreditorsTrade' || eligibility.groupCategory === 'CreditorsOthers') &&
    candidate.balanceNature === 'Debit'
  ) {
    const targetFSLI = fsliByCode.get('CA_ST_LOAN') || fsliByCode.get('CA_OTH_ASSET');
    const hasValidTarget = !!targetFSLI;
    return {
      shouldRegroup: true,
      proposedClassification: hasValidTarget
        ? 'Supplier Advance (Short-Term Loans & Advances)'
        : 'Supplier Advance (Needs Review)',
      proposedFSLIId: targetFSLI?.id || null,
      proposedFSLIName: targetFSLI?.fsliName || 'Short-Term Loans and Advances',
      confidence: hasValidTarget ? 0.85 : 0.4,
      detectionConfidence: 1.0,
      recommendationConfidence: hasValidTarget ? 0.85 : 0.4,
      reason: 'Eligible Sundry Creditor with Debit Balance -> Propose Supplier Advance under Current Assets',
      ruleId: null,
      ruleName: null,
      autoApply: false,
      initialStatus: hasValidTarget ? 'Detected' : 'NeedsReview',
    };
  }

  // 4. Eligible Sundry Debtor with Credit Balance -> Propose Customer Advance under Current Liabilities
  if (eligibility.groupCategory === 'Debtors' && candidate.balanceNature === 'Credit') {
    const targetFSLI = fsliByCode.get('CL_OTH_LIAB') || fsliByCode.get('CL_ST_BORR');
    const hasValidTarget = !!targetFSLI;
    return {
      shouldRegroup: true,
      proposedClassification: hasValidTarget
        ? 'Customer Advance (Other Current Liabilities)'
        : 'Customer Advance (Needs Review)',
      proposedFSLIId: targetFSLI?.id || null,
      proposedFSLIName: targetFSLI?.fsliName || 'Other Current Liabilities',
      confidence: hasValidTarget ? 0.85 : 0.4,
      detectionConfidence: 1.0,
      recommendationConfidence: hasValidTarget ? 0.85 : 0.4,
      reason: 'Eligible Sundry Debtor with Credit Balance -> Propose Customer Advance under Current Liabilities',
      ruleId: null,
      ruleName: null,
      autoApply: false,
      initialStatus: hasValidTarget ? 'Detected' : 'NeedsReview',
    };
  }

  // 5. Eligible Loans and Advances (Asset) with Credit Balance -> Needs Review for liability treatment
  if (eligibility.groupCategory === 'LoansAdvancesAsset' && candidate.balanceNature === 'Credit') {
    const targetFSLI = fsliByCode.get('CL_OTH_LIAB');
    return {
      shouldRegroup: true,
      proposedClassification: 'Other Current Liabilities (Credit Advance Balance)',
      proposedFSLIId: targetFSLI?.id || null,
      proposedFSLIName: targetFSLI?.fsliName || 'Other Current Liabilities',
      confidence: 0.70,
      detectionConfidence: 1.0,
      recommendationConfidence: 0.70,
      reason: 'Loans & Advances (Asset) with Credit Balance -> Needs Review for liability treatment',
      ruleId: null,
      ruleName: null,
      autoApply: false,
      initialStatus: 'NeedsReview',
    };
  }

  // 6. Eligible Advance from Customers with Debit Balance -> Needs Review for asset treatment
  if (eligibility.groupCategory === 'AdvanceFromCustomers' && candidate.balanceNature === 'Debit') {
    const targetFSLI = fsliByCode.get('CA_OTH_ASSET') || fsliByCode.get('CA_ST_LOAN');
    return {
      shouldRegroup: true,
      proposedClassification: 'Other Current Assets (Debit Customer Balance)',
      proposedFSLIId: targetFSLI?.id || null,
      proposedFSLIName: targetFSLI?.fsliName || 'Other Current Assets',
      confidence: 0.70,
      detectionConfidence: 1.0,
      recommendationConfidence: 0.70,
      reason: 'Advance from Customers with Debit Balance -> Needs Review for asset treatment',
      ruleId: null,
      ruleName: null,
      autoApply: false,
      initialStatus: 'NeedsReview',
    };
  }

  return {
    shouldRegroup: false,
    proposedClassification: null,
    proposedFSLIId: null,
    proposedFSLIName: null,
    confidence: 0,
    detectionConfidence: 0,
    recommendationConfidence: 0,
    reason: 'Normal balance behavior for eligible group',
    ruleId: null,
    ruleName: null,
    autoApply: false,
    initialStatus: 'Detected',
  };
}

// ── Audit Logger ──────────────────────────────────────────────────────────────

function recordAudit(
  database: Database.Database,
  regroupingResultId: string,
  action: string,
  beforeStatus: string | null,
  afterStatus: string | null,
  beforeFSLIId: string | null,
  afterFSLIId: string | null,
  beforeClassification: string | null,
  afterClassification: string | null,
  reason: string | null,
  performedBy: string | null,
): void {
  const auditId = `rga-${crypto.randomUUID()}`;
  database.prepare(`
    INSERT INTO RegroupingAudit (
      id, regrouping_result_id, action, before_status, after_status,
      before_fsli_id, after_fsli_id, before_classification, after_classification,
      reason, performed_by, performed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    auditId,
    regroupingResultId,
    action,
    beforeStatus,
    afterStatus,
    beforeFSLIId,
    afterFSLIId,
    beforeClassification,
    afterClassification,
    reason,
    performedBy || 'System',
    new Date().toISOString(),
  );
}

// ── Unit & Import Batch Scope Validation (Safeguard 3) ─────────────────────────

export function validateUnitBatchScope(
  database: Database.Database,
  financialYearId: string,
  unitId?: string,
  importBatchId?: string,
): boolean {
  if (!financialYearId) return false;

  // Validate financial year exists
  const fy = database.prepare(`SELECT id FROM FinancialYear WHERE id = ?`).get(financialYearId);
  if (!fy) return false;

  // If unit is specified, validate unit exists
  if (unitId) {
    const unit = database.prepare(`SELECT id FROM Unit WHERE id = ?`).get(unitId);
    if (!unit) return false;
  }

  // If batch is specified, validate batch belongs to FY and (if provided) unit
  if (importBatchId) {
    const batch = database.prepare(`
      SELECT id, unit_id, financial_year_id FROM ImportBatch WHERE id = ?
    `).get(importBatchId) as { id: string; unit_id: string; financial_year_id: string } | undefined;

    if (!batch) return false;
    if (batch.financial_year_id !== financialYearId) return false;
    if (unitId && batch.unit_id !== unitId) return false;
  }

  return true;
}

// ── Candidate Fetcher ─────────────────────────────────────────────────────────

function fetchCandidatesForYear(
  database: Database.Database,
  financialYearId: string,
  unitId?: string,
  importBatchId?: string,
): LedgerCandidateForRegrouping[] {
  // Query all existing RegroupingResult records for this FY (optionally unit-scoped) to link by nature or ledger_id
  const existingWhere = unitId ? 'WHERE financial_year_id = ? AND unit_id = ?' : 'WHERE financial_year_id = ?';
  const existingParams = unitId ? [financialYearId, unitId] : [financialYearId];
  const existingResults = database.prepare(`
    SELECT id, ledger_id, balance_nature, status, approved_fsli_id, approved_classification, rule_id
    FROM RegroupingResult
    ${existingWhere}
  `).all(...existingParams) as Array<{
    id: string;
    ledger_id: string;
    balance_nature: string;
    status: string;
    approved_fsli_id: string | null;
    approved_classification: string | null;
    rule_id: string | null;
  }>;

  const existingMap = new Map<string, typeof existingResults[0]>();
  for (const er of existingResults) {
    existingMap.set(`${er.ledger_id}:${er.balance_nature}`, er);
    if (!existingMap.has(er.ledger_id)) {
      existingMap.set(er.ledger_id, er);
    }
  }

  const whereClauses: string[] = [];
  const whereParams: string[] = [financialYearId, financialYearId];

  if (unitId) {
    whereClauses.push('l.unit_id = ?');
    whereParams.push(unitId);
  }
  if (importBatchId) {
    whereClauses.push('lb.import_batch_id = ?');
    whereParams.push(importBatchId);
  }

  const extraWhere = whereClauses.length > 0 ? ' AND ' + whereClauses.join(' AND ') : '';

  const rows = database.prepare(`
    SELECT
      l.id as ledger_id,
      l.ledger_name,
      l.unit_id,
      u.unit_name,
      l.entity_id,
      lb.financial_year_id,
      tg.group_name as tally_group_name,
      ptg.group_name as parent_group_name,
      lb.debit,
      lb.credit,
      lb.net_balance,
      lc.original_tally_classification as cls_orig_tally,
      lc.application_classification as cls_app,
      lc.child_fsli_id as cls_child_id,
      cfsli.fsli_name as cls_child_name,
      lc.parent_fsli_id as cls_parent_id,
      pfsli.fsli_name as cls_parent_name,
      lc.final_fsli_id as cls_final_id,
      ffsli.fsli_name as cls_final_name,
      COALESCE(ffsli.category, pfsli.category, cfsli.category) as cls_category
    FROM Ledger l
    JOIN Unit u ON l.unit_id = u.id
    JOIN LedgerBalance lb ON l.id = lb.ledger_id AND lb.financial_year_id = ?
    LEFT JOIN TallyGroup tg ON l.tally_group_id = tg.id
    LEFT JOIN TallyGroup ptg ON tg.parent_group_id = ptg.id
    LEFT JOIN LedgerClassification lc ON l.id = lc.ledger_id AND lc.financial_year_id = ?
    LEFT JOIN FSLI cfsli ON lc.child_fsli_id = cfsli.id
    LEFT JOIN FSLI pfsli ON lc.parent_fsli_id = pfsli.id
    LEFT JOIN FSLI ffsli ON lc.final_fsli_id = ffsli.id
    WHERE 1=1${extraWhere}
    ORDER BY u.unit_name ASC, tg.group_name ASC, l.ledger_name ASC
  `).all(...whereParams) as Array<{
    ledger_id: string;
    ledger_name: string;
    unit_id: string;
    unit_name: string | null;
    entity_id: string;
    financial_year_id: string;
    tally_group_name: string | null;
    parent_group_name: string | null;
    debit: number | null;
    credit: number | null;
    net_balance: number | null;
    cls_orig_tally: string | null;
    cls_app: string | null;
    cls_child_id: string | null;
    cls_child_name: string | null;
    cls_parent_id: string | null;
    cls_parent_name: string | null;
    cls_final_id: string | null;
    cls_final_name: string | null;
    cls_category: string | null;
  }>;

  const candidates: LedgerCandidateForRegrouping[] = [];

  for (const r of rows) {
    const eligibility = isEligibleRegroupingGroup(
      r.tally_group_name,
      r.parent_group_name,
      r.ledger_name,
      r.cls_final_name,
      r.cls_category,
    );

    const debitVal = r.debit || 0;
    const creditVal = r.credit || 0;

    if (eligibility.eligible) {
      // For the 5 whitelisted groups: PREVENT NETTING.
      // Preserve gross debit and gross credit balances separately.
      if (debitVal > 0.0001 && creditVal > 0.0001) {
        // 1. Debit component (preserving gross debit balance)
        const exDeb = existingMap.get(`${r.ledger_id}:Debit`) || (existingMap.get(r.ledger_id)?.balance_nature === 'Debit' ? existingMap.get(r.ledger_id) : undefined);
        candidates.push({
          ledgerId: r.ledger_id,
          ledgerName: r.ledger_name,
          unitId: r.unit_id,
          unitName: r.unit_name,
          entityId: r.entity_id,
          financialYearId: r.financial_year_id,
          tallyGroupName: r.tally_group_name,
          parentGroupName: r.parent_group_name,
          debit: debitVal,
          credit: 0,
          netBalance: debitVal,
          balanceNature: 'Debit',
          clsOriginalTally: r.cls_orig_tally,
          clsApplication: r.cls_app,
          clsChildFSLIId: r.cls_child_id,
          clsChildFSLIName: r.cls_child_name,
          clsParentFSLIId: r.cls_parent_id,
          clsParentFSLIName: r.cls_parent_name,
          clsFinalFSLIId: r.cls_final_id,
          clsFinalFSLIName: r.cls_final_name,
          clsCategory: r.cls_category,
          existingResultId: exDeb?.id || null,
          existingStatus: (exDeb?.status as RegroupingStatus) || null,
          existingApprovedFSLIId: exDeb?.approved_fsli_id || null,
          existingApprovedClassification: exDeb?.approved_classification || null,
          existingRuleId: exDeb?.rule_id || null,
        });

        // 2. Credit component (preserving gross credit balance)
        const exCred = existingMap.get(`${r.ledger_id}:Credit`) || (existingMap.get(r.ledger_id)?.balance_nature === 'Credit' ? existingMap.get(r.ledger_id) : undefined);
        candidates.push({
          ledgerId: r.ledger_id,
          ledgerName: r.ledger_name,
          unitId: r.unit_id,
          unitName: r.unit_name,
          entityId: r.entity_id,
          financialYearId: r.financial_year_id,
          tallyGroupName: r.tally_group_name,
          parentGroupName: r.parent_group_name,
          debit: 0,
          credit: creditVal,
          netBalance: -creditVal,
          balanceNature: 'Credit',
          clsOriginalTally: r.cls_orig_tally,
          clsApplication: r.cls_app,
          clsChildFSLIId: r.cls_child_id,
          clsChildFSLIName: r.cls_child_name,
          clsParentFSLIId: r.cls_parent_id,
          clsParentFSLIName: r.cls_parent_name,
          clsFinalFSLIId: r.cls_final_id,
          clsFinalFSLIName: r.cls_final_name,
          clsCategory: r.cls_category,
          existingResultId: exCred?.id || null,
          existingStatus: (exCred?.status as RegroupingStatus) || null,
          existingApprovedFSLIId: exCred?.approved_fsli_id || null,
          existingApprovedClassification: exCred?.approved_classification || null,
          existingRuleId: exCred?.rule_id || null,
        });
      } else if (debitVal > 0.0001) {
        const ex = existingMap.get(`${r.ledger_id}:Debit`) || existingMap.get(r.ledger_id);
        candidates.push({
          ledgerId: r.ledger_id,
          ledgerName: r.ledger_name,
          unitId: r.unit_id,
          unitName: r.unit_name,
          entityId: r.entity_id,
          financialYearId: r.financial_year_id,
          tallyGroupName: r.tally_group_name,
          parentGroupName: r.parent_group_name,
          debit: debitVal,
          credit: 0,
          netBalance: debitVal,
          balanceNature: 'Debit',
          clsOriginalTally: r.cls_orig_tally,
          clsApplication: r.cls_app,
          clsChildFSLIId: r.cls_child_id,
          clsChildFSLIName: r.cls_child_name,
          clsParentFSLIId: r.cls_parent_id,
          clsParentFSLIName: r.cls_parent_name,
          clsFinalFSLIId: r.cls_final_id,
          clsFinalFSLIName: r.cls_final_name,
          clsCategory: r.cls_category,
          existingResultId: ex?.id || null,
          existingStatus: (ex?.status as RegroupingStatus) || null,
          existingApprovedFSLIId: ex?.approved_fsli_id || null,
          existingApprovedClassification: ex?.approved_classification || null,
          existingRuleId: ex?.rule_id || null,
        });
      } else if (creditVal > 0.0001) {
        const ex = existingMap.get(`${r.ledger_id}:Credit`) || existingMap.get(r.ledger_id);
        candidates.push({
          ledgerId: r.ledger_id,
          ledgerName: r.ledger_name,
          unitId: r.unit_id,
          unitName: r.unit_name,
          entityId: r.entity_id,
          financialYearId: r.financial_year_id,
          tallyGroupName: r.tally_group_name,
          parentGroupName: r.parent_group_name,
          debit: 0,
          credit: creditVal,
          netBalance: -creditVal,
          balanceNature: 'Credit',
          clsOriginalTally: r.cls_orig_tally,
          clsApplication: r.cls_app,
          clsChildFSLIId: r.cls_child_id,
          clsChildFSLIName: r.cls_child_name,
          clsParentFSLIId: r.cls_parent_id,
          clsParentFSLIName: r.cls_parent_name,
          clsFinalFSLIId: r.cls_final_id,
          clsFinalFSLIName: r.cls_final_name,
          clsCategory: r.cls_category,
          existingResultId: ex?.id || null,
          existingStatus: (ex?.status as RegroupingStatus) || null,
          existingApprovedFSLIId: ex?.approved_fsli_id || null,
          existingApprovedClassification: ex?.approved_classification || null,
          existingRuleId: ex?.rule_id || null,
        });
      } else {
        const ex = existingMap.get(r.ledger_id);
        candidates.push({
          ledgerId: r.ledger_id,
          ledgerName: r.ledger_name,
          unitId: r.unit_id,
          unitName: r.unit_name,
          entityId: r.entity_id,
          financialYearId: r.financial_year_id,
          tallyGroupName: r.tally_group_name,
          parentGroupName: r.parent_group_name,
          debit: 0,
          credit: 0,
          netBalance: 0,
          balanceNature: 'Zero',
          clsOriginalTally: r.cls_orig_tally,
          clsApplication: r.cls_app,
          clsChildFSLIId: r.cls_child_id,
          clsChildFSLIName: r.cls_child_name,
          clsParentFSLIId: r.cls_parent_id,
          clsParentFSLIName: r.cls_parent_name,
          clsFinalFSLIId: r.cls_final_id,
          clsFinalFSLIName: r.cls_final_name,
          clsCategory: r.cls_category,
          existingResultId: ex?.id || null,
          existingStatus: (ex?.status as RegroupingStatus) || null,
          existingApprovedFSLIId: ex?.approved_fsli_id || null,
          existingApprovedClassification: ex?.approved_classification || null,
          existingRuleId: ex?.rule_id || null,
        });
      }
    } else {
      // For all OTHER groups: Retain existing netting logic
      const net = r.net_balance !== null && r.net_balance !== undefined ? r.net_balance : debitVal - creditVal;
      const nature: 'Debit' | 'Credit' | 'Zero' = net > 0.0001 ? 'Debit' : net < -0.0001 ? 'Credit' : 'Zero';
      const ex = existingMap.get(r.ledger_id);

      candidates.push({
        ledgerId: r.ledger_id,
        ledgerName: r.ledger_name,
        unitId: r.unit_id,
        unitName: r.unit_name,
        entityId: r.entity_id,
        financialYearId: r.financial_year_id,
        tallyGroupName: r.tally_group_name,
        parentGroupName: r.parent_group_name,
        debit: debitVal,
        credit: creditVal,
        netBalance: net,
        balanceNature: nature,
        clsOriginalTally: r.cls_orig_tally,
        clsApplication: r.cls_app,
        clsChildFSLIId: r.cls_child_id,
        clsChildFSLIName: r.cls_child_name,
        clsParentFSLIId: r.cls_parent_id,
        clsParentFSLIName: r.cls_parent_name,
        clsFinalFSLIId: r.cls_final_id,
        clsFinalFSLIName: r.cls_final_name,
        clsCategory: r.cls_category,
        existingResultId: ex?.id || null,
        existingStatus: (ex?.status as RegroupingStatus) || null,
        existingApprovedFSLIId: ex?.approved_fsli_id || null,
        existingApprovedClassification: ex?.approved_classification || null,
        existingRuleId: ex?.rule_id || null,
      });
    }
  }

  return candidates;
}

// ── Suggestion Engine ─────────────────────────────────────────────────────────

export function generateRegroupingSuggestions(
  database: Database.Database,
  financialYearId: string,
  unitId?: string,
  importBatchId?: string,
): { detectedCount: number; autoAppliedCount: number; needsReviewCount: number } {
  // Validate scope first (Safeguard 3: Invalid combination returns 0 and performs 0 DB modifications)
  if (!validateUnitBatchScope(database, financialYearId, unitId, importBatchId)) {
    return { detectedCount: 0, autoAppliedCount: 0, needsReviewCount: 0 };
  }

  const now = new Date().toISOString();

  // 1. Fetch FSLIs
  const fsliRows = database.prepare(`
    SELECT id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at, parent_fsli_id
    FROM FSLI WHERE active = 1
  `).all() as Array<{
    id: string; fsli_name: string; fsli_code: string | null; category: string;
    sub_category: string | null; display_order: number; source: string | null;
    active: number; created_at: string; parent_fsli_id: string | null;
  }>;

  const fsliMap = new Map<string, FSLIRecord>();
  const fsliByCode = new Map<string, FSLIRecord>();
  for (const r of fsliRows) {
    const rec: FSLIRecord = {
      id: r.id, fsliName: r.fsli_name, fsliCode: r.fsli_code, category: r.category,
      subCategory: r.sub_category, displayOrder: r.display_order,
      source: (r.source as 'SYSTEM' | 'USER') || 'SYSTEM',
      active: r.active === 1, createdAt: r.created_at, parentFSLIId: r.parent_fsli_id,
    };
    fsliMap.set(rec.id, rec);
    if (rec.fsliCode) fsliByCode.set(rec.fsliCode, rec);
  }

  // 2. Fetch active regrouping rules
  const rules = getRegroupingRules(database);

  // 3. Fetch candidates strictly for the scoped population
  const candidates = fetchCandidatesForYear(database, financialYearId, unitId, importBatchId);

  const insertStmt = database.prepare(`
    INSERT INTO RegroupingResult (
      id, ledger_id, unit_id, entity_id, financial_year_id,
      before_classification, before_fsli_id, before_fsli_name,
      proposed_classification, proposed_fsli_id, proposed_fsli_name,
      approved_classification, approved_fsli_id, approved_fsli_name,
      balance_debit, balance_credit, balance_net, balance_nature,
      tally_group_name, ledger_name, reason, rule_id, rule_name,
      confidence, detection_confidence, recommendation_confidence, status,
      approved_by, approved_at, applied_by, applied_at,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?
    )
  `);

  const updateStmt = database.prepare(`
    UPDATE RegroupingResult SET
      before_classification = ?,
      before_fsli_id = ?,
      before_fsli_name = ?,
      proposed_classification = ?,
      proposed_fsli_id = ?,
      proposed_fsli_name = ?,
      balance_debit = ?,
      balance_credit = ?,
      balance_net = ?,
      balance_nature = ?,
      reason = ?,
      rule_id = ?,
      rule_name = ?,
      confidence = ?,
      detection_confidence = ?,
      recommendation_confidence = ?,
      status = ?,
      approved_classification = CASE WHEN ? = 'AutoApplied' THEN ? ELSE approved_classification END,
      approved_fsli_id = CASE WHEN ? = 'AutoApplied' THEN ? ELSE approved_fsli_id END,
      approved_fsli_name = CASE WHEN ? = 'AutoApplied' THEN ? ELSE approved_fsli_name END,
      applied_by = CASE WHEN ? = 'AutoApplied' THEN 'AutoRule' ELSE applied_by END,
      applied_at = CASE WHEN ? = 'AutoApplied' THEN ? ELSE applied_at END,
      updated_at = ?
    WHERE id = ?
  `);

  let detectedCount = 0;
  let autoAppliedCount = 0;
  let needsReviewCount = 0;

  const tx = database.transaction(() => {
    for (const c of candidates) {
      const proposal = detectCandidate(c, fsliMap, fsliByCode, rules);

      // If existing record was already approved, applied, or rejected manually, preserve user decision
      const isLockedByUser =
        c.existingStatus === 'Approved' ||
        c.existingStatus === 'Applied' ||
        c.existingStatus === 'Rejected' ||
        c.existingStatus === 'Undone';

      if (!proposal.shouldRegroup) {
        // If candidate had an existing result that was in 'Detected' or 'NeedsReview',
        // mark it 'Obsolete' so it is removed from active workbench candidates while preserving audit/history
        if (c.existingResultId && (c.existingStatus === 'Detected' || c.existingStatus === 'NeedsReview')) {
          database.prepare(`
            UPDATE RegroupingResult SET
              status = 'Obsolete',
              reason = ?,
              updated_at = ?
            WHERE id = ?
          `).run(proposal.reason || 'Ineligible regrouping group - marked Obsolete', now, c.existingResultId);

          recordAudit(
            database,
            c.existingResultId,
            'Obsolete',
            c.existingStatus,
            'Obsolete',
            c.clsFinalFSLIId || null,
            null,
            c.clsApplication || null,
            null,
            proposal.reason || 'Ineligible regrouping group - marked Obsolete',
            'SystemDetection',
          );
        }
        continue;
      }

      const beforeClassification = c.clsApplication || c.clsFinalFSLIName || c.tallyGroupName || 'Unclassified';
      const beforeFSLIId = c.clsFinalFSLIId || null;
      const beforeFSLIName = c.clsFinalFSLIName || null;

      if (!c.existingResultId) {
        // Insert new
        const id = `rg-${crypto.randomUUID()}`;
        const status = proposal.initialStatus;
        const approvedCls = status === 'AutoApplied' ? proposal.proposedClassification : null;
        const approvedFSLIId = status === 'AutoApplied' ? proposal.proposedFSLIId : null;
        const approvedFSLIName = status === 'AutoApplied' ? proposal.proposedFSLIName : null;
        const appliedBy = status === 'AutoApplied' ? 'AutoRule' : null;
        const appliedAt = status === 'AutoApplied' ? now : null;

        insertStmt.run(
          id,
          c.ledgerId,
          c.unitId,
          c.entityId,
          c.financialYearId,
          beforeClassification,
          beforeFSLIId,
          beforeFSLIName,
          proposal.proposedClassification,
          proposal.proposedFSLIId,
          proposal.proposedFSLIName,
          approvedCls,
          approvedFSLIId,
          approvedFSLIName,
          c.debit,
          c.credit,
          c.netBalance,
          c.balanceNature,
          c.tallyGroupName,
          c.ledgerName,
          proposal.reason,
          proposal.ruleId,
          proposal.ruleName,
          proposal.confidence,
          proposal.detectionConfidence,
          proposal.recommendationConfidence,
          status,
          null,
          null,
          appliedBy,
          appliedAt,
          now,
          now,
        );

        recordAudit(
          database,
          id,
          status === 'AutoApplied' ? 'AutoApplied' : 'Detected',
          null,
          status,
          beforeFSLIId,
          proposal.proposedFSLIId,
          beforeClassification,
          proposal.proposedClassification,
          proposal.reason,
          status === 'AutoApplied' ? 'AutoRule' : 'SystemDetection',
        );

        if (status === 'AutoApplied') autoAppliedCount++;
        else if (status === 'NeedsReview') needsReviewCount++;
        else detectedCount++;
      } else if (!isLockedByUser) {
        // Update existing if not manually locked
        const status = proposal.initialStatus;
        const targetCls = proposal.proposedClassification;
        const targetFSLIId = proposal.proposedFSLIId;
        const targetFSLIName = proposal.proposedFSLIName;

        updateStmt.run(
          beforeClassification,
          beforeFSLIId,
          beforeFSLIName,
          proposal.proposedClassification,
          proposal.proposedFSLIId,
          proposal.proposedFSLIName,
          c.debit,
          c.credit,
          c.netBalance,
          c.balanceNature,
          proposal.reason,
          proposal.ruleId,
          proposal.ruleName,
          proposal.confidence,
          proposal.detectionConfidence,
          proposal.recommendationConfidence,
          status,
          status,
          targetCls,
          status,
          targetFSLIId,
          status,
          targetFSLIName,
          status,
          status,
          now,
          now,
          c.existingResultId,
        );

        if (status === 'AutoApplied') autoAppliedCount++;
        else if (status === 'NeedsReview') needsReviewCount++;
        else detectedCount++;
      }
    }
  });

  tx();
  return { detectedCount, autoAppliedCount, needsReviewCount };
}

// ── Actions ───────────────────────────────────────────────────────────────────

export function approveRegrouping(
  database: Database.Database,
  id: string,
  approvedBy?: string,
): RegroupingResultRecord {
  const now = new Date().toISOString();
  const current = getRegroupingResultById(database, id);
  if (!current) throw new Error(`Regrouping result ${id} not found`);

  database.prepare(`
    UPDATE RegroupingResult SET
      approved_classification = proposed_classification,
      approved_fsli_id = proposed_fsli_id,
      approved_fsli_name = proposed_fsli_name,
      status = 'Approved',
      approved_by = ?,
      approved_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(approvedBy || 'User', now, now, id);

  recordAudit(
    database,
    id,
    'Approved',
    current.status,
    'Approved',
    current.beforeFSLIId,
    current.proposedFSLIId,
    current.beforeClassification,
    current.proposedClassification,
    'Approved by user',
    approvedBy || 'User',
  );

  return getRegroupingResultById(database, id)!;
}

export function rejectRegrouping(
  database: Database.Database,
  id: string,
  rejectedBy?: string,
  reason?: string,
): RegroupingResultRecord {
  const now = new Date().toISOString();
  const current = getRegroupingResultById(database, id);
  if (!current) throw new Error(`Regrouping result ${id} not found`);

  database.prepare(`
    UPDATE RegroupingResult SET
      status = 'Rejected',
      reason = COALESCE(?, reason),
      updated_at = ?
    WHERE id = ?
  `).run(reason || null, now, id);

  recordAudit(
    database,
    id,
    'Rejected',
    current.status,
    'Rejected',
    current.beforeFSLIId,
    null,
    current.beforeClassification,
    null,
    reason || 'Rejected by user',
    rejectedBy || 'User',
  );

  return getRegroupingResultById(database, id)!;
}

export function changeRegrouping(
  database: Database.Database,
  id: string,
  newFSLIId: string,
  newClassification: string,
  reason: string,
  changedBy?: string,
): RegroupingResultRecord {
  const now = new Date().toISOString();
  const current = getRegroupingResultById(database, id);
  if (!current) throw new Error(`Regrouping result ${id} not found`);

  // Look up new FSLI name
  const fsli = database.prepare(`SELECT fsli_name FROM FSLI WHERE id = ?`).get(newFSLIId) as
    | { fsli_name: string }
    | undefined;
  const fsliName = fsli?.fsli_name || newClassification;

  database.prepare(`
    UPDATE RegroupingResult SET
      approved_classification = ?,
      approved_fsli_id = ?,
      approved_fsli_name = ?,
      status = 'Approved',
      approved_by = ?,
      approved_at = ?,
      reason = ?,
      updated_at = ?
    WHERE id = ?
  `).run(newClassification, newFSLIId, fsliName, changedBy || 'User', now, reason, now, id);

  recordAudit(
    database,
    id,
    'Changed',
    current.status,
    'Approved',
    current.approvedFSLIId || current.proposedFSLIId,
    newFSLIId,
    current.approvedClassification || current.proposedClassification,
    newClassification,
    reason,
    changedBy || 'User',
  );

  return getRegroupingResultById(database, id)!;
}

export function applyRegrouping(
  database: Database.Database,
  id: string,
  appliedBy?: string,
): RegroupingResultRecord {
  const now = new Date().toISOString();
  const current = getRegroupingResultById(database, id);
  if (!current) throw new Error(`Regrouping result ${id} not found`);

  // If not yet approved, set approved values from proposed values
  const finalApprovedCls = current.approvedClassification || current.proposedClassification;
  const finalApprovedFSLIId = current.approvedFSLIId || current.proposedFSLIId;
  const finalApprovedFSLIName = current.approvedFSLIName || current.proposedFSLIName;

  database.prepare(`
    UPDATE RegroupingResult SET
      approved_classification = ?,
      approved_fsli_id = ?,
      approved_fsli_name = ?,
      status = 'Applied',
      applied_by = ?,
      applied_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(finalApprovedCls, finalApprovedFSLIId, finalApprovedFSLIName, appliedBy || 'User', now, now, id);

  recordAudit(
    database,
    id,
    'Applied',
    current.status,
    'Applied',
    current.beforeFSLIId,
    finalApprovedFSLIId,
    current.beforeClassification,
    finalApprovedCls,
    'Applied to financial statements',
    appliedBy || 'User',
  );

  return getRegroupingResultById(database, id)!;
}

export function undoRegrouping(
  database: Database.Database,
  id: string,
  undoneBy?: string,
  reason?: string,
): RegroupingResultRecord {
  const now = new Date().toISOString();
  const current = getRegroupingResultById(database, id);
  if (!current) throw new Error(`Regrouping result ${id} not found`);

  database.prepare(`
    UPDATE RegroupingResult SET
      status = 'Undone',
      undone_by = ?,
      undone_at = ?,
      undo_reason = ?,
      updated_at = ?
    WHERE id = ?
  `).run(undoneBy || 'User', now, reason || 'User initiated undo', now, id);

  recordAudit(
    database,
    id,
    'Undone',
    current.status,
    'Undone',
    current.approvedFSLIId,
    current.beforeFSLIId,
    current.approvedClassification,
    current.beforeClassification,
    reason || 'Regrouping undone',
    undoneBy || 'User',
  );

  return getRegroupingResultById(database, id)!;
}

// ── Rules Management ──────────────────────────────────────────────────────────

export function createRegroupingRule(
  database: Database.Database,
  input: CreateRegroupingRuleInput,
): RegroupingRuleRecord {
  const now = new Date().toISOString();
  const id = `rgr-${crypto.randomUUID()}`;
  const conditionsJson = JSON.stringify(input.conditions);

  database.prepare(`
    INSERT INTO RegroupingRule (
      id, rule_name, description, conditions,
      target_fsli_id, target_classification,
      confidence, auto_apply, active,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(
    id,
    input.ruleName,
    input.description || null,
    conditionsJson,
    input.targetFSLIId || null,
    input.targetClassification || null,
    input.confidence ?? 0.85,
    input.autoApply ? 1 : 0,
    input.createdBy || 'User',
    now,
    now,
  );

  return getRegroupingRuleById(database, id)!;
}

export function getRegroupingRules(database: Database.Database): RegroupingRuleRecord[] {
  const rows = database.prepare(`
    SELECT
      id, rule_name, description, conditions,
      target_fsli_id, target_classification,
      confidence, auto_apply, active,
      created_by, created_at, updated_at
    FROM RegroupingRule
    ORDER BY created_at DESC
  `).all() as Array<{
    id: string;
    rule_name: string;
    description: string | null;
    conditions: string;
    target_fsli_id: string | null;
    target_classification: string | null;
    confidence: number;
    auto_apply: number;
    active: number;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    ruleName: r.rule_name,
    description: r.description,
    conditions: r.conditions,
    targetFSLIId: r.target_fsli_id,
    targetClassification: r.target_classification,
    confidence: r.confidence,
    autoApply: r.auto_apply === 1,
    active: r.active === 1,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function toggleRegroupingRuleAutoApply(
  database: Database.Database,
  ruleId: string,
  autoApply: boolean,
): RegroupingRuleRecord {
  const now = new Date().toISOString();
  database.prepare(`
    UPDATE RegroupingRule SET
      auto_apply = ?,
      updated_at = ?
    WHERE id = ?
  `).run(autoApply ? 1 : 0, now, ruleId);

  return getRegroupingRuleById(database, ruleId)!;
}

function getRegroupingRuleById(database: Database.Database, id: string): RegroupingRuleRecord | null {
  const r = database.prepare(`
    SELECT
      id, rule_name, description, conditions,
      target_fsli_id, target_classification,
      confidence, auto_apply, active,
      created_by, created_at, updated_at
    FROM RegroupingRule WHERE id = ?
  `).get(id) as {
    id: string;
    rule_name: string;
    description: string | null;
    conditions: string;
    target_fsli_id: string | null;
    target_classification: string | null;
    confidence: number;
    auto_apply: number;
    active: number;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!r) return null;
  return {
    id: r.id,
    ruleName: r.rule_name,
    description: r.description,
    conditions: r.conditions,
    targetFSLIId: r.target_fsli_id,
    targetClassification: r.target_classification,
    confidence: r.confidence,
    autoApply: r.auto_apply === 1,
    active: r.active === 1,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── Data Retrieval for Workbench ──────────────────────────────────────────────

export function getRegroupingWorkbenchData(
  database: Database.Database,
  financialYearId?: string,
  unitId?: string,
  importBatchId?: string,
): RegroupingWorkbenchData {
  // 1. Fetch available financial years
  const fyRows = database.prepare(`
    SELECT fy.id, fy.year_label,
           (SELECT COUNT(*) FROM LedgerBalance lb WHERE lb.financial_year_id = fy.id) as balance_count
    FROM FinancialYear fy
    ORDER BY fy.year_label DESC
  `).all() as Array<{ id: string; year_label: string; balance_count: number }>;

  if (fyRows.length === 0) {
    return {
      financialYears: [],
      activeFinancialYearId: '',
      activeFinancialYearLabel: 'No Financial Year',
      units: [],
      activeUnitId: null,
      importBatches: [],
      activeImportBatchId: null,
      fslis: [],
      rules: [],
      summary: {
        totalCandidates: 0,
        detectedCount: 0,
        needsReviewCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        appliedCount: 0,
        autoAppliedCount: 0,
        undoneCount: 0,
        obsoleteCount: 0,
      },
      rows: [],
    };
  }

  const activeFy = financialYearId
    ? fyRows.find((f) => f.id === financialYearId) || fyRows[0]
    : fyRows[0];
  const activeFyId = activeFy.id;

  // 2. Fetch units that have ledger balances in this FY
  const unitRows = database.prepare(`
    SELECT DISTINCT u.id, u.unit_name
    FROM Unit u
    JOIN Ledger l ON l.unit_id = u.id
    JOIN LedgerBalance lb ON lb.ledger_id = l.id AND lb.financial_year_id = ?
    ORDER BY u.unit_name ASC
  `).all(activeFyId) as Array<{ id: string; unit_name: string }>;

  const units = unitRows.map((u) => ({ id: u.id, unitName: u.unit_name }));

  // 3. Fetch import batches for this FY, optionally filtered by unit
  const batchQuery = unitId
    ? `SELECT ib.id, ib.unit_id, ib.financial_year_id, ib.file_name, ib.import_timestamp, ib.ledger_count
       FROM ImportBatch ib
       WHERE ib.financial_year_id = ? AND ib.unit_id = ?
       ORDER BY ib.import_timestamp DESC`
    : `SELECT ib.id, ib.unit_id, ib.financial_year_id, ib.file_name, ib.import_timestamp, ib.ledger_count
       FROM ImportBatch ib
       WHERE ib.financial_year_id = ?
       ORDER BY ib.import_timestamp DESC`;

  const batchParams = unitId ? [activeFyId, unitId] : [activeFyId];
  const batchRows = database.prepare(batchQuery).all(...batchParams) as Array<{
    id: string; unit_id: string; financial_year_id: string;
    file_name: string; import_timestamp: string; ledger_count: number | null;
  }>;

  const importBatches = batchRows.map((b) => ({
    id: b.id,
    unitId: b.unit_id,
    financialYearId: b.financial_year_id,
    fileName: b.file_name,
    importTimestamp: b.import_timestamp,
    ledgerCount: b.ledger_count ?? 0,
  }));

  // 4. Fetch FSLIs
  const fsliRows = database.prepare(`
    SELECT id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at, parent_fsli_id
    FROM FSLI WHERE active = 1
    ORDER BY display_order ASC, fsli_name ASC
  `).all() as Array<{
    id: string; fsli_name: string; fsli_code: string | null; category: string;
    sub_category: string | null; display_order: number; source: string | null;
    active: number; created_at: string; parent_fsli_id: string | null;
  }>;

  const fslis: FSLIRecord[] = fsliRows.map((r) => ({
    id: r.id, fsliName: r.fsli_name, fsliCode: r.fsli_code, category: r.category,
    subCategory: r.sub_category, displayOrder: r.display_order,
    source: (r.source as 'SYSTEM' | 'USER') || 'SYSTEM',
    active: r.active === 1, createdAt: r.created_at, parentFSLIId: r.parent_fsli_id,
  }));

  // 5. Fetch Rules
  const rules = getRegroupingRules(database);

  // Validate scope (Safeguard 3)
  if (!validateUnitBatchScope(database, activeFyId, unitId, importBatchId)) {
    return {
      financialYears: fyRows.map((f) => ({ id: f.id, yearLabel: f.year_label, hasData: f.balance_count > 0 })),
      activeFinancialYearId: activeFyId,
      activeFinancialYearLabel: activeFy.year_label,
      units,
      activeUnitId: unitId || null,
      importBatches,
      activeImportBatchId: importBatchId || null,
      fslis,
      rules,
      summary: {
        totalCandidates: 0,
        detectedCount: 0,
        needsReviewCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        appliedCount: 0,
        autoAppliedCount: 0,
        undoneCount: 0,
        obsoleteCount: 0,
      },
      rows: [],
    };
  }

  // 6. Fetch Regrouping rows for scope
  const whereClauses: string[] = ['rr.financial_year_id = ?'];
  const whereParams: string[] = [activeFyId];

  if (unitId) {
    whereClauses.push('l.unit_id = ?');
    whereParams.push(unitId);
  }
  if (importBatchId) {
    whereClauses.push('lb.import_batch_id = ?');
    whereParams.push(importBatchId);
  }

  const whereSql = whereClauses.join(' AND ');

  const resultRows = database.prepare(`
    SELECT DISTINCT
      rr.id,
      rr.ledger_id,
      rr.unit_id,
      u.unit_name,
      rr.ledger_name,
      rr.tally_group_name,
      rr.balance_debit,
      rr.balance_credit,
      rr.balance_net,
      rr.balance_nature,
      rr.before_classification,
      rr.before_fsli_id,
      rr.before_fsli_name,
      rr.proposed_classification,
      rr.proposed_fsli_id,
      rr.proposed_fsli_name,
      rr.approved_classification,
      rr.approved_fsli_id,
      rr.approved_fsli_name,
      rr.reason,
      rr.rule_name,
      rr.confidence,
      COALESCE(rr.detection_confidence, 1.0) as detection_confidence,
      COALESCE(rr.recommendation_confidence, rr.confidence, 0.85) as recommendation_confidence,
      rr.status,
      rr.approved_by,
      rr.approved_at,
      rr.applied_by,
      rr.applied_at,
      rr.created_at,
      lc.original_tally_classification,
      lc.application_classification
    FROM RegroupingResult rr
    JOIN Ledger l ON rr.ledger_id = l.id
    JOIN Unit u ON l.unit_id = u.id
    JOIN LedgerBalance lb ON l.id = lb.ledger_id AND lb.financial_year_id = rr.financial_year_id
    LEFT JOIN LedgerClassification lc ON rr.ledger_id = lc.ledger_id AND rr.financial_year_id = lc.financial_year_id
    WHERE ${whereSql}
    ORDER BY u.unit_name ASC, rr.ledger_name ASC
  `).all(...whereParams) as Array<{
    id: string;
    ledger_id: string;
    unit_id: string;
    unit_name: string | null;
    ledger_name: string;
    tally_group_name: string | null;
    balance_debit: number;
    balance_credit: number;
    balance_net: number;
    balance_nature: 'Debit' | 'Credit' | 'Zero';
    before_classification: string | null;
    before_fsli_id: string | null;
    before_fsli_name: string | null;
    proposed_classification: string | null;
    proposed_fsli_id: string | null;
    proposed_fsli_name: string | null;
    approved_classification: string | null;
    approved_fsli_id: string | null;
    approved_fsli_name: string | null;
    reason: string | null;
    rule_name: string | null;
    confidence: number;
    detection_confidence: number;
    recommendation_confidence: number;
    status: RegroupingStatus;
    approved_by: string | null;
    approved_at: string | null;
    applied_by: string | null;
    applied_at: string | null;
    created_at: string;
    original_tally_classification: string | null;
    application_classification: string | null;
  }>;

  let detectedCount = 0;
  let needsReviewCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  let appliedCount = 0;
  let autoAppliedCount = 0;
  let undoneCount = 0;
  let obsoleteCount = 0;

  const rows: RegroupingWorkbenchRow[] = resultRows.map((r) => {
    switch (r.status) {
      case 'Detected': detectedCount++; break;
      case 'NeedsReview': needsReviewCount++; break;
      case 'Approved': approvedCount++; break;
      case 'Rejected': rejectedCount++; break;
      case 'Applied': appliedCount++; break;
      case 'AutoApplied': autoAppliedCount++; break;
      case 'Undone': undoneCount++; break;
      case 'Obsolete': obsoleteCount++; break;
    }

    return {
      id: r.id,
      ledgerId: r.ledger_id,
      ledgerName: r.ledger_name,
      unitId: r.unit_id,
      unitName: r.unit_name,
      tallyGroupName: r.tally_group_name,
      balanceDebit: r.balance_debit,
      balanceCredit: r.balance_credit,
      balanceNet: r.balance_net,
      balanceNature: r.balance_nature,
      originalTallyClassification: r.original_tally_classification || r.tally_group_name,
      applicationClassification: r.application_classification || r.before_classification,
      beforeClassification: r.before_classification,
      beforeFSLIId: r.before_fsli_id,
      beforeFSLIName: r.before_fsli_name,
      proposedClassification: r.proposed_classification,
      proposedFSLIId: r.proposed_fsli_id,
      proposedFSLIName: r.proposed_fsli_name,
      approvedClassification: r.approved_classification,
      approvedFSLIId: r.approved_fsli_id,
      approvedFSLIName: r.approved_fsli_name,
      reason: r.reason,
      ruleName: r.rule_name,
      confidence: r.confidence,
      detectionConfidence: r.detection_confidence,
      recommendationConfidence: r.recommendation_confidence,
      status: r.status,
      approvedBy: r.approved_by,
      approvedAt: r.approved_at,
      appliedBy: r.applied_by,
      appliedAt: r.applied_at,
      createdAt: r.created_at,
    };
  });

  const summary: RegroupingWorkbenchSummary = {
    totalCandidates: rows.length,
    detectedCount,
    needsReviewCount,
    approvedCount,
    rejectedCount,
    appliedCount,
    autoAppliedCount,
    undoneCount,
    obsoleteCount,
  };

  return {
    financialYears: fyRows.map((f) => ({ id: f.id, yearLabel: f.year_label, hasData: f.balance_count > 0 })),
    activeFinancialYearId: activeFyId,
    activeFinancialYearLabel: activeFy.year_label,
    units,
    activeUnitId: unitId || null,
    importBatches,
    activeImportBatchId: importBatchId || null,
    fslis,
    rules,
    summary,
    rows,
  };
}

export function getRegroupingAuditHistory(
  database: Database.Database,
  regroupingId: string,
): RegroupingAuditRecord[] {
  const rows = database.prepare(`
    SELECT
      id, regrouping_result_id, action,
      before_status, after_status,
      before_fsli_id, after_fsli_id,
      before_classification, after_classification,
      reason, performed_by, performed_at
    FROM RegroupingAudit
    WHERE regrouping_result_id = ?
    ORDER BY performed_at DESC
  `).all(regroupingId) as Array<{
    id: string;
    regrouping_result_id: string;
    action: string;
    before_status: string | null;
    after_status: string | null;
    before_fsli_id: string | null;
    after_fsli_id: string | null;
    before_classification: string | null;
    after_classification: string | null;
    reason: string | null;
    performed_by: string | null;
    performed_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    regroupingResultId: r.regrouping_result_id,
    action: r.action,
    beforeStatus: r.before_status,
    afterStatus: r.after_status,
    beforeFSLIId: r.before_fsli_id,
    afterFSLIId: r.after_fsli_id,
    beforeClassification: r.before_classification,
    afterClassification: r.after_classification,
    reason: r.reason,
    performedBy: r.performed_by,
    performedAt: r.performed_at,
  }));
}

function getRegroupingResultById(database: Database.Database, id: string): RegroupingResultRecord | null {
  const r = database.prepare(`
    SELECT
      id, ledger_id, unit_id, entity_id, financial_year_id,
      before_classification, before_fsli_id, before_fsli_name,
      proposed_classification, proposed_fsli_id, proposed_fsli_name,
      approved_classification, approved_fsli_id, approved_fsli_name,
      balance_debit, balance_credit, balance_net, balance_nature,
      tally_group_name, ledger_name, reason, rule_id, rule_name,
      confidence,
      COALESCE(detection_confidence, 1.0) as detection_confidence,
      COALESCE(recommendation_confidence, confidence, 0.85) as recommendation_confidence,
      status,
      approved_by, approved_at, applied_by, applied_at,
      undone_by, undone_at, undo_reason,
      created_at, updated_at
    FROM RegroupingResult WHERE id = ?
  `).get(id) as {
    id: string;
    ledger_id: string;
    unit_id: string;
    entity_id: string;
    financial_year_id: string;
    before_classification: string | null;
    before_fsli_id: string | null;
    before_fsli_name: string | null;
    proposed_classification: string | null;
    proposed_fsli_id: string | null;
    proposed_fsli_name: string | null;
    approved_classification: string | null;
    approved_fsli_id: string | null;
    approved_fsli_name: string | null;
    balance_debit: number;
    balance_credit: number;
    balance_net: number;
    balance_nature: 'Debit' | 'Credit' | 'Zero';
    tally_group_name: string | null;
    ledger_name: string;
    reason: string | null;
    rule_id: string | null;
    rule_name: string | null;
    confidence: number;
    detection_confidence: number;
    recommendation_confidence: number;
    status: RegroupingStatus;
    approved_by: string | null;
    approved_at: string | null;
    applied_by: string | null;
    applied_at: string | null;
    undone_by: string | null;
    undone_at: string | null;
    undo_reason: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!r) return null;

  return {
    id: r.id,
    ledgerId: r.ledger_id,
    unitId: r.unit_id,
    entityId: r.entity_id,
    financialYearId: r.financial_year_id,
    beforeClassification: r.before_classification,
    beforeFSLIId: r.before_fsli_id,
    beforeFSLIName: r.before_fsli_name,
    proposedClassification: r.proposed_classification,
    proposedFSLIId: r.proposed_fsli_id,
    proposedFSLIName: r.proposed_fsli_name,
    approvedClassification: r.approved_classification,
    approvedFSLIId: r.approved_fsli_id,
    approvedFSLIName: r.approved_fsli_name,
    balanceDebit: r.balance_debit,
    balanceCredit: r.balance_credit,
    balanceNet: r.balance_net,
    balanceNature: r.balance_nature,
    tallyGroupName: r.tally_group_name,
    ledgerName: r.ledger_name,
    reason: r.reason,
    ruleId: r.rule_id,
    ruleName: r.rule_name,
    confidence: r.confidence,
    detectionConfidence: r.detection_confidence,
    recommendationConfidence: r.recommendation_confidence,
    status: r.status,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    appliedBy: r.applied_by,
    appliedAt: r.applied_at,
    undoneBy: r.undone_by,
    undoneAt: r.undone_at,
    undoReason: r.undo_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
