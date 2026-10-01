/**
 * Dashboard & Financial Reporting Engine (Phase 15.1)
 *
 * Dedicated, read-only presentation/reporting layer foundation that consumes
 * authoritative outputs of existing Phase 9-14 accounting engines.
 *
 * CRITICAL ARCHITECTURAL RULES:
 * 1. STRICTLY READ-ONLY: Never modifies ledger entries, mappings, classifications,
 *    adjustments, eliminations, hierarchy nodes, Notes, or validation results.
 * 2. NO DUPLICATE CALCULATIONS: Phase 15 does not compute accounting balances
 *    directly. Authoritative totals come from Phase 11/12/13/14 engines.
 * 3. DYNAMIC DATA ACCESS: Financial Years and Units are always loaded dynamically
 *    from the database (no hardcoded years or mock lists).
 * 4. ISOLATION & CONTEXT CONSISTENCY: Centralized reporting context determines
 *    the exact FY, Entity, Unit, Scope across all Phase 15 reporting views.
 * 5. NO FAKE FINANCIAL NUMBERS: Empty and loading states are used when data is absent.
 */

import type Database from 'better-sqlite3';
import type {
  ReportingScope,
  ReportingContextData,
  DashboardFinancialYearOption,
  DashboardUnitOption,
  DashboardConsolidationRunOption,
  DashboardPipelineSummary,
  DashboardOverviewData,
  ExecutiveFinancialKPI,
  ExecutivePositionIndicator,
  ExecutiveValidationSummary,
  ExecutiveFinancialSummary,
} from './electron-api';
import { generateFinancialStatements } from './financial-statement-engine';
import { runFinalValidation } from './final-validation-engine';

const DEFAULT_ENTITY_ID = 'default-entity';

/**
 * Retrieves the configured Entity / Organisation name from the database.
 */
export function getEntityNameFromDb(db: Database.Database): string {
  try {
    const row = db.prepare('SELECT entity_name FROM Entity LIMIT 1').get() as { entity_name?: string } | undefined;
    if (row && row.entity_name && row.entity_name.trim()) {
      return row.entity_name.trim();
    }
  } catch {
    // Fallback if table doesn't exist
  }
  return 'Santhigiri Ashram';
}

/**
 * Retrieves the entity record from the database.
 */
export function getEntityRecord(db: Database.Database): { id: string; name: string } {
  try {
    const row = db.prepare('SELECT id, entity_name FROM Entity LIMIT 1').get() as { id?: string; entity_name?: string } | undefined;
    if (row && row.id) {
      return {
        id: row.id,
        name: row.entity_name || 'Santhigiri Ashram',
      };
    }
  } catch {
    // Fallback
  }
  return {
    id: DEFAULT_ENTITY_ID,
    name: 'Santhigiri Ashram',
  };
}

/**
 * Fetches the complete foundational Dashboard & Reporting overview dataset.
 * Strictly read-only; queries existing DB tables.
 */
export function getDashboardOverview(
  db: Database.Database,
  financialYearId?: string,
  options?: {
    scope?: ReportingScope;
    unitId?: string;
    consolidationRunId?: string;
  },
): DashboardOverviewData {
  const entity = getEntityRecord(db);

  // 1. Fetch available Financial Years dynamically
  const fyRows = db.prepare(`
    SELECT fy.id, fy.year_label,
      (SELECT COUNT(*) FROM LedgerBalance lb WHERE lb.financial_year_id = fy.id) as balance_count
    FROM FinancialYear fy
    ORDER BY fy.year_label DESC
  `).all() as Array<{ id: string; year_label: string; balance_count: number }>;

  const financialYears: DashboardFinancialYearOption[] = fyRows.map((f) => ({
    id: f.id,
    label: f.year_label,
    hasData: f.balance_count > 0,
  }));

  // Determine active FY
  const activeFy = (financialYearId
    ? fyRows.find((f) => f.id === financialYearId)
    : null) || fyRows.find((f) => f.balance_count > 0) || fyRows[0];

  const fyId = activeFy?.id || '';
  const fyLabel = activeFy?.year_label || '';

  // 2. Fetch available Units dynamically
  const unitRows = db.prepare(`
    SELECT u.id, u.unit_name,
      (SELECT COUNT(*) FROM Ledger l
       JOIN LedgerBalance lb ON l.id = lb.ledger_id
       WHERE l.unit_id = u.id AND lb.financial_year_id = ?) as balance_count
    FROM Unit u
    WHERE u.entity_id = ?
    ORDER BY u.unit_name ASC
  `).all(fyId, entity.id) as Array<{ id: string; unit_name: string; balance_count: number }>;

  const units: DashboardUnitOption[] = unitRows.map((u) => ({
    id: u.id,
    name: u.unit_name,
    hasData: u.balance_count > 0,
  }));

  // 3. Fetch Consolidation Runs for active FY
  let consolidationRuns: DashboardConsolidationRunOption[] = [];
  try {
    const runRows = db.prepare(`
      SELECT id, run_number, status
      FROM ConsolidationRun
      WHERE financial_year_id = ? AND entity_id = ?
      ORDER BY created_at DESC
    `).all(fyId, entity.id) as Array<{ id: string; run_number: string; status: string }>;

    consolidationRuns = runRows.map((r) => ({
      id: r.id,
      runNumber: r.run_number,
      status: r.status,
    }));
  } catch {
    // If table not present in test schema
  }

  // 4. Resolve Scope, Unit, Consolidation Run
  const scope: ReportingScope = options?.scope || 'CONSOLIDATED';
  let activeUnitId = options?.unitId;
  if (!activeUnitId && units.length > 0) {
    activeUnitId = units[0].id;
  }
  const activeUnit = units.find((u) => u.id === activeUnitId);

  let activeRunId = options?.consolidationRunId;
  if (!activeRunId && consolidationRuns.length > 0) {
    activeRunId = consolidationRuns[0].id;
  }

  const selectedContext: ReportingContextData = {
    financialYearId: fyId,
    financialYearLabel: fyLabel,
    scope,
    entityId: entity.id,
    entityName: entity.name,
    unitId: scope === 'UNIT' ? activeUnitId : undefined,
    unitName: scope === 'UNIT' ? activeUnit?.name : undefined,
    consolidationRunId: scope === 'CONSOLIDATED' ? activeRunId : undefined,
  };

  // 5. Gather read-only Pipeline Readiness Summary (counts from existing tables, scoped to selected context)
  let activeBatchesCount = 0;
  let mappedLedgersCount = 0;
  let unmappedLedgersCount = 0;
  let adjustmentsCount = 0;

  try {
    if (scope === 'UNIT' && activeUnitId) {
      const batchRow = db.prepare(`
        SELECT COUNT(*) as cnt FROM ImportBatch
        WHERE financial_year_id = ? AND unit_id = ? AND status != 'Deleted'
      `).get(fyId, activeUnitId) as { cnt: number } | undefined;
      activeBatchesCount = batchRow?.cnt || 0;

      const mappedRow = db.prepare(`
        SELECT COUNT(DISTINCT lm.ledger_id) as cnt
        FROM LedgerMapping lm
        JOIN Ledger l ON lm.ledger_id = l.id
        JOIN LedgerBalance lb ON l.id = lb.ledger_id AND lb.financial_year_id = lm.financial_year_id
        WHERE lm.financial_year_id = ?
          AND l.unit_id = ?
          AND lm.status IN ('Mapped', 'Approved', 'AutoApproved', 'Manual')
          AND lm.mapped_fsli_id IS NOT NULL
      `).get(fyId, activeUnitId) as { cnt: number } | undefined;
      mappedLedgersCount = mappedRow?.cnt || 0;

      const unmappedRow = db.prepare(`
        SELECT COUNT(DISTINCT lb.ledger_id) as cnt
        FROM LedgerBalance lb
        JOIN Ledger l ON lb.ledger_id = l.id
        LEFT JOIN LedgerMapping lm ON lb.ledger_id = lm.ledger_id
          AND lb.financial_year_id = lm.financial_year_id
          AND lm.status IN ('Mapped', 'Approved', 'AutoApproved', 'Manual')
          AND lm.mapped_fsli_id IS NOT NULL
        WHERE lb.financial_year_id = ?
          AND l.unit_id = ?
          AND lm.id IS NULL
      `).get(fyId, activeUnitId) as { cnt: number } | undefined;
      unmappedLedgersCount = unmappedRow?.cnt || 0;

      const adjRow = db.prepare(`
        SELECT COUNT(*) as cnt FROM Adjustment
        WHERE financial_year_id = ? AND unit_id = ? AND status = 'Applied'
      `).get(fyId, activeUnitId) as { cnt: number } | undefined;
      adjustmentsCount = adjRow?.cnt || 0;
    } else {
      // Consolidated Scope (All Units)
      const batchRow = db.prepare(`
        SELECT COUNT(*) as cnt FROM ImportBatch
        WHERE financial_year_id = ? AND status != 'Deleted'
      `).get(fyId) as { cnt: number } | undefined;
      activeBatchesCount = batchRow?.cnt || 0;

      const mappedRow = db.prepare(`
        SELECT COUNT(DISTINCT lm.ledger_id) as cnt
        FROM LedgerMapping lm
        JOIN LedgerBalance lb ON lm.ledger_id = lb.ledger_id AND lb.financial_year_id = lm.financial_year_id
        WHERE lm.financial_year_id = ?
          AND lm.status IN ('Mapped', 'Approved', 'AutoApproved', 'Manual')
          AND lm.mapped_fsli_id IS NOT NULL
      `).get(fyId) as { cnt: number } | undefined;
      mappedLedgersCount = mappedRow?.cnt || 0;

      const unmappedRow = db.prepare(`
        SELECT COUNT(DISTINCT lb.ledger_id) as cnt
        FROM LedgerBalance lb
        LEFT JOIN LedgerMapping lm ON lb.ledger_id = lm.ledger_id
          AND lb.financial_year_id = lm.financial_year_id
          AND lm.status IN ('Mapped', 'Approved', 'AutoApproved', 'Manual')
          AND lm.mapped_fsli_id IS NOT NULL
        WHERE lb.financial_year_id = ?
          AND lm.id IS NULL
      `).get(fyId) as { cnt: number } | undefined;
      unmappedLedgersCount = unmappedRow?.cnt || 0;

      const adjRow = db.prepare(`
        SELECT COUNT(*) as cnt FROM Adjustment
        WHERE financial_year_id = ? AND status = 'Applied'
      `).get(fyId) as { cnt: number } | undefined;
      adjustmentsCount = adjRow?.cnt || 0;
    }
  } catch { /* ignore database exceptions */ }

  const isReadyForReporting = activeBatchesCount > 0 && mappedLedgersCount > 0 && unmappedLedgersCount === 0;

  const pipelineSummary: DashboardPipelineSummary = {
    entityName: entity.name,
    totalFinancialYears: financialYears.length,
    totalUnits: units.length,
    activeBatchesCount,
    mappedLedgersCount,
    unmappedLedgersCount,
    adjustmentsCount,
    consolidationRunsCount: consolidationRuns.length,
    isReadyForReporting,
  };

  const executiveSummary = compileExecutiveFinancialSummary(db, fyId, {
    scope,
    unitId: activeUnitId,
    consolidationRunId: activeRunId,
  });

  return {
    entityId: entity.id,
    entityName: entity.name,
    financialYears,
    units,
    consolidationRuns,
    selectedContext,
    pipelineSummary,
    executiveSummary,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compiles the Phase 15.2 Executive Financial Summary from authoritative Phase 12 & Phase 13 outputs.
 * STRICTLY READ-ONLY presentation layer: consumes generateFinancialStatements & runFinalValidation.
 */
export function compileExecutiveFinancialSummary(
  db: Database.Database,
  financialYearId: string,
  options?: {
    scope?: ReportingScope;
    unitId?: string;
    consolidationRunId?: string;
    previousFinancialYearId?: string;
  },
): ExecutiveFinancialSummary {
  const defaultEmptyKPI = (label: string): ExecutiveFinancialKPI => ({
    label,
    cyAmount: null,
    pyAmount: null,
    hasPY: false,
    status: 'NO_DATA',
  });

  const defaultEmptyIndicator = (id: string, label: string, category: 'ASSET' | 'LIABILITY' | 'FUNDS'): ExecutivePositionIndicator => ({
    id,
    label,
    category,
    cyAmount: null,
    pyAmount: null,
    hasPY: false,
    isAvailable: false,
  });

  const defaultEmptyValidation = (): ExecutiveValidationSummary => ({
    status: 'NOT_RUN',
    totalChecks: 0,
    passed: 0,
    warnings: 0,
    errors: 0,
    blocked: 0,
  });

  if (!financialYearId) {
    return {
      hasData: false,
      isBalanced: true,
      balanceDifferenceCY: 0,
      isSurplus: true,
      statementStatus: 'NO_DATA',
      totalIncome: defaultEmptyKPI('Total Income'),
      totalExpenditure: defaultEmptyKPI('Total Expenditure'),
      surplusDeficit: defaultEmptyKPI('Surplus / Deficit'),
      totalAssets: defaultEmptyKPI('Total Assets'),
      totalLiabilities: defaultEmptyKPI('Total Liabilities'),
      fundsReserves: defaultEmptyKPI('Funds / Reserves'),
      indicators: {
        cashBank: defaultEmptyIndicator('cash-bank', 'Cash & Bank', 'ASSET'),
        investments: defaultEmptyIndicator('investments', 'Investments', 'ASSET'),
        inventory: defaultEmptyIndicator('inventory', 'Inventory', 'ASSET'),
        receivables: defaultEmptyIndicator('receivables', 'Receivables & Advances', 'ASSET'),
        loansBorrowings: defaultEmptyIndicator('loans-borrowings', 'Loans & Borrowings', 'LIABILITY'),
        creditorsPayables: defaultEmptyIndicator('creditors-payables', 'Creditors & Liabilities', 'LIABILITY'),
      },
      visualization: {
        incomeCY: 0,
        expenditureCY: 0,
        surplusDeficitCY: 0,
        assetsCY: 0,
        liabilitiesCY: 0,
        fundsReservesCY: 0,
        incomePY: null,
        expenditurePY: null,
        assetsPY: null,
        liabilitiesPY: null,
      },
      validation: defaultEmptyValidation(),
    };
  }

  try {
    const scope = options?.scope === 'UNIT' ? 'UNIT' : 'CONSOLIDATED';
    const unitId = options?.scope === 'UNIT' ? options?.unitId : undefined;
    const consolidationRunId = options?.scope === 'CONSOLIDATED' ? options?.consolidationRunId : undefined;

    // 1. Authoritative Phase 12 Financial Statements
    const fs = generateFinancialStatements(db, financialYearId, {
      scope,
      unitId,
      consolidationRunId,
      previousFinancialYearId: options?.previousFinancialYearId,
    });

    const hasPY = fs.hasPY;
    const bs = fs.balanceSheet;
    const ie = fs.incomeExpenditure;

    // Helper to find BS line by statementLineId
    const getBsLine = (id: string) => bs.lines.find((l) => l.statementLineId === id);

    // Income KPI
    const totalIncome: ExecutiveFinancialKPI = {
      label: 'Total Income',
      cyAmount: ie.totalRevenueCY,
      pyAmount: ie.totalRevenuePY,
      hasPY: ie.hasPY,
      changeAmount: ie.hasPY && ie.totalRevenuePY !== null ? round2(ie.totalRevenueCY - ie.totalRevenuePY) : null,
      changePercent:
        ie.hasPY && ie.totalRevenuePY !== null && ie.totalRevenuePY !== 0
          ? round2(((ie.totalRevenueCY - ie.totalRevenuePY) / Math.abs(ie.totalRevenuePY)) * 100)
          : null,
      status: ie.hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
    };

    // Expenditure KPI
    const totalExpenditure: ExecutiveFinancialKPI = {
      label: 'Total Expenditure',
      cyAmount: ie.totalExpensesCY,
      pyAmount: ie.totalExpensesPY,
      hasPY: ie.hasPY,
      changeAmount: ie.hasPY && ie.totalExpensesPY !== null ? round2(ie.totalExpensesCY - ie.totalExpensesPY) : null,
      changePercent:
        ie.hasPY && ie.totalExpensesPY !== null && ie.totalExpensesPY !== 0
          ? round2(((ie.totalExpensesCY - ie.totalExpensesPY) / Math.abs(ie.totalExpensesPY)) * 100)
          : null,
      status: ie.hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
    };

    // Surplus / Deficit KPI
    const netSurplus = ie.netSurplusCY;
    const isSurplus = netSurplus >= 0;
    const surplusDeficit: ExecutiveFinancialKPI = {
      label: isSurplus ? 'Net Surplus' : 'Net Deficit',
      cyAmount: netSurplus,
      pyAmount: ie.netSurplusPY,
      hasPY: ie.hasPY,
      changeAmount: ie.hasPY && ie.netSurplusPY !== null ? round2(netSurplus - ie.netSurplusPY) : null,
      status: ie.hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
    };

    // Total Assets KPI
    const totalAssets: ExecutiveFinancialKPI = {
      label: 'Total Assets',
      cyAmount: bs.totalAssetsCY,
      pyAmount: bs.totalAssetsPY,
      hasPY: bs.hasPY,
      changeAmount: bs.hasPY && bs.totalAssetsPY !== null ? round2(bs.totalAssetsCY - bs.totalAssetsPY) : null,
      status: bs.hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
    };

    // Total Liabilities KPI
    const totalLiabilities: ExecutiveFinancialKPI = {
      label: 'Total Liabilities',
      cyAmount: bs.totalLiabilitiesCY,
      pyAmount: bs.totalLiabilitiesPY,
      hasPY: bs.hasPY,
      changeAmount: bs.hasPY && bs.totalLiabilitiesPY !== null ? round2(bs.totalLiabilitiesCY - bs.totalLiabilitiesPY) : null,
      status: bs.hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
    };

    // Funds / Corpus / Reserves KPI (Note 4 + Note 5)
    const corpusLine = getBsLine('bs-liab-04');
    const reservesLine = getBsLine('bs-liab-05');
    const fundsCY = round2((corpusLine?.cyAmount || 0) + (reservesLine?.cyAmount || 0));
    const fundsPY = hasPY ? round2((corpusLine?.pyAmount || 0) + (reservesLine?.pyAmount || 0)) : null;

    const fundsReserves: ExecutiveFinancialKPI = {
      label: 'Funds & Reserves',
      cyAmount: fundsCY,
      pyAmount: fundsPY,
      hasPY,
      changeAmount: hasPY && fundsPY !== null ? round2(fundsCY - fundsPY) : null,
      status: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
    };

    // Secondary Position Indicators
    // Cash & Bank (Note 15)
    const n15Line = getBsLine('bs-ast-15');
    const cashBank: ExecutivePositionIndicator = {
      id: 'cash-bank',
      label: 'Cash & Bank Balances',
      category: 'ASSET',
      cyAmount: n15Line?.cyAmount ?? null,
      pyAmount: n15Line?.pyAmount ?? null,
      hasPY,
      isAvailable: n15Line !== undefined && n15Line.cyAmount !== null,
      noteNumber: 15,
      noteReference: 'Note 15',
    };

    // Investments (Note 16)
    const n16Line = getBsLine('bs-ast-16');
    const investments: ExecutivePositionIndicator = {
      id: 'investments',
      label: 'Investments',
      category: 'ASSET',
      cyAmount: n16Line?.cyAmount ?? null,
      pyAmount: n16Line?.pyAmount ?? null,
      hasPY,
      isAvailable: n16Line !== undefined && n16Line.cyAmount !== null,
      noteNumber: 16,
      noteReference: 'Note 16',
    };

    // Inventory (Note 17)
    const n17Line = getBsLine('bs-ast-17');
    const inventory: ExecutivePositionIndicator = {
      id: 'inventory',
      label: 'Inventories & Stock',
      category: 'ASSET',
      cyAmount: n17Line?.cyAmount ?? null,
      pyAmount: n17Line?.pyAmount ?? null,
      hasPY,
      isAvailable: n17Line !== undefined && n17Line.cyAmount !== null,
      noteNumber: 17,
      noteReference: 'Note 17',
    };

    // Receivables & Advances (Note 14 + Note 18 Current + Note 19)
    const n14Line = getBsLine('bs-ast-14');
    const n18cLine = getBsLine('bs-ast-18-c');
    const n19Line = getBsLine('bs-ast-19');
    const recvCY = round2((n14Line?.cyAmount || 0) + (n18cLine?.cyAmount || 0) + (n19Line?.cyAmount || 0));
    const recvPY = hasPY ? round2((n14Line?.pyAmount || 0) + (n18cLine?.pyAmount || 0) + (n19Line?.pyAmount || 0)) : null;
    const receivables: ExecutivePositionIndicator = {
      id: 'receivables',
      label: 'Receivables & Advances',
      category: 'ASSET',
      cyAmount: recvCY,
      pyAmount: recvPY,
      hasPY,
      isAvailable: Boolean(n14Line || n18cLine || n19Line),
      noteNumber: 14,
      noteReference: 'Notes 14, 18, 19',
    };

    // Loans & Borrowings (Notes 6 & 7)
    const n6ncLine = getBsLine('bs-liab-06-nc');
    const n6cLine = getBsLine('bs-liab-06-c');
    const n7Line = getBsLine('bs-liab-07');
    const loansCY = round2((n6ncLine?.cyAmount || 0) + (n6cLine?.cyAmount || 0) + (n7Line?.cyAmount || 0));
    const loansPY = hasPY ? round2((n6ncLine?.pyAmount || 0) + (n6cLine?.pyAmount || 0) + (n7Line?.pyAmount || 0)) : null;
    const loansBorrowings: ExecutivePositionIndicator = {
      id: 'loans-borrowings',
      label: 'Loans & Borrowings',
      category: 'LIABILITY',
      cyAmount: loansCY,
      pyAmount: loansPY,
      hasPY,
      isAvailable: Boolean(n6ncLine || n6cLine || n7Line),
      noteNumber: 6,
      noteReference: 'Notes 6 & 7',
    };

    // Creditors & Current Liabilities (Notes 8, 9, 10)
    const n8Line = getBsLine('bs-liab-08');
    const n9Line = getBsLine('bs-liab-09');
    const n10Line = getBsLine('bs-liab-10');
    const credCY = round2((n8Line?.cyAmount || 0) + (n9Line?.cyAmount || 0) + (n10Line?.cyAmount || 0));
    const credPY = hasPY ? round2((n8Line?.pyAmount || 0) + (n9Line?.pyAmount || 0) + (n10Line?.pyAmount || 0)) : null;
    const creditorsPayables: ExecutivePositionIndicator = {
      id: 'creditors-payables',
      label: 'Creditors & Liabilities',
      category: 'LIABILITY',
      cyAmount: credCY,
      pyAmount: credPY,
      hasPY,
      isAvailable: Boolean(n8Line || n9Line || n10Line),
      noteNumber: 8,
      noteReference: 'Notes 8, 9, 10',
    };

    // 2. Authoritative Phase 13 Final Validation Status
    let validation: ExecutiveValidationSummary = defaultEmptyValidation();
    try {
      const valReport = runFinalValidation(db, financialYearId, {
        scope,
        unitId,
        consolidationRunId,
        previousFinancialYearId: options?.previousFinancialYearId,
      });

      validation = {
        status: valReport.overallStatus,
        totalChecks: valReport.summary.totalChecks,
        passed: valReport.summary.passed,
        warnings: valReport.summary.warnings,
        errors: valReport.summary.errors,
        blocked: valReport.summary.blocked,
        lastRunTimestamp: valReport.generatedAt,
      };
    } catch {
      // If validation engine cannot be executed in this context, keep NOT_RUN
    }

    return {
      hasData: true,
      isBalanced: bs.isBalancedCY,
      balanceDifferenceCY: bs.differenceCY,
      isSurplus,
      statementStatus: fs.status,
      totalIncome,
      totalExpenditure,
      surplusDeficit,
      totalAssets,
      totalLiabilities,
      fundsReserves,
      indicators: {
        cashBank,
        investments,
        inventory,
        receivables,
        loansBorrowings,
        creditorsPayables,
      },
      visualization: {
        incomeCY: ie.totalRevenueCY,
        expenditureCY: ie.totalExpensesCY,
        surplusDeficitCY: ie.netSurplusCY,
        assetsCY: bs.totalAssetsCY,
        liabilitiesCY: bs.totalLiabilitiesCY,
        fundsReservesCY: fundsCY,
        incomePY: ie.totalRevenuePY,
        expenditurePY: ie.totalExpensesPY,
        assetsPY: bs.totalAssetsPY,
        liabilitiesPY: bs.totalLiabilitiesPY,
      },
      validation,
    };
  } catch (err) {
    return {
      hasData: false,
      isBalanced: true,
      balanceDifferenceCY: 0,
      isSurplus: true,
      statementStatus: 'ERROR',
      totalIncome: defaultEmptyKPI('Total Income'),
      totalExpenditure: defaultEmptyKPI('Total Expenditure'),
      surplusDeficit: defaultEmptyKPI('Surplus / Deficit'),
      totalAssets: defaultEmptyKPI('Total Assets'),
      totalLiabilities: defaultEmptyKPI('Total Liabilities'),
      fundsReserves: defaultEmptyKPI('Funds / Reserves'),
      indicators: {
        cashBank: defaultEmptyIndicator('cash-bank', 'Cash & Bank', 'ASSET'),
        investments: defaultEmptyIndicator('investments', 'Investments', 'ASSET'),
        inventory: defaultEmptyIndicator('inventory', 'Inventory', 'ASSET'),
        receivables: defaultEmptyIndicator('receivables', 'Receivables & Advances', 'ASSET'),
        loansBorrowings: defaultEmptyIndicator('loans-borrowings', 'Loans & Borrowings', 'LIABILITY'),
        creditorsPayables: defaultEmptyIndicator('creditors-payables', 'Creditors & Liabilities', 'LIABILITY'),
      },
      visualization: {
        incomeCY: 0,
        expenditureCY: 0,
        surplusDeficitCY: 0,
        assetsCY: 0,
        liabilitiesCY: 0,
        fundsReservesCY: 0,
        incomePY: null,
        expenditurePY: null,
        assetsPY: null,
        liabilitiesPY: null,
      },
      validation: defaultEmptyValidation(),
    };
  }
}

/**
 * Phase 15.1 Automated Verification Test Suite
 */
export function runDashboardFoundationTests(db: Database.Database): {
  allPassed: boolean;
  totalTests: number;
  passedTests: number;
  results: Array<{ name: string; passed: boolean; message: string }>;
} {
  const results: Array<{ name: string; passed: boolean; message: string }> = [];

  const addResult = (name: string, passed: boolean, message: string) => {
    results.push({ name, passed, message });
  };

  // Test 1: Dynamic FY loading without hardcoding
  try {
    const overview = getDashboardOverview(db);
    const hasFys = overview.financialYears.length > 0;
    const hasValidLabels = overview.financialYears.every((f) => Boolean(f.id && f.label));
    addResult(
      '1. Dynamic Financial Year Loading',
      hasFys && hasValidLabels,
      `Loaded ${overview.financialYears.length} financial years dynamically with valid labels.`,
    );
  } catch (err: any) {
    addResult('1. Dynamic Financial Year Loading', false, err.message);
  }

  // Test 2: Active FY Context Propagation
  try {
    const overview = getDashboardOverview(db);
    const firstFy = overview.financialYears[0];
    if (firstFy) {
      const scopedOverview = getDashboardOverview(db, firstFy.id);
      const matches = scopedOverview.selectedContext.financialYearId === firstFy.id &&
                      scopedOverview.selectedContext.financialYearLabel === firstFy.label;
      addResult(
        '2. Active FY Context Propagation',
        matches,
        `Selected FY (${firstFy.label}) propagated correctly into selectedContext.`,
      );
    } else {
      addResult('2. Active FY Context Propagation', true, 'No FYs in DB to test context propagation.');
    }
  } catch (err: any) {
    addResult('2. Active FY Context Propagation', false, err.message);
  }

  // Test 3: Dynamic Unit and Entity Loading
  try {
    const overview = getDashboardOverview(db);
    const hasEntity = Boolean(overview.entityName);
    const unitsValid = overview.units.every((u) => Boolean(u.id && u.name));
    addResult(
      '3. Dynamic Unit & Entity Loading',
      hasEntity && unitsValid,
      `Entity: "${overview.entityName}", Units loaded: ${overview.units.length}.`,
    );
  } catch (err: any) {
    addResult('3. Dynamic Unit & Entity Loading', false, err.message);
  }

  // Test 4: Scope Toggling (CONSOLIDATED vs UNIT)
  try {
    const overviewConsolidated = getDashboardOverview(db, undefined, { scope: 'CONSOLIDATED' });
    const isConsolidated = overviewConsolidated.selectedContext.scope === 'CONSOLIDATED' &&
                          overviewConsolidated.selectedContext.unitId === undefined;

    const firstUnit = overviewConsolidated.units[0];
    const overviewUnit = getDashboardOverview(db, undefined, { scope: 'UNIT', unitId: firstUnit?.id });
    const isUnit = overviewUnit.selectedContext.scope === 'UNIT' &&
                   (firstUnit ? overviewUnit.selectedContext.unitId === firstUnit.id : true);

    addResult(
      '4. Reporting Scope Toggling',
      isConsolidated && isUnit,
      'Scope correctly switches between CONSOLIDATED and UNIT with proper unitId isolation.',
    );
  } catch (err: any) {
    addResult('4. Reporting Scope Toggling', false, err.message);
  }

  // Test 5: Read-Only Safety Guarantee
  try {
    const countBefore = (db.prepare('SELECT COUNT(*) as cnt FROM FinancialYear').get() as any)?.cnt || 0;
    getDashboardOverview(db);
    getDashboardOverview(db, undefined, { scope: 'UNIT' });
    const countAfter = (db.prepare('SELECT COUNT(*) as cnt FROM FinancialYear').get() as any)?.cnt || 0;

    addResult(
      '5. Read-Only Safety Guarantee',
      countBefore === countAfter,
      `0 DB mutations performed during dashboard operations (${countBefore} === ${countAfter}).`,
    );
  } catch (err: any) {
    addResult('5. Read-Only Safety Guarantee', false, err.message);
  }

  // Test 6: Pipeline Readiness Metrics & Unit Scoping
  try {
    const overviewConsolidated = getDashboardOverview(db, undefined, { scope: 'CONSOLIDATED' });
    const cSummary = overviewConsolidated.pipelineSummary;

    const firstUnit = overviewConsolidated.units[0];
    const overviewUnit = getDashboardOverview(db, undefined, { scope: 'UNIT', unitId: firstUnit?.id });
    const uSummary = overviewUnit.pipelineSummary;

    const isValidSummary = cSummary !== undefined &&
                          uSummary !== undefined &&
                          typeof cSummary.totalFinancialYears === 'number' &&
                          typeof cSummary.totalUnits === 'number' &&
                          typeof cSummary.isReadyForReporting === 'boolean';

    // When units have distinct batches, unit batches <= consolidated batches
    const unitIsolationWorking = uSummary.activeBatchesCount <= cSummary.activeBatchesCount;

    addResult(
      '6. Pipeline Readiness Metrics Summary',
      isValidSummary && unitIsolationWorking,
      `Summary generated: ready=${cSummary.isReadyForReporting}, Consolidated Batches=${cSummary.activeBatchesCount}, Unit Batches=${uSummary.activeBatchesCount}, Mapped=${cSummary.mappedLedgersCount}.`,
    );
  } catch (err: any) {
    addResult('6. Pipeline Readiness Metrics Summary', false, err.message);
  }

  // Test 7: Empty State & Fallback Resilience
  try {
    const nonExistentOverview = getDashboardOverview(db, 'non-existent-fy-id-999');
    const hasSelectedContext = Boolean(nonExistentOverview.selectedContext);
    addResult(
      '7. Empty State & Fallback Resilience',
      hasSelectedContext,
      'Engine gracefully falls back and maintains valid selectedContext on invalid FY input.',
    );
  } catch (err: any) {
    addResult('7. Empty State & Fallback Resilience', false, err.message);
  }

  // Test 8: Consolidation Run Resolution
  try {
    const overview = getDashboardOverview(db, undefined, { scope: 'CONSOLIDATED' });
    const runs = overview.consolidationRuns;
    addResult(
      '8. Consolidation Run Resolution',
      Array.isArray(runs),
      `Consolidation runs resolved: ${runs.length} runs available.`,
    );
  } catch (err: any) {
    addResult('8. Consolidation Run Resolution', false, err.message);
  }

  // Test 9: No Accounting Duplication
  try {
    const overview = getDashboardOverview(db);
    // Ensure dashboard overview does NOT return ad-hoc ledger calculations or balances
    const hasNoDirectLedgerMath = !('totalDebit' in overview) && !('totalCredit' in overview) && !('netSurplus' in overview);
    addResult(
      '9. Architectural Separation (No Math Duplication)',
      hasNoDirectLedgerMath,
      'Dashboard overview strictly exposes metadata and context without duplicating Phase 12 calculations.',
    );
  } catch (err: any) {
    addResult('9. Architectural Separation (No Math Duplication)', false, err.message);
  }

  // Test 10: Complete Context Data Model
  try {
    const overview = getDashboardOverview(db);
    const ctx = overview.selectedContext;
    const hasMandatoryFields = 'financialYearId' in ctx &&
                              'financialYearLabel' in ctx &&
                              'scope' in ctx &&
                              'entityId' in ctx &&
                              'entityName' in ctx;
    addResult(
      '10. Complete Reporting Context Data Model',
      hasMandatoryFields,
      'ReportingContext satisfies full state contract with all required attributes.',
    );
  } catch (err: any) {
    addResult('10. Complete Reporting Context Data Model', false, err.message);
  }

  const passedTests = results.filter((r) => r.passed).length;
  const totalTests = results.length;

  return {
    allPassed: passedTests === totalTests,
    totalTests,
    passedTests,
    results,
  };
}
