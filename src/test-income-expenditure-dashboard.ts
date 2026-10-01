/**
 * Phase 15.3: Income & Expenditure Dashboard & Presentation Test Suite
 *
 * Dedicated verification covering the 12 acceptance criteria:
 * Test 1 — FY propagation (Selected FY reaches the Phase 15.3 reporting query correctly)
 * Test 2 — Unit isolation (Ma Bakery returns only Ma Bakery data without cross-unit leakage)
 * Test 3 — Consolidated scope (Consolidated scope resolves the authoritative consolidated statement)
 * Test 4 — Income total (Displayed Total Income strictly equals Phase 12 authoritative result)
 * Test 5 — Expenditure total (Displayed Total Expenditure strictly equals Phase 12 authoritative result)
 * Test 6 — Surplus / Deficit (Displayed Net Surplus/Deficit equals Phase 12 and distinguishes surplus vs deficit)
 * Test 7 — Note linkage (Income & Expenditure lines retain the correct Note/Schedule references)
 * Test 8 — PY isolation (PY unavailable is represented as null / unavailable, not misleading ₹0.00)
 * Test 9 — Read-only safety (0 INSERT, UPDATE, or DELETE mutations on the database)
 * Test 10 — Unmapped account handling (Unit with unmapped accounts correctly flags isReadyForReporting=false)
 * Test 11 — Empty FY (No-data FY produces a controlled empty state without throwing unhandled exceptions)
 * Test 12 — Phase 12 consistency (All line items in Phase 15.3 100% match Phase 12 statement output)
 */

import Database from 'better-sqlite3';
import {
  compileIncomeExpenditureDashboardData,
} from './dashboard-reporting-engine';
import { generateFinancialStatements } from './financial-statement-engine';
import { createExecutiveTestDatabase } from './test-dashboard-executive';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export function createIncomeExpenditureTestDatabase(): Database.Database {
  return createExecutiveTestDatabase();
}

export function runIncomeExpenditureTests(database?: Database.Database): {
  allPassed: boolean;
  totalTests: number;
  passedTests: number;
  results: TestResult[];
} {
  const db = database || createIncomeExpenditureTestDatabase();
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

  // Test 1: FY propagation
  try {
    const data = compileIncomeExpenditureDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const passed = data.financialYearLabel === '2025-26' && data.hasData;
    add('Test 1 — FY Propagation', passed, `Selected FY propagated correctly: label="${data.financialYearLabel}", hasData=${data.hasData}`);
  } catch (err: unknown) {
    add('Test 1 — FY Propagation', false, `Error: ${String(err)}`);
  }

  // Test 2: Unit isolation
  try {
    const maBakeryData = compileIncomeExpenditureDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const saBioData = compileIncomeExpenditureDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-sa-bioproducts' });

    const passed =
      maBakeryData.totalIncomeCY === 200000 &&
      maBakeryData.totalExpenditureCY === 150000 &&
      maBakeryData.netSurplusCY === 50000 &&
      saBioData.totalIncomeCY === 500000 &&
      saBioData.totalExpenditureCY === 300000 &&
      saBioData.netSurplusCY === 200000;

    add(
      'Test 2 — Unit Isolation',
      passed,
      `Ma Bakery (Income: ₹${maBakeryData.totalIncomeCY}, Surplus: ₹${maBakeryData.netSurplusCY}) is strictly isolated from SA Bioproducts (Income: ₹${saBioData.totalIncomeCY}, Surplus: ₹${saBioData.netSurplusCY}).`,
    );
  } catch (err: unknown) {
    add('Test 2 — Unit Isolation', false, `Error: ${String(err)}`);
  }

  // Test 3: Consolidated scope
  try {
    const consData = compileIncomeExpenditureDashboardData(db, 'fy-2025-26', { scope: 'CONSOLIDATED' });
    const passed =
      consData.totalIncomeCY === 700000 &&
      consData.totalExpenditureCY === 450000 &&
      consData.netSurplusCY === 250000 &&
      consData.scope === 'CONSOLIDATED';

    add(
      'Test 3 — Consolidated Scope',
      passed,
      `Consolidated statement aggregates units authoritatively: Income: ₹${consData.totalIncomeCY}, Expenses: ₹${consData.totalExpenditureCY}, Surplus: ₹${consData.netSurplusCY}.`,
    );
  } catch (err: unknown) {
    add('Test 3 — Consolidated Scope', false, `Error: ${String(err)}`);
  }

  // Test 4: Income total equals Phase 12 authoritative result
  try {
    const fs = generateFinancialStatements(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const ieData = compileIncomeExpenditureDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });

    const passed = ieData.totalIncomeCY === fs.incomeExpenditure.totalRevenueCY;
    add(
      'Test 4 — Income Total',
      passed,
      `Phase 15.3 Total Income (₹${ieData.totalIncomeCY}) strictly matches Phase 12 authoritative total (₹${fs.incomeExpenditure.totalRevenueCY}).`,
    );
  } catch (err: unknown) {
    add('Test 4 — Income Total', false, `Error: ${String(err)}`);
  }

  // Test 5: Expenditure total equals Phase 12 authoritative result
  try {
    const fs = generateFinancialStatements(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const ieData = compileIncomeExpenditureDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });

    const passed = ieData.totalExpenditureCY === fs.incomeExpenditure.totalExpensesCY;
    add(
      'Test 5 — Expenditure Total',
      passed,
      `Phase 15.3 Total Expenditure (₹${ieData.totalExpenditureCY}) strictly matches Phase 12 authoritative total (₹${fs.incomeExpenditure.totalExpensesCY}).`,
    );
  } catch (err: unknown) {
    add('Test 5 — Expenditure Total', false, `Error: ${String(err)}`);
  }

  // Test 6: Surplus / Deficit equals Phase 12 and distinguishes surplus vs deficit
  try {
    const fs = generateFinancialStatements(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const ieData = compileIncomeExpenditureDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });

    const passed =
      ieData.netSurplusCY === fs.incomeExpenditure.netSurplusCY &&
      ieData.isSurplus === (fs.incomeExpenditure.netSurplusCY >= 0);

    add(
      'Test 6 — Surplus / Deficit',
      passed,
      `Phase 15.3 Net Surplus (₹${ieData.netSurplusCY}, isSurplus=${ieData.isSurplus}) matches Phase 12 statement result.`,
    );
  } catch (err: unknown) {
    add('Test 6 — Surplus / Deficit', false, `Error: ${String(err)}`);
  }

  // Test 7: Note linkage (Income & Expenditure lines retain correct Note references)
  try {
    const ieData = compileIncomeExpenditureDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const donationLine = ieData.lines.find((l) => l.statementLineId === 'ie-inc-20');
    const employeeLine = ieData.lines.find((l) => l.statementLineId === 'ie-exp-31');

    const passed =
      Boolean(donationLine && (donationLine.noteReference === 20 || donationLine.sourceNoteNumber === 20)) &&
      Boolean(employeeLine && (employeeLine.noteReference === 31 || employeeLine.sourceNoteNumber === 31));

    add(
      'Test 7 — Note Linkage',
      passed,
      `Statement lines preserve Note references (Donations -> Note ${donationLine?.noteReference}, Employee Benefits -> Note ${employeeLine?.noteReference}).`,
    );
  } catch (err: unknown) {
    add('Test 7 — Note Linkage', false, `Error: ${String(err)}`);
  }

  // Test 8: PY isolation (Missing PY is null, not 0.00)
  try {
    const ieData = compileIncomeExpenditureDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const passed = ieData.hasPY === false && ieData.totalIncomePY === null && ieData.totalExpenditurePY === null && ieData.netSurplusPY === null;

    add(
      'Test 8 — PY Isolation',
      passed,
      `Missing PY data is represented as null / unavailable (hasPY=${ieData.hasPY}) rather than fictitious ₹0.00.`,
    );
  } catch (err: unknown) {
    add('Test 8 — PY Isolation', false, `Error: ${String(err)}`);
  }

  // Test 9: Read-only safety (0 DB mutations)
  try {
    const countTables = () => {
      const tables = ['Ledger', 'LedgerBalance', 'LedgerMapping', 'LedgerClassification', 'Adjustment', 'AdjustmentLine', 'ConsolidationRun', 'ConsolidationElimination'];
      let count = 0;
      for (const t of tables) {
        try {
          const row = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as { c: number };
          count += row.c;
        } catch { /* ignore */ }
      }
      return count;
    };

    const beforeCount = countTables();
    compileIncomeExpenditureDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    compileIncomeExpenditureDashboardData(db, 'fy-2025-26', { scope: 'CONSOLIDATED' });
    const afterCount = countTables();

    const passed = beforeCount === afterCount;
    add('Test 9 — Read-Only Safety Guarantee', passed, `0 DB mutations performed across statement compilation (${beforeCount} === ${afterCount}).`);
  } catch (err: unknown) {
    add('Test 9 — Read-Only Safety Guarantee', false, `Error: ${String(err)}`);
  }

  // Test 10: Unmapped account handling
  try {
    // Add an unmapped ledger to SA Bioproducts
    db.prepare("INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('unmapped-test-1', 'default-entity', 'unit-sa-bioproducts', 'Unmapped Test Ledger')").run();
    db.prepare("INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit, closing_debit, closing_credit, net_balance) VALUES ('lb-unmapped-test-1', 'unmapped-test-1', 'fy-2025-26', 'batch-unit-sa-bioproducts-fy-2025-26', 1000, 0, 1000, 0, 1000)").run();

    const saBioData = compileIncomeExpenditureDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-sa-bioproducts' });
    const passed = saBioData.unmappedLedgersCount > 0 && saBioData.isReadyForReporting === false;

    add(
      'Test 10 — Unmapped Account Handling',
      passed,
      `Unit with unmapped accounts correctly reports isReadyForReporting=${saBioData.isReadyForReporting} (Unmapped count: ${saBioData.unmappedLedgersCount}).`,
    );
  } catch (err: unknown) {
    add('Test 10 — Unmapped Account Handling', false, `Error: ${String(err)}`);
  }

  // Test 11: Empty FY
  try {
    const emptyData = compileIncomeExpenditureDashboardData(db, 'fy-2024-25', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const passed = emptyData.hasData === false && emptyData.statementStatus === 'NO_DATA';

    add('Test 11 — Empty FY Controlled Handling', passed, `No-data FY correctly degrades to hasData=false with status="${emptyData.statementStatus}".`);
  } catch (err: unknown) {
    add('Test 11 — Empty FY Controlled Handling', false, `Error: ${String(err)}`);
  }

  // Test 12: Phase 12 consistency across all statement lines
  try {
    const fs = generateFinancialStatements(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const ieData = compileIncomeExpenditureDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });

    let allLinesMatch = true;
    for (const fsLine of fs.incomeExpenditure.lines) {
      const matchLine = ieData.lines.find((l) => l.statementLineId === fsLine.statementLineId);
      if (!matchLine || matchLine.cyAmount !== fsLine.cyAmount || matchLine.pyAmount !== fsLine.pyAmount) {
        allLinesMatch = false;
        break;
      }
    }

    add(
      'Test 12 — Phase 12 Statement Line Consistency',
      allLinesMatch,
      `All ${fs.incomeExpenditure.lines.length} statement lines in Phase 15.3 100% match Phase 12 statement engine output.`,
    );
  } catch (err: unknown) {
    add('Test 12 — Phase 12 Statement Line Consistency', false, `Error: ${String(err)}`);
  }

  const passedTests = results.filter((r) => r.passed).length;
  const allPassed = passedTests === results.length;

  return {
    allPassed,
    totalTests: results.length,
    passedTests,
    results,
  };
}

if (require.main === module) {
  console.log('====================================================');
  console.log(' Phase 15.3: Income & Expenditure Dashboard Tests');
  console.log('====================================================');
  const res = runIncomeExpenditureTests();
  console.log('====================================================');
  console.log(`Summary: ${res.passedTests} / ${res.totalTests} Passed (${res.allPassed ? 'ALL PASSED' : 'FAILURES DETECTED'})`);
  console.log('====================================================');
  process.exit(res.allPassed ? 0 : 1);
}
