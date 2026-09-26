import Database from 'better-sqlite3';
import { seedStandardFSLIs } from './database';
import { ensureReportingHierarchyTables, generateReportingHierarchyData } from './reporting-hierarchy-engine';
import {
  createClosingStockAdjustment,
  submitAdjustmentForReview,
  approveAdjustment,
  applyAdjustment,
  reverseAdjustment,
} from './adjustments-engine';
import { generateFinancialStatements } from './financial-statement-engine';

export function runMaBakeryClosingStockTest() {
  console.log('=== RUNNING MA BAKERY CLOSING STOCK TEST ===\n');

  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  // Setup base schema
  db.exec(`
    CREATE TABLE Client (id TEXT PRIMARY KEY, client_name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE Entity (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, entity_name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE Unit (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, unit_name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE FinancialYear (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, year_label TEXT NOT NULL, start_date TEXT, end_date TEXT, created_at TEXT NOT NULL, UNIQUE(entity_id, year_label));
    CREATE TABLE ImportBatch (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, unit_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL, file_hash TEXT NOT NULL, total_debit REAL, total_credit REAL, difference REAL, import_timestamp TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE Ledger (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, unit_id TEXT NOT NULL, ledger_name TEXT NOT NULL, active INTEGER DEFAULT 1);
    CREATE TABLE LedgerBalance (id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, import_batch_id TEXT NOT NULL, debit REAL DEFAULT 0, credit REAL DEFAULT 0);
    CREATE TABLE FSLI (id TEXT PRIMARY KEY, fsli_name TEXT NOT NULL, fsli_code TEXT UNIQUE, category TEXT NOT NULL, sub_category TEXT, display_order INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'SYSTEM', active INTEGER NOT NULL DEFAULT 1, parent_fsli_id TEXT, created_at TEXT NOT NULL);
    CREATE TABLE LedgerMapping (id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, mapped_fsli_id TEXT, status TEXT NOT NULL DEFAULT 'Mapped', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE LedgerClassification (id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, original_tally_classification TEXT, application_classification TEXT, child_fsli_id TEXT, parent_fsli_id TEXT, final_fsli_id TEXT, classification_source TEXT NOT NULL, is_manual_override INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Classified', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE RegroupingResult (id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, rule_id TEXT, proposed_fsli_id TEXT, approved_fsli_id TEXT, status TEXT NOT NULL, confidence_score REAL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE Adjustment (id TEXT PRIMARY KEY, adjustment_number TEXT NOT NULL, entity_id TEXT NOT NULL, unit_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, adjustment_date TEXT NOT NULL, adjustment_type TEXT NOT NULL, narration TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Draft', total_debit REAL NOT NULL DEFAULT 0, total_credit REAL NOT NULL DEFAULT 0, is_closing_stock INTEGER NOT NULL DEFAULT 0, closing_stock_value REAL, reversal_of_id TEXT, reversed_by_id TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_by TEXT, submitted_at TEXT, approved_by TEXT, approved_at TEXT, rejected_by TEXT, rejected_at TEXT, rejection_reason TEXT, applied_by TEXT, applied_at TEXT, reversed_by TEXT, reversed_at TEXT, reversal_reason TEXT);
    CREATE TABLE AdjustmentLine (id TEXT PRIMARY KEY, adjustment_id TEXT NOT NULL, line_number INTEGER NOT NULL, ledger_id TEXT, ledger_name TEXT NOT NULL, fsli_id TEXT NOT NULL, fsli_name TEXT NOT NULL, fsli_code TEXT, fsli_category TEXT, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, description TEXT);
    CREATE TABLE AdjustmentAudit (id TEXT PRIMARY KEY, adjustment_id TEXT NOT NULL, action TEXT NOT NULL, before_status TEXT, after_status TEXT, details TEXT, reason TEXT, performed_by TEXT, performed_at TEXT NOT NULL);
    CREATE TABLE ConsolidationElimination (id TEXT PRIMARY KEY, consolidation_run_id TEXT NOT NULL, fsli_id TEXT, eliminated_amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL);
    CREATE TABLE LedgerReportingOverride (id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, reporting_node_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  `);

  seedStandardFSLIs(db);
  ensureReportingHierarchyTables(db);

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO Client VALUES ('c1', 'Test Client', ?)`).run(now);
  db.prepare(`INSERT INTO Entity VALUES ('default-entity', 'c1', 'Test Entity', ?)`).run(now);
  db.prepare(`INSERT INTO Unit VALUES ('unit-ma-bakery', 'default-entity', 'Ma Bakery', ?)`).run(now);
  db.prepare(`INSERT INTO FinancialYear VALUES ('fy-2025-26', 'default-entity', '2025-26', '2025-04-01', '2026-03-31', ?)`).run(now);

  db.prepare(`INSERT INTO ImportBatch VALUES ('b-ma', 'default-entity', 'unit-ma-bakery', 'fy-2025-26', 'ma_tb.xlsx', '/ma_tb.xlsx', 'hash', 0, 0, 0, ?, 'SUCCESS')`).run(now);

  // 1. Create Closing Stock adjustment for Ma Bakery ₹10,000
  const adj = createClosingStockAdjustment(db, {
    unitId: 'unit-ma-bakery',
    financialYearId: 'fy-2025-26',
    closingStockValue: 10000,
    adjustmentDate: '2026-03-31',
    narration: 'Closing Stock Ma Bakery',
    createdBy: 'Baker',
  });

  console.log('[1] Created Adjustment:', adj.adjustmentNumber, adj.status);
  console.log('    Journal Lines:', adj.lines.map(l => ({ name: l.ledgerName, fsliCode: l.fsliCode, dr: l.debit, cr: l.credit })));

  // 2. Workflow: Submit, Approve, Apply
  submitAdjustmentForReview(db, adj.id, 'Baker');
  approveAdjustment(db, adj.id, 'Manager');
  applyAdjustment(db, adj.id, 'Accountant');

  // 3. Generate Reporting Hierarchy (Phase 10)
  const report = generateReportingHierarchyData(db, 'fy-2025-26', { unitId: 'unit-ma-bakery' });

  const sch25 = report.scheduleRows.find(s => s.scheduleCode === 'SCH_25');
  const sch28 = report.scheduleRows.find(s => s.scheduleCode === 'SCH_28');
  const sch17 = report.scheduleRows.find(s => s.scheduleCode === 'SCH_17');

  console.log('\n[2] Phase 10 Reporting Hierarchy Results:');
  console.log('    Schedule 25 Total (Net Increase/Decrease): ₹' + sch25?.cyTotal);
  console.log('    Schedule 25 Stock Movement Details: Total Closing = ₹' + report.calculatedSchedules.stockMovement.totalClosingStock + ', Total Opening = ₹' + report.calculatedSchedules.stockMovement.totalOpeningStock + ', Net = ₹' + report.calculatedSchedules.stockMovement.netIncreaseDecreaseTotal);
  console.log('    Schedule 28 Total (Material Consumption): ₹' + sch28?.cyTotal);
  console.log('    Schedule 17 Total (Inventories): ₹' + sch17?.cyTotal);
  console.log('    Total Revenue (I&E): ₹' + report.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-inc-tot')?.cyAmount);
  console.log('    Total Expenses (I&E): ₹' + report.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-exp-tot')?.cyAmount);
  console.log('    Net Surplus (I&E): ₹' + report.netSurplusCY);
  console.log('    Balance Sheet Total Assets: ₹' + report.balanceSheet.lines.find(l => l.lineId === 'bs-tot-ast')?.cyAmount);
  console.log('    Balance Sheet Total Liabilities: ₹' + report.balanceSheet.lines.find(l => l.lineId === 'bs-tot-liab')?.cyAmount);
  console.log('    Balance Sheet Difference: ₹' + report.balanceSheetDifference);
  console.log('    Balance Sheet Is Balanced:', report.balanceSheet.isBalanced);

  // Assertions for Ma Bakery ₹10,000 Closing Stock
  if (sch25?.cyTotal !== 10000) throw new Error('FAIL: SCH_25 should be 10000, got ' + sch25?.cyTotal);
  if (sch28?.cyTotal !== 0) throw new Error('FAIL: SCH_28 should be 0, got ' + sch28?.cyTotal);
  if (sch17?.cyTotal !== 10000) throw new Error('FAIL: SCH_17 should be 10000, got ' + sch17?.cyTotal);
  if (report.netSurplusCY !== 10000) throw new Error('FAIL: Net surplus should be 10000, got ' + report.netSurplusCY);
  if (report.balanceSheetDifference !== 0) throw new Error('FAIL: Balance sheet difference should be 0, got ' + report.balanceSheetDifference);

  // 4. Generate Financial Statements Package (Phase 12)
  const fsPackage = generateFinancialStatements(db, 'fy-2025-26', { unitId: 'unit-ma-bakery' });
  console.log('\n[3] Phase 12 Financial Statement Package Results:');
  console.log('    Package Status:', fsPackage.status);
  console.log('    Balance Sheet Total Assets: ₹' + fsPackage.balanceSheet.totalAssetsCY);
  console.log('    Balance Sheet Total Liabilities: ₹' + fsPackage.balanceSheet.totalLiabilitiesCY);
  console.log('    Income & Expenditure Total Revenue: ₹' + fsPackage.incomeExpenditure.totalRevenueCY);
  console.log('    Income & Expenditure Total Expenses: ₹' + fsPackage.incomeExpenditure.totalExpensesCY);
  console.log('    Income & Expenditure Net Surplus: ₹' + fsPackage.incomeExpenditure.netSurplusCY);

  if (fsPackage.incomeExpenditure.totalRevenueCY !== 10000) throw new Error('FAIL: FS Total Revenue should be 10000, got ' + fsPackage.incomeExpenditure.totalRevenueCY);
  if (fsPackage.incomeExpenditure.totalExpensesCY !== 0) throw new Error('FAIL: FS Total Expenses should be 0, got ' + fsPackage.incomeExpenditure.totalExpensesCY);
  if (fsPackage.incomeExpenditure.netSurplusCY !== 10000) throw new Error('FAIL: FS Net Surplus should be 10000, got ' + fsPackage.incomeExpenditure.netSurplusCY);
  if (fsPackage.balanceSheet.totalAssetsCY !== 10000) throw new Error('FAIL: FS Total Assets should be 10000, got ' + fsPackage.balanceSheet.totalAssetsCY);
  if (fsPackage.balanceSheet.totalLiabilitiesCY !== 10000) throw new Error('FAIL: FS Total Liabilities should be 10000, got ' + fsPackage.balanceSheet.totalLiabilitiesCY);

  // 5. Test Reversal Lifecycle
  console.log('\n[4] Testing Phase 8 Reversal Lifecycle:');
  const rev = reverseAdjustment(db, adj.id, 'Correction required', 'Accountant');
  console.log('    Original Status:', rev.original.status, '| Reversal Status:', rev.reversal.status);

  const reportAfterRev = generateReportingHierarchyData(db, 'fy-2025-26', { unitId: 'unit-ma-bakery' });
  const sch25Rev = reportAfterRev.scheduleRows.find(s => s.scheduleCode === 'SCH_25');
  const sch28Rev = reportAfterRev.scheduleRows.find(s => s.scheduleCode === 'SCH_28');
  const sch17Rev = reportAfterRev.scheduleRows.find(s => s.scheduleCode === 'SCH_17');

  console.log('    After Reversal SCH_25 Total: ₹' + sch25Rev?.cyTotal);
  console.log('    After Reversal SCH_28 Total: ₹' + sch28Rev?.cyTotal);
  console.log('    After Reversal SCH_17 Total: ₹' + sch17Rev?.cyTotal);
  console.log('    After Reversal Surplus: ₹' + reportAfterRev.netSurplusCY);
  console.log('    After Reversal Balance Sheet Difference: ₹' + reportAfterRev.balanceSheetDifference);

  if (sch25Rev?.cyTotal !== 0) throw new Error('FAIL: SCH_25 should be 0 after reversal, got ' + sch25Rev?.cyTotal);
  if (sch28Rev?.cyTotal !== 0) throw new Error('FAIL: SCH_28 should be 0 after reversal, got ' + sch28Rev?.cyTotal);
  if (sch17Rev?.cyTotal !== 0) throw new Error('FAIL: SCH_17 should be 0 after reversal, got ' + sch17Rev?.cyTotal);
  if (reportAfterRev.netSurplusCY !== 0) throw new Error('FAIL: Net surplus should be 0 after reversal, got ' + reportAfterRev.netSurplusCY);
  if (reportAfterRev.balanceSheetDifference !== 0) throw new Error('FAIL: Balance sheet difference should be 0 after reversal, got ' + reportAfterRev.balanceSheetDifference);

  console.log('\n✅ ALL MA BAKERY CLOSING STOCK PIPELINE VERIFICATIONS PASSED SUCCESSFULLY!');
}

runMaBakeryClosingStockTest();
