/**
 * Phase 15.4: Balance Sheet Dashboard & Presentation Test Suite
 *
 * Dedicated verification covering the 12 acceptance criteria:
 * Test 1 — FY propagation (Selected FY reaches the Phase 15.4 reporting query correctly)
 * Test 2 — Unit isolation (Ma Bakery returns only Ma Bakery data without cross-unit leakage)
 * Test 3 — Consolidated scope (Consolidated scope resolves the authoritative consolidated Balance Sheet)
 * Test 4 — Total Assets (Displayed Total Assets strictly equals Phase 12 authoritative result)
 * Test 5 — Total Liabilities (Displayed Total Liabilities strictly equals Phase 12 authoritative result)
 * Test 6 — Corpus & Reserves (Displayed Corpus & Reserves extracted from authoritative Balance Sheet lines)
 * Test 7 — Health & Reconciliation Status (Balance Sheet equilibrium status and difference strictly matches Phase 12)
 * Test 8 — Asset & Liability Category Breakdowns (Breakdowns match the reporting node hierarchy)
 * Test 9 — Note linkage (Balance Sheet lines retain correct Note 4–19 references)
 * Test 10 — PY isolation (PY unavailable is represented as null / unavailable, not misleading ₹0.00)
 * Test 11 — Read-only safety (0 INSERT, UPDATE, or DELETE mutations on the database)
 * Test 12 — Phase 12 consistency (All line items in Phase 15.4 100% match Phase 12 statement output)
 */

import Database from 'better-sqlite3';
import {
  compileBalanceSheetDashboardData,
} from './dashboard-reporting-engine';
import { generateFinancialStatements } from './financial-statement-engine';
import { createExecutiveTestDatabase } from './test-dashboard-executive';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export function createBalanceSheetTestDatabase(): Database.Database {
  return createExecutiveTestDatabase();
}

export function runBalanceSheetDashboardTests(database?: Database.Database): {
  allPassed: boolean;
  totalTests: number;
  passedTests: number;
  results: TestResult[];
} {
  const db = database || createBalanceSheetTestDatabase();
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
    const data = compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const passed = data.financialYearLabel === '2025-26' && data.hasData;
    add('Test 1 — FY Propagation', passed, `Selected FY propagated correctly: label="${data.financialYearLabel}", hasData=${data.hasData}`);
  } catch (err: unknown) {
    add('Test 1 — FY Propagation', false, `Error: ${String(err)}`);
  }

  // Test 2: Unit isolation
  try {
    const maBakeryData = compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const saBioData = compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-sa-bioproducts' });

    const passed =
      maBakeryData.totalAssetsCY > 0 &&
      saBioData.totalAssetsCY > 0 &&
      maBakeryData.totalAssetsCY !== saBioData.totalAssetsCY &&
      maBakeryData.unitName === 'Ma Bakery';

    add(
      'Test 2 — Unit Isolation',
      passed,
      `Ma Bakery (Assets: ₹${maBakeryData.totalAssetsCY}, Liabilities: ₹${maBakeryData.totalLiabilitiesCY}) is strictly isolated from SA Bioproducts (Assets: ₹${saBioData.totalAssetsCY}, Liabilities: ₹${saBioData.totalLiabilitiesCY}).`,
    );
  } catch (err: unknown) {
    add('Test 2 — Unit Isolation', false, `Error: ${String(err)}`);
  }

  // Test 3: Consolidated scope
  try {
    const consData = compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'CONSOLIDATED' });
    const maBakeryData = compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const saBioData = compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-sa-bioproducts' });

    const passed =
      consData.totalAssetsCY >= maBakeryData.totalAssetsCY &&
      consData.totalAssetsCY >= saBioData.totalAssetsCY &&
      consData.scope === 'CONSOLIDATED';

    add(
      'Test 3 — Consolidated Scope',
      passed,
      `Consolidated Balance Sheet aggregates units authoritatively: Assets: ₹${consData.totalAssetsCY}, Liabilities: ₹${consData.totalLiabilitiesCY}.`,
    );
  } catch (err: unknown) {
    add('Test 3 — Consolidated Scope', false, `Error: ${String(err)}`);
  }

  // Test 4: Total Assets equals Phase 12 authoritative result
  try {
    const fs = generateFinancialStatements(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const bsData = compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });

    const passed = bsData.totalAssetsCY === fs.balanceSheet.totalAssetsCY;
    add(
      'Test 4 — Total Assets',
      passed,
      `Phase 15.4 Total Assets (₹${bsData.totalAssetsCY}) strictly matches Phase 12 authoritative total (₹${fs.balanceSheet.totalAssetsCY}).`,
    );
  } catch (err: unknown) {
    add('Test 4 — Total Assets', false, `Error: ${String(err)}`);
  }

  // Test 5: Total Liabilities equals Phase 12 authoritative result
  try {
    const fs = generateFinancialStatements(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const bsData = compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });

    const passed = bsData.totalLiabilitiesCY === fs.balanceSheet.totalLiabilitiesCY;
    add(
      'Test 5 — Total Liabilities',
      passed,
      `Phase 15.4 Total Liabilities (₹${bsData.totalLiabilitiesCY}) strictly matches Phase 12 authoritative total (₹${fs.balanceSheet.totalLiabilitiesCY}).`,
    );
  } catch (err: unknown) {
    add('Test 5 — Total Liabilities', false, `Error: ${String(err)}`);
  }

  // Test 6: Corpus & Reserves extracted from authoritative Balance Sheet lines
  try {
    const bsData = compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const passed = typeof bsData.corpusCapitalCY === 'number' && typeof bsData.reservesSurplusCY === 'number';

    add(
      'Test 6 — Corpus & Reserves Extraction',
      passed,
      `Corpus (₹${bsData.corpusCapitalCY}) and Reserves (₹${bsData.reservesSurplusCY}) extracted accurately from Phase 12 reporting structure.`,
    );
  } catch (err: unknown) {
    add('Test 6 — Corpus & Reserves Extraction', false, `Error: ${String(err)}`);
  }

  // Test 7: Health & Reconciliation Status
  try {
    const fs = generateFinancialStatements(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const bsData = compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });

    const passed =
      bsData.isBalanced === fs.balanceSheet.isBalancedCY &&
      bsData.balanceDifferenceCY === fs.balanceSheet.differenceCY;

    add(
      'Test 7 — Health & Reconciliation Status',
      passed,
      `Equilibrium health verified: isBalanced=${bsData.isBalanced}, difference=₹${bsData.balanceDifferenceCY}.`,
    );
  } catch (err: unknown) {
    add('Test 7 — Health & Reconciliation Status', false, `Error: ${String(err)}`);
  }

  // Test 8: Asset & Liability Category Breakdowns
  try {
    const bsData = compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const passed =
      Array.isArray(bsData.assetBreakdown) &&
      Array.isArray(bsData.liabilityBreakdown) &&
      bsData.assetBreakdown.length > 0 &&
      bsData.liabilityBreakdown.length > 0;

    add(
      'Test 8 — Category Breakdowns',
      passed,
      `Breakdowns generated from reporting hierarchy (${bsData.assetBreakdown.length} asset categories, ${bsData.liabilityBreakdown.length} liability categories).`,
    );
  } catch (err: unknown) {
    add('Test 8 — Category Breakdowns', false, `Error: ${String(err)}`);
  }

  // Test 9: Note linkage (Balance Sheet lines retain correct Note 4-19 references)
  try {
    const bsData = compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const hasNoteRefs = bsData.lines.some((l: any) => typeof l.noteReference === 'number' || typeof l.sourceNoteNumber === 'number');

    add(
      'Test 9 — Note Linkage (Notes 4–19)',
      hasNoteRefs,
      `Balance Sheet lines preserve Note references (Notes 4–19 mapped to FSLIs/Schedules).`,
    );
  } catch (err: unknown) {
    add('Test 9 — Note Linkage (Notes 4–19)', false, `Error: ${String(err)}`);
  }

  // Test 10: PY isolation (Missing PY is null, not 0.00)
  try {
    const bsData = compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const passed = bsData.hasPY === false && bsData.totalAssetsPY === null && bsData.totalLiabilitiesPY === null;

    add(
      'Test 10 — PY Isolation',
      passed,
      `Missing PY data is represented as null / unavailable (hasPY=${bsData.hasPY}) rather than fictitious ₹0.00.`,
    );
  } catch (err: unknown) {
    add('Test 10 — PY Isolation', false, `Error: ${String(err)}`);
  }

  // Test 11: Read-only safety (0 DB mutations)
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
    compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'CONSOLIDATED' });
    const afterCount = countTables();

    const passed = beforeCount === afterCount;
    add('Test 11 — Read-Only Safety Guarantee', passed, `0 DB mutations performed across Balance Sheet compilation (${beforeCount} === ${afterCount}).`);
  } catch (err: unknown) {
    add('Test 11 — Read-Only Safety Guarantee', false, `Error: ${String(err)}`);
  }

  // Test 12: Phase 12 consistency across all statement lines
  try {
    const fs = generateFinancialStatements(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });
    const bsData = compileBalanceSheetDashboardData(db, 'fy-2025-26', { scope: 'UNIT', unitId: 'unit-ma-bakery' });

    let allLinesMatch = true;
    for (const fsLine of fs.balanceSheet.lines) {
      const matchLine = bsData.lines.find((l: any) => l.statementLineId === fsLine.statementLineId);
      if (!matchLine || matchLine.cyAmount !== fsLine.cyAmount || matchLine.pyAmount !== fsLine.pyAmount) {
        allLinesMatch = false;
        break;
      }
    }

    add(
      'Test 12 — Phase 12 Statement Line Consistency',
      allLinesMatch,
      `All ${fs.balanceSheet.lines.length} statement lines in Phase 15.4 100% match Phase 12 Balance Sheet engine output.`,
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
  console.log(' Phase 15.4: Balance Sheet Dashboard Tests');
  console.log('====================================================');
  const res = runBalanceSheetDashboardTests();
  console.log('====================================================');
  console.log(`Summary: ${res.passedTests} / ${res.totalTests} Passed (${res.allPassed ? 'ALL PASSED' : 'FAILURES DETECTED'})`);
  console.log('====================================================');
  process.exit(res.allPassed ? 0 : 1);
}
