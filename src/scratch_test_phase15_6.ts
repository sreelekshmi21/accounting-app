import Database from 'better-sqlite3';
import { runUnitConsolidatedReportingTests } from './test-unit-consolidated-reporting';
import { runComparativeReportingTests } from './test-comparative-reporting';
import { runBalanceSheetDashboardTests } from './test-balance-sheet-dashboard';
import { runIncomeExpenditureTests } from './test-income-expenditure-dashboard';
import { runExecutiveDashboardTests, createExecutiveTestDatabase } from './test-dashboard-executive';
import { runDashboardFoundationTests } from './dashboard-reporting-engine';

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  RUNNING PHASE 15.6 & PHASE 15 REGRESSION AUTOMATED VERIFICATION');
console.log('═══════════════════════════════════════════════════════════════════════\n');

// 1. Run Phase 15.6 Unit-wise & Consolidated Reporting Tests
console.log('--- Suite 1: Phase 15.6 Unit-wise & Consolidated Reporting Tests ---');
const res156 = runUnitConsolidatedReportingTests();
console.log(`Phase 15.6 Result: ${res156.passedTests}/${res156.totalTests} passed (allPassed: ${res156.allPassed})\n`);

// 2. Run Phase 15.5 Comparative Reporting Tests
console.log('--- Suite 2: Phase 15.5 Comparative Reporting Tests ---');
const res155 = runComparativeReportingTests();
console.log(`Phase 15.5 Result: ${res155.passedTests}/${res155.totalTests} passed (allPassed: ${res155.allPassed})\n`);

// 3. Run Phase 15.4 Balance Sheet Dashboard Tests
console.log('--- Suite 3: Phase 15.4 Balance Sheet Dashboard Tests ---');
const res154 = runBalanceSheetDashboardTests();
console.log(`Phase 15.4 Result: ${res154.passedTests}/${res154.totalTests} passed (allPassed: ${res154.allPassed})\n`);

// 4. Run Phase 15.3 Income & Expenditure Dashboard Tests
console.log('--- Suite 4: Phase 15.3 Income & Expenditure Dashboard Tests ---');
const res153 = runIncomeExpenditureTests();
console.log(`Phase 15.3 Result: ${res153.passedTests}/${res153.totalTests} passed (allPassed: ${res153.allPassed})\n`);

// 5. Run Phase 15.2 Executive Dashboard Tests
console.log('--- Suite 5: Phase 15.2 Executive Dashboard Tests ---');
const res152 = runExecutiveDashboardTests();
console.log(`Phase 15.2 Result: ${res152.passedTests}/${res152.totalTests} passed (allPassed: ${res152.allPassed})\n`);

// 6. Run Phase 15.1 Dashboard Foundation Tests
console.log('--- Suite 6: Phase 15.1 Foundation Tests ---');
const dbFoundation = createExecutiveTestDatabase();
const res151 = runDashboardFoundationTests(dbFoundation);
console.log(`Phase 15.1 Result: ${res151.passedTests}/${res151.totalTests} passed (allPassed: ${res151.allPassed})\n`);

const allSuitesPassed = res156.allPassed && res155.allPassed && res154.allPassed && res153.allPassed && res152.allPassed && res151.allPassed;

console.log('═══════════════════════════════════════════════════════════════════════');
if (allSuitesPassed) {
  console.log('  >>> ALL PHASE 15 SUITES PASSED WITH 0 FAILURES (100% SUCCESS) <<<');
} else {
  console.error('  >>> SOME PHASE 15 TESTS FAILED <<<');
  process.exit(1);
}
console.log('═══════════════════════════════════════════════════════════════════════');
