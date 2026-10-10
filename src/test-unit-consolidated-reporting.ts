/**
 * Phase 15.6: Unit-wise & Consolidated Reporting Test Suite
 *
 * Dedicated verification covering all Phase 15.6 requirements:
 * Test 1 (Test A) — Individual Unit (Ma Bakery): Authoritative Phase 12 statements for isolated unit
 * Test 2 (Test B) — Different Unit Isolation (SA Bioproducts): Zero cross-unit data leakage
 * Test 3 (Test C) — Authoritative Consolidated Reporting: Uses Phase 9 consolidation & Phase 12 output
 * Test 4 (Test D) — Scope Context Switching: Dynamic switching between CONSOLIDATED and UNIT
 * Test 5 (Test E) — Financial Year Context Switching: CY and PY isolation without cross-FY leakage
 * Test 6 (Test F) — Missing PY Degradation: Returns null & 'PY_UNAVAILABLE', never fake zero
 * Test 7 (Test G) — Branch / Division Reconciliation: Status & difference exposed accurately
 * Test 8 (Test H) — Unit Comparison Matrices: Unit-wise I&E and BS rows with consolidated total
 * Test 9 (Test I) — Read-Only Safety Guarantee: 0 DB mutations across all compilation calls
 * Test 10 (Test J) — Architectural Non-Duplication: Strict delegation of math to Phase 9 and 12
 */

import Database from 'better-sqlite3';
import {
  compileUnitConsolidatedReportingData,
  runUnitConsolidatedReportingTests as runEngineTests,
} from './dashboard-reporting-engine';
import { generateFinancialStatements } from './financial-statement-engine';
import { createComparativeWithPyTestDatabase } from './test-comparative-reporting';
import { createExecutiveTestDatabase } from './test-dashboard-executive';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export function createUnitConsolidatedTestDatabase(): Database.Database {
  return createComparativeWithPyTestDatabase();
}

export function runUnitConsolidatedReportingTests(database?: Database.Database): {
  allPassed: boolean;
  totalTests: number;
  passedTests: number;
  results: TestResult[];
} {
  const db = database || createUnitConsolidatedTestDatabase();
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

  // Run the comprehensive test suite
  const suiteResults = runEngineTests(db);
  for (const r of suiteResults.results) {
    add(r.name, r.passed, r.message);
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
