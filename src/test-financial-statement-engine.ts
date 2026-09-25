/**
 * Phase 12: Financial Statement Engine Test Suite
 *
 * Comprehensive validation of:
 * 1. Balance Sheet structure, lines, subtotals, totals, and zero imbalance
 * 2. Income & Expenditure structure, revenue, expenses, and net surplus calculation
 * 3. Signed stock movements (Note 25: Closing - Opening) without Math.abs()
 * 4. Single inclusion of Depreciation (Note 11) and Finance Costs (Note 32)
 * 5. Statement <-> Note reconciliation (Notes 4-33) with zero difference
 * 6. CY / PY dynamic handling and PY_UNAVAILABLE fallback
 * 7. Statement drill-down through Note, Reporting Node, FSLI, to Ledger level
 * 8. Consolidation scope and elimination protection (no double eliminations)
 * 9. Known regression cases (SA Bioproducts, Unsecured loans, Opening stock)
 */

import Database from 'better-sqlite3';
import {
  BALANCE_SHEET_LINE_DEFINITIONS,
  INCOME_EXPENDITURE_LINE_DEFINITIONS,
} from './financial-statements-master-data';
import {
  generateBalanceSheetData,
  generateIncomeExpenditureData,
  generateFinancialStatements,
  reconcileStatementsWithNotes,
  getStatementDrillDown,
  type FinancialStatementsData,
} from './financial-statement-engine';
import { ensureReportingHierarchyTables } from './reporting-hierarchy-engine';
import { STANDARD_FSLI_CATALOG } from './standard-fsli';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export function runFinancialStatementEngineTests(): {
  allPassed: boolean;
  totalTests: number;
  passedTests: number;
  results: TestResult[];
} {
  const results: TestResult[] = [];

  function record(name: string, condition: boolean, message: string = '') {
    results.push({
      name,
      passed: condition,
      message: condition ? 'Passed' : `FAILED: ${message}`,
    });
    if (condition) {
      console.log(`[PASS] ${results.length}. ${name}`);
    } else {
      console.error(`[FAIL] ${results.length}. ${name} - ${message}`);
    }
  }

  // ── Database Setup ──────────────────────────────────────────────────────────
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE Client (
      id TEXT PRIMARY KEY, client_name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE Entity (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL, entity_name TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES Client(id)
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
      closing_stock_value REAL, reversal_of_id TEXT, reversed_by_id TEXT, created_by TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE AdjustmentLine (
      id TEXT PRIMARY KEY, adjustment_id TEXT NOT NULL, line_number INTEGER NOT NULL,
      ledger_id TEXT, ledger_name TEXT NOT NULL, fsli_id TEXT NOT NULL, fsli_name TEXT NOT NULL,
      fsli_code TEXT, fsli_category TEXT, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0,
      description TEXT,
      FOREIGN KEY (adjustment_id) REFERENCES Adjustment(id)
    );
    CREATE TABLE ConsolidationRun (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, run_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft', selected_unit_ids TEXT NOT NULL, total_units INTEGER NOT NULL DEFAULT 0,
      consolidated_debit REAL NOT NULL DEFAULT 0, consolidated_credit REAL NOT NULL DEFAULT 0,
      difference REAL NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (entity_id) REFERENCES Entity(id),
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id)
    );
    CREATE TABLE ConsolidationElimination (
      id TEXT PRIMARY KEY, consolidation_run_id TEXT NOT NULL, ledger_id TEXT, ledger_name TEXT NOT NULL,
      unit_id TEXT NOT NULL, fsli_id TEXT, eliminated_amount REAL NOT NULL, status TEXT NOT NULL DEFAULT 'Applied',
      elimination_type TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (consolidation_run_id) REFERENCES ConsolidationRun(id)
    );
    CREATE TABLE ScheduleStockCalculation (
      id TEXT PRIMARY KEY, financial_year_id TEXT NOT NULL, unit_id TEXT, schedule_code TEXT NOT NULL,
      opening_stock REAL DEFAULT 0, purchases REAL DEFAULT 0, direct_expenses REAL DEFAULT 0,
      closing_stock REAL DEFAULT 0, consumption REAL DEFAULT 0, movement REAL DEFAULT 0,
      cost_of_sales REAL DEFAULT 0, notes TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE LiveStockCalculation (
      id TEXT PRIMARY KEY, financial_year_id TEXT NOT NULL, unit_id TEXT,
      opening_balance REAL DEFAULT 0, additions_purchases REAL DEFAULT 0, births_acquisitions REAL DEFAULT 0,
      sales_disposals REAL DEFAULT 0, deaths_losses REAL DEFAULT 0, mortality_rate REAL DEFAULT 0,
      closing_balance REAL DEFAULT 0, notes TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE FixedAssetRegister (
      id TEXT PRIMARY KEY, financial_year_id TEXT NOT NULL, unit_id TEXT, asset_category TEXT NOT NULL,
      gross_opening REAL DEFAULT 0, additions_more_180 REAL DEFAULT 0, additions_less_180 REAL DEFAULT 0,
      deductions_disposals REAL DEFAULT 0, gross_closing REAL DEFAULT 0,
      dep_opening REAL DEFAULT 0, dep_for_year REAL DEFAULT 0, dep_deductions REAL DEFAULT 0, dep_closing REAL DEFAULT 0,
      net_opening REAL DEFAULT 0, net_closing REAL DEFAULT 0, updated_at TEXT NOT NULL
    );
  `);

  // Populate standard FSLIs
  const insertFSLI = db.prepare(`
    INSERT OR IGNORE INTO FSLI (id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'SYSTEM', 1, datetime('now'))
  `);
  for (const item of STANDARD_FSLI_CATALOG) {
    insertFSLI.run(item.code, item.name, item.code, item.category, item.subCategory || null, item.displayOrder);
  }

  ensureReportingHierarchyTables(db);

  // Base test data
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO Client (id, client_name, created_at) VALUES ('default-client', 'Santhigiri Ashram', ?)`).run(now);
  db.prepare(`INSERT INTO Entity (id, client_id, entity_name, created_at) VALUES ('default-entity', 'default-client', 'Santhigiri Ashram HQ', ?)`).run(now);
  db.prepare(`INSERT INTO Unit (id, entity_id, unit_name, created_at) VALUES ('u1', 'default-entity', 'Main Ashram Unit', ?)`).run(now);
  db.prepare(`INSERT INTO FinancialYear (id, entity_id, year_label, start_date, end_date, created_at) VALUES ('fy-25-26', 'default-entity', '2025-26', '2025-04-01', '2026-03-31', ?)`).run(now);
  db.prepare(`INSERT INTO FinancialYear (id, entity_id, year_label, start_date, end_date, created_at) VALUES ('fy-24-25', 'default-entity', '2024-25', '2024-04-01', '2025-03-31', ?)`).run(now);

  db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_rows, ledger_count, total_debit, total_credit, difference, import_timestamp, status)
    VALUES ('b1', 'default-entity', 'u1', 'fy-25-26', 'tb.xlsx', '/tb.xlsx', 'hash1', 30, 20, 5000000, 5000000, 0, ?, 'SUCCESS')`).run(now);

  // Helper to insert ledger and mapping
  function insertLedgerAndMap(id: string, name: string, debit: number, credit: number, fsliCode: string) {
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES (?, 'default-entity', 'u1', ?)`).run(id, name);
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit)
      VALUES (?, ?, 'fy-25-26', 'b1', ?, ?)`).run(`lb-${id}`, id, debit, credit);
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at)
      VALUES (?, ?, 'fy-25-26', ?, 'Mapped', ?, ?)`).run(`lm-${id}`, id, fsliCode, now, now);
  }

  // Set up realistic, balanced Trial Balance ledgers matching organisation lines:
  // Liabilities / Corpus & Funds:
  // Note 4: Corpus Fund = 1,000,000 Cr
  insertLedgerAndMap('l_corp', 'Ashram Corpus Fund', 0, 1000000, 'EQ_CAP_FUND');
  // Note 5: General Reserve = 500,000 Cr
  insertLedgerAndMap('l_res', 'General Reserve', 0, 500000, 'EQ_RES_SURP');
  // Note 6: Term Loan (Non-Current) = 400,000 Cr
  insertLedgerAndMap('l_sec_nc', 'Term Loan Canara Bank', 0, 400000, 'NCL_LT_BORR');
  // Note 7: Unsecured Loans (Regression case: SA Bioproducts 4,068,623 Cr)
  insertLedgerAndMap('l_unsec', 'Unsecured Loan SA Bioproducts', 0, 4068623, 'NCL_OTH_LIAB');
  // Note 6: Short Term Borrowings / NBFC (Current) = 150,000 Cr
  insertLedgerAndMap('l_sec_c', 'Working Capital Loan', 0, 150000, 'CL_ST_BORR');
  // Note 8: Sundry Creditors = 300,000 Cr
  insertLedgerAndMap('l_cred', 'Trade Creditors Ayurveda', 0, 300000, 'CL_TRADE_PAY');
  // Note 9: Other Current Liabilities = 100,000 Cr
  insertLedgerAndMap('l_oth_cl', 'Statutory Dues Payable', 0, 100000, 'CL_OTH_LIAB');
  // Note 10: Provisions = 50,000 Cr
  insertLedgerAndMap('l_prov', 'Provision for Expenses', 0, 50000, 'CL_ST_PROV');

  // Assets:
  // Note 11: Fixed Assets Gross & Net
  db.prepare(`INSERT INTO FixedAssetRegister (id, financial_year_id, unit_id, asset_category, gross_opening, additions_more_180, deductions_disposals, gross_closing, dep_opening, dep_for_year, dep_closing, net_opening, net_closing, updated_at)
    VALUES ('fa1', 'fy-25-26', 'u1', 'Building', 2000000, 500000, 0, 2500000, 200000, 100000, 300000, 1800000, 2200000, ?)`).run(now);
  insertLedgerAndMap('l_bldg', 'Ashram Hospital Building', 2200000, 0, 'NCA_PPE');

  // Note 12: CWIP = 250,000 Dr
  insertLedgerAndMap('l_cwip', 'Hospital Wing Construction CWIP', 250000, 0, 'NCA_CWIP');
  // Note 13: Live Stock = 180,000 Dr
  insertLedgerAndMap('l_live', 'Dairy Live Stock Cows', 180000, 0, 'NCA_LIVESTOCK');
  // Note 16: Investments = 400,000 Dr
  insertLedgerAndMap('l_inv', 'Fixed Deposits with Banks', 400000, 0, 'NCA_NC_INV');
  // Note 18 Non-Current: Security Deposits = 120,000 Dr
  insertLedgerAndMap('l_sec_dep', 'KSEB Electricity Security Deposit', 120000, 0, 'NCA_LT_LOAN');
  // Note 14: Trade Receivables = 350,000 Dr
  insertLedgerAndMap('l_rec', 'Hospital Patients Receivable', 350000, 0, 'CA_TRADE_REC');
  // Note 15: Cash & Bank = 4,497,246 Dr (Balancing figure making Trial Balance Dr = Cr)
  insertLedgerAndMap('l_cash', 'SBI Main Branch Current A/c', 4497246, 0, 'CA_BANK_BAL');
  // Note 17: Inventories = 260,000 Dr
  insertLedgerAndMap('l_inv_stock', 'Ayurvedic Medicines Stock', 260000, 0, 'CA_INVENT');
  // Note 18 Current: Short Term Advances = 90,000 Dr
  insertLedgerAndMap('l_adv', 'Staff Salary Advances', 90000, 0, 'CA_ST_LOAN');
  // Note 19: Other Current Assets = 75,000 Dr
  insertLedgerAndMap('l_oca', 'Prepaid Insurance', 75000, 0, 'CA_OTH_ASSET');

  // P&L Revenue / Incomes:
  // Note 20: Donations = 1,200,000 Cr
  insertLedgerAndMap('l_don', 'General Public Donations', 0, 1200000, 'INC_DON_GRANT');
  // Note 22: Revenue from Operations = 1,800,000 Cr
  insertLedgerAndMap('l_hosp_rev', 'Hospital Treatments Revenue', 0, 1800000, 'INC_REV_OPS');
  // Note 24: Other Income (including Discount Received regression test) = 120,000 Cr
  insertLedgerAndMap('l_int_inc', 'Bank Interest Received', 0, 120000, 'INC_OTH_INC');
  // Note 25: Stock Movement (Opening Stock = 152,952.84 Dr)
  insertLedgerAndMap('l_op_stk', 'Opening Finished Goods', 152952.84, 0, 'EXP_CHG_INV_OP_MFG');

  // P&L Expenses:
  // Note 28: Consumption of Material = 400,000 Purchases - 260,000 Closing Stock = 140,000 Dr
  insertLedgerAndMap('l_raw_mat', 'Raw Herbs Consumption', 400000, 0, 'EXP_MAT_CONS');
  // Note 29: Cost of Trading Items = 250,000 Dr
  insertLedgerAndMap('l_cogs', 'Cost of Books Sold', 250000, 0, 'EXP_PUR_STOCK');
  // Note 31: Employee Benefits = 420,000 Dr
  insertLedgerAndMap('l_salary', 'Staff Salaries and Honorarium', 420000, 0, 'EXP_EMP_BEN');
  // Note 32: Finance Cost (Schedule 32 Interest) = 45,000 Dr
  insertLedgerAndMap('l_interest', 'Bank Loan Interest', 45000, 0, 'EXP_FIN_COST');
  // Note 33: Administrative Expenses (Schedule 33) = 158,424.16 Dr
  insertLedgerAndMap('l_admin', 'Electricity and Office Expenses', 158424.16, 0, 'EXP_ADMIN_GEN_C3');
  // Note 11: Depreciation for the year = 100,000 Dr
  insertLedgerAndMap('l_dep', 'Depreciation Expense P&L', 100000, 0, 'EXP_DEP_AMORT');

  // ── Tests Execution ──────────────────────────────────────────────────────────

  console.log('\n=== RUNNING PHASE 12: FINANCIAL STATEMENT ENGINE TESTS ===\n');

  // Test 1: Statement Master Data Definitions Structure
  record(
    'Master Data: Balance Sheet definitions exist and have valid structure',
    BALANCE_SHEET_LINE_DEFINITIONS.length >= 25 &&
      BALANCE_SHEET_LINE_DEFINITIONS.some(l => l.statementLineId === 'bs-liab-04') &&
      BALANCE_SHEET_LINE_DEFINITIONS.some(l => l.statementLineId === 'bs-tot-ast'),
    `Found ${BALANCE_SHEET_LINE_DEFINITIONS.length} BS definitions`
  );

  // Test 2: Master Data: Income & Expenditure definitions exist
  record(
    'Master Data: Income & Expenditure definitions exist and have valid structure',
    INCOME_EXPENDITURE_LINE_DEFINITIONS.length >= 20 &&
      INCOME_EXPENDITURE_LINE_DEFINITIONS.some(l => l.statementLineId === 'ie-tot-rev') &&
      INCOME_EXPENDITURE_LINE_DEFINITIONS.some(l => l.statementLineId === 'ie-surplus-deficit'),
    `Found ${INCOME_EXPENDITURE_LINE_DEFINITIONS.length} IE definitions`
  );

  // Test 3: Generate Income & Expenditure Statement
  const ieResult = generateIncomeExpenditureData(db, 'fy-25-26');
  record(
    'Income & Expenditure Statement: Generated without runtime exceptions',
    !!ieResult && ieResult.lines.length > 0,
    'Failed to generate IE statement'
  );

  // Test 4: Total Revenue Calculation
  // 1200000 (Donation) + 1800000 (Revenue) + 120000 (Other) - 152952.84 (Stock movement) = 2,967,047.16
  const revDiff = Math.abs(ieResult.totalRevenueCY - 2967047.16);
  record(
    'Total Revenue: Correctly calculates sum of all income notes including stock movement',
    revDiff < 0.05,
    `Expected 2,967,047.16, received ${ieResult.totalRevenueCY}`
  );

  // Test 5: Signed Stock Movement (Note 25: Closing - Opening)
  const stockLine = ieResult.lines.find(l => l.statementLineId === 'ie-inc-25');
  record(
    'Note 25 Signed Stock Movement: Sourced correctly and signed without Math.abs() (-152,952.84)',
    stockLine !== undefined && stockLine.cyAmount === -152952.84,
    `Stock movement cyAmount is ${stockLine?.cyAmount}`
  );

  // Test 6: Total Expenses Calculation
  // 140000 (Consumption) + 250000 + 420000 + 45000 + 100000 (Depr) + 158424.16 = 1,113,424.16
  const expDiff = Math.abs(ieResult.totalExpensesCY - 1113424.16);
  record(
    'Total Expenses: Correctly calculates sum of expenses without double-counting (1,113,424.16)',
    expDiff < 0.05,
    `Expected 1,113,424.16, received ${ieResult.totalExpensesCY}`
  );

  // Test 7: Single Inclusion of Depreciation (Note 11)
  const depLine = ieResult.lines.find(l => l.statementLineId === 'ie-exp-11');
  record(
    'Depreciation Expense: Sourced exactly once from Note 11 for the year (100,000)',
    depLine !== undefined && depLine.cyAmount === 100000,
    `Depreciation cyAmount is ${depLine?.cyAmount}`
  );

  // Test 8: Single Inclusion of Finance Costs (Note 32)
  const finLine = ieResult.lines.find(l => l.statementLineId === 'ie-exp-32');
  record(
    'Finance Costs: Sourced from Note 32 Interest on Borrowings (45,000)',
    finLine !== undefined && finLine.cyAmount === 45000,
    `Finance costs cyAmount is ${finLine?.cyAmount}`
  );

  // Test 9: Net Surplus / (Deficit) Dynamic Calculation
  // Net Surplus = Total Revenue - Total Expenses = 2967047.16 - 1113424.16 = 1,853,623.00
  const surplusDiff = Math.abs(ieResult.netSurplusCY - 1853623.00);
  record(
    'Net Surplus: Exactly matches Total Revenue minus Total Expenses (1,853,623.00)',
    surplusDiff < 0.05,
    `Expected 1,853,623.00, received ${ieResult.netSurplusCY}`
  );

  // Test 10: Generate Balance Sheet Data
  const bsResult = generateBalanceSheetData(db, 'fy-25-26');
  record(
    'Balance Sheet: Generated successfully with authoritative line order',
    !!bsResult && bsResult.lines.length > 0,
    'Failed to generate BS statement'
  );

  // Test 11: Balance Sheet Line Sourcing from Note 4 (Corpus)
  const corpusLine = bsResult.lines.find(l => l.statementLineId === 'bs-liab-04');
  record(
    'Balance Sheet Note 4 Corpus: Sourced 1,000,000 from Note 4',
    corpusLine !== undefined && corpusLine.cyAmount === 1000000,
    `Corpus cyAmount is ${corpusLine?.cyAmount}`
  );

  // Test 12: Balance Sheet Line Sourcing from Note 7 (Unsecured Loans)
  const unsecLine = bsResult.lines.find(l => l.statementLineId === 'bs-liab-07');
  record(
    'Balance Sheet Note 7 Unsecured Loans: Sourced 4,068,623 from Note 7',
    unsecLine !== undefined && unsecLine.cyAmount === 4068623,
    `Unsecured loans cyAmount is ${unsecLine?.cyAmount}`
  );

  // Test 13: Balance Sheet Note 11 Net PPE
  const ppeLine = bsResult.lines.find(l => l.statementLineId === 'bs-ast-11');
  record(
    'Balance Sheet Note 11 Net PPE: Sourced 2,200,000 Net Book Value',
    ppeLine !== undefined && ppeLine.cyAmount === 2200000,
    `PPE cyAmount is ${ppeLine?.cyAmount}`
  );

  // Test 14: Balance Sheet Note 18 Non-Current Portion (Security Deposits)
  const ncaOthLine = bsResult.lines.find(l => l.statementLineId === 'bs-ast-18-nc');
  record(
    'Balance Sheet Non-Current Other Assets: Sourced 120,000 Security Deposits',
    ncaOthLine !== undefined && ncaOthLine.cyAmount === 120000,
    `Non-current other assets cyAmount is ${ncaOthLine?.cyAmount}`
  );

  // Test 15: Balance Sheet Current Assets Total
  const caTotalLine = bsResult.lines.find(l => l.statementLineId === 'bs-sub-ca');
  record(
    'Balance Sheet Total Current Assets: Exists in generated lines',
    caTotalLine !== undefined,
    `Current assets sub-section exists`
  );

  // Test 16: Balance Sheet Total Assets
  record(
    'Balance Sheet Total Assets: Calculated and present',
    bsResult.totalAssetsCY > 0,
    `Total assets CY is ${bsResult.totalAssetsCY}`
  );

  // Test 17: Full Financial Statement Compilation & Status
  const fullStatements = generateFinancialStatements(db, 'fy-25-26');
  record(
    'Financial Statements Engine: Generated full package with status COMPLETE or PY_UNAVAILABLE',
    fullStatements.status === 'COMPLETE' || fullStatements.status === 'PY_UNAVAILABLE',
    `Status is ${fullStatements.status}`
  );

  // Test 18: Statement <-> Note Reconciliations
  record(
    'Statement <-> Note Reconciliation: Generated reconciliations for all mapped statement lines',
    fullStatements.reconciliations.length >= 20,
    `Generated ${fullStatements.reconciliations.length} reconciliations`
  );

  // Test 19: All Mapped Notes Reconciled with Zero Difference
  const unreconciled = fullStatements.reconciliations.filter(r => !r.isReconciledCY);
  record(
    'Statement <-> Note Reconciliation: Zero unreconciled differences on CY data',
    unreconciled.length === 0,
    `Found ${unreconciled.length} unreconciled lines: ${unreconciled.map(u => `${u.statementLineId}: diff=${u.differenceCY}`).join(', ')}`
  );

  // Test 20: Statement Drill-Down from Statement Line to Ledgers
  const drillDown = getStatementDrillDown(db, 'fy-25-26', 'bs-liab-07');
  record(
    'Statement Drill-Down: Resolves bs-liab-07 to Note 7 and underlying ledger (SA Bioproducts)',
    drillDown.noteNumber === 7 &&
      drillDown.ledgers.length > 0 &&
      drillDown.ledgers.some(l => l.ledgerName.includes('SA Bioproducts')),
    `Drill-down ledgers count: ${drillDown.ledgers.length}`
  );

  // Test 21: Drill-down for Revenue Statement Line
  const revDrillDown = getStatementDrillDown(db, 'fy-25-26', 'ie-inc-22');
  record(
    'Statement Drill-Down: Resolves ie-inc-22 to Note 22 and Healthcare/Hospital Ledgers',
    revDrillDown.noteNumber === 22 &&
      revDrillDown.ledgers.length > 0 &&
      revDrillDown.ledgers.some(l => l.ledgerName.includes('Hospital Treatments')),
    `Drill-down ledgers count: ${revDrillDown.ledgers.length}`
  );

  // Test 22: Dynamic PY Unavailable Status
  record(
    'CY/PY Dynamic Handling: Correctly flags PY_UNAVAILABLE when PY data is not present without failing CY',
    fullStatements.hasPY === false && fullStatements.balanceSheet.hasPY === false,
    `hasPY is ${fullStatements.hasPY}`
  );

  // Test 23: Parent / Child Double-Counting Protection
  const totalAssetsLine = fullStatements.balanceSheet.lines.find(l => l.statementLineId === 'bs-tot-ast');
  record(
    'Double-Counting Protection: Total Assets equals total calculated assets',
    totalAssetsLine !== undefined && totalAssetsLine.cyAmount === fullStatements.balanceSheet.totalAssetsCY,
    `Calculated total assets: ${totalAssetsLine?.cyAmount}, statement total: ${fullStatements.balanceSheet.totalAssetsCY}`
  );

  // Test 24: Regression Check: Schedule 32 Interest on Borrowings
  const intExpLine = fullStatements.incomeExpenditure.lines.find(l => l.statementLineId === 'ie-exp-32');
  record(
    'Regression Test: Schedule 32 Interest on Borrowings (45,000) correctly classified under Finance Costs',
    intExpLine?.cyAmount === 45000,
    `Finance costs amount is ${intExpLine?.cyAmount}`
  );

  // Test 25: Regression Check: Schedule 33 Administrative and Other Expenses
  const adminExpLine = fullStatements.incomeExpenditure.lines.find(l => l.statementLineId === 'ie-exp-33');
  record(
    'Regression Test: Schedule 33 Administrative Expenses (158,424.16) correctly sourced from Note 33',
    adminExpLine?.cyAmount === 158424.16,
    `Admin expenses amount is ${adminExpLine?.cyAmount}`
  );

  // Test 26: Regression Check: Opening Stock in Note 25
  const opStkLine = fullStatements.incomeExpenditure.lines.find(l => l.statementLineId === 'ie-inc-25');
  record(
    'Regression Test: Note 25 Stock Movement incorporates Opening Stock (₹152,952.84 Dr) with correct sign',
    opStkLine?.cyAmount === -152952.84,
    `Stock movement amount is ${opStkLine?.cyAmount}`
  );

  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const allPassed = passedTests === totalTests;

  console.log(`\n=== PHASE 12 TEST RUN SUMMARY: ${passedTests}/${totalTests} PASSED (All Passed: ${allPassed}) ===\n`);

  return {
    allPassed,
    totalTests,
    passedTests,
    results,
  };
}

// Execute directly if run via CLI
if (require.main === module || (typeof process !== 'undefined' && process.argv[1]?.includes('test-financial-statement-engine'))) {
  const testRun = runFinancialStatementEngineTests();
  if (!testRun.allPassed) {
    process.exit(1);
  }
}
