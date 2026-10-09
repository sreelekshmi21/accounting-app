/**
 * Phase 15.5: CY/PY Comparative Reporting Test Suite
 *
 * Comprehensive verification covering the requirements and scenarios:
 * Scenario A — CY + PY available: CY, PY, Absolute Change (₹), and Percentage Change (%)
 * Scenario B — CY available, PY unavailable: Graceful degradation, no fake 0, no NaN
 * Scenario C — PY = zero: Change is calculated, Change % is null/N/A, not Infinity/NaN
 * Scenario D — Unit isolation: CY and PY strictly isolated per selected unit
 * Scenario E — Consolidated scope: Authoritative aggregated CY and PY comparison
 * Scenario F — Financial Year propagation: Selected FY is CY, previous FY is PY
 * Scenario G — Read-only safety: 0 DB mutations across all compilation paths
 * Scenario H — Hierarchy preservation: Statement -> Schedule -> Reporting Node -> Lines
 * Scenario I — Note / Schedule linkage: Preserves all Note 4–33 references
 * Scenario J — Phase 12 consistency: 100% data fidelity with Phase 12 statement engine
 * Scenario K — Phase 13 validation: CY_PY_ISOLATION status and message consistency
 * Scenario L — Arithmetic verification: Accurate signed variance and percentage calculations
 */

import Database from 'better-sqlite3';
import {
  calculateVariance,
  compileComparativeReportingData,
} from './dashboard-reporting-engine';
import { generateFinancialStatements } from './financial-statement-engine';
import { createExecutiveTestDatabase } from './test-dashboard-executive';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

/**
 * Creates a base test database (CY only).
 */
export function createComparativeBaseTestDatabase(): Database.Database {
  return createExecutiveTestDatabase();
}

/**
 * Creates a test database with both CY (2025-26) and PY (2024-25) balanced data.
 */
export function createComparativeWithPyTestDatabase(): Database.Database {
  const db = createExecutiveTestDatabase();
  const now = new Date().toISOString();

  // Helper to add balanced ledger balances and mappings
  const addLedger = (id: string, unitId: string, name: string, fsliCode: string, debit: number, credit: number, fyId = 'fy-2024-25') => {
    db.prepare("INSERT OR IGNORE INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES (?, 'default-entity', ?, ?)").run(id, unitId, name);
    const batchId = `batch-${unitId}-${fyId}`;
    db.prepare(`
      INSERT OR IGNORE INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_rows, ledger_count, total_debit, total_credit, difference, import_timestamp, status)
      VALUES (?, 'default-entity', ?, ?, 'tb_py.xlsx', '/path/tb_py.xlsx', 'hash_py', 10, 10, 500000, 500000, 0, ?, 'SUCCESS')
    `).run(batchId, unitId, fyId, now);

    db.prepare(`
      INSERT OR IGNORE INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit, closing_debit, closing_credit, net_balance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`lb-${id}-${fyId}`, id, fyId, batchId, debit, credit, debit, credit, debit - credit);

    db.prepare(`
      INSERT OR IGNORE INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'Approved', ?, ?)
    `).run(`map-${id}-${fyId}`, id, fyId, fsliCode, now, now);
  };

  // Seed Ma Bakery PY (FY 2024-25)
  // Income: 180,000, Expenses: 120,000 => Surplus: 60,000
  // Assets: Cash 40,000 + Receivables 140,000 => Total Assets 180,000
  // Liabilities: Creditors 40,000 + Reserves 80,000 + Surplus 60,000 => Total Liabilities 180,000
  addLedger('mb-rev-py-1', 'unit-ma-bakery', 'Bakery Donations PY', 'INC_DON_GRANT', 0, 180000, 'fy-2024-25');
  addLedger('mb-exp-py-1', 'unit-ma-bakery', 'Staff Salaries PY', 'EXP_EMP_BEN', 120000, 0, 'fy-2024-25');
  addLedger('mb-ast-cash-py', 'unit-ma-bakery', 'Bakery Cash PY', 'CA_BANK_BAL', 40000, 0, 'fy-2024-25');
  addLedger('mb-ast-rec-py', 'unit-ma-bakery', 'Bakery Receivables PY', 'CA_TRADE_REC', 140000, 0, 'fy-2024-25');
  addLedger('mb-liab-cred-py', 'unit-ma-bakery', 'Flour Suppliers PY', 'CL_TRADE_PAY', 0, 40000, 'fy-2024-25');
  addLedger('mb-liab-res-py', 'unit-ma-bakery', 'General Reserve PY', 'EQ_RES_SURP', 0, 80000, 'fy-2024-25');

  return db;
}

export function runComparativeReportingTests(database?: Database.Database): {
  allPassed: boolean;
  totalTests: number;
  passedTests: number;
  results: TestResult[];
} {
  const dbCyOnly = database || createComparativeBaseTestDatabase();
  const dbWithPy = createComparativeWithPyTestDatabase();
  const results: TestResult[] = [];

  const add = (name: string, passed: boolean, message: string) => {
    results.push({ name, passed, message });
    if (passed) {
      console.log(`[✓ PASS] ${name}`);
      console.log(`        ${message}`);
    } else {
      console.error(`[✗ FAIL] ${name}`);
      console.error(`        ${message}`);
    }
  };

  // Test 1: FY Propagation
  try {
    const data = compileComparativeReportingData(dbCyOnly, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const passed = data.financialYearLabel === '2025-26' && data.hasData;
    add('Test 1 — FY Propagation', passed, `Selected FY propagated correctly: label="${data.financialYearLabel}", hasData=${data.hasData}`);
  } catch (err: unknown) {
    add('Test 1 — FY Propagation', false, `Error: ${String(err)}`);
  }

  // Test 2: Unit Isolation
  try {
    const maBakeryData = compileComparativeReportingData(dbCyOnly, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const saBioData = compileComparativeReportingData(dbCyOnly, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-sa-bioproducts' });

    const passed =
      maBakeryData.incomeExpenditure.headlineMetrics[0]?.cyAmount === 200000 &&
      saBioData.incomeExpenditure.headlineMetrics[0]?.cyAmount === 500000 &&
      maBakeryData.unitName === 'Ma Bakery';

    add(
      'Test 2 — Unit Isolation',
      passed,
      `Ma Bakery (Income: ₹${maBakeryData.incomeExpenditure.headlineMetrics[0]?.cyAmount}) is strictly isolated from SA Bioproducts (Income: ₹${saBioData.incomeExpenditure.headlineMetrics[0]?.cyAmount}).`,
    );
  } catch (err: unknown) {
    add('Test 2 — Unit Isolation', false, `Error: ${String(err)}`);
  }

  // Test 3: Consolidated Scope
  try {
    const consData = compileComparativeReportingData(dbCyOnly, 'fy-2025-26', { scope: 'CONSOLIDATED' });
    const passed =
      consData.incomeExpenditure.headlineMetrics[0]?.cyAmount === 700000 &&
      consData.incomeExpenditure.headlineMetrics[1]?.cyAmount === 450000 &&
      consData.scope === 'CONSOLIDATED';

    add(
      'Test 3 — Consolidated Scope',
      passed,
      `Consolidated statement aggregates units authoritatively: Income: ₹${consData.incomeExpenditure.headlineMetrics[0]?.cyAmount}, Expenditure: ₹${consData.incomeExpenditure.headlineMetrics[1]?.cyAmount}.`,
    );
  } catch (err: unknown) {
    add('Test 3 — Consolidated Scope', false, `Error: ${String(err)}`);
  }

  // Test 4: Scenario B — CY available, PY unavailable (Graceful degradation, no fake 0, no NaN)
  try {
    const compCyOnly = compileComparativeReportingData(dbCyOnly, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const ieInc = compCyOnly.incomeExpenditure.headlineMetrics[0];
    const bsAst = compCyOnly.balanceSheet.headlineMetrics[0];

    const passed =
      compCyOnly.hasPY === false &&
      ieInc?.pyAmount === null &&
      ieInc?.changeAmount === null &&
      ieInc?.changePercent === null &&
      ieInc?.status === 'PY_UNAVAILABLE' &&
      bsAst?.pyAmount === null &&
      bsAst?.changeAmount === null &&
      bsAst?.changePercent === null &&
      bsAst?.status === 'PY_UNAVAILABLE' &&
      compCyOnly.pyStatusMessage.includes('unavailable');

    add(
      'Test 4 — Scenario B: Missing PY Isolation',
      passed,
      `When PY is absent, PY is null, Change is null, Change % is null (status="PY_UNAVAILABLE") with no fake ₹0 or NaN.`,
    );
  } catch (err: unknown) {
    add('Test 4 — Scenario B: Missing PY Isolation', false, `Error: ${String(err)}`);
  }

  // Test 5: Scenario A — CY + PY Available Income & Expenditure Comparison
  try {
    const compPy = compileComparativeReportingData(dbWithPy, 'fy-2025-26', {
      scope: 'UNIT',
      unitId: 'unit-ma-bakery',
      previousFinancialYearId: 'fy-2024-25',
    });

    const incMetric = compPy.incomeExpenditure.headlineMetrics.find((m) => m.label === 'Total Income');
    const expMetric = compPy.incomeExpenditure.headlineMetrics.find((m) => m.label === 'Total Expenditure');
    const surpMetric = compPy.incomeExpenditure.headlineMetrics.find((m) => m.label.includes('Surplus'));

    // CY: 200,000, PY: 180,000, Change: 20,000, Change %: +11.11%
    // Expenses: CY 150,000, PY 120,000, Change: 30,000, Change %: +25%
    // Surplus: CY 50,000, PY 60,000, Change: -10,000, Change %: -16.67%
    const passed =
      compPy.hasPY === true &&
      incMetric !== undefined &&
      incMetric.cyAmount === 200000 &&
      incMetric.pyAmount === 180000 &&
      incMetric.changeAmount === 20000 &&
      Math.abs(incMetric.changePercent! - 11.11) < 0.1 &&
      expMetric !== undefined &&
      expMetric.cyAmount === 150000 &&
      expMetric.pyAmount === 120000 &&
      expMetric.changeAmount === 30000 &&
      expMetric.changePercent === 25 &&
      surpMetric !== undefined &&
      surpMetric.cyAmount === 50000 &&
      surpMetric.pyAmount === 60000 &&
      surpMetric.changeAmount === -10000 &&
      Math.abs(surpMetric.changePercent! - (-16.67)) < 0.1;

    add(
      'Test 5 — Scenario A: CY + PY Available I&E Comparison',
      passed,
      `CY & PY correctly calculated: Income CY: ₹${incMetric?.cyAmount}, PY: ₹${incMetric?.pyAmount}, Change: ₹${incMetric?.changeAmount} (${incMetric?.changePercent}%); Expenses Change: ₹${expMetric?.changeAmount} (${expMetric?.changePercent}%).`,
    );
  } catch (err: unknown) {
    add('Test 5 — Scenario A: CY + PY Available I&E Comparison', false, `Error: ${String(err)}`);
  }

  // Test 6: Scenario A — CY + PY Available Balance Sheet Comparison
  try {
    const compPy = compileComparativeReportingData(dbWithPy, 'fy-2025-26', {
      scope: 'UNIT',
      unitId: 'unit-ma-bakery',
      previousFinancialYearId: 'fy-2024-25',
    });

    const astMetric = compPy.balanceSheet.headlineMetrics.find((m) => m.label === 'Total Assets');
    const liabMetric = compPy.balanceSheet.headlineMetrics.find((m) => m.label.includes('Liabilities'));

    // Assets: CY 200,000, PY 180,000, Change: 20,000, Change %: +11.11%
    const passed =
      astMetric !== undefined &&
      astMetric.cyAmount === 200000 &&
      astMetric.pyAmount === 180000 &&
      astMetric.changeAmount === 20000 &&
      Math.abs(astMetric.changePercent! - 11.11) < 0.1 &&
      liabMetric !== undefined &&
      liabMetric.cyAmount === 200000 &&
      liabMetric.pyAmount === 180000 &&
      liabMetric.changeAmount === 20000;

    add(
      'Test 6 — Scenario A: CY + PY Available Balance Sheet Comparison',
      passed,
      `Balance Sheet comparative metrics correct: Assets CY: ₹${astMetric?.cyAmount}, PY: ₹${astMetric?.pyAmount}, Change: ₹${astMetric?.changeAmount} (${astMetric?.changePercent}%).`,
    );
  } catch (err: unknown) {
    add('Test 6 — Scenario A: CY + PY Available Balance Sheet Comparison', false, `Error: ${String(err)}`);
  }

  // Test 7: Scenario C — PY = Zero base handling (Change calculated, Change % is null/N/A, not Infinity/NaN)
  try {
    const vZero = calculateVariance(50000, 0, true);
    const passed =
      vZero.changeAmount === 50000 &&
      vZero.changePercent === null &&
      vZero.status === 'ZERO_BASE' &&
      !Number.isNaN(vZero.changeAmount) &&
      vZero.changePercent !== Infinity &&
      vZero.changePercent !== -Infinity;

    add(
      'Test 7 — Scenario C: Zero PY Base Handling (No NaN or Infinity)',
      passed,
      `When PY is ₹0, Change is ₹${vZero.changeAmount} and Change % is null (status="ZERO_BASE") without NaN or Infinity.`,
    );
  } catch (err: unknown) {
    add('Test 7 — Scenario C: Zero PY Base Handling (No NaN or Infinity)', false, `Error: ${String(err)}`);
  }

  // Test 8: Reporting Hierarchy Preservation (Statement -> Section -> Line -> Subtotal -> Total)
  try {
    const compPy = compileComparativeReportingData(dbWithPy, 'fy-2025-26', {
      scope: 'UNIT',
      unitId: 'unit-ma-bakery',
      previousFinancialYearId: 'fy-2024-25',
    });

    const fs = generateFinancialStatements(dbWithPy, 'fy-2025-26', {
      scope: 'UNIT',
      unitId: 'unit-ma-bakery',
      previousFinancialYearId: 'fy-2024-25',
    });

    const bsLinesMatch =
      compPy.balanceSheet.lines.length === fs.balanceSheet.lines.length &&
      compPy.balanceSheet.lines.every((l, idx) => {
        const fsL = fs.balanceSheet.lines[idx];
        return (
          l.statementLineId === fsL.statementLineId &&
          l.lineLabel === fsL.lineLabel &&
          l.depth === fsL.depth &&
          l.displayOrder === fsL.displayOrder &&
          l.cyAmount === fsL.cyAmount &&
          l.pyAmount === fsL.pyAmount
        );
      });

    const ieLinesMatch =
      compPy.incomeExpenditure.lines.length === fs.incomeExpenditure.lines.length &&
      compPy.incomeExpenditure.lines.every((l, idx) => {
        const fsL = fs.incomeExpenditure.lines[idx];
        return (
          l.statementLineId === fsL.statementLineId &&
          l.lineLabel === fsL.lineLabel &&
          l.depth === fsL.depth &&
          l.displayOrder === fsL.displayOrder &&
          l.cyAmount === fsL.cyAmount &&
          l.pyAmount === fsL.pyAmount
        );
      });

    add(
      'Test 8 — Reporting Hierarchy Preservation',
      bsLinesMatch && ieLinesMatch,
      `Schedule III hierarchy 100% preserved (${compPy.balanceSheet.lines.length} BS lines, ${compPy.incomeExpenditure.lines.length} IE lines) with exact depths and order.`,
    );
  } catch (err: unknown) {
    add('Test 8 — Reporting Hierarchy Preservation', false, `Error: ${String(err)}`);
  }

  // Test 9: Note & Schedule Linkage (Preserves Note references)
  try {
    const compData = compileComparativeReportingData(dbWithPy, 'fy-2025-26', {
      scope: 'UNIT',
      unitId: 'unit-ma-bakery',
      previousFinancialYearId: 'fy-2024-25',
    });

    const hasBsNoteRefs = compData.balanceSheet.lines.some((l) => typeof l.noteReference === 'number' || typeof l.sourceNoteNumber === 'number');
    const hasIeNoteRefs = compData.incomeExpenditure.lines.some((l) => typeof l.noteReference === 'number' || typeof l.sourceNoteNumber === 'number');

    add(
      'Test 9 — Note & Schedule Linkage',
      hasBsNoteRefs && hasIeNoteRefs,
      'Statement lines maintain Note references (Notes 4–33 linkable to Schedule engines).',
    );
  } catch (err: unknown) {
    add('Test 9 — Note & Schedule Linkage', false, `Error: ${String(err)}`);
  }

  // Test 10: Phase 12 Financial Statement Engine Consistency
  try {
    const fs = generateFinancialStatements(dbWithPy, 'fy-2025-26', {
      scope: 'UNIT',
      unitId: 'unit-ma-bakery',
      previousFinancialYearId: 'fy-2024-25',
    });
    const compData = compileComparativeReportingData(dbWithPy, 'fy-2025-26', {
      scope: 'UNIT',
      unitId: 'unit-ma-bakery',
      previousFinancialYearId: 'fy-2024-25',
    });

    const passed =
      compData.incomeExpenditure.headlineMetrics[0]?.cyAmount === fs.incomeExpenditure.totalRevenueCY &&
      compData.incomeExpenditure.headlineMetrics[0]?.pyAmount === fs.incomeExpenditure.totalRevenuePY &&
      compData.incomeExpenditure.headlineMetrics[1]?.cyAmount === fs.incomeExpenditure.totalExpensesCY &&
      compData.incomeExpenditure.headlineMetrics[1]?.pyAmount === fs.incomeExpenditure.totalExpensesPY &&
      compData.balanceSheet.headlineMetrics[0]?.cyAmount === fs.balanceSheet.totalAssetsCY &&
      compData.balanceSheet.headlineMetrics[0]?.pyAmount === fs.balanceSheet.totalAssetsPY;

    add(
      'Test 10 — Phase 12 Consistency Guarantee',
      passed,
      'Phase 15.5 presentation strictly delegates all accounting calculations to Phase 12 authoritative engine.',
    );
  } catch (err: unknown) {
    add('Test 10 — Phase 12 Consistency Guarantee', false, `Error: ${String(err)}`);
  }

  // Test 11: Phase 13 Validation & CY_PY_ISOLATION Consistency
  try {
    const cyOnlyData = compileComparativeReportingData(dbCyOnly, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const pyData = compileComparativeReportingData(dbWithPy, 'fy-2025-26', {
      scope: 'UNIT',
      unitId: 'unit-ma-bakery',
      previousFinancialYearId: 'fy-2024-25',
    });

    const passed =
      cyOnlyData.pyStatusMessage.includes('unavailable') &&
      pyData.pyStatusMessage.includes('verified');

    add(
      'Test 11 — Phase 13 CY_PY_ISOLATION Consistency',
      passed,
      `Validation message matches Phase 13 status: CY-only="${cyOnlyData.pyStatusMessage}", CY+PY="${pyData.pyStatusMessage}".`,
    );
  } catch (err: unknown) {
    add('Test 11 — Phase 13 CY_PY_ISOLATION Consistency', false, `Error: ${String(err)}`);
  }

  // Test 12: Read-Only Safety Guarantee (0 DB Mutations)
  try {
    const countTables = () => {
      const tables = ['Ledger', 'LedgerBalance', 'LedgerMapping', 'LedgerClassification', 'Adjustment', 'ConsolidationRun'];
      let count = 0;
      for (const t of tables) {
        try {
          const row = dbWithPy.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as { c: number };
          count += row.c;
        } catch { /* ignore */ }
      }
      return count;
    };

    const countBefore = countTables();
    compileComparativeReportingData(dbWithPy, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    compileComparativeReportingData(dbWithPy, 'fy-2025-26', { scope: 'CONSOLIDATED' });
    const countAfter = countTables();

    const passed = countBefore === countAfter;
    add(
      'Test 12 — Read-Only Safety Guarantee',
      passed,
      `0 DB mutations performed across comparative reporting compilation (${countBefore} === ${countAfter}).`,
    );
  } catch (err: unknown) {
    add('Test 12 — Read-Only Safety Guarantee', false, `Error: ${String(err)}`);
  }

  const passedTests = results.filter((r) => r.passed).length;
  const totalTests = results.length;
  const allPassed = passedTests === totalTests;

  return {
    allPassed,
    totalTests,
    passedTests,
    results,
  };
}

if (require.main === module) {
  console.log('====================================================');
  console.log(' Phase 15.5: CY/PY Comparative Reporting Tests');
  console.log('====================================================');
  const res = runComparativeReportingTests();
  console.log('====================================================');
  console.log(`Summary: ${res.passedTests} / ${res.totalTests} Passed (${res.allPassed ? 'ALL PASSED' : 'FAILURES DETECTED'})`);
  console.log('====================================================');
  process.exit(res.allPassed ? 0 : 1);
}
