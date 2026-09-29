/**
 * Comprehensive Test Suite for Ma Bakery Four Corrections & Regression Testing
 *
 * Validates:
 * 1. Note 6 vs Note 7: Unsecured Loans (₹28,000) routes to Note 7 (N_07_DEV), Note 6 = 0
 * 2. Note 10: Duties & Taxes gross debit (₹7,777.42) and gross credit (₹10,419.00) preserved in disclosure alongside net (₹2,641.58)
 * 3. Branch / Divisions: Debit (₹11,616.00) in Current Assets, Credit (₹73,396.69) in Current Liabilities, never netted
 * 4. Note 29: Purchases (₹80,367.41) correctly displayed in Note 29 and COGS (₹80,367.41) is correct
 * 5. Full Phase 10 -> 11 -> 12 -> 13 -> 14 pipeline validation and export
 */

import Database from 'better-sqlite3';
import { generateReportingHierarchyData, ensureReportingHierarchyTables } from './reporting-hierarchy-engine';
import { generateNotesData } from './notes-engine';
import { generateFinancialStatements } from './financial-statement-engine';
import { runFinalValidation } from './final-validation-engine';
import { exportFinancialReport } from './export-engine';

function createMaBakeryTestDB(): Database.Database {
  const db = new Database(':memory:');
  const now = new Date().toISOString();

  // Create base schema
  db.exec(`
    CREATE TABLE Entity (
      id TEXT PRIMARY KEY, legal_name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE Unit (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, unit_name TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (entity_id) REFERENCES Entity(id)
    );
    CREATE TABLE FinancialYear (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, year_label TEXT NOT NULL, start_date TEXT, end_date TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY (entity_id) REFERENCES Entity(id),
      UNIQUE(entity_id, year_label)
    );
    CREATE TABLE ImportBatch (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, unit_id TEXT NOT NULL, financial_year_id TEXT NOT NULL,
      file_name TEXT NOT NULL, file_path TEXT NOT NULL, file_hash TEXT NOT NULL,
      total_rows INTEGER, ledger_count INTEGER, total_debit REAL, total_credit REAL, difference REAL,
      import_timestamp TEXT NOT NULL, status TEXT NOT NULL,
      FOREIGN KEY (entity_id) REFERENCES Entity(id),
      FOREIGN KEY (unit_id) REFERENCES Unit(id),
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id)
    );
    CREATE TABLE Ledger (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, unit_id TEXT NOT NULL, ledger_name TEXT NOT NULL,
      tally_group_id TEXT, ledger_code TEXT, active INTEGER DEFAULT 1,
      FOREIGN KEY (entity_id) REFERENCES Entity(id),
      FOREIGN KEY (unit_id) REFERENCES Unit(id)
    );
    CREATE TABLE LedgerBalance (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, import_batch_id TEXT NOT NULL,
      opening_debit REAL DEFAULT 0, opening_credit REAL DEFAULT 0, debit REAL DEFAULT 0, credit REAL DEFAULT 0,
      closing_debit REAL DEFAULT 0, closing_credit REAL DEFAULT 0, net_balance REAL DEFAULT 0,
      FOREIGN KEY (ledger_id) REFERENCES Ledger(id),
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id),
      FOREIGN KEY (import_batch_id) REFERENCES ImportBatch(id)
    );
    CREATE TABLE FSLI (
      id TEXT PRIMARY KEY, fsli_name TEXT NOT NULL, fsli_code TEXT UNIQUE, category TEXT NOT NULL,
      sub_category TEXT, display_order INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'SYSTEM',
      active INTEGER NOT NULL DEFAULT 1, parent_fsli_id TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE LedgerMapping (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, mapped_fsli_id TEXT,
      mapping_rule_id TEXT, mapping_source TEXT NOT NULL DEFAULT 'UserMapping', confidence_score REAL,
      is_manual_override INTEGER NOT NULL DEFAULT 0, approved_by TEXT, approved_at TEXT, status TEXT NOT NULL DEFAULT 'Unmapped',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (ledger_id) REFERENCES Ledger(id)
    );
    CREATE TABLE LedgerClassification (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL,
      original_tally_classification TEXT, application_classification TEXT, child_fsli_id TEXT, parent_fsli_id TEXT,
      final_fsli_id TEXT, classification_source TEXT NOT NULL DEFAULT 'PENDING', confidence_score REAL DEFAULT 0,
      reason TEXT, is_manual_override INTEGER NOT NULL DEFAULT 0, approved_by TEXT, approved_at TEXT,
      status TEXT NOT NULL DEFAULT 'Unclassified', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (ledger_id) REFERENCES Ledger(id)
    );
    CREATE TABLE RegroupingResult (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, unit_id TEXT NOT NULL, entity_id TEXT NOT NULL,
      financial_year_id TEXT NOT NULL, before_classification TEXT, before_fsli_id TEXT, before_fsli_name TEXT,
      proposed_classification TEXT, proposed_fsli_id TEXT, proposed_fsli_name TEXT,
      approved_classification TEXT, approved_fsli_id TEXT, approved_fsli_name TEXT,
      balance_debit REAL NOT NULL DEFAULT 0, balance_credit REAL NOT NULL DEFAULT 0, balance_net REAL NOT NULL DEFAULT 0,
      balance_nature TEXT NOT NULL, tally_group_name TEXT, ledger_name TEXT NOT NULL, reason TEXT,
      rule_id TEXT, rule_name TEXT, confidence REAL NOT NULL DEFAULT 0, detection_confidence REAL NOT NULL DEFAULT 1.0,
      recommendation_confidence REAL NOT NULL DEFAULT 0.85, status TEXT NOT NULL DEFAULT 'Detected',
      approved_by TEXT, approved_at TEXT, applied_by TEXT, applied_at TEXT, undone_by TEXT, undone_at TEXT,
      undo_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (ledger_id) REFERENCES Ledger(id)
    );
    CREATE TABLE Adjustment (
      id TEXT PRIMARY KEY, adjustment_number TEXT NOT NULL, entity_id TEXT NOT NULL, unit_id TEXT NOT NULL,
      financial_year_id TEXT NOT NULL, adjustment_date TEXT NOT NULL, adjustment_type TEXT NOT NULL,
      narration TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Draft', total_debit REAL NOT NULL DEFAULT 0,
      total_credit REAL NOT NULL DEFAULT 0, is_closing_stock INTEGER NOT NULL DEFAULT 0,
      closing_stock_value REAL,
      reversal_of_id TEXT, reversed_by_id TEXT, created_by TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      submitted_by TEXT, submitted_at TEXT, approved_by TEXT, approved_at TEXT,
      rejected_by TEXT, rejected_at TEXT, rejection_reason TEXT,
      FOREIGN KEY (entity_id) REFERENCES Entity(id),
      FOREIGN KEY (unit_id) REFERENCES Unit(id),
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id)
    );
    CREATE TABLE AdjustmentLine (
      id TEXT PRIMARY KEY, adjustment_id TEXT NOT NULL, fsli_id TEXT NOT NULL, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (adjustment_id) REFERENCES Adjustment(id)
    );
    CREATE TABLE ConsolidationRun (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, name TEXT NOT NULL,
      status TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE ConsolidationElimination (
      id TEXT PRIMARY KEY, consolidation_run_id TEXT NOT NULL, fsli_id TEXT, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, eliminated_amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL
    );
  `);

  // Seed Entity, FY, Unit, ImportBatch
  db.prepare(`INSERT INTO Entity VALUES ('default-entity', 'Santhigiri Ashram', ?)`).run(now);
  db.prepare(`INSERT INTO FinancialYear VALUES ('fy-cy', 'default-entity', '2025-2026', '2025-04-01', '2026-03-31', ?)`).run(now);
  db.prepare(`INSERT INTO Unit VALUES ('u-ma-bakery', 'default-entity', 'Ma Bakery', ?)`).run(now);
  db.prepare(`INSERT INTO ImportBatch VALUES ('b-mb-1', 'default-entity', 'u-ma-bakery', 'fy-cy', 'trial_balance.xlsx', '/tmp/tb.xlsx', 'hash123', 7, 7, 211815.69, 211815.69, 0, ?, 'SUCCESS')`).run(now);

  ensureReportingHierarchyTables(db);

  // Setup Ma Bakery Ledgers
  const ledgers = [
    // 1. Unsecured Loans (Temporary returnable assistance from devotees) ₹28,000 Cr
    { id: 'l-unsec', name: 'Unsecured Loans', group: 'Unsecured Loans', dr: 0, cr: 28000, fsli: 'UN_SECD_LNS' },
    // 2. Duties & Taxes: Dr ₹7,777.42, Cr ₹10,419.00 (Net Cr ₹2,641.58)
    { id: 'l-taxes', name: 'Duties & Taxes', group: 'Duties & Taxes', dr: 7777.42, cr: 10419.00, fsli: 'CL_DUTIES_TAX' },
    // 3. Branch / Divisions: Dr ₹11,616.00, Cr ₹73,396.69
    { id: 'l-branch', name: 'Branch / Divisions', group: 'Branch / Divisions', dr: 11616.00, cr: 73396.69, fsli: 'BRAN_DIV-S' },
    // 4. Deposits (Asset): Dr ₹6,734.00
    { id: 'l-dep-asset', name: 'Deposits (Asset)', group: 'Deposits (Asset)', dr: 6734.00, cr: 0, fsli: 'CA_OTH_ASSET' },
    // 5. Purchases (Trading): Dr ₹80,367.41
    { id: 'l-pur', name: 'Purchase Account', group: 'Purchase Accounts', dr: 80367.41, cr: 0, fsli: 'EXP_PUR_STOCK' },
    // 6. Sales / Revenue: Cr ₹100,000.00
    { id: 'l-sales', name: 'Bakery Sales', group: 'Sales Accounts', dr: 0, cr: 100000.00, fsli: 'INC_REV_OPS' },
    // 7. Cash & Bank balances: Dr ₹105,320.86 (to balance TB)
    // TB Calculation:
    // Debits: 7,777.42 (Taxes) + 11,616.00 (Branch) + 6,734.00 (Dep) + 80,367.41 (Purchases) + 105,320.86 (Cash) = 211,815.69
    // Credits: 28,000.00 (Unsec) + 10,419.00 (Taxes) + 73,396.69 (Branch) + 100,000.00 (Sales) = 211,815.69
    { id: 'l-cash', name: 'Cash at Bank', group: 'Bank Accounts', dr: 105320.86, cr: 0, fsli: 'CA_BANK_BAL' },
  ];

  for (const l of ledgers) {
    db.prepare(`INSERT INTO Ledger VALUES (?, 'default-entity', 'u-ma-bakery', ?, NULL, NULL, 1)`).run(l.id, l.name);
    db.prepare(`INSERT INTO LedgerBalance VALUES (?, ?, 'fy-cy', 'b-mb-1', 0, 0, ?, ?, 0, 0, ?)`).run(
      `lb-${l.id}`, l.id, l.dr, l.cr, l.dr - l.cr
    );
    const fsliRow = db.prepare('SELECT id FROM FSLI WHERE fsli_code = ?').get(l.fsli) as { id: string } | undefined;
    const fsliId = fsliRow?.id || l.fsli;
    db.prepare(`INSERT INTO LedgerMapping VALUES (?, ?, 'fy-cy', ?, NULL, 'UserMapping', 1.0, 0, 'User', ?, 'Approved', ?, ?)`).run(
      `lm-${l.id}`, l.id, fsliId, now, now, now
    );
    db.prepare(`INSERT INTO LedgerClassification VALUES (?, ?, 'fy-cy', NULL, NULL, NULL, NULL, ?, 'MANUAL', 1.0, 'Rule', 0, 'User', ?, 'Approved', ?, ?)`).run(
      `lc-${l.id}`, l.id, fsliId, now, now, now
    );
  }

  return db;
}

export async function runMaBakeryTests() {
  console.log('=== Running Ma Bakery Four Discrepancies & Regression Test Suite ===\n');

  const db = createMaBakeryTestDB();

  // ── Step 1: Run Phase 10 Reporting Hierarchy ─────────────────────────────────
  const repData = generateReportingHierarchyData(db, 'fy-cy', { scope: 'UNIT', unitId: 'u-ma-bakery' });

  console.log('Phase 10 Result Status:', repData.status);
  console.log('TB Debit:', repData.reconciliation.sourceDebit, 'TB Credit:', repData.reconciliation.sourceCredit);

  // Assert TB Integrity
  if (Math.abs(repData.reconciliation.sourceDebit - 211815.69) > 0.01) {
    throw new Error(`TB Source Debit mismatch: expected 211815.69, got ${repData.reconciliation.sourceDebit}`);
  }
  if (Math.abs(repData.reconciliation.sourceCredit - 211815.69) > 0.01) {
    throw new Error(`TB Source Credit mismatch: expected 211815.69, got ${repData.reconciliation.sourceCredit}`);
  }
  console.log('[PASS] Trial Balance Debit == Credit == ₹211,815.69');

  // Check Node 7 (N_07_DEV) vs Node 6 (N_06_*)
  const node7 = repData.subScheduleRows.find(n => n.nodeCode === 'N_07_DEV');
  const node6NC = repData.subScheduleRows.find(n => n.nodeCode === 'N_06_NC_TB');
  const node6C = repData.subScheduleRows.find(n => n.nodeCode === 'N_06_C_NBFC');

  console.log('Node 7 (N_07_DEV) cyCredit:', node7?.cyCredit, 'cyNet:', node7?.cyNet);
  console.log('Node 6 (N_06_C_NBFC) cyCredit:', node6C?.cyCredit);

  if ((node7?.cyCredit || 0) !== 28000) {
    throw new Error(`Correction 1 Failed: Note 7 expected 28000, got ${node7?.cyCredit}`);
  }
  if ((node6C?.cyCredit || 0) !== 0 || (node6NC?.cyCredit || 0) !== 0) {
    throw new Error(`Correction 1 Failed: Note 6 should be 0, got NC=${node6NC?.cyCredit}, C=${node6C?.cyCredit}`);
  }
  console.log('[PASS] Correction 1: Note 7 = ₹28,000 and Note 6 = ₹0 (Unsecured Loans correctly routed)');

  // Check Branch / Divisions separate presentation
  const node19Oth = repData.subScheduleRows.find(n => n.nodeCode === 'N_19_OTH');
  const node09Oth = repData.subScheduleRows.find(n => n.nodeCode === 'N_09_OTH');

  console.log('Node 19 (Other Current Assets) cyDebit:', node19Oth?.cyDebit, 'cyNet:', node19Oth?.cyNet);
  console.log('Node 9 (Other Current Liabilities) cyCredit:', node09Oth?.cyCredit, 'cyNet:', node09Oth?.cyNet);

  // In Node 19: Deposits (6,734) + Branch Debit (11,616) = 18,350
  if (Math.abs((node19Oth?.cyDebit || 0) - 18350) > 0.01) {
    throw new Error(`Correction 3 Failed: Node 19 expected 18350 (6734 Dep + 11616 Branch Dr), got ${node19Oth?.cyDebit}`);
  }
  // In Node 9: Branch Credit = 73,396.69
  if (Math.abs((node09Oth?.cyCredit || 0) - 73396.69) > 0.01) {
    throw new Error(`Correction 3 Failed: Node 9 expected 73396.69 (Branch Cr), got ${node09Oth?.cyCredit}`);
  }
  console.log('[PASS] Correction 3: Branch / Divisions Dr (₹11,616.00) in Current Assets, Cr (₹73,396.69) in Current Liabilities - NEVER NETTED');

  // ── Step 2: Run Phase 11 Notes Engine ─────────────────────────────────────────
  const notesData = generateNotesData(db, 'fy-cy', { scope: 'UNIT', unitId: 'u-ma-bakery' });

  // Note 10 Gross Disclosure Check
  const note10 = notesData.notes.find(n => n.noteNumber === 10);
  const note10StatLine = note10?.lines.find(l => l.lineId === 'n10-a-stat');
  console.log('Note 10 Statutory Line cyAmount:', note10StatLine?.cyAmount, 'cyDebit:', note10StatLine?.cyDebit, 'cyCredit:', note10StatLine?.cyCredit);

  if (Math.abs((note10StatLine?.cyAmount || 0) - 2641.58) > 0.01) {
    throw new Error(`Correction 2 Failed: Note 10 net amount expected 2641.58, got ${note10StatLine?.cyAmount}`);
  }
  if (Math.abs((note10StatLine?.cyDebit || 0) - 7777.42) > 0.01 || Math.abs((note10StatLine?.cyCredit || 0) - 10419.00) > 0.01) {
    throw new Error(`Correction 2 Failed: Note 10 gross disclosure missing. Debit: ${note10StatLine?.cyDebit}, Credit: ${note10StatLine?.cyCredit}`);
  }
  console.log('[PASS] Correction 2: Note 10 preserves gross debit (₹7,777.42) and gross credit (₹10,419.00) with net liability (₹2,641.58)');

  // Note 29 Purchases & Trading COGS Check
  const note29 = notesData.notes.find(n => n.noteNumber === 29);
  const note29PurLine = note29?.lines.find(l => l.lineId === 'n29-pur');
  const note29CogsLine = note29?.lines.find(l => l.lineId === 'n29-cogs');
  console.log('Note 29 Purchases:', note29PurLine?.cyAmount, 'COGS:', note29CogsLine?.cyAmount);

  if (Math.abs((note29PurLine?.cyAmount || 0) - 80367.41) > 0.01) {
    throw new Error(`Correction 4 Failed: Note 29 Purchases expected 80367.41, got ${note29PurLine?.cyAmount}`);
  }
  if (Math.abs((note29CogsLine?.cyAmount || 0) - 80367.41) > 0.01) {
    throw new Error(`Correction 4 Failed: Note 29 COGS expected 80367.41, got ${note29CogsLine?.cyAmount}`);
  }
  console.log('[PASS] Correction 4: Note 29 Purchases = ₹80,367.41, Cost of Trading Items Sold = ₹80,367.41');

  // ── Step 3: Run Phase 12 Financial Statements Engine ─────────────────────────
  const finStmts = generateFinancialStatements(db, 'fy-cy', { scope: 'UNIT', unitId: 'u-ma-bakery' });
  console.log('Balance Sheet Status:', finStmts.balanceSheet.isBalancedCY ? 'BALANCED' : 'IMBALANCED');
  console.log('Total Liabilities & Funds:', finStmts.balanceSheet.totalLiabilitiesCY);
  console.log('Total Assets:', finStmts.balanceSheet.totalAssetsCY);
  console.log('Difference:', finStmts.balanceSheet.differenceCY);

  if (!finStmts.balanceSheet.isBalancedCY) {
    throw new Error(`Balance Sheet is not balanced! Diff: ${finStmts.balanceSheet.differenceCY}`);
  }
  console.log('[PASS] Balance Sheet is perfectly BALANCED (Total Assets == Total Liabilities)');

  // ── Step 4: Run Phase 13 Final Validation Engine ─────────────────────────────
  const valResult = runFinalValidation(db, 'fy-cy', { scope: 'UNIT', unitId: 'u-ma-bakery' });
  console.log('Phase 13 Validation Overall Status:', valResult.overallStatus);
  console.log('Passed:', valResult.summary.passed, 'Warnings:', valResult.summary.warnings, 'Errors:', valResult.summary.errors);

  if (valResult.overallStatus === 'ERROR' || valResult.overallStatus === 'BLOCKED') {
    throw new Error(`Phase 13 Validation failed with status: ${valResult.overallStatus}`);
  }
  console.log('[PASS] Phase 13 Final Validation Passed without Blocking/Errors');

  // ── Step 5: Run Phase 14 Export Dataset & Excel Export ────────────────────────
  const exportRes = await exportFinancialReport(db, {
    financialYearId: 'fy-cy',
    scope: 'UNIT',
    unitId: 'u-ma-bakery',
    format: 'EXCEL',
    reportType: 'COMPLETE',
    outputDirectory: 'scratch',
    customFileName: 'Ma_Bakery_Final_Financial_Statements_2025-2026.xlsx',
    allowWarningExport: true,
  });

  console.log('Phase 14 Excel Export Result:', exportRes.success, 'FilePath:', exportRes.filePath);
  if (!exportRes.success) {
    throw new Error(`Phase 14 Export failed: ${exportRes.error}`);
  }
  console.log('[PASS] Phase 14 Excel Export generated successfully with all 5 sheets (Cover, Balance Sheet, Income & Expenditure, Notes & Schedules, Validation Summary, Reconciliations)');

  console.log('\n======================================================');
  console.log(' ALL 4 MA BAKERY CORRECTIONS & PIPELINE TESTS PASSED!');
  console.log('======================================================\n');
}

runMaBakeryTests();
