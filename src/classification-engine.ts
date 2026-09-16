/**
 * Classification Engine (Phase 6)
 *
 * Deterministic, explainable classification engine that classifies ledgers
 * into financial statement line items using approved Phase 5 mappings as
 * primary input.
 *
 * Classification Priority (highest → lowest):
 *   1. Manual Override (is_manual_override = 1) — never overwritten
 *   2. Approved Phase 5 mapping (LedgerMapping.status = 'Mapped') → confidence 1.0
 *   3. User-created mapping rules (MappingRule) → confidence from rule
 *   4. Phase 5 suggested mapping (LedgerMapping.status = 'Suggested') → confidence from suggestion
 *   5. Tally Group deterministic rules → confidence from group dictionary
 *   6. Keyword matching → confidence from keyword dictionary
 *   7. Balance nature heuristic → confidence 0.5 (marked NeedsReview)
 *
 * This module must ONLY be imported in the main process.
 */

import type Database from 'better-sqlite3';
import type {
  ClassificationSource,
  ClassificationStatus,
  ClassificationRow,
  ClassificationSummary,
  ClassificationData,
  ClassificationUpdateItem,
  FSLIRecord,
  MappingStatus,
} from './electron-api';

// ── Types used internally ────────────────────────────────────────────────────

interface LedgerCandidate {
  ledgerId: string;
  ledgerName: string;
  tallyGroupName: string | null;
  parentGroupName: string | null;
  netBalance: number;
  balanceNature: 'Debit' | 'Credit' | 'Zero';
  // From Phase 5 mapping
  mappingStatus: MappingStatus | null;
  mappedFSLIId: string | null;
  mappedFSLIName: string | null;
  mappingConfidence: number | null;
  mappingSource: string | null;
  mappingReason: string | null;
  // Existing classification (if any)
  classificationId: string | null;
  isManualOverride: boolean;
  existingChildFSLIId: string | null;
  existingParentFSLIId: string | null;
  existingFinalFSLIId: string | null;
  existingSource: ClassificationSource | null;
  existingStatus: ClassificationStatus | null;
}

interface ClassificationResult {
  applicationClassification: string;
  childFSLIId: string | null;
  parentFSLIId: string | null;
  finalFSLIId: string | null;
  classificationSource: ClassificationSource;
  confidenceScore: number;
  reason: string;
  status: ClassificationStatus;
}

// ── Tally Group → FSLI classification rules ──────────────────────────────────

interface GroupClassificationRule {
  targetFSLICode: string;
  classification: string;
  confidence: number;
  reason: string;
}

const TALLY_GROUP_CLASSIFICATION_RULES: Record<string, GroupClassificationRule> = {
  'sundry creditors': { targetFSLICode: 'CL_TRADE_PAY', classification: 'Trade Payables', confidence: 0.95, reason: "Tally group 'Sundry Creditors' → Trade Payables" },
  'sundry creditors (trade)': { targetFSLICode: 'CL_TRADE_PAY', classification: 'Trade Payables', confidence: 0.95, reason: "Tally group 'Sundry Creditors (Trade)' → Trade Payables" },
  'sundry creditors (others)': { targetFSLICode: 'CL_OTH_LIAB', classification: 'Other Current Liabilities', confidence: 0.90, reason: "Tally group 'Sundry Creditors (Others)' → Other Current Liabilities" },
  'duties & taxes': { targetFSLICode: 'CL_DUTIES_TAX', classification: 'Duties and Taxes Payable', confidence: 0.95, reason: "Tally group 'Duties & Taxes' → Duties and Taxes Payable" },
  'provisions': { targetFSLICode: 'CL_ST_PROV', classification: 'Short-Term Provisions', confidence: 0.90, reason: "Tally group 'Provisions' → Short-Term Provisions" },
  'expenses payable': { targetFSLICode: 'CL_OTH_LIAB', classification: 'Other Current Liabilities', confidence: 0.92, reason: "Tally group 'Expenses Payable' → Other Current Liabilities" },
  'working capital loans from banks': { targetFSLICode: 'CL_ST_BORR', classification: 'Short-Term Borrowings', confidence: 0.95, reason: "Tally group 'Working Capital Loans' → Short-Term Borrowings" },
  'bank od a/c': { targetFSLICode: 'CL_ST_BORR', classification: 'Short-Term Borrowings', confidence: 0.95, reason: "Bank Overdraft → Short-Term Borrowings" },
  'secured loans': { targetFSLICode: 'NCL_LT_BORR', classification: 'Long-Term Borrowings', confidence: 0.90, reason: "Secured Loans → Long-Term Borrowings" },
  'unsecured loans': { targetFSLICode: 'NCL_LT_BORR', classification: 'Long-Term Borrowings', confidence: 0.90, reason: "Unsecured Loans → Long-Term Borrowings" },
  'sundry debtors': { targetFSLICode: 'CA_TRADE_REC', classification: 'Trade Receivables', confidence: 0.95, reason: "Tally group 'Sundry Debtors' → Trade Receivables" },
  'bank accounts': { targetFSLICode: 'CA_CASH_EQUIV', classification: 'Cash and Cash Equivalents', confidence: 0.95, reason: "Bank Accounts → Cash and Cash Equivalents" },
  'cash-in-hand': { targetFSLICode: 'CA_CASH_EQUIV', classification: 'Cash and Cash Equivalents', confidence: 0.95, reason: "Cash-in-hand → Cash and Cash Equivalents" },
  'deposits (asset)': { targetFSLICode: 'CA_OTH_ASSET', classification: 'Other Current Assets', confidence: 0.90, reason: "Deposits (Asset) → Other Current Assets" },
  'loans & advances (asset)': { targetFSLICode: 'CA_ST_LOAN', classification: 'Short-Term Loans and Advances', confidence: 0.90, reason: "Loans & Advances → Short-Term Loans and Advances" },
  'advances': { targetFSLICode: 'CA_ST_LOAN', classification: 'Short-Term Loans and Advances', confidence: 0.88, reason: "Advances → Short-Term Loans and Advances" },
  'stock-in-hand': { targetFSLICode: 'CA_INVENT', classification: 'Inventories', confidence: 0.95, reason: "Stock-in-hand → Inventories" },
  'fixed assets': { targetFSLICode: 'NCA_PPE', classification: 'Property, Plant and Equipment', confidence: 0.95, reason: "Fixed Assets → Property, Plant and Equipment" },
  'investments': { targetFSLICode: 'NCA_NC_INV', classification: 'Non-Current Investments', confidence: 0.90, reason: "Investments → Non-Current Investments" },
  'capital account': { targetFSLICode: 'EQ_CAP_FUND', classification: 'Capital / Corpus Fund', confidence: 0.92, reason: "Capital Account → Capital / Corpus Fund" },
  'reserves & surplus': { targetFSLICode: 'EQ_RES_SURP', classification: 'Reserves and Surplus', confidence: 0.95, reason: "Reserves & Surplus → Reserves and Surplus" },
  'sales accounts': { targetFSLICode: 'INC_REV_OPS', classification: 'Revenue from Operations', confidence: 0.95, reason: "Sales Accounts → Revenue from Operations" },
  'purchase accounts': { targetFSLICode: 'EXP_PUR_STOCK', classification: 'Purchases of Stock-in-Trade', confidence: 0.90, reason: "Purchase Accounts → Purchases of Stock-in-Trade" },
  'direct income': { targetFSLICode: 'INC_REV_OPS', classification: 'Revenue from Operations', confidence: 0.95, reason: "Direct Income → Revenue from Operations" },
  'indirect income': { targetFSLICode: 'INC_OTH_INC', classification: 'Other Income', confidence: 0.90, reason: "Indirect Income → Other Income" },
  'direct expenses': { targetFSLICode: 'EXP_MAT_CONS', classification: 'Cost of Materials Consumed', confidence: 0.85, reason: "Direct Expenses → Cost of Materials Consumed" },
  'indirect expenses': { targetFSLICode: 'EXP_OTH_EXP', classification: 'Other Expenses', confidence: 0.85, reason: "Indirect Expenses → Other Expenses" },
};

// ── Keyword classification rules ─────────────────────────────────────────────

interface KeywordClassificationRule {
  keywords: string[];
  targetFSLICode: string;
  classification: string;
  confidence: number;
  reasonTemplate: (kw: string) => string;
  condition?: (name: string, nature: string) => boolean;
}

const KEYWORD_CLASSIFICATION_RULES: KeywordClassificationRule[] = [
  {
    keywords: ['salaries', 'salary', 'wages', 'remuneration', 'bonus', 'provident fund', 'pf contribution', 'esi contribution', 'gratuity', 'staff welfare'],
    targetFSLICode: 'EXP_EMP_BEN',
    classification: 'Employee Benefit Expense',
    confidence: 0.92,
    reasonTemplate: (kw) => `Keyword '${kw}' → Employee Benefit Expense`,
    condition: (name) => !name.includes('payable') && !name.includes('provision') && !name.includes('accrued'),
  },
  {
    keywords: ['interest on loan', 'interest paid', 'interest expense', 'finance charges', 'bank charges', 'bank commission'],
    targetFSLICode: 'EXP_FIN_COST',
    classification: 'Finance Costs',
    confidence: 0.90,
    reasonTemplate: (kw) => `Keyword '${kw}' → Finance Costs`,
    condition: (name) => !name.includes('received') && !name.includes('income'),
  },
  {
    keywords: ['interest received', 'interest income', 'dividend received', 'discount received', 'miscellaneous income'],
    targetFSLICode: 'INC_OTH_INC',
    classification: 'Other Income',
    confidence: 0.90,
    reasonTemplate: (kw) => `Keyword '${kw}' → Other Income`,
  },
  {
    keywords: ['depreciation', 'amortization', 'amortisation'],
    targetFSLICode: 'EXP_DEP_AMORT',
    classification: 'Depreciation and Amortization',
    confidence: 0.95,
    reasonTemplate: (kw) => `Keyword '${kw}' → Depreciation and Amortization`,
  },
  {
    keywords: ['gst payable', 'tds payable', 'tcs payable', 'duties & taxes'],
    targetFSLICode: 'CL_DUTIES_TAX',
    classification: 'Duties and Taxes Payable',
    confidence: 0.90,
    reasonTemplate: (kw) => `Keyword '${kw}' → Duties and Taxes Payable`,
  },
  {
    keywords: ['rent', 'lease rent', 'office rent'],
    targetFSLICode: 'EXP_ADMIN_GEN',
    classification: 'Administrative and General Expenses',
    confidence: 0.85,
    reasonTemplate: (kw) => `Keyword '${kw}' → Administrative and General Expenses`,
    condition: (name) => !name.includes('income') && !name.includes('received'),
  },
  {
    keywords: ['telephone', 'internet', 'postage', 'courier', 'communication'],
    targetFSLICode: 'EXP_ADMIN_GEN',
    classification: 'Administrative and General Expenses',
    confidence: 0.85,
    reasonTemplate: (kw) => `Keyword '${kw}' → Administrative and General Expenses`,
  },
  {
    keywords: ['printing', 'stationery', 'office expenses', 'miscellaneous expenses', 'travelling', 'conveyance'],
    targetFSLICode: 'EXP_OTH_EXP',
    classification: 'Other Expenses',
    confidence: 0.82,
    reasonTemplate: (kw) => `Keyword '${kw}' → Other Expenses`,
  },
];

// ── Balance Nature Heuristic ─────────────────────────────────────────────────

function classifyByBalanceNature(nature: string): { classification: string; fsliCode: string } {
  switch (nature) {
    case 'Debit':
      return { classification: 'Unclassified Debit Balance', fsliCode: 'EXP_OTH_EXP' };
    case 'Credit':
      return { classification: 'Unclassified Credit Balance', fsliCode: 'CL_OTH_LIAB' };
    default:
      return { classification: 'Zero Balance Item', fsliCode: 'EXP_OTH_EXP' };
  }
}

// ── Core Classification Logic ────────────────────────────────────────────────

/**
 * Classifies a single ledger using the priority chain.
 * Returns the classification result with source, confidence, and reason.
 */
function classifyLedger(
  candidate: LedgerCandidate,
  fsliMap: Map<string, FSLIRecord>,
  fsliByCode: Map<string, FSLIRecord>,
  userRules: Array<{ conditions: string; targetFSLIId: string | null; confidence: number }>,
): ClassificationResult {
  // Priority 1: Manual Override — already handled by caller (skipped)

  // Priority 2: Approved Phase 5 mapping (status = 'Mapped')
  if (candidate.mappingStatus === 'Mapped' && candidate.mappedFSLIId) {
    const mappedFSLI = fsliMap.get(candidate.mappedFSLIId);
    if (mappedFSLI) {
      const { childId, parentId, finalId } = resolveFSLIHierarchy(candidate.mappedFSLIId, fsliMap);
      return {
        applicationClassification: mappedFSLI.fsliName,
        childFSLIId: childId,
        parentFSLIId: parentId,
        finalFSLIId: finalId,
        classificationSource: 'MAPPING',
        confidenceScore: 1.0,
        reason: `Approved Phase 5 mapping → ${mappedFSLI.fsliName}`,
        status: 'Classified',
      };
    }
  }

  // Priority 3: User-created mapping rules
  for (const rule of userRules) {
    try {
      const conditions = JSON.parse(rule.conditions);
      if (matchesRule(candidate, conditions) && rule.targetFSLIId) {
        const targetFSLI = fsliMap.get(rule.targetFSLIId);
        if (targetFSLI) {
          const { childId, parentId, finalId } = resolveFSLIHierarchy(rule.targetFSLIId, fsliMap);
          return {
            applicationClassification: targetFSLI.fsliName,
            childFSLIId: childId,
            parentFSLIId: parentId,
            finalFSLIId: finalId,
            classificationSource: 'RULE',
            confidenceScore: rule.confidence,
            reason: `User rule matched → ${targetFSLI.fsliName}`,
            status: rule.confidence >= 0.85 ? 'Classified' : 'NeedsReview',
          };
        }
      }
    } catch {
      // Invalid rule conditions, skip
    }
  }

  // Priority 4: Phase 5 suggested mapping (status = 'Suggested')
  if (candidate.mappingStatus === 'Suggested' && candidate.mappedFSLIId) {
    const sugFSLI = fsliMap.get(candidate.mappedFSLIId);
    if (sugFSLI) {
      const { childId, parentId, finalId } = resolveFSLIHierarchy(candidate.mappedFSLIId, fsliMap);
      const conf = candidate.mappingConfidence ?? 0.8;
      return {
        applicationClassification: sugFSLI.fsliName,
        childFSLIId: childId,
        parentFSLIId: parentId,
        finalFSLIId: finalId,
        classificationSource: 'AUTO',
        confidenceScore: conf,
        reason: candidate.mappingReason || `Phase 5 suggestion → ${sugFSLI.fsliName}`,
        status: conf >= 0.85 ? 'Classified' : 'NeedsReview',
      };
    }
  }

  // Priority 5: Tally Group deterministic rules
  const groupName = (candidate.tallyGroupName || '').toLowerCase().trim();
  const parentName = (candidate.parentGroupName || '').toLowerCase().trim();

  for (const [ruleGroup, rule] of Object.entries(TALLY_GROUP_CLASSIFICATION_RULES)) {
    if (groupName === ruleGroup || parentName === ruleGroup) {
      const targetFSLI = fsliByCode.get(rule.targetFSLICode);
      if (targetFSLI) {
        const { childId, parentId, finalId } = resolveFSLIHierarchy(targetFSLI.id, fsliMap);
        return {
          applicationClassification: rule.classification,
          childFSLIId: childId,
          parentFSLIId: parentId,
          finalFSLIId: finalId,
          classificationSource: 'AUTO',
          confidenceScore: rule.confidence,
          reason: rule.reason,
          status: rule.confidence >= 0.85 ? 'Classified' : 'NeedsReview',
        };
      }
    }
  }

  // Priority 6: Keyword matching
  const ledgerNameLower = candidate.ledgerName.toLowerCase();
  for (const rule of KEYWORD_CLASSIFICATION_RULES) {
    if (rule.condition && !rule.condition(ledgerNameLower, candidate.balanceNature)) {
      continue;
    }
    for (const kw of rule.keywords) {
      if (ledgerNameLower.includes(kw)) {
        const targetFSLI = fsliByCode.get(rule.targetFSLICode);
        if (targetFSLI) {
          const { childId, parentId, finalId } = resolveFSLIHierarchy(targetFSLI.id, fsliMap);
          return {
            applicationClassification: rule.classification,
            childFSLIId: childId,
            parentFSLIId: parentId,
            finalFSLIId: finalId,
            classificationSource: 'AUTO',
            confidenceScore: rule.confidence,
            reason: rule.reasonTemplate(kw),
            status: rule.confidence >= 0.85 ? 'Classified' : 'NeedsReview',
          };
        }
      }
    }
  }

  // Priority 7: Balance nature heuristic (fallback)
  const heuristic = classifyByBalanceNature(candidate.balanceNature);
  const heuristicFSLI = fsliByCode.get(heuristic.fsliCode);
  if (heuristicFSLI) {
    const { childId, parentId, finalId } = resolveFSLIHierarchy(heuristicFSLI.id, fsliMap);
    return {
      applicationClassification: heuristic.classification,
      childFSLIId: childId,
      parentFSLIId: parentId,
      finalFSLIId: finalId,
      classificationSource: 'AUTO',
      confidenceScore: 0.5,
      reason: `Balance nature heuristic (${candidate.balanceNature}) — needs manual review`,
      status: 'NeedsReview',
    };
  }

  // Absolute fallback
  return {
    applicationClassification: 'Unclassified',
    childFSLIId: null,
    parentFSLIId: null,
    finalFSLIId: null,
    classificationSource: 'PENDING',
    confidenceScore: 0,
    reason: 'No classification rule matched',
    status: 'Unclassified',
  };
}

/**
 * Resolves FSLI hierarchy: given an FSLI ID, determines child/parent/final.
 * If the FSLI has a parent_fsli_id, the FSLI itself is the "child" and parent_fsli_id is the "parent".
 * If the FSLI has no parent, it acts as both child and final.
 */
function resolveFSLIHierarchy(
  fsliId: string,
  fsliMap: Map<string, FSLIRecord>,
): { childId: string | null; parentId: string | null; finalId: string | null } {
  const fsli = fsliMap.get(fsliId);
  if (!fsli) {
    return { childId: null, parentId: null, finalId: null };
  }

  if (fsli.parentFSLIId) {
    // This FSLI is a child — its parent is the Parent FSLI
    return {
      childId: fsli.id,
      parentId: fsli.parentFSLIId,
      finalId: fsli.parentFSLIId, // Final resolves to the top-level parent
    };
  }

  // This FSLI is top-level — it is both the classification target and the final
  return {
    childId: fsli.id,
    parentId: null,
    finalId: fsli.id,
  };
}

/**
 * Simple rule condition matcher (matches user-defined MappingRule conditions).
 */
function matchesRule(
  candidate: LedgerCandidate,
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
      default:
        continue;
    }

    const lowerField = fieldValue.toLowerCase();
    const lowerValue = (rule.value || '').toLowerCase();

    switch (rule.operator) {
      case 'equals':
        if (lowerField !== lowerValue) return false;
        break;
      case 'contains':
        if (!lowerField.includes(lowerValue)) return false;
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

// ── Database Functions ───────────────────────────────────────────────────────

/**
 * Fetches all classification data for a given financial year.
 */
export function getClassificationData(
  database: Database.Database,
  financialYearId?: string,
  unitId?: string,
  importBatchId?: string,
): ClassificationData {
  const emptyResult = (fys: Array<{ id: string; year_label: string; balance_count: number }>, activeFyId: string, activeFyLabel: string): ClassificationData => ({
    financialYears: fys.map((f) => ({ id: f.id, yearLabel: f.year_label, hasData: f.balance_count > 0 })),
    activeFinancialYearId: activeFyId,
    activeFinancialYearLabel: activeFyLabel,
    units: [],
    activeUnitId: unitId || null,
    importBatches: [],
    activeImportBatchId: importBatchId || null,
    fslis: [],
    summary: { totalLedgers: 0, classifiedCount: 0, unclassifiedCount: 0, needsReviewCount: 0, manualOverrideCount: 0, autoClassifiedCount: 0 },
    rows: [],
  });

  // 1. Fetch available Financial Years with data availability
  const fyRows = database.prepare(`
    SELECT fy.id, fy.year_label,
           (SELECT COUNT(*) FROM LedgerBalance lb WHERE lb.financial_year_id = fy.id) as balance_count
    FROM FinancialYear fy
    ORDER BY fy.year_label DESC
  `).all() as Array<{ id: string; year_label: string; balance_count: number }>;

  if (fyRows.length === 0) {
    return emptyResult([], '', 'No Financial Year');
  }

  const activeFy = financialYearId
    ? fyRows.find((f) => f.id === financialYearId) || fyRows[0]
    : fyRows[0];
  const activeFyId = activeFy.id;

  // Check if this FY has data
  if (activeFy.balance_count === 0) {
    return emptyResult(fyRows, activeFyId, activeFy.year_label);
  }

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

  const fsliMap = new Map<string, FSLIRecord>();
  for (const f of fslis) fsliMap.set(f.id, f);

  // 5. Build dynamic WHERE clause for unit/batch scoping
  const whereClauses: string[] = [];
  const whereParams: (string)[] = [];

  if (unitId) {
    whereClauses.push('l.unit_id = ?');
    whereParams.push(unitId);
  }
  if (importBatchId) {
    whereClauses.push('lb.import_batch_id = ?');
    whereParams.push(importBatchId);
  }

  const extraWhere = whereClauses.length > 0 ? ' AND ' + whereClauses.join(' AND ') : '';

  // 6. Fetch ledgers with balances, groups, mappings, and existing classifications
  const ledgerRows = database.prepare(`
    SELECT
      l.id as ledger_id,
      l.ledger_name,
      l.unit_id,
      u.unit_name,
      tg.group_name as tally_group_name,
      ptg.group_name as parent_group_name,
      lb.net_balance,
      lb.debit,
      lb.credit,
      lm.mapped_fsli_id,
      lm.status as mapping_status,
      lm.confidence_score as mapping_confidence,
      lm.mapping_source,
      lc.id as classification_id,
      lc.original_tally_classification,
      lc.application_classification,
      lc.child_fsli_id,
      lc.parent_fsli_id as cls_parent_fsli_id,
      lc.final_fsli_id,
      lc.classification_source,
      lc.confidence_score as cls_confidence,
      lc.reason as cls_reason,
      lc.is_manual_override,
      lc.status as cls_status,
      lc.approved_by,
      lc.approved_at
    FROM Ledger l
    JOIN LedgerBalance lb ON l.id = lb.ledger_id AND lb.financial_year_id = ?
    JOIN Unit u ON l.unit_id = u.id
    LEFT JOIN TallyGroup tg ON l.tally_group_id = tg.id
    LEFT JOIN TallyGroup ptg ON tg.parent_group_id = ptg.id
    LEFT JOIN LedgerMapping lm ON l.id = lm.ledger_id AND lm.financial_year_id = ?
    LEFT JOIN LedgerClassification lc ON l.id = lc.ledger_id AND lc.financial_year_id = ?
    WHERE 1=1${extraWhere}
    ORDER BY tg.group_name ASC, l.ledger_name ASC
  `).all(activeFyId, activeFyId, activeFyId, ...whereParams) as Array<{
    ledger_id: string;
    ledger_name: string;
    unit_id: string;
    unit_name: string;
    tally_group_name: string | null;
    parent_group_name: string | null;
    net_balance: number | null;
    debit: number | null;
    credit: number | null;
    mapped_fsli_id: string | null;
    mapping_status: string | null;
    mapping_confidence: number | null;
    mapping_source: string | null;
    classification_id: string | null;
    original_tally_classification: string | null;
    application_classification: string | null;
    child_fsli_id: string | null;
    cls_parent_fsli_id: string | null;
    final_fsli_id: string | null;
    classification_source: string | null;
    cls_confidence: number | null;
    cls_reason: string | null;
    is_manual_override: number | null;
    cls_status: string | null;
    approved_by: string | null;
    approved_at: string | null;
  }>;

  // 7. Build rows
  let classifiedCount = 0;
  let unclassifiedCount = 0;
  let needsReviewCount = 0;
  let manualOverrideCount = 0;
  let autoClassifiedCount = 0;

  const rows: ClassificationRow[] = ledgerRows.map((r) => {
    const net = r.net_balance ?? (r.debit || 0) - (r.credit || 0);
    const nature: 'Debit' | 'Credit' | 'Zero' = net > 0 ? 'Debit' : net < 0 ? 'Credit' : 'Zero';

    // Determine status and metrics
    const status = (r.cls_status as ClassificationStatus) || 'Unclassified';
    const isManual = (r.is_manual_override ?? 0) === 1;

    switch (status) {
      case 'Classified':
        classifiedCount++;
        if (!isManual) autoClassifiedCount++;
        break;
      case 'ManualOverride':
        manualOverrideCount++;
        classifiedCount++;
        break;
      case 'NeedsReview':
        needsReviewCount++;
        break;
      default:
        unclassifiedCount++;
    }

    // Resolve FSLI names
    const childFSLI = r.child_fsli_id ? fsliMap.get(r.child_fsli_id) : null;
    const parentFSLI = r.cls_parent_fsli_id ? fsliMap.get(r.cls_parent_fsli_id) : null;
    const finalFSLI = r.final_fsli_id ? fsliMap.get(r.final_fsli_id) : null;
    const mappedFSLI = r.mapped_fsli_id ? fsliMap.get(r.mapped_fsli_id) : null;

    return {
      ledgerId: r.ledger_id,
      ledgerName: r.ledger_name,
      unitId: r.unit_id,
      unitName: r.unit_name,
      tallyGroupName: r.tally_group_name,
      parentGroupName: r.parent_group_name,
      netBalance: net,
      balanceNature: nature,
      originalTallyClassification: r.original_tally_classification || r.tally_group_name,
      applicationClassification: r.application_classification,
      childFSLIId: r.child_fsli_id,
      childFSLIName: childFSLI?.fsliName || null,
      parentFSLIId: r.cls_parent_fsli_id,
      parentFSLIName: parentFSLI?.fsliName || null,
      finalFSLIId: r.final_fsli_id,
      finalFSLIName: finalFSLI?.fsliName || null,
      classificationSource: (r.classification_source as ClassificationSource) || 'PENDING',
      confidenceScore: r.cls_confidence ?? 0,
      reason: r.cls_reason,
      status,
      isManualOverride: isManual,
      classificationId: r.classification_id,
      mappedFSLIId: r.mapped_fsli_id,
      mappedFSLIName: mappedFSLI?.fsliName || null,
      mappingStatus: r.mapping_status as MappingStatus | null,
    };
  });

  return {
    financialYears: fyRows.map((f) => ({ id: f.id, yearLabel: f.year_label, hasData: f.balance_count > 0 })),
    activeFinancialYearId: activeFyId,
    activeFinancialYearLabel: activeFy.year_label,
    units,
    activeUnitId: unitId || null,
    importBatches,
    activeImportBatchId: importBatchId || null,
    fslis,
    summary: {
      totalLedgers: rows.length,
      classifiedCount,
      unclassifiedCount,
      needsReviewCount,
      manualOverrideCount,
      autoClassifiedCount,
    },
    rows,
  };
}

/**
 * Runs auto-classification for ledgers in the given scope.
 * Skips manual overrides.
 */
export function autoClassifyLedgers(
  database: Database.Database,
  financialYearId: string,
  unitId?: string,
  importBatchId?: string,
): { classifiedCount: number; skippedCount: number } {
  const now = new Date().toISOString();
  const crypto = require('node:crypto');

  // 1. Build FSLI lookups
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

  // 2. Fetch user-defined mapping rules (active only)
  const userRules = database.prepare(`
    SELECT conditions, target_fsli_id, confidence
    FROM MappingRule WHERE active = 1
    ORDER BY priority DESC
  `).all() as Array<{ conditions: string; target_fsli_id: string | null; confidence: number }>;

  const mappedRules = userRules.map((r) => ({
    conditions: r.conditions,
    targetFSLIId: r.target_fsli_id,
    confidence: r.confidence,
  }));

  // 3. Build dynamic WHERE clause for unit/batch scoping
  const whereClauses: string[] = [];
  const whereParams: string[] = [];

  if (unitId) {
    whereClauses.push('l.unit_id = ?');
    whereParams.push(unitId);
  }
  if (importBatchId) {
    whereClauses.push('lb.import_batch_id = ?');
    whereParams.push(importBatchId);
  }

  const extraWhere = whereClauses.length > 0 ? ' AND ' + whereClauses.join(' AND ') : '';

  // 4. Fetch candidates (scoped)
  const candidates = database.prepare(`
    SELECT
      l.id as ledger_id,
      l.ledger_name,
      tg.group_name as tally_group_name,
      ptg.group_name as parent_group_name,
      lb.net_balance,
      lb.debit,
      lb.credit,
      lm.mapped_fsli_id,
      lm.status as mapping_status,
      lm.confidence_score as mapping_confidence,
      lm.mapping_source,
      lc.id as classification_id,
      lc.is_manual_override,
      lc.child_fsli_id as existing_child_fsli_id,
      lc.parent_fsli_id as existing_parent_fsli_id,
      lc.final_fsli_id as existing_final_fsli_id,
      lc.classification_source as existing_source,
      lc.status as existing_status
    FROM Ledger l
    JOIN LedgerBalance lb ON l.id = lb.ledger_id AND lb.financial_year_id = ?
    LEFT JOIN TallyGroup tg ON l.tally_group_id = tg.id
    LEFT JOIN TallyGroup ptg ON tg.parent_group_id = ptg.id
    LEFT JOIN LedgerMapping lm ON l.id = lm.ledger_id AND lm.financial_year_id = ?
    LEFT JOIN LedgerClassification lc ON l.id = lc.ledger_id AND lc.financial_year_id = ?
    WHERE 1=1${extraWhere}
    ORDER BY l.ledger_name
  `).all(financialYearId, financialYearId, financialYearId, ...whereParams) as Array<{
    ledger_id: string;
    ledger_name: string;
    tally_group_name: string | null;
    parent_group_name: string | null;
    net_balance: number | null;
    debit: number | null;
    credit: number | null;
    mapped_fsli_id: string | null;
    mapping_status: string | null;
    mapping_confidence: number | null;
    mapping_source: string | null;
    classification_id: string | null;
    is_manual_override: number | null;
    existing_child_fsli_id: string | null;
    existing_parent_fsli_id: string | null;
    existing_final_fsli_id: string | null;
    existing_source: string | null;
    existing_status: string | null;
  }>;

  // 5. Prepare upsert statement
  const upsert = database.prepare(`
    INSERT INTO LedgerClassification (
      id, ledger_id, financial_year_id,
      original_tally_classification, application_classification,
      child_fsli_id, parent_fsli_id, final_fsli_id,
      classification_source, confidence_score, reason,
      is_manual_override, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    ON CONFLICT(ledger_id, financial_year_id) DO UPDATE SET
      application_classification = excluded.application_classification,
      child_fsli_id = excluded.child_fsli_id,
      parent_fsli_id = excluded.parent_fsli_id,
      final_fsli_id = excluded.final_fsli_id,
      classification_source = excluded.classification_source,
      confidence_score = excluded.confidence_score,
      reason = excluded.reason,
      status = excluded.status,
      updated_at = excluded.updated_at
    WHERE LedgerClassification.is_manual_override = 0
  `);

  let classifiedCount = 0;
  let skippedCount = 0;

  const tx = database.transaction(() => {
    for (const c of candidates) {
      // Skip manual overrides
      if ((c.is_manual_override ?? 0) === 1) {
        skippedCount++;
        continue;
      }

      const net = c.net_balance ?? (c.debit || 0) - (c.credit || 0);
      const nature: 'Debit' | 'Credit' | 'Zero' = net > 0 ? 'Debit' : net < 0 ? 'Credit' : 'Zero';

      const candidate: LedgerCandidate = {
        ledgerId: c.ledger_id,
        ledgerName: c.ledger_name,
        tallyGroupName: c.tally_group_name,
        parentGroupName: c.parent_group_name,
        netBalance: net,
        balanceNature: nature,
        mappingStatus: c.mapping_status as MappingStatus | null,
        mappedFSLIId: c.mapped_fsli_id,
        mappedFSLIName: c.mapped_fsli_id ? (fsliMap.get(c.mapped_fsli_id)?.fsliName || null) : null,
        mappingConfidence: c.mapping_confidence,
        mappingSource: c.mapping_source,
        mappingReason: null,
        classificationId: c.classification_id,
        isManualOverride: false,
        existingChildFSLIId: c.existing_child_fsli_id,
        existingParentFSLIId: c.existing_parent_fsli_id,
        existingFinalFSLIId: c.existing_final_fsli_id,
        existingSource: c.existing_source as ClassificationSource | null,
        existingStatus: c.existing_status as ClassificationStatus | null,
      };

      const result = classifyLedger(candidate, fsliMap, fsliByCode, mappedRules);

      const id = c.classification_id || `cls-${crypto.randomUUID()}`;
      const originalTallyClassification = c.tally_group_name || null;

      upsert.run(
        id,
        c.ledger_id,
        financialYearId,
        originalTallyClassification,
        result.applicationClassification,
        result.childFSLIId,
        result.parentFSLIId,
        result.finalFSLIId,
        result.classificationSource,
        result.confidenceScore,
        result.reason,
        result.status,
        now,
        now,
      );
      classifiedCount++;
    }
  });

  tx();
  return { classifiedCount, skippedCount };
}

/**
 * Saves manual classification updates for one or more ledgers.
 */
export function saveClassifications(
  database: Database.Database,
  financialYearId: string,
  items: ClassificationUpdateItem[],
): { savedCount: number } {
  const now = new Date().toISOString();
  const crypto = require('node:crypto');

  const upsert = database.prepare(`
    INSERT INTO LedgerClassification (
      id, ledger_id, financial_year_id,
      original_tally_classification, application_classification,
      child_fsli_id, parent_fsli_id, final_fsli_id,
      classification_source, confidence_score, reason,
      is_manual_override, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ledger_id, financial_year_id) DO UPDATE SET
      application_classification = COALESCE(excluded.application_classification, LedgerClassification.application_classification),
      child_fsli_id = CASE WHEN excluded.child_fsli_id IS NOT NULL THEN excluded.child_fsli_id ELSE LedgerClassification.child_fsli_id END,
      parent_fsli_id = CASE WHEN excluded.parent_fsli_id IS NOT NULL THEN excluded.parent_fsli_id ELSE LedgerClassification.parent_fsli_id END,
      final_fsli_id = CASE WHEN excluded.final_fsli_id IS NOT NULL THEN excluded.final_fsli_id ELSE LedgerClassification.final_fsli_id END,
      classification_source = excluded.classification_source,
      confidence_score = excluded.confidence_score,
      reason = excluded.reason,
      is_manual_override = excluded.is_manual_override,
      status = excluded.status,
      updated_at = excluded.updated_at
  `);

  // Fetch original tally classification (group name) for each ledger
  const getOriginalTally = database.prepare(`
    SELECT tg.group_name
    FROM Ledger l
    LEFT JOIN TallyGroup tg ON l.tally_group_id = tg.id
    WHERE l.id = ?
  `);

  let savedCount = 0;

  const tx = database.transaction(() => {
    for (const item of items) {
      const tallyRow = getOriginalTally.get(item.ledgerId) as { group_name: string | null } | undefined;
      const originalTally = tallyRow?.group_name || null;

      const id = `cls-${crypto.randomUUID()}`;
      const isManual = item.isManualOverride !== undefined ? item.isManualOverride : true;
      const source = item.classificationSource || (isManual ? 'MANUAL' : 'AUTO');
      const status = item.status || (isManual ? 'ManualOverride' : 'Classified');

      upsert.run(
        id,
        item.ledgerId,
        financialYearId,
        originalTally,
        item.applicationClassification || null,
        item.childFSLIId ?? null,
        item.parentFSLIId ?? null,
        item.finalFSLIId ?? null,
        source,
        item.confidenceScore ?? 1.0,
        item.reason || (isManual ? 'Manual classification by user' : null),
        isManual ? 1 : 0,
        status,
        now,
        now,
      );
      savedCount++;
    }
  });

  tx();
  return { savedCount };
}

/**
 * Resets classification decisions for ledgers in the given scope.
 * When unitId/importBatchId are provided, only classifications for
 * ledgers matching the scope are deleted. Otherwise deletes all for the FY.
 * Does NOT touch LedgerMapping, Ledger, TallyGroup, or LedgerBalance.
 */
export function resetClassifications(
  database: Database.Database,
  financialYearId: string,
  unitId?: string,
  importBatchId?: string,
): { deletedCount: number } {
  // If no unit/batch scope, delete all for FY (original behavior)
  if (!unitId && !importBatchId) {
    const result = database.prepare(`
      DELETE FROM LedgerClassification WHERE financial_year_id = ?
    `).run(financialYearId);
    return { deletedCount: result.changes };
  }

  // Scoped delete: only delete classifications for ledgers matching the scope
  const whereClauses: string[] = [];
  const whereParams: string[] = [];

  if (unitId) {
    whereClauses.push('l.unit_id = ?');
    whereParams.push(unitId);
  }
  if (importBatchId) {
    whereClauses.push('lb.import_batch_id = ?');
    whereParams.push(importBatchId);
  }

  const extraWhere = whereClauses.join(' AND ');

  const result = database.prepare(`
    DELETE FROM LedgerClassification
    WHERE financial_year_id = ?
      AND ledger_id IN (
        SELECT DISTINCT l.id
        FROM Ledger l
        JOIN LedgerBalance lb ON lb.ledger_id = l.id AND lb.financial_year_id = ?
        WHERE ${extraWhere}
      )
  `).run(financialYearId, financialYearId, ...whereParams);

  return { deletedCount: result.changes };
}
