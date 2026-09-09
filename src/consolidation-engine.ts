/**
 * Consolidation Engine (Phase 9)
 *
 * Dedicated, auditable consolidation & interbranch elimination layer
 * that operates AFTER Phase 8 Adjustments and BEFORE Phase 10 FSLI / FS.
 *
 * Data flow:
 *   Original Trial Balance
 *   → Phase 5 Mapping
 *   → Phase 6 Classification
 *   → Phase 7 Regrouping
 *   → Phase 8 Adjustments
 *   → Phase 9 Consolidation & Interbranch Elimination
 *   → Phase 10 FSLI / Financial Statements
 *
 * CRITICAL RULES:
 * 1. Phase 9 NEVER modifies unit-level data (LedgerBalance, LedgerMapping,
 *    LedgerClassification, RegroupingResult, Adjustment, AdjustmentLine).
 * 2. Phase 9 ONLY writes to its own 4 tables: ConsolidationRun,
 *    ConsolidationElimination, ConsolidationEliminationLine, ConsolidationAudit.
 * 3. Unit Balance Sheets always retain Branch/Division and Santhigiri Ashram HO
 *    balances — Phase 9 elimination NEVER alters a Unit Balance Sheet.
 * 4. Keyword-only detection is NEVER sufficient for automatic elimination.
 *    Multi-layer evidence hierarchy is required.
 * 5. Sundry Debtors are NOT treated as internal merely because of Tally Group.
 * 6. Counterparty identification requires relationship evidence, not just
 *    opposite-side balance matching.
 * 7. Consolidation scope is strictly limited to selected units + one FY.
 * 8. Duplicate elimination prevention: one inter-unit relationship = one elimination.
 * 9. No artificial balancing figures — differences are always reported.
 * 10. Phase 7 no-netting rules are preserved.
 *
 * This module must ONLY be imported in the main process.
 */

import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import type {
  ConsolidationRunStatus,
  EliminationMatchStatus,
  EliminationStatus,
  InternalAccountType,
  ConsolidationRunRecord,
  ConsolidationEliminationRecord,
  ConsolidationEliminationLineRecord,
  ConsolidationAuditRecord,
  UnitPreConsolidationSummary,
  ConsolidationWorkbenchData,
  ConsolidatedTrialBalanceData,
  ConsolidatedTrialBalanceRow,
  InternalControlSummary,
  UnmatchedItem,
  CreateConsolidationRunInput,
  CreateEliminationInput,
  UpdateEliminationInput,
  EliminationReviewData,
  EliminationReviewRow,
  EliminationReviewSummary,
  AdjustedTrialBalanceData,
  ConsolidatedBalanceSheetPreviewData,
  ConsolidatedBalanceSheetRow,
  ConsolidatedBalanceSheetReconciliation,
} from './electron-api';
import { getAdjustedTrialBalance } from './adjustments-engine';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_ENTITY_ID = 'default-entity';

/** Tally Groups that indicate Branch/Division internal accounts. */
const BRANCH_DIVISION_TALLY_GROUPS = [
  'branch / divisions',
  'branch/divisions',
  'branch divisions',
];

/** Ledger name patterns indicating Branch/Division relationships. */
const BRANCH_DIVISION_PATTERNS = [
  /branch\s*divn/i,
  /branch\s*\/\s*division/i,
  /branch\s*-\s*/i,
  /\bbr\s*\.\s*divn\b/i,
  /\bbranch\b/i,
  /\bdivision\b/i,
];

/** Ledger name patterns indicating Santhigiri Ashram HO relationships. */
const SANTHIGIRI_HO_PATTERNS = [
  /santhigiri\s*ashram\s*h\s*\.?\s*o/i,
  /santhigiri\s*ashram\s*head\s*office/i,
  /ashram\s*head\s*office/i,
  /ashram\s*h\s*\.?\s*o/i,
  /\bh\s*\.?\s*o\s*a\s*\/\s*c\b/i,
];

/** Sundry Debtors group name (must NOT be auto-treated as internal). */
const SUNDRY_DEBTORS_GROUPS = [
  'sundry debtors',
];

// ── Internal Helpers ──────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function generateRunNumber(db: Database.Database, fyId: string): string {
  const count = db.prepare(
    `SELECT COUNT(*) as cnt FROM ConsolidationRun WHERE financial_year_id = ?`
  ).get(fyId) as { cnt: number };
  return `CR-${String((count?.cnt || 0) + 1).padStart(4, '0')}`;
}

function generateEliminationNumber(db: Database.Database, runId: string): string {
  const count = db.prepare(
    `SELECT COUNT(*) as cnt FROM ConsolidationElimination WHERE consolidation_run_id = ?`
  ).get(runId) as { cnt: number };
  return `CE-${String((count?.cnt || 0) + 1).padStart(4, '0')}`;
}

function insertAudit(
  db: Database.Database,
  runId: string | null,
  eliminationId: string | null,
  action: string,
  beforeStatus: string | null,
  afterStatus: string | null,
  details: string | null,
  reason: string | null,
  performedBy: string | null,
): void {
  db.prepare(`
    INSERT INTO ConsolidationAudit (id, consolidation_run_id, elimination_id,
      action, before_status, after_status, details, reason, performed_by, performed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `ca-${crypto.randomUUID()}`,
    runId,
    eliminationId,
    action,
    beforeStatus,
    afterStatus,
    details,
    reason,
    performedBy,
    new Date().toISOString(),
  );
}

function mapRunRow(row: any, db?: Database.Database): ConsolidationRunRecord {
  const unitIds: string[] = JSON.parse(row.selected_unit_ids || '[]');
  let unitNames: string[] | undefined;
  if (db) {
    unitNames = unitIds.map((uid: string) => {
      const u = db.prepare('SELECT unit_name FROM Unit WHERE id = ?').get(uid) as { unit_name: string } | undefined;
      return u?.unit_name || uid;
    });
  }
  let fyLabel: string | undefined;
  if (db) {
    const fy = db.prepare('SELECT year_label FROM FinancialYear WHERE id = ?').get(row.financial_year_id) as { year_label: string } | undefined;
    fyLabel = fy?.year_label;
  }
  return {
    id: row.id,
    entityId: row.entity_id,
    financialYearId: row.financial_year_id,
    financialYearLabel: fyLabel,
    runNumber: row.run_number,
    status: row.status,
    selectedUnitIds: unitIds,
    selectedUnitNames: unitNames,
    totalUnits: row.total_units,
    consolidatedDebit: row.consolidated_debit,
    consolidatedCredit: row.consolidated_credit,
    internalDebit: row.internal_debit,
    internalCredit: row.internal_credit,
    internalDifference: row.internal_difference,
    finalDebit: row.final_debit,
    finalCredit: row.final_credit,
    finalDifference: row.final_difference,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function mapEliminationRow(row: any, db: Database.Database): ConsolidationEliminationRecord {
  // Fetch lines
  const lineRows = db.prepare(`
    SELECT * FROM ConsolidationEliminationLine WHERE elimination_id = ? ORDER BY line_number ASC
  `).all(row.id) as any[];

  const lines: ConsolidationEliminationLineRecord[] = lineRows.map((lr: any) => {
    const u = db.prepare('SELECT unit_name FROM Unit WHERE id = ?').get(lr.unit_id) as { unit_name: string } | undefined;
    let fsliName: string | null = null;
    if (lr.fsli_id) {
      const f = db.prepare('SELECT fsli_name FROM FSLI WHERE id = ?').get(lr.fsli_id) as { fsli_name: string } | undefined;
      fsliName = f?.fsli_name || null;
    }
    return {
      id: lr.id,
      eliminationId: lr.elimination_id,
      lineNumber: lr.line_number,
      unitId: lr.unit_id,
      unitName: u?.unit_name,
      ledgerId: lr.ledger_id,
      ledgerName: lr.ledger_name,
      fsliId: lr.fsli_id,
      fsliName: fsliName || lr.fsli_name,
      debit: lr.debit,
      credit: lr.credit,
      description: lr.description,
    };
  });

  // Resolve unit names
  const srcUnit = db.prepare('SELECT unit_name FROM Unit WHERE id = ?').get(row.source_unit_id) as { unit_name: string } | undefined;
  let cptyUnit: { unit_name: string } | undefined;
  if (row.counterparty_unit_id) {
    cptyUnit = db.prepare('SELECT unit_name FROM Unit WHERE id = ?').get(row.counterparty_unit_id) as { unit_name: string } | undefined;
  }

  return {
    id: row.id,
    consolidationRunId: row.consolidation_run_id,
    eliminationNumber: row.elimination_number,
    entityId: row.entity_id,
    financialYearId: row.financial_year_id,
    sourceUnitId: row.source_unit_id,
    sourceUnitName: srcUnit?.unit_name,
    counterpartyUnitId: row.counterparty_unit_id,
    counterpartyUnitName: cptyUnit?.unit_name,
    sourceLedgerId: row.source_ledger_id,
    sourceLedgerName: row.source_ledger_name,
    counterpartyLedgerId: row.counterparty_ledger_id,
    counterpartyLedgerName: row.counterparty_ledger_name,
    internalAccountType: row.internal_account_type,
    fsliId: row.fsli_id,
    fsliName: row.fsli_name,
    debitAmount: row.debit_amount,
    creditAmount: row.credit_amount,
    eliminatedAmount: row.eliminated_amount,
    unmatchedAmount: row.unmatched_amount,
    matchingBasis: row.matching_basis,
    confidence: row.confidence,
    matchStatus: row.match_status,
    reason: row.reason,
    status: row.status,
    reversalOfId: row.reversal_of_id,
    reversedById: row.reversed_by_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    rejectedBy: row.rejected_by,
    rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    appliedBy: row.applied_by,
    appliedAt: row.applied_at,
    reversedBy: row.reversed_by,
    reversedAt: row.reversed_at,
    reversalReason: row.reversal_reason,
    lines,
  };
}

// ── Multi-Layer Internal Balance Detection ────────────────────────────────────

interface DetectedInternalLedger {
  ledgerId: string;
  ledgerName: string;
  unitId: string;
  unitName: string;
  tallyGroupName: string | null;
  internalAccountType: InternalAccountType;
  debit: number;
  credit: number;
  confidence: number;
  evidenceLayers: string[];
  resolvedFsliId: string | null;
}

/**
 * Detects internal/inter-unit ledgers for a set of selected units in a given FY.
 * Uses the multi-layer evidence hierarchy. Keyword-only detection always results
 * in NeedsReview. Sundry Debtors are NOT treated as internal without relationship evidence.
 */
function detectInternalLedgers(
  db: Database.Database,
  fyId: string,
  selectedUnitIds: string[],
): DetectedInternalLedger[] {
  if (selectedUnitIds.length === 0) return [];

  const placeholders = selectedUnitIds.map(() => '?').join(',');

  // Fetch all ledgers with balances for selected units in this FY
  const ledgerRows = db.prepare(`
    SELECT
      l.id AS ledger_id,
      l.ledger_name,
      l.unit_id,
      u.unit_name,
      tg.group_name AS tally_group_name,
      ptg.group_name AS parent_group_name,
      lb.debit,
      lb.credit,
      COALESCE(
        CASE WHEN rr.status IN ('Applied', 'AutoApplied') THEN rr.approved_fsli_id END,
        lc.final_fsli_id,
        lm.mapped_fsli_id
      ) AS resolved_fsli_id,
      lm.mapped_fsli_id,
      lc.application_classification
    FROM LedgerBalance lb
    JOIN Ledger l ON lb.ledger_id = l.id
    JOIN Unit u ON l.unit_id = u.id
    LEFT JOIN TallyGroup tg ON l.tally_group_id = tg.id
    LEFT JOIN TallyGroup ptg ON tg.parent_group_id = ptg.id
    LEFT JOIN RegroupingResult rr ON l.id = rr.ledger_id AND lb.financial_year_id = rr.financial_year_id
    LEFT JOIN LedgerClassification lc ON l.id = lc.ledger_id AND lb.financial_year_id = lc.financial_year_id
    LEFT JOIN LedgerMapping lm ON l.id = lm.ledger_id AND lb.financial_year_id = lm.financial_year_id
    WHERE lb.financial_year_id = ?
      AND l.unit_id IN (${placeholders})
      AND (lb.debit != 0 OR lb.credit != 0)
  `).all(fyId, ...selectedUnitIds) as any[];

  // Build a set of selected unit names for counterparty detection
  const unitNameMap = new Map<string, string>();
  for (const uid of selectedUnitIds) {
    const u = db.prepare('SELECT unit_name FROM Unit WHERE id = ?').get(uid) as { unit_name: string } | undefined;
    if (u) unitNameMap.set(uid, u.unit_name);
  }

  const detected: DetectedInternalLedger[] = [];

  for (const row of ledgerRows) {
    const tallyGroup = (row.tally_group_name || '').toLowerCase().trim();
    const parentGroup = (row.parent_group_name || '').toLowerCase().trim();
    const ledgerName = row.ledger_name || '';
    const ledgerNameLower = ledgerName.toLowerCase().trim();

    let totalConfidence = 0;
    const evidenceLayers: string[] = [];
    let accountType: InternalAccountType | null = null;

    // ── Layer 1: Tally Group Classification (weight 0.40) ──
    const isBranchDivGroup = BRANCH_DIVISION_TALLY_GROUPS.includes(tallyGroup)
      || BRANCH_DIVISION_TALLY_GROUPS.includes(parentGroup);

    // Sundry Debtors safeguard: if the ledger is under Sundry Debtors,
    // do NOT treat as internal merely because of the Tally Group.
    const isSundryDebtors = SUNDRY_DEBTORS_GROUPS.includes(tallyGroup)
      || SUNDRY_DEBTORS_GROUPS.includes(parentGroup);

    if (isBranchDivGroup && !isSundryDebtors) {
      totalConfidence += 0.40;
      evidenceLayers.push('TallyGroup:Branch/Divisions');
      accountType = 'Branch/Division';
    }

    // ── Layer 2: Phase 5/6 Evidence (weight 0.30) ──
    // Check if classification indicates internal balance
    const appClassification = (row.application_classification || '').toLowerCase();
    if (appClassification.includes('branch') || appClassification.includes('division')
        || appClassification.includes('inter-unit') || appClassification.includes('internal')) {
      totalConfidence += 0.30;
      evidenceLayers.push('Phase6:InternalClassification');
      if (!accountType) accountType = 'Branch/Division';
    }

    // ── Layer 3: Ledger Name Patterns (weight 0.20) ──
    let nameMatched = false;
    for (const pattern of SANTHIGIRI_HO_PATTERNS) {
      if (pattern.test(ledgerName)) {
        totalConfidence += 0.20;
        evidenceLayers.push('LedgerName:SanthigiriHO');
        accountType = 'Santhigiri Ashram HO';
        nameMatched = true;
        break;
      }
    }
    if (!nameMatched) {
      for (const pattern of BRANCH_DIVISION_PATTERNS) {
        if (pattern.test(ledgerName)) {
          totalConfidence += 0.20;
          evidenceLayers.push('LedgerName:Branch/Division');
          if (!accountType) accountType = 'Branch/Division';
          nameMatched = true;
          break;
        }
      }
    }

    // ── Layer 4: Cross-Unit Corroboration (weight 0.10) ──
    // Check if ledger name references another selected unit
    if (accountType) {
      for (const [uid, uName] of unitNameMap) {
        if (uid === row.unit_id) continue; // skip self
        const uNameLower = uName.toLowerCase();
        if (ledgerNameLower.includes(uNameLower) || uNameLower.includes(ledgerNameLower.replace(/[^a-z0-9]/g, ''))) {
          totalConfidence += 0.10;
          evidenceLayers.push(`CrossUnit:${uName}`);
          break;
        }
      }
    }

    // For Sundry Debtors: only include if there's strong relationship evidence
    // beyond the Tally Group (cross-unit ledger name match referencing another unit)
    if (isSundryDebtors) {
      let hasSundryRelationshipEvidence = false;
      for (const [uid, uName] of unitNameMap) {
        if (uid === row.unit_id) continue;
        if (ledgerNameLower.includes(uName.toLowerCase())) {
          hasSundryRelationshipEvidence = true;
          totalConfidence += 0.40; // Strong evidence: Sundry Debtor referencing another unit
          evidenceLayers.push(`SundryDebtorRelationship:${uName}`);
          accountType = 'Other Internal';
          break;
        }
      }
      if (!hasSundryRelationshipEvidence) {
        continue; // Skip: ordinary external Sundry Debtor
      }
    }

    // Only include if we found at least some evidence
    if (accountType && totalConfidence > 0) {
      detected.push({
        ledgerId: row.ledger_id,
        ledgerName: row.ledger_name,
        unitId: row.unit_id,
        unitName: row.unit_name,
        tallyGroupName: row.tally_group_name,
        internalAccountType: accountType,
        debit: Number(row.debit) || 0,
        credit: Number(row.credit) || 0,
        confidence: Math.min(totalConfidence, 1.0),
        evidenceLayers,
        resolvedFsliId: row.resolved_fsli_id,
      });
    }
  }

  return detected;
}

// ── Counterparty Resolution ───────────────────────────────────────────────────

interface CounterpartyMatch {
  counterpartyUnitId: string;
  counterpartyUnitName: string;
  counterpartyLedgerId: string;
  counterpartyLedgerName: string;
  matchingBasis: string;
  confidence: number;
}

/**
 * Attempts to find the counterparty for a detected internal ledger.
 * Uses relationship evidence — does NOT match solely on opposite balance direction.
 */
function resolveCounterparty(
  source: DetectedInternalLedger,
  allDetected: DetectedInternalLedger[],
  unitNameMap: Map<string, string>,
): CounterpartyMatch | null {
  const sourceLedgerLower = source.ledgerName.toLowerCase().trim();

  // Strategy 1: Ledger name contains another unit's name
  for (const [uid, uName] of unitNameMap) {
    if (uid === source.unitId) continue;
    const uNameLower = uName.toLowerCase();
    if (sourceLedgerLower.includes(uNameLower)) {
      // Found a unit name in the ledger name — look for reciprocal
      const counterparts = allDetected.filter(
        (d) => d.unitId === uid
          && d.internalAccountType === source.internalAccountType
      );
      if (counterparts.length > 0) {
        // Pick the one whose ledger name contains the source unit's name
        const sourceUnitName = unitNameMap.get(source.unitId) || '';
        const reciprocal = counterparts.find(
          (c) => c.ledgerName.toLowerCase().includes(sourceUnitName.toLowerCase())
        );
        const best = reciprocal || counterparts[0];
        return {
          counterpartyUnitId: best.unitId,
          counterpartyUnitName: best.unitName,
          counterpartyLedgerId: best.ledgerId,
          counterpartyLedgerName: best.ledgerName,
          matchingBasis: reciprocal
            ? 'Reciprocal ledger name match'
            : 'Ledger name references counterparty unit',
          confidence: reciprocal ? 0.90 : 0.70,
        };
      }
    }
  }

  // Strategy 2: For Santhigiri HO accounts, look for any other unit's
  //             HO account with opposite balance direction
  if (source.internalAccountType === 'Santhigiri Ashram HO') {
    const sourceIsDebit = source.debit > source.credit;
    const counterparts = allDetected.filter(
      (d) => d.unitId !== source.unitId
        && d.internalAccountType === 'Santhigiri Ashram HO'
        && (sourceIsDebit ? d.credit > d.debit : d.debit > d.credit)
    );
    if (counterparts.length === 1) {
      // Unique opposite-side HO balance — reasonable match
      return {
        counterpartyUnitId: counterparts[0].unitId,
        counterpartyUnitName: counterparts[0].unitName,
        counterpartyLedgerId: counterparts[0].ledgerId,
        counterpartyLedgerName: counterparts[0].ledgerName,
        matchingBasis: 'Unique Santhigiri HO opposite-side balance',
        confidence: 0.60, // Medium — still needs review
      };
    }
  }

  // Strategy 3: For Branch/Division accounts under same Tally Group,
  //             look for reciprocal names
  if (source.internalAccountType === 'Branch/Division') {
    const counterparts = allDetected.filter(
      (d) => d.unitId !== source.unitId
        && d.internalAccountType === 'Branch/Division'
        && d.tallyGroupName === source.tallyGroupName
    );
    if (counterparts.length === 1) {
      return {
        counterpartyUnitId: counterparts[0].unitId,
        counterpartyUnitName: counterparts[0].unitName,
        counterpartyLedgerId: counterparts[0].ledgerId,
        counterpartyLedgerName: counterparts[0].ledgerName,
        matchingBasis: 'Unique Branch/Division match under same Tally Group',
        confidence: 0.55,
      };
    }
  }

  return null; // Cannot establish counterparty — NeedsReview
}

// ── Workbench Data ────────────────────────────────────────────────────────────

export function getConsolidationWorkbenchData(
  db: Database.Database,
  financialYearId?: string,
): ConsolidationWorkbenchData {
  // Fetch financial years
  const fyRows = db.prepare(`
    SELECT fy.id, fy.year_label,
      (SELECT COUNT(*) FROM LedgerBalance lb WHERE lb.financial_year_id = fy.id) as cnt
    FROM FinancialYear fy
    ORDER BY fy.year_label DESC
  `).all() as Array<{ id: string; year_label: string; cnt: number }>;

  const activeFy = (financialYearId
    ? fyRows.find((f) => f.id === financialYearId)
    : null) || fyRows.find((f) => f.cnt > 0) || fyRows[0];
  const fyId = activeFy?.id || '';
  const fyLabel = activeFy?.year_label || '';

  // Fetch all units
  const unitRows = db.prepare(`
    SELECT u.id, u.unit_name,
      (SELECT COUNT(*) FROM Ledger l
       JOIN LedgerBalance lb ON l.id = lb.ledger_id
       WHERE l.unit_id = u.id AND lb.financial_year_id = ?) as cnt
    FROM Unit u
    WHERE u.entity_id = ?
    ORDER BY u.unit_name ASC
  `).all(fyId, DEFAULT_ENTITY_ID) as Array<{ id: string; unit_name: string; cnt: number }>;

  const units = unitRows.map((u) => ({
    id: u.id,
    unitName: u.unit_name,
    hasData: u.cnt > 0,
  }));

  // Compute per-unit pre-consolidation summaries
  const unitSummaries: UnitPreConsolidationSummary[] = [];
  for (const u of unitRows) {
    if (u.cnt === 0) continue;
    const summary = computeUnitPreConsolidationSummary(db, fyId, u.id, u.unit_name);
    unitSummaries.push(summary);
  }

  // Fetch consolidation runs for this FY
  const runRows = db.prepare(`
    SELECT * FROM ConsolidationRun
    WHERE financial_year_id = ? AND entity_id = ?
    ORDER BY created_at DESC
  `).all(fyId, DEFAULT_ENTITY_ID) as any[];

  const runs = runRows.map((r: any) => mapRunRow(r, db));

  // Summary
  const summary = {
    totalRuns: runs.length,
    draftCount: runs.filter((r) => r.status === 'Draft').length,
    inProgressCount: runs.filter((r) => r.status === 'InProgress').length,
    completedCount: runs.filter((r) => r.status === 'Completed').length,
    cancelledCount: runs.filter((r) => r.status === 'Cancelled').length,
  };

  return {
    financialYears: fyRows.map((f) => ({
      id: f.id,
      yearLabel: f.year_label,
      hasData: f.cnt > 0,
    })),
    activeFinancialYearId: fyId,
    activeFinancialYearLabel: fyLabel,
    units,
    unitSummaries,
    summary,
    runs,
  };
}

function computeUnitPreConsolidationSummary(
  db: Database.Database,
  fyId: string,
  unitId: string,
  unitName: string,
): UnitPreConsolidationSummary {
  // Totals from LedgerBalance
  const totals = db.prepare(`
    SELECT
      COUNT(DISTINCT l.id) as ledger_count,
      COALESCE(SUM(lb.debit), 0) as total_debit,
      COALESCE(SUM(lb.credit), 0) as total_credit
    FROM LedgerBalance lb
    JOIN Ledger l ON lb.ledger_id = l.id
    WHERE lb.financial_year_id = ? AND l.unit_id = ?
  `).get(fyId, unitId) as { ledger_count: number; total_debit: number; total_credit: number };

  // Phase 8 applied adjustments count
  const adjCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM Adjustment
    WHERE financial_year_id = ? AND unit_id = ? AND status = 'Applied'
  `).get(fyId, unitId) as { cnt: number };

  // Detect internal balances for this single unit (using all units scope for detection patterns)
  const internalLedgers = detectInternalLedgers(db, fyId, [unitId]);

  let branchDr = 0, branchCr = 0, hoDr = 0, hoCr = 0;
  for (const il of internalLedgers) {
    if (il.internalAccountType === 'Branch/Division') {
      branchDr += il.debit;
      branchCr += il.credit;
    } else if (il.internalAccountType === 'Santhigiri Ashram HO') {
      hoDr += il.debit;
      hoCr += il.credit;
    }
  }

  const totalDr = round2(totals.total_debit);
  const totalCr = round2(totals.total_credit);

  return {
    unitId,
    unitName,
    totalDebit: totalDr,
    totalCredit: totalCr,
    difference: round2(totalDr - totalCr),
    ledgerCount: totals.ledger_count,
    appliedAdjustmentsCount: adjCount.cnt,
    branchDivisionDebit: round2(branchDr),
    branchDivisionCredit: round2(branchCr),
    santhigiriHODebit: round2(hoDr),
    santhigiriHOCredit: round2(hoCr),
    internalDifference: round2((branchDr + hoDr) - (branchCr + hoCr)),
  };
}

// ── Consolidation Run Management ──────────────────────────────────────────────

export function createConsolidationRun(
  db: Database.Database,
  input: CreateConsolidationRunInput,
): ConsolidationRunRecord {
  if (!input.selectedUnitIds || input.selectedUnitIds.length === 0) {
    throw new Error('At least one unit must be selected for consolidation.');
  }
  if (!input.financialYearId) {
    throw new Error('Financial Year is required for consolidation.');
  }

  // Verify all units exist and belong to the entity
  for (const uid of input.selectedUnitIds) {
    const exists = db.prepare(
      'SELECT id FROM Unit WHERE id = ? AND entity_id = ?'
    ).get(uid, DEFAULT_ENTITY_ID);
    if (!exists) {
      throw new Error(`Unit "${uid}" not found or does not belong to the entity.`);
    }
  }

  const id = `cr-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const runNumber = generateRunNumber(db, input.financialYearId);

  db.prepare(`
    INSERT INTO ConsolidationRun (
      id, entity_id, financial_year_id, run_number, status,
      selected_unit_ids, total_units,
      consolidated_debit, consolidated_credit,
      internal_debit, internal_credit, internal_difference,
      final_debit, final_credit, final_difference,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'Draft', ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?, ?)
  `).run(
    id,
    DEFAULT_ENTITY_ID,
    input.financialYearId,
    runNumber,
    JSON.stringify(input.selectedUnitIds),
    input.selectedUnitIds.length,
    input.createdBy || null,
    now,
    now,
  );

  insertAudit(db, id, null, 'RunCreated', null, 'Draft',
    `Consolidation run created with ${input.selectedUnitIds.length} units`,
    null, input.createdBy || null);

  insertAudit(db, id, null, 'UnitsSelected', null, null,
    `Units: ${input.selectedUnitIds.join(', ')}`,
    null, input.createdBy || null);

  const row = db.prepare('SELECT * FROM ConsolidationRun WHERE id = ?').get(id);
  return mapRunRow(row, db);
}

// ── Internal Balance Detection & Elimination Creation ─────────────────────────

export function runInternalBalanceDetection(
  db: Database.Database,
  runId: string,
): { detectedCount: number; matchedCount: number; needsReviewCount: number; unmatchedCount: number } {
  const run = db.prepare('SELECT * FROM ConsolidationRun WHERE id = ?').get(runId) as any;
  if (!run) throw new Error(`Consolidation run "${runId}" not found.`);
  if (run.status !== 'Draft' && run.status !== 'InProgress') {
    throw new Error(`Cannot detect internal balances for run in status "${run.status}".`);
  }

  const selectedUnitIds: string[] = JSON.parse(run.selected_unit_ids || '[]');
  const fyId = run.financial_year_id;

  // Build unit name map (ONLY selected units — scope enforcement)
  const unitNameMap = new Map<string, string>();
  for (const uid of selectedUnitIds) {
    const u = db.prepare('SELECT unit_name FROM Unit WHERE id = ?').get(uid) as { unit_name: string } | undefined;
    if (u) unitNameMap.set(uid, u.unit_name);
  }

  // Detect internal ledgers across selected units
  const detected = detectInternalLedgers(db, fyId, selectedUnitIds);

  // Delete existing Draft eliminations for this run (re-detection)
  db.prepare(`
    DELETE FROM ConsolidationElimination
    WHERE consolidation_run_id = ? AND status = 'Draft'
  `).run(runId);

  // Track already-created elimination pairs to prevent duplicates
  const processedPairs = new Set<string>();
  let matchedCount = 0;
  let needsReviewCount = 0;
  let unmatchedCount = 0;

  const tx = db.transaction(() => {
    for (const source of detected) {
      // Attempt counterparty resolution
      const counterparty = resolveCounterparty(source, detected, unitNameMap);

      // Duplicate prevention: if this pair was already processed from the other side, skip
      if (counterparty) {
        const pairKey1 = `${source.unitId}:${source.ledgerId}:${counterparty.counterpartyUnitId}:${counterparty.counterpartyLedgerId}`;
        const pairKey2 = `${counterparty.counterpartyUnitId}:${counterparty.counterpartyLedgerId}:${source.unitId}:${source.ledgerId}`;
        if (processedPairs.has(pairKey1) || processedPairs.has(pairKey2)) {
          continue; // Already created elimination for this pair
        }
        processedPairs.add(pairKey1);
      }

      // Compute match status
      let matchStatus: EliminationMatchStatus;
      let eliminatedAmount = 0;
      let unmatchedAmount = 0;
      const sourceDr = source.debit;
      const sourceCr = source.credit;
      const sourceNet = sourceDr - sourceCr; // positive = debit balance
      const sourceAbs = Math.abs(sourceNet);
      let pairDr = sourceDr;
      let pairCr = sourceCr;

      if (!counterparty) {
        // No counterparty found — single-sided or unresolvable
        matchStatus = 'NeedsReview';
        eliminatedAmount = 0;
        unmatchedAmount = sourceAbs;
        unmatchedCount++;
      } else {
        // Find counterparty's balance
        const cptyData = detected.find(
          (d) => d.ledgerId === counterparty.counterpartyLedgerId
        );
        const cptyNet = cptyData ? (cptyData.debit - cptyData.credit) : 0;
        const cptyAbs = Math.abs(cptyNet);

        // For internal balances: calculate pair's debit and credit amounts
        if (sourceNet > 0) {
          pairDr = sourceAbs;
          if (cptyNet < 0) pairCr = cptyAbs;
          else if (cptyNet > 0) pairDr += cptyAbs;
        } else if (sourceNet < 0) {
          pairCr = sourceAbs;
          if (cptyNet > 0) pairDr = cptyAbs;
          else if (cptyNet < 0) pairCr += cptyAbs;
        }

        // Only propose match if they're on opposite sides
        if ((sourceNet > 0 && cptyNet < 0) || (sourceNet < 0 && cptyNet > 0)) {
          const matchable = Math.min(sourceAbs, cptyAbs);
          const diff = Math.abs(sourceAbs - cptyAbs);

          if (diff < 0.01) {
            // Exact match
            matchStatus = source.confidence >= 0.70 ? 'Matched' : 'NeedsReview';
            eliminatedAmount = matchable;
            unmatchedAmount = 0;
            if (matchStatus === 'Matched') matchedCount++; else needsReviewCount++;
          } else {
            // Partial match
            matchStatus = 'PartiallyMatched';
            eliminatedAmount = matchable;
            unmatchedAmount = diff;
            needsReviewCount++;
          }
        } else {
          // Same-side balances — doesn't make sense as internal elimination
          matchStatus = 'NeedsReview';
          eliminatedAmount = 0;
          unmatchedAmount = sourceAbs + cptyAbs;
          needsReviewCount++;
        }

        // Override: if confidence is insufficient, force NeedsReview
        if (source.confidence < 0.70 && matchStatus === 'Matched') {
          matchStatus = 'NeedsReview';
          matchedCount--;
          needsReviewCount++;
        }
      }

      // Create elimination record
      const elimId = `ce-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const elimNumber = generateEliminationNumber(db, runId);

      db.prepare(`
        INSERT INTO ConsolidationElimination (
          id, consolidation_run_id, elimination_number,
          entity_id, financial_year_id,
          source_unit_id, counterparty_unit_id,
          source_ledger_id, source_ledger_name,
          counterparty_ledger_id, counterparty_ledger_name,
          internal_account_type, fsli_id, fsli_name,
          debit_amount, credit_amount,
          eliminated_amount, unmatched_amount,
          matching_basis, confidence, match_status,
          reason, status,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?)
      `).run(
        elimId, runId, elimNumber,
        DEFAULT_ENTITY_ID, fyId,
        source.unitId,
        counterparty?.counterpartyUnitId || null,
        source.ledgerId, source.ledgerName,
        counterparty?.counterpartyLedgerId || null,
        counterparty?.counterpartyLedgerName || null,
        source.internalAccountType,
        source.resolvedFsliId, null,
        round2(pairDr), round2(pairCr),
        round2(eliminatedAmount), round2(unmatchedAmount),
        counterparty?.matchingBasis || 'No counterparty identified',
        round2(source.confidence),
        matchStatus,
        source.evidenceLayers.join('; '),
        null, now, now,
      );

      // Audit
      insertAudit(db, runId, elimId, 'InternalDetected', null, 'Draft',
        `Detected ${source.internalAccountType}: ${source.ledgerName} (${source.unitName}) → ${matchStatus}`,
        null, null);
      if (counterparty) {
        insertAudit(db, runId, elimId, 'MatchCreated', null, null,
          `Counterparty: ${counterparty.counterpartyLedgerName} (${counterparty.counterpartyUnitName}). Basis: ${counterparty.matchingBasis}`,
          null, null);
      }
      if (unmatchedAmount > 0) {
        insertAudit(db, runId, elimId, 'DifferenceDetected', null, null,
          `Unmatched: ${unmatchedAmount}`, null, null);
      }
    }

    // Update run status to InProgress
    db.prepare(`
      UPDATE ConsolidationRun SET status = 'InProgress', updated_at = ? WHERE id = ?
    `).run(new Date().toISOString(), runId);
  });

  tx();

  return {
    detectedCount: detected.length,
    matchedCount,
    needsReviewCount,
    unmatchedCount,
  };
}

// ── Elimination CRUD ──────────────────────────────────────────────────────────

export function createElimination(
  db: Database.Database,
  input: CreateEliminationInput,
): ConsolidationEliminationRecord {
  const run = db.prepare('SELECT * FROM ConsolidationRun WHERE id = ?').get(input.consolidationRunId) as any;
  if (!run) throw new Error('Consolidation run not found.');

  const selectedUnitIds: string[] = JSON.parse(run.selected_unit_ids || '[]');
  if (!selectedUnitIds.includes(input.sourceUnitId)) {
    throw new Error('Source unit is not in the selected consolidation scope.');
  }
  if (input.counterpartyUnitId && !selectedUnitIds.includes(input.counterpartyUnitId)) {
    throw new Error('Counterparty unit is not in the selected consolidation scope.');
  }

  const id = `ce-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const elimNumber = generateEliminationNumber(db, input.consolidationRunId);

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO ConsolidationElimination (
        id, consolidation_run_id, elimination_number,
        entity_id, financial_year_id,
        source_unit_id, counterparty_unit_id,
        source_ledger_id, source_ledger_name,
        counterparty_ledger_id, counterparty_ledger_name,
        internal_account_type, fsli_id,
        debit_amount, credit_amount,
        eliminated_amount, unmatched_amount,
        matching_basis, confidence, match_status,
        reason, status,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?)
    `).run(
      id, input.consolidationRunId, elimNumber,
      DEFAULT_ENTITY_ID, run.financial_year_id,
      input.sourceUnitId, input.counterpartyUnitId || null,
      input.sourceLedgerId || null, input.sourceLedgerName,
      input.counterpartyLedgerId || null, input.counterpartyLedgerName || null,
      input.internalAccountType, input.fsliId || null,
      input.debitAmount, input.creditAmount,
      input.eliminatedAmount, input.unmatchedAmount,
      input.matchingBasis || null, input.confidence || 0,
      input.matchStatus || 'NeedsReview',
      input.reason || null,
      input.createdBy || null, now, now,
    );

    // Insert lines if provided
    if (input.lines && input.lines.length > 0) {
      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i];
        db.prepare(`
          INSERT INTO ConsolidationEliminationLine (
            id, elimination_id, line_number,
            unit_id, ledger_id, ledger_name,
            fsli_id, fsli_name,
            debit, credit, description
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `cel-${crypto.randomUUID()}`, id, i + 1,
          line.unitId, line.ledgerId || null, line.ledgerName,
          line.fsliId || null, null,
          line.debit, line.credit, line.description || null,
        );
      }
    }

    insertAudit(db, input.consolidationRunId, id, 'EliminationCreated', null, 'Draft',
      `Manual elimination created: ${input.sourceLedgerName}`, null, input.createdBy || null);
  });

  tx();

  const row = db.prepare('SELECT * FROM ConsolidationElimination WHERE id = ?').get(id);
  return mapEliminationRow(row, db);
}

export function updateElimination(
  db: Database.Database,
  id: string,
  input: UpdateEliminationInput,
): ConsolidationEliminationRecord {
  const existing = db.prepare('SELECT * FROM ConsolidationElimination WHERE id = ?').get(id) as any;
  if (!existing) throw new Error('Elimination not found.');
  if (existing.status !== 'Draft') {
    throw new Error(`Cannot edit elimination in status "${existing.status}". Only Draft eliminations can be edited.`);
  }

  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE ConsolidationElimination SET
        source_unit_id = COALESCE(?, source_unit_id),
        counterparty_unit_id = COALESCE(?, counterparty_unit_id),
        source_ledger_name = COALESCE(?, source_ledger_name),
        counterparty_ledger_name = COALESCE(?, counterparty_ledger_name),
        internal_account_type = COALESCE(?, internal_account_type),
        fsli_id = COALESCE(?, fsli_id),
        debit_amount = COALESCE(?, debit_amount),
        credit_amount = COALESCE(?, credit_amount),
        eliminated_amount = COALESCE(?, eliminated_amount),
        unmatched_amount = COALESCE(?, unmatched_amount),
        matching_basis = COALESCE(?, matching_basis),
        confidence = COALESCE(?, confidence),
        match_status = COALESCE(?, match_status),
        reason = COALESCE(?, reason),
        updated_at = ?
      WHERE id = ?
    `).run(
      input.sourceUnitId ?? null,
      input.counterpartyUnitId ?? null,
      input.sourceLedgerName ?? null,
      input.counterpartyLedgerName ?? null,
      input.internalAccountType ?? null,
      input.fsliId ?? null,
      input.debitAmount ?? null,
      input.creditAmount ?? null,
      input.eliminatedAmount ?? null,
      input.unmatchedAmount ?? null,
      input.matchingBasis ?? null,
      input.confidence ?? null,
      input.matchStatus ?? null,
      input.reason ?? null,
      now, id,
    );

    // Replace lines if provided
    if (input.lines) {
      db.prepare('DELETE FROM ConsolidationEliminationLine WHERE elimination_id = ?').run(id);
      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i];
        db.prepare(`
          INSERT INTO ConsolidationEliminationLine (
            id, elimination_id, line_number,
            unit_id, ledger_id, ledger_name,
            fsli_id, debit, credit, description
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `cel-${crypto.randomUUID()}`, id, i + 1,
          line.unitId, line.ledgerId || null, line.ledgerName,
          line.fsliId || null, line.debit, line.credit, line.description || null,
        );
      }
    }

    insertAudit(db, existing.consolidation_run_id, id, 'EliminationCreated', 'Draft', 'Draft',
      'Elimination updated', null, null);
  });

  tx();

  const row = db.prepare('SELECT * FROM ConsolidationElimination WHERE id = ?').get(id);
  return mapEliminationRow(row, db);
}

export function deleteElimination(db: Database.Database, id: string): boolean {
  const existing = db.prepare('SELECT * FROM ConsolidationElimination WHERE id = ?').get(id) as any;
  if (!existing) throw new Error('Elimination not found.');
  if (existing.status !== 'Draft') {
    throw new Error(`Cannot delete elimination in status "${existing.status}". Only Draft eliminations can be deleted.`);
  }

  insertAudit(db, existing.consolidation_run_id, id, 'EliminationDeleted', 'Draft', null,
    `Deleted elimination ${existing.elimination_number}`, null, null);

  db.prepare('DELETE FROM ConsolidationEliminationLine WHERE elimination_id = ?').run(id);
  db.prepare('DELETE FROM ConsolidationElimination WHERE id = ?').run(id);
  return true;
}

// ── Elimination Workflow ──────────────────────────────────────────────────────

export function submitEliminationForReview(
  db: Database.Database,
  id: string,
  submittedBy?: string,
): ConsolidationEliminationRecord {
  const existing = db.prepare('SELECT * FROM ConsolidationElimination WHERE id = ?').get(id) as any;
  if (!existing) throw new Error('Elimination not found.');
  if (existing.status !== 'Draft') {
    throw new Error(`Cannot submit elimination in status "${existing.status}".`);
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE ConsolidationElimination SET status = 'PendingReview', submitted_by = ?, submitted_at = ?, updated_at = ? WHERE id = ?
  `).run(submittedBy || null, now, now, id);

  insertAudit(db, existing.consolidation_run_id, id, 'EliminationSubmitted', 'Draft', 'PendingReview',
    null, null, submittedBy || null);

  const row = db.prepare('SELECT * FROM ConsolidationElimination WHERE id = ?').get(id);
  return mapEliminationRow(row, db);
}

export function approveElimination(
  db: Database.Database,
  id: string,
  approvedBy?: string,
): ConsolidationEliminationRecord {
  const existing = db.prepare('SELECT * FROM ConsolidationElimination WHERE id = ?').get(id) as any;
  if (!existing) throw new Error('Elimination not found.');
  if (existing.status !== 'PendingReview') {
    throw new Error(`Cannot approve elimination in status "${existing.status}".`);
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE ConsolidationElimination SET status = 'Approved', match_status = 'Approved',
      approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?
  `).run(approvedBy || null, now, now, id);

  insertAudit(db, existing.consolidation_run_id, id, 'EliminationApproved', 'PendingReview', 'Approved',
    null, null, approvedBy || null);

  const row = db.prepare('SELECT * FROM ConsolidationElimination WHERE id = ?').get(id);
  return mapEliminationRow(row, db);
}

export function rejectElimination(
  db: Database.Database,
  id: string,
  reason: string,
  rejectedBy?: string,
): ConsolidationEliminationRecord {
  const existing = db.prepare('SELECT * FROM ConsolidationElimination WHERE id = ?').get(id) as any;
  if (!existing) throw new Error('Elimination not found.');
  if (existing.status !== 'PendingReview') {
    throw new Error(`Cannot reject elimination in status "${existing.status}".`);
  }
  if (!reason || !reason.trim()) {
    throw new Error('Rejection reason is required.');
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE ConsolidationElimination SET status = 'Rejected', match_status = 'Rejected',
      rejected_by = ?, rejected_at = ?, rejection_reason = ?, updated_at = ? WHERE id = ?
  `).run(rejectedBy || null, now, reason, now, id);

  insertAudit(db, existing.consolidation_run_id, id, 'EliminationRejected', 'PendingReview', 'Rejected',
    null, reason, rejectedBy || null);

  const row = db.prepare('SELECT * FROM ConsolidationElimination WHERE id = ?').get(id);
  return mapEliminationRow(row, db);
}

export function applyElimination(
  db: Database.Database,
  id: string,
  appliedBy?: string,
): ConsolidationEliminationRecord {
  const existing = db.prepare('SELECT * FROM ConsolidationElimination WHERE id = ?').get(id) as any;
  if (!existing) throw new Error('Elimination not found.');
  if (existing.status !== 'Approved') {
    throw new Error(`Cannot apply elimination in status "${existing.status}". Only Approved eliminations can be applied.`);
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE ConsolidationElimination SET status = 'Applied', match_status = 'Applied',
      applied_by = ?, applied_at = ?, updated_at = ? WHERE id = ?
  `).run(appliedBy || null, now, now, id);

  insertAudit(db, existing.consolidation_run_id, id, 'EliminationApplied', 'Approved', 'Applied',
    null, null, appliedBy || null);

  const row = db.prepare('SELECT * FROM ConsolidationElimination WHERE id = ?').get(id);
  return mapEliminationRow(row, db);
}

export function reverseElimination(
  db: Database.Database,
  id: string,
  reason: string,
  reversedBy?: string,
): { original: ConsolidationEliminationRecord; reversal: ConsolidationEliminationRecord } {
  const existing = db.prepare('SELECT * FROM ConsolidationElimination WHERE id = ?').get(id) as any;
  if (!existing) throw new Error('Elimination not found.');
  if (existing.status !== 'Applied') {
    throw new Error(`Cannot reverse elimination in status "${existing.status}". Only Applied eliminations can be reversed.`);
  }
  if (!reason || !reason.trim()) {
    throw new Error('Reversal reason is required.');
  }

  const now = new Date().toISOString();
  const reversalId = `ce-${crypto.randomUUID()}`;
  const reversalNumber = generateEliminationNumber(db, existing.consolidation_run_id);

  const tx = db.transaction(() => {
    // Mark original as Reversed
    db.prepare(`
      UPDATE ConsolidationElimination SET status = 'Reversed', match_status = 'Reversed',
        reversed_by = ?, reversed_at = ?, reversal_reason = ?, reversed_by_id = ?, updated_at = ? WHERE id = ?
    `).run(reversedBy || null, now, reason, reversalId, now, id);

    // Create inverse reversal entry
    db.prepare(`
      INSERT INTO ConsolidationElimination (
        id, consolidation_run_id, elimination_number,
        entity_id, financial_year_id,
        source_unit_id, counterparty_unit_id,
        source_ledger_id, source_ledger_name,
        counterparty_ledger_id, counterparty_ledger_name,
        internal_account_type, fsli_id, fsli_name,
        debit_amount, credit_amount,
        eliminated_amount, unmatched_amount,
        matching_basis, confidence, match_status,
        reason, status, reversal_of_id,
        created_by, created_at, updated_at,
        applied_by, applied_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Applied', ?, 'Applied', ?, ?, ?, ?, ?, ?)
    `).run(
      reversalId, existing.consolidation_run_id, reversalNumber,
      existing.entity_id, existing.financial_year_id,
      existing.source_unit_id, existing.counterparty_unit_id,
      existing.source_ledger_id, existing.source_ledger_name,
      existing.counterparty_ledger_id, existing.counterparty_ledger_name,
      existing.internal_account_type, existing.fsli_id, existing.fsli_name,
      // Reverse: swap debit and credit
      existing.credit_amount, existing.debit_amount,
      -existing.eliminated_amount, 0,
      'Reversal of ' + existing.elimination_number,
      existing.confidence,
      `Reversal: ${reason}`,
      existing.id, // reversal_of_id
      reversedBy || null, now, now,
      reversedBy || null, now,
    );

    insertAudit(db, existing.consolidation_run_id, id, 'EliminationReversed', 'Applied', 'Reversed',
      `Reversed by ${reversalNumber}`, reason, reversedBy || null);
    insertAudit(db, existing.consolidation_run_id, reversalId, 'EliminationApplied', null, 'Applied',
      `Reversal of ${existing.elimination_number}`, reason, reversedBy || null);
  });

  tx();

  const origRow = db.prepare('SELECT * FROM ConsolidationElimination WHERE id = ?').get(id);
  const revRow = db.prepare('SELECT * FROM ConsolidationElimination WHERE id = ?').get(reversalId);
  return {
    original: mapEliminationRow(origRow, db),
    reversal: mapEliminationRow(revRow, db),
  };
}

// ── Consolidation Run Completion ──────────────────────────────────────────────

export function completeConsolidationRun(
  db: Database.Database,
  runId: string,
  completedBy?: string,
): ConsolidationRunRecord {
  const run = db.prepare('SELECT * FROM ConsolidationRun WHERE id = ?').get(runId) as any;
  if (!run) throw new Error('Consolidation run not found.');
  if (run.status !== 'InProgress' && run.status !== 'Draft') {
    throw new Error(`Cannot complete run in status "${run.status}".`);
  }

  // Compute final totals from consolidated TB
  const ctbData = getConsolidatedTrialBalance(db, runId);
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE ConsolidationRun SET
      status = 'Completed',
      consolidated_debit = ?, consolidated_credit = ?,
      internal_debit = ?, internal_credit = ?, internal_difference = ?,
      final_debit = ?, final_credit = ?, final_difference = ?,
      completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    ctbData.totalBeforeDebit, ctbData.totalBeforeCredit,
    ctbData.internalControl.totalInternalDebit, ctbData.internalControl.totalInternalCredit,
    ctbData.internalControl.unmatchedDifference,
    ctbData.totalAfterDebit, ctbData.totalAfterCredit,
    ctbData.finalDifference,
    now, now, runId,
  );

  insertAudit(db, runId, null, 'RunCompleted', run.status, 'Completed',
    `Consolidation completed. Final Dr: ${ctbData.totalAfterDebit}, Cr: ${ctbData.totalAfterCredit}`,
    null, completedBy || null);

  const row = db.prepare('SELECT * FROM ConsolidationRun WHERE id = ?').get(runId);
  return mapRunRow(row, db);
}

export function cancelConsolidationRun(
  db: Database.Database,
  runId: string,
  cancelledBy?: string,
): ConsolidationRunRecord {
  const run = db.prepare('SELECT * FROM ConsolidationRun WHERE id = ?').get(runId) as any;
  if (!run) throw new Error('Consolidation run not found.');
  if (run.status === 'Completed' || run.status === 'Cancelled') {
    throw new Error(`Cannot cancel run in status "${run.status}".`);
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE ConsolidationRun SET status = 'Cancelled', updated_at = ? WHERE id = ?
  `).run(now, runId);

  insertAudit(db, runId, null, 'RunCancelled', run.status, 'Cancelled',
    null, null, cancelledBy || null);

  const row = db.prepare('SELECT * FROM ConsolidationRun WHERE id = ?').get(runId);
  return mapRunRow(row, db);
}

// ── Consolidated Trial Balance ────────────────────────────────────────────────

/**
 * Computes the Consolidated Adjusted Trial Balance.
 * This is the AUTHORITATIVE output for Phase 10.
 *
 * Formula:
 *   Before Elimination = Σ (Unit Adjusted Trial Balances for selected units)
 *   Elimination = Σ (Applied ConsolidationElimination entries)
 *   After Elimination = Before - Elimination
 *
 * NEVER modifies unit-level data.
 * NEVER creates artificial balancing figures.
 */
export function getConsolidatedTrialBalance(
  db: Database.Database,
  runId: string,
): ConsolidatedTrialBalanceData {
  const run = db.prepare('SELECT * FROM ConsolidationRun WHERE id = ?').get(runId) as any;
  if (!run) throw new Error('Consolidation run not found.');

  const selectedUnitIds: string[] = JSON.parse(run.selected_unit_ids || '[]');
  const fyId = run.financial_year_id;

  const fyRow = db.prepare('SELECT year_label FROM FinancialYear WHERE id = ?').get(fyId) as { year_label: string } | undefined;
  const fyLabel = fyRow?.year_label || '';

  const unitNames: string[] = selectedUnitIds.map((uid) => {
    const u = db.prepare('SELECT unit_name FROM Unit WHERE id = ?').get(uid) as { unit_name: string } | undefined;
    return u?.unit_name || uid;
  });

  // Get all FSLIs
  const allFslis = db.prepare(`
    SELECT id, fsli_code, fsli_name, category, sub_category, display_order
    FROM FSLI WHERE active = 1
    ORDER BY display_order ASC, fsli_name ASC
  `).all() as Array<{
    id: string; fsli_code: string | null; fsli_name: string;
    category: string; sub_category: string | null; display_order: number;
  }>;

  // Accumulator: FSLI -> { beforeDr, beforeCr, elimDr, elimCr }
  const fsliMap = new Map<string, {
    fsliId: string; fsliCode: string | null; fsliName: string;
    category: string; subCategory: string | null; displayOrder: number;
    beforeDr: number; beforeCr: number; elimDr: number; elimCr: number;
  }>();

  for (const f of allFslis) {
    fsliMap.set(f.id, {
      fsliId: f.id, fsliCode: f.fsli_code, fsliName: f.fsli_name,
      category: f.category, subCategory: f.sub_category, displayOrder: f.display_order,
      beforeDr: 0, beforeCr: 0, elimDr: 0, elimCr: 0,
    });
  }

  // Pre-seed unmapped bucket for ledgers without resolved FSLIs
  fsliMap.set('unmapped-pending', {
    fsliId: 'unmapped-pending',
    fsliCode: 'UNMAPPED',
    fsliName: 'Unmapped / Pending FSLI Assignment',
    category: 'Unmapped',
    subCategory: null,
    displayOrder: 9999,
    beforeDr: 0,
    beforeCr: 0,
    elimDr: 0,
    elimCr: 0,
  });

  // 1. Aggregate BEFORE elimination: Authoritative single-path aggregation per unit
  for (const unitId of selectedUnitIds) {
    // A. Base balances per ledger -> resolved FSLI or unmapped bucket
    const ledgerRows = db.prepare(`
      SELECT
        lb.debit as base_debit,
        lb.credit as base_credit,
        COALESCE(
          CASE WHEN rr.status IN ('Applied', 'AutoApplied') THEN rr.approved_fsli_id END,
          lc.final_fsli_id,
          lm.mapped_fsli_id
        ) as resolved_fsli_id
      FROM LedgerBalance lb
      JOIN Ledger l ON lb.ledger_id = l.id
      LEFT JOIN RegroupingResult rr ON l.id = rr.ledger_id AND lb.financial_year_id = rr.financial_year_id
      LEFT JOIN LedgerClassification lc ON l.id = lc.ledger_id AND lb.financial_year_id = lc.financial_year_id
      LEFT JOIN LedgerMapping lm ON l.id = lm.ledger_id AND lb.financial_year_id = lm.financial_year_id
      WHERE lb.financial_year_id = ? AND l.unit_id = ?
    `).all(fyId, unitId) as Array<{
      base_debit: number;
      base_credit: number;
      resolved_fsli_id: string | null;
    }>;

    for (const lr of ledgerRows) {
      const targetFsliId = lr.resolved_fsli_id && fsliMap.has(lr.resolved_fsli_id)
        ? lr.resolved_fsli_id
        : 'unmapped-pending';
      const entry = fsliMap.get(targetFsliId)!;
      entry.beforeDr += Number(lr.base_debit) || 0;
      entry.beforeCr += Number(lr.base_credit) || 0;
    }

    // B. Phase 8 adjustments per FSLI (Applied and Reversed)
    const adjRows = db.prepare(`
      SELECT
        al.fsli_id,
        SUM(al.debit) as adj_debit,
        SUM(al.credit) as adj_credit
      FROM AdjustmentLine al
      JOIN Adjustment a ON al.adjustment_id = a.id
      WHERE a.financial_year_id = ? AND a.unit_id = ? AND a.status IN ('Applied', 'Reversed')
      GROUP BY al.fsli_id
    `).all(fyId, unitId) as Array<{
      fsli_id: string;
      adj_debit: number;
      adj_credit: number;
    }>;

    for (const ar of adjRows) {
      if (fsliMap.has(ar.fsli_id)) {
        const entry = fsliMap.get(ar.fsli_id)!;
        entry.beforeDr += Number(ar.adj_debit) || 0;
        entry.beforeCr += Number(ar.adj_credit) || 0;
      }
    }
  }

  // 2. Applied eliminations
  const appliedEliminations = db.prepare(`
    SELECT * FROM ConsolidationElimination
    WHERE consolidation_run_id = ? AND status IN ('Applied', 'Reversed')
  `).all(runId) as any[];

  // For eliminations: the eliminated_amount reduces both sides
  // We track elimination impact by FSLI (via the elimination's fsli_id)
  // If no FSLI, we skip FSLI-level impact but still count in internal control
  for (const elim of appliedEliminations) {
    if (elim.fsli_id && fsliMap.has(elim.fsli_id)) {
      const entry = fsliMap.get(elim.fsli_id)!;
      // Elimination reduces both debit and credit by the eliminated amount
      const elimAmt = Number(elim.eliminated_amount) || 0;
      entry.elimDr += elimAmt;
      entry.elimCr += elimAmt;
    }
  }

  // 3. Internal control summary
  const allEliminations = db.prepare(`
    SELECT * FROM ConsolidationElimination
    WHERE consolidation_run_id = ? AND reversal_of_id IS NULL
  `).all(runId) as any[];

  let branchDr = 0, branchCr = 0, hoDr = 0, hoCr = 0, otherDr = 0, otherCr = 0;
  let totalElimAmt = 0;
  let totalUnmatched = 0;

  for (const e of allEliminations) {
    const dr = Number(e.debit_amount) || 0;
    const cr = Number(e.credit_amount) || 0;
    if (e.internal_account_type === 'Branch/Division') {
      branchDr += dr; branchCr += cr;
    } else if (e.internal_account_type === 'Santhigiri Ashram HO') {
      hoDr += dr; hoCr += cr;
    } else {
      otherDr += dr; otherCr += cr;
    }
    if (e.status === 'Applied') {
      totalElimAmt += Number(e.eliminated_amount) || 0;
    }
    totalUnmatched += Number(e.unmatched_amount) || 0;
  }

  const internalControl: InternalControlSummary = {
    branchDivisionDebit: round2(branchDr),
    branchDivisionCredit: round2(branchCr),
    santhigiriHODebit: round2(hoDr),
    santhigiriHOCredit: round2(hoCr),
    otherInternalDebit: round2(otherDr),
    otherInternalCredit: round2(otherCr),
    totalInternalDebit: round2(branchDr + hoDr + otherDr),
    totalInternalCredit: round2(branchCr + hoCr + otherCr),
    eliminationAmount: round2(totalElimAmt),
    unmatchedDifference: round2(totalUnmatched),
  };

  // 4. Unmatched items
  const unmatchedItems: UnmatchedItem[] = allEliminations
    .filter((e: any) => (Number(e.unmatched_amount) || 0) > 0)
    .map((e: any) => {
      const srcUnit = db.prepare('SELECT unit_name FROM Unit WHERE id = ?').get(e.source_unit_id) as { unit_name: string } | undefined;
      return {
        unitId: e.source_unit_id,
        unitName: srcUnit?.unit_name || e.source_unit_id,
        ledgerId: e.source_ledger_id,
        ledgerName: e.source_ledger_name,
        internalAccountType: e.internal_account_type,
        debitAmount: Number(e.debit_amount) || 0,
        creditAmount: Number(e.credit_amount) || 0,
        matchedAmount: Number(e.eliminated_amount) || 0,
        unmatchedAmount: Number(e.unmatched_amount) || 0,
        matchStatus: e.match_status,
      };
    });

  // 5. Build rows
  let totalBeforeDr = 0, totalBeforeCr = 0;
  let totalElimDr = 0, totalElimCr = 0;
  let totalAfterDr = 0, totalAfterCr = 0;

  const rows: ConsolidatedTrialBalanceRow[] = [];
  const categoryMap = new Map<string, {
    category: string;
    beforeDebit: number; beforeCredit: number; beforeNet: number;
    eliminationDebit: number; eliminationCredit: number; eliminationNet: number;
    afterDebit: number; afterCredit: number; afterNet: number;
  }>();

  for (const item of fsliMap.values()) {
    const bDr = round2(item.beforeDr);
    const bCr = round2(item.beforeCr);
    const eDr = round2(item.elimDr);
    const eCr = round2(item.elimCr);
    const aDr = round2(bDr - eDr);
    const aCr = round2(bCr - eCr);

    if (bDr !== 0 || bCr !== 0 || eDr !== 0 || eCr !== 0) {
      rows.push({
        fsliId: item.fsliId,
        fsliCode: item.fsliCode,
        fsliName: item.fsliName,
        category: item.category as any,
        subCategory: item.subCategory,
        displayOrder: item.displayOrder,
        beforeEliminationDebit: bDr,
        beforeEliminationCredit: bCr,
        beforeEliminationNet: round2(bDr - bCr),
        eliminationDebit: eDr,
        eliminationCredit: eCr,
        eliminationNet: round2(eDr - eCr),
        afterEliminationDebit: aDr,
        afterEliminationCredit: aCr,
        afterEliminationNet: round2(aDr - aCr),
      });

      totalBeforeDr += bDr;
      totalBeforeCr += bCr;
      totalElimDr += eDr;
      totalElimCr += eCr;
      totalAfterDr += aDr;
      totalAfterCr += aCr;

      if (!categoryMap.has(item.category)) {
        categoryMap.set(item.category, {
          category: item.category,
          beforeDebit: 0, beforeCredit: 0, beforeNet: 0,
          eliminationDebit: 0, eliminationCredit: 0, eliminationNet: 0,
          afterDebit: 0, afterCredit: 0, afterNet: 0,
        });
      }
      const cat = categoryMap.get(item.category)!;
      cat.beforeDebit += bDr; cat.beforeCredit += bCr; cat.beforeNet += round2(bDr - bCr);
      cat.eliminationDebit += eDr; cat.eliminationCredit += eCr; cat.eliminationNet += round2(eDr - eCr);
      cat.afterDebit += aDr; cat.afterCredit += aCr; cat.afterNet += round2(aDr - aCr);
    }
  }

  // Sort rows
  const categoryPriority: Record<string, number> = {
    Equity: 1, Liability: 2, Asset: 3, Income: 4, Expense: 5, Unmapped: 6,
  };
  rows.sort((a, b) => {
    const cpA = categoryPriority[a.category] || 99;
    const cpB = categoryPriority[b.category] || 99;
    return cpA !== cpB ? cpA - cpB : a.displayOrder - b.displayOrder;
  });

  return {
    consolidationRunId: runId,
    financialYearId: fyId,
    financialYearLabel: fyLabel,
    selectedUnitCount: selectedUnitIds.length,
    selectedUnitNames: unitNames,
    totalBeforeDebit: round2(totalBeforeDr),
    totalBeforeCredit: round2(totalBeforeCr),
    totalEliminationDebit: round2(totalElimDr),
    totalEliminationCredit: round2(totalElimCr),
    totalAfterDebit: round2(totalAfterDr),
    totalAfterCredit: round2(totalAfterCr),
    finalDifference: round2(totalAfterDr - totalAfterCr),
    internalControl,
    unmatchedItems,
    rows,
    categoryTotals: Array.from(categoryMap.values()),
  };
}

// ── Consolidated Balance Sheet Preview ────────────────────────────────────────

/**
 * Computes the Consolidated Balance Sheet Preview for Phase 9.
 *
 * Requirements:
 * 1. If any part of the consolidated balance is under UNMAPPED, generates a
 *    clear "Pending FSLI Assignment" warning and marks isComplete = false.
 * 2. UNMAPPED is NEVER treated as a genuine FSLI or placed in Asset/Equity/Liability tables.
 * 3. Unresolved amounts are explicitly reported (Dr, Cr, Net) and reconciliation provided.
 * 4. When all balances have valid FSLI assignments, generates the normal Assets and
 *    Equity & Liabilities schedules using the approved FSLI hierarchy.
 * 5. Reconciles source amounts against the Consolidated Trial Balance after eliminations.
 */
export function getConsolidatedBalanceSheetPreview(
  db: Database.Database,
  runId: string,
): ConsolidatedBalanceSheetPreviewData {
  const ctb = getConsolidatedTrialBalance(db, runId);

  // Identify unmapped row
  const unmappedRow = ctb.rows.find(
    (r) => r.category === 'Unmapped' || r.fsliId === 'unmapped-pending',
  );
  const unmappedDr = unmappedRow ? round2(unmappedRow.afterEliminationDebit) : 0;
  const unmappedCr = unmappedRow ? round2(unmappedRow.afterEliminationCredit) : 0;
  const unmappedNet = unmappedRow ? round2(unmappedRow.afterEliminationNet) : 0;
  const hasUnmappedBalances = unmappedDr !== 0 || unmappedCr !== 0;

  // Extract Mapped Assets (excluding UNMAPPED)
  const assetRows: ConsolidatedBalanceSheetRow[] = ctb.rows
    .filter((r) => r.category === 'Asset' && r.fsliId !== 'unmapped-pending')
    .map((r) => ({
      fsliId: r.fsliId,
      fsliCode: r.fsliCode,
      fsliName: r.fsliName,
      category: 'Asset' as const,
      subCategory: r.subCategory,
      displayOrder: r.displayOrder,
      beforeEliminationDebit: r.beforeEliminationDebit,
      beforeEliminationCredit: r.beforeEliminationCredit,
      beforeEliminationNet: r.beforeEliminationNet,
      eliminationDebit: r.eliminationDebit,
      eliminationCredit: r.eliminationCredit,
      eliminationNet: r.eliminationNet,
      afterEliminationDebit: r.afterEliminationDebit,
      afterEliminationCredit: r.afterEliminationCredit,
      afterEliminationNet: r.afterEliminationNet,
      amount: r.afterEliminationDebit,
    }));

  // Extract Mapped Equity & Liabilities (excluding UNMAPPED)
  const equityLiabilityRows: ConsolidatedBalanceSheetRow[] = ctb.rows
    .filter(
      (r) =>
        (r.category === 'Equity' || r.category === 'Liability') &&
        r.fsliId !== 'unmapped-pending',
    )
    .map((r) => ({
      fsliId: r.fsliId,
      fsliCode: r.fsliCode,
      fsliName: r.fsliName,
      category: r.category as 'Equity' | 'Liability',
      subCategory: r.subCategory,
      displayOrder: r.displayOrder,
      beforeEliminationDebit: r.beforeEliminationDebit,
      beforeEliminationCredit: r.beforeEliminationCredit,
      beforeEliminationNet: r.beforeEliminationNet,
      eliminationDebit: r.eliminationDebit,
      eliminationCredit: r.eliminationCredit,
      eliminationNet: r.eliminationNet,
      afterEliminationDebit: r.afterEliminationDebit,
      afterEliminationCredit: r.afterEliminationCredit,
      afterEliminationNet: r.afterEliminationNet,
      amount: r.afterEliminationCredit,
    }));

  // Calculate totals
  let totalAssetsBefore = 0;
  let totalAssetsElim = 0;
  let totalAssetsConsolidated = 0;
  for (const r of assetRows) {
    totalAssetsBefore += r.beforeEliminationDebit;
    totalAssetsElim += r.eliminationDebit;
    totalAssetsConsolidated += r.afterEliminationDebit;
  }

  let totalEqLiabBefore = 0;
  let totalEqLiabElim = 0;
  let totalEqLiabConsolidated = 0;
  for (const r of equityLiabilityRows) {
    totalEqLiabBefore += r.beforeEliminationCredit;
    totalEqLiabElim += r.eliminationCredit;
    totalEqLiabConsolidated += r.afterEliminationCredit;
  }

  // Extract P&L (Income & Expense) for reconciliation
  const plRows = ctb.rows.filter(
    (r) => r.category === 'Income' || r.category === 'Expense',
  );
  let plDr = 0;
  let plCr = 0;
  for (const r of plRows) {
    plDr += r.afterEliminationDebit;
    plCr += r.afterEliminationCredit;
  }

  const isComplete = !hasUnmappedBalances;
  let warningMessage: string | null = null;
  if (hasUnmappedBalances) {
    if (assetRows.length === 0 && equityLiabilityRows.length === 0) {
      warningMessage = `Pending FSLI Assignment: Consolidated units contain ₹${unmappedDr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} of unmapped balances across unassigned ledgers. No approved FSLI classifications exist for these units. This preview is incomplete and cannot be used as a final Consolidated Balance Sheet.`;
    } else {
      warningMessage = `Pending FSLI Assignment: Partially unmapped balances detected. ₹${unmappedDr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Dr) / ₹${unmappedCr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Cr) remains unclassified under unmapped ledgers. Mapped balances are shown below, but the Consolidated Balance Sheet remains incomplete until all ledgers complete Phase 5–7 mapping.`;
    }
  }

  // Reconciliation
  const mappedAssetsTotal = round2(totalAssetsConsolidated);
  const mappedEquityLiabilitiesTotal = round2(totalEqLiabConsolidated);
  const totalTrialBalanceDebit = ctb.totalAfterDebit;
  const totalTrialBalanceCredit = ctb.totalAfterCredit;
  const totalEliminations = ctb.totalEliminationDebit;

  const reconciliationDiff = round2(
    totalTrialBalanceDebit - totalTrialBalanceCredit,
  );

  const reconciliation: ConsolidatedBalanceSheetReconciliation = {
    totalTrialBalanceDebit,
    totalTrialBalanceCredit,
    totalEliminations,
    mappedAssetsTotal,
    mappedEquityLiabilitiesTotal,
    unmappedDebit: unmappedDr,
    unmappedCredit: unmappedCr,
    unmappedNet,
    plDebit: round2(plDr),
    plCredit: round2(plCr),
    plNet: round2(plDr - plCr),
    reconciliationDifference: reconciliationDiff,
    isReconciled: reconciliationDiff === 0,
  };

  return {
    consolidationRunId: runId,
    financialYearId: ctb.financialYearId,
    financialYearLabel: ctb.financialYearLabel,
    isComplete,
    hasUnmappedBalances,
    unmappedDebit: unmappedDr,
    unmappedCredit: unmappedCr,
    unmappedNet,
    warningMessage,
    assetRows,
    equityLiabilityRows,
    totalAssetsBeforeElimination: round2(totalAssetsBefore),
    totalAssetsElimination: round2(totalAssetsElim),
    totalAssetsConsolidated: round2(totalAssetsConsolidated),
    totalEquityLiabilitiesBeforeElimination: round2(totalEqLiabBefore),
    totalEquityLiabilitiesElimination: round2(totalEqLiabElim),
    totalEquityLiabilitiesConsolidated: round2(totalEqLiabConsolidated),
    reconciliation,
  };
}

// ── Elimination Review Data ───────────────────────────────────────────────────

export function getEliminationReviewData(
  db: Database.Database,
  runId: string,
): EliminationReviewData {
  const run = db.prepare('SELECT * FROM ConsolidationRun WHERE id = ?').get(runId) as any;
  if (!run) throw new Error('Consolidation run not found.');

  const fyRow = db.prepare('SELECT year_label FROM FinancialYear WHERE id = ?').get(run.financial_year_id) as { year_label: string } | undefined;

  const elimRows = db.prepare(`
    SELECT * FROM ConsolidationElimination
    WHERE consolidation_run_id = ? AND reversal_of_id IS NULL
    ORDER BY elimination_number ASC
  `).all(runId) as any[];

  let totalInternalDr = 0, totalInternalCr = 0;
  let totalProposedElim = 0, totalUnmatched = 0;
  let matchedCount = 0, partialCount = 0, unmatchedCount = 0, needsReviewCount = 0;
  let approvedCount = 0, appliedCount = 0, rejectedCount = 0, reversedCount = 0;

  const rows: EliminationReviewRow[] = elimRows.map((r: any) => {
    const srcUnit = db.prepare('SELECT unit_name FROM Unit WHERE id = ?').get(r.source_unit_id) as { unit_name: string } | undefined;
    let cptyUnit: { unit_name: string } | undefined;
    if (r.counterparty_unit_id) {
      cptyUnit = db.prepare('SELECT unit_name FROM Unit WHERE id = ?').get(r.counterparty_unit_id) as { unit_name: string } | undefined;
    }

    const dr = Number(r.debit_amount) || 0;
    const cr = Number(r.credit_amount) || 0;
    totalInternalDr += dr;
    totalInternalCr += cr;
    totalProposedElim += Number(r.eliminated_amount) || 0;
    totalUnmatched += Number(r.unmatched_amount) || 0;

    // Count by match status
    switch (r.match_status) {
      case 'Matched': matchedCount++; break;
      case 'PartiallyMatched': partialCount++; break;
      case 'Unmatched': unmatchedCount++; break;
      case 'NeedsReview': needsReviewCount++; break;
      case 'Approved': approvedCount++; break;
      case 'Applied': appliedCount++; break;
      case 'Rejected': rejectedCount++; break;
      case 'Reversed': reversedCount++; break;
    }

    return {
      eliminationId: r.id,
      eliminationNumber: r.elimination_number,
      sourceUnitId: r.source_unit_id,
      sourceUnitName: srcUnit?.unit_name || r.source_unit_id,
      counterpartyUnitId: r.counterparty_unit_id,
      counterpartyUnitName: cptyUnit?.unit_name || null,
      sourceLedgerName: r.source_ledger_name,
      counterpartyLedgerName: r.counterparty_ledger_name,
      internalAccountType: r.internal_account_type,
      debitAmount: dr,
      creditAmount: cr,
      proposedElimination: Number(r.eliminated_amount) || 0,
      unmatchedDifference: Number(r.unmatched_amount) || 0,
      matchStatus: r.match_status,
      confidence: Number(r.confidence) || 0,
      reason: r.reason,
      status: r.status,
    };
  });

  const summary: EliminationReviewSummary = {
    totalDetected: elimRows.length,
    matchedCount,
    partiallyMatchedCount: partialCount,
    unmatchedCount,
    needsReviewCount,
    approvedCount,
    appliedCount,
    rejectedCount,
    reversedCount,
    totalInternalDebit: round2(totalInternalDr),
    totalInternalCredit: round2(totalInternalCr),
    internalDifference: round2(totalInternalDr - totalInternalCr),
    totalProposedElimination: round2(totalProposedElim),
    totalUnmatchedAmount: round2(totalUnmatched),
  };

  return {
    consolidationRunId: runId,
    financialYearLabel: fyRow?.year_label || '',
    summary,
    rows,
  };
}

// ── Audit Trail ───────────────────────────────────────────────────────────────

export function getConsolidationAuditHistory(
  db: Database.Database,
  runId?: string,
  eliminationId?: string,
): ConsolidationAuditRecord[] {
  let query = 'SELECT * FROM ConsolidationAudit WHERE 1=1';
  const params: string[] = [];

  if (runId) {
    query += ' AND consolidation_run_id = ?';
    params.push(runId);
  }
  if (eliminationId) {
    query += ' AND elimination_id = ?';
    params.push(eliminationId);
  }

  query += ' ORDER BY performed_at ASC';

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((r: any) => ({
    id: r.id,
    consolidationRunId: r.consolidation_run_id,
    eliminationId: r.elimination_id,
    action: r.action,
    beforeStatus: r.before_status,
    afterStatus: r.after_status,
    details: r.details,
    reason: r.reason,
    performedBy: r.performed_by,
    performedAt: r.performed_at,
  }));
}
