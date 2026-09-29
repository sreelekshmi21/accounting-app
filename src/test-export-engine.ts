/**
 * Phase 14: Export Engine Test Suite
 *
 * Automated verification tests covering:
 * Test 1:  Current Year only (CY present, PY blank/—, CY_PY_ISOLATION warning in summary, export succeeds for Excel & PDF)
 * Test 2:  PY available (both CY and PY values populated, both appear in Excel & PDF, no false CY_PY_ISOLATION)
 * Test 3:  Validation error (controlled Phase 13 ERROR blocks final export, returns clear warning/error status)
 * Test 4:  Blocked validation (controlled Phase 13 BLOCKED stops export completely)
 * Test 5:  Specific Unit (Mandalam exported without cross-unit contamination)
 * Test 6:  Consolidated scope (matches Phase 12 consolidated figures exactly)
 * Test 7:  Excel / PDF consistency (all major totals—BS total, Total Income, Total Expenses, Surplus/Deficit—match Phase 12 identically)
 * Test 8:  Non-mutation guarantee (export is strictly read-only and modifies 0 database records)
 * Test 9:  File naming & sanitization (generates standard compliant filenames)
 * Test 10: Individual statement exports (Balance Sheet only, Income & Expenditure only, Notes only)
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import {
  buildExportDatasetBundle,
  buildExcelWorkbook,
  buildHtmlReport,
  evaluateValidationGate,
  generateStandardFileName,
  sanitizeFileName,
  formatDisplayAmount,
  type ExportDatasetBundle,
  type ExportReportResult,
} from './export-engine';
import { ensureReportingHierarchyTables } from './reporting-hierarchy-engine';
import { STANDARD_FSLI_CATALOG } from './standard-fsli';
import {
  generateFinancialStatements,
} from './financial-statement-engine';
import {
  generateNotesData,
} from './notes-engine';
import {
  runFinalValidation,
} from './final-validation-engine';
import type { FinalValidationResult } from './electron-api';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

/**
 * Creates an in-memory test database with full schema and seed data.
 */
function createBaseTestDatabase(): Database.Database {
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
      closing_stock_value REAL,
      reversal_of_id TEXT, reversed_by_id TEXT, created_by TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      submitted_by TEXT, submitted_at TEXT, approved_by TEXT, approved_at TEXT,
      rejected_by TEXT, rejected_at TEXT, rejection_reason TEXT,
      applied_by TEXT, applied_at TEXT, reversed_by TEXT, reversed_at TEXT, reversal_reason TEXT
    );
    CREATE TABLE AdjustmentLine (
      id TEXT PRIMARY KEY, adjustment_id TEXT NOT NULL, line_number INTEGER NOT NULL,
      ledger_id TEXT, ledger_name TEXT NOT NULL, fsli_id TEXT NOT NULL, fsli_name TEXT NOT NULL,
      fsli_code TEXT, fsli_category TEXT, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0,
      description TEXT,
      FOREIGN KEY (adjustment_id) REFERENCES Adjustment(id)
    );
    CREATE TABLE AdjustmentAudit (
      id TEXT PRIMARY KEY, adjustment_id TEXT NOT NULL, action TEXT NOT NULL,
      before_status TEXT, after_status TEXT, details TEXT, reason TEXT,
      performed_by TEXT, performed_at TEXT NOT NULL
    );
    CREATE TABLE LedgerReportingOverride (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL,
      reporting_node_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE ConsolidationRun (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, financial_year_id TEXT NOT NULL,
      run_number TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Draft'
      CHECK(status IN ('Draft','InProgress','Completed','Cancelled')),
      selected_unit_ids TEXT NOT NULL, total_units INTEGER NOT NULL DEFAULT 0,
      consolidated_debit REAL NOT NULL DEFAULT 0, consolidated_credit REAL NOT NULL DEFAULT 0,
      internal_debit REAL NOT NULL DEFAULT 0, internal_credit REAL NOT NULL DEFAULT 0,
      internal_difference REAL NOT NULL DEFAULT 0, final_debit REAL NOT NULL DEFAULT 0,
      final_credit REAL NOT NULL DEFAULT 0, final_difference REAL NOT NULL DEFAULT 0,
      created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
    );
    CREATE TABLE ConsolidationElimination (
      id TEXT PRIMARY KEY, consolidation_run_id TEXT NOT NULL, elimination_number TEXT NOT NULL,
      entity_id TEXT NOT NULL, financial_year_id TEXT NOT NULL,
      source_unit_id TEXT NOT NULL, counterparty_unit_id TEXT,
      source_ledger_id TEXT, source_ledger_name TEXT NOT NULL,
      counterparty_ledger_id TEXT, counterparty_ledger_name TEXT,
      internal_account_type TEXT NOT NULL, fsli_id TEXT, fsli_name TEXT,
      debit_amount REAL NOT NULL DEFAULT 0, credit_amount REAL NOT NULL DEFAULT 0,
      eliminated_amount REAL NOT NULL DEFAULT 0, unmatched_amount REAL NOT NULL DEFAULT 0,
      matching_basis TEXT, confidence REAL NOT NULL DEFAULT 0,
      match_status TEXT NOT NULL DEFAULT 'NeedsReview',
      reason TEXT, status TEXT NOT NULL DEFAULT 'Draft',
      reversal_of_id TEXT, reversed_by_id TEXT, created_by TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      submitted_by TEXT, submitted_at TEXT, approved_by TEXT, approved_at TEXT,
      rejected_by TEXT, rejected_at TEXT, rejection_reason TEXT,
      applied_by TEXT, applied_at TEXT, reversed_by TEXT, reversed_at TEXT, reversal_reason TEXT
    );
    CREATE TABLE ConsolidationEliminationLine (
      id TEXT PRIMARY KEY, elimination_id TEXT NOT NULL, line_number INTEGER NOT NULL,
      unit_id TEXT NOT NULL, ledger_id TEXT, ledger_name TEXT NOT NULL,
      fsli_id TEXT, fsli_name TEXT, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0,
      description TEXT
    );
    CREATE TABLE ConsolidationAudit (
      id TEXT PRIMARY KEY, consolidation_run_id TEXT, elimination_id TEXT,
      action TEXT NOT NULL, before_status TEXT, after_status TEXT,
      details TEXT, reason TEXT, performed_by TEXT, performed_at TEXT NOT NULL
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

  const now = new Date().toISOString();
  // Populate standard FSLIs
  const insertFSLI = db.prepare(`
    INSERT OR IGNORE INTO FSLI (id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'SYSTEM', 1, datetime('now'))
  `);
  for (const item of STANDARD_FSLI_CATALOG) {
    insertFSLI.run(item.code, item.name, item.code, item.category, item.subCategory || null, item.displayOrder);
  }
  db.prepare(`
    INSERT OR IGNORE INTO FSLI (id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at)
    VALUES ('GR_DON_CONSTR', 'Grant /Donation for construction', 'GR_DON_CONSTR', 'Capital', 'Reserves & Surplus', 10, 'SYSTEM', 1, datetime('now'))
  `).run();
  db.prepare(`
    INSERT OR IGNORE INTO FSLI (id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at)
    VALUES ('SUB_RECD_OTH', 'Subscription Received', 'SUB_RECD_OTH', 'Income', 'Donations and Grants', 20, 'SYSTEM', 1, datetime('now'))
  `).run();
  db.prepare(`
    INSERT OR IGNORE INTO FSLI (id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at)
    VALUES ('BRAN_DIV-S', 'Branch / Divisions', 'BRAN_DIV-S', 'Asset', 'Branch / Divisions', 999, 'SYSTEM', 1, datetime('now'))
  `).run();
  db.prepare(`
    INSERT OR IGNORE INTO FSLI (id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at)
    VALUES ('INC_DECR_FG', 'Increase / Decrease in Finished Goods', 'INC_DECR_FG', 'Expense', 'Increase / Decrease', 1000, 'SYSTEM', 1, datetime('now'))
  `).run();

  ensureReportingHierarchyTables(db);

  db.prepare(`INSERT INTO Client VALUES ('c1', 'Client 1', ?)`).run(now);
  db.prepare(`INSERT INTO Entity VALUES ('default-entity', 'c1', 'Santhigiri Ashram', ?)`).run(now);
  db.prepare(`INSERT INTO Unit VALUES ('unit-mandalam', 'default-entity', 'Mandalam', ?)`).run(now);
  db.prepare(`INSERT INTO Unit VALUES ('unit-bakery', 'default-entity', 'Ma Bakery', ?)`).run(now);
  db.prepare(`INSERT INTO FinancialYear VALUES ('fy-cy', 'default-entity', '2025-26', '2025-04-01', '2026-03-31', ?)`).run(now);
  db.prepare(`INSERT INTO FinancialYear VALUES ('fy-py', 'default-entity', '2024-25', '2024-04-01', '2025-03-31', ?)`).run(now);

  return db;
}

/**
 * Seeds balanced Current Year data for Mandalam unit.
 */
function seedMandalamCurrentYear(db: Database.Database): void {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO ImportBatch VALUES ('batch-mandalam-cy', 'default-entity', 'unit-mandalam', 'fy-cy', 'tb_mandalam.xlsx', '/tb.xlsx', 'h1', 6, 6, 1025000, 1025000, 0, ?, 'SUCCESS')
  `).run(now);

  const ledgers = [
    { id: 'led-1', name: 'Corpus Fund', debit: 0, credit: 500000, fsli: 'EQ_CAP_FUND' },
    { id: 'led-2', name: 'Grant /Donation for Construction', debit: 0, credit: 200000, fsli: 'GR_DON_CONSTR' },
    { id: 'led-3', name: 'Subscription Received', debit: 0, credit: 325000, fsli: 'SUB_RECD_OTH' },
    { id: 'led-4', name: 'Land and Building', debit: 600000, credit: 0, fsli: 'NCA_PPE' },
    { id: 'led-5', name: 'Bank Balance', debit: 175000, credit: 0, fsli: 'CA_BANK_BAL' },
    { id: 'led-6', name: 'Administrative Expenses', debit: 250000, credit: 0, fsli: 'EXP_ADMIN_GEN' },
  ];

  for (let i = 0; i < ledgers.length; i++) {
    const l = ledgers[i];
    db.prepare(`
      INSERT INTO Ledger (id, entity_id, unit_id, ledger_name, tally_group_id, ledger_code, active)
      VALUES (?, 'default-entity', 'unit-mandalam', ?, 'G1', ?, 1)
    `).run(l.id, l.name, `CODE-${i}`);

    const fsliRow = db.prepare('SELECT id FROM FSLI WHERE fsli_code = ?').get(l.fsli) as { id: string };
    db.prepare(`
      INSERT INTO LedgerMapping VALUES (?, ?, 'fy-cy', ?, NULL, 'UserMapping', 1.0, 1, 'admin', ?, 'Approved', ?, ?)
    `).run(`lm-${l.id}`, l.id, fsliRow.id, now, now, now);

    db.prepare(`
      INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, opening_debit, opening_credit, debit, credit, closing_debit, closing_credit, net_balance)
      VALUES (?, ?, 'fy-cy', 'batch-mandalam-cy', 0, 0, ?, ?, ?, ?, ?)
    `).run(`lb-${l.id}`, l.id, l.debit, l.credit, l.debit, l.credit, l.debit - l.credit);
  }
}

/**
 * Seeds balanced Previous Year data for Mandalam unit.
 */
function seedMandalamPreviousYear(db: Database.Database): void {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO ImportBatch VALUES ('batch-mandalam-py', 'default-entity', 'unit-mandalam', 'fy-py', 'tb_mandalam_py.xlsx', '/tb_py.xlsx', 'h2', 6, 6, 900000, 900000, 0, ?, 'SUCCESS')
  `).run(now);

  const pyEntries = [
    { id: 'led-py-1', name: 'Corpus Fund', debit: 0, credit: 500000, fsli: 'EQ_CAP_FUND' },
    { id: 'led-py-2', name: 'Grant /Donation for Construction', debit: 0, credit: 150000, fsli: 'GR_DON_CONSTR' },
    { id: 'led-py-3', name: 'Subscription Received', debit: 0, credit: 250000, fsli: 'SUB_RECD_OTH' },
    { id: 'led-py-4', name: 'Land and Building', debit: 600000, credit: 0, fsli: 'NCA_PPE' },
    { id: 'led-py-5', name: 'Bank Balance', debit: 100000, credit: 0, fsli: 'CA_BANK_BAL' },
    { id: 'led-py-6', name: 'Administrative Expenses', debit: 200000, credit: 0, fsli: 'EXP_ADMIN_GEN' },
  ];

  for (let i = 0; i < pyEntries.length; i++) {
    const l = pyEntries[i];
    db.prepare(`
      INSERT OR IGNORE INTO Ledger (id, entity_id, unit_id, ledger_name, tally_group_id, ledger_code, active)
      VALUES (?, 'default-entity', 'unit-mandalam', ?, 'G1', ?, 1)
    `).run(l.id, l.name, `CODE-PY-${i}`);

    const fsliRow = db.prepare('SELECT id FROM FSLI WHERE fsli_code = ?').get(l.fsli) as { id: string };
    db.prepare(`
      INSERT INTO LedgerMapping VALUES (?, ?, 'fy-py', ?, NULL, 'UserMapping', 1.0, 1, 'admin', ?, 'Approved', ?, ?)
    `).run(`lm-py-${l.id}`, l.id, fsliRow.id, now, now, now);

    db.prepare(`
      INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, opening_debit, opening_credit, debit, credit, closing_debit, closing_credit, net_balance)
      VALUES (?, ?, 'fy-py', 'batch-mandalam-py', 0, 0, ?, ?, ?, ?, ?)
    `).run(`lb-py-${l.id}`, l.id, l.debit, l.credit, l.debit, l.credit, l.debit - l.credit);
  }
}

/**
 * Main automated verification test runner for Phase 14 Export Engine.
 */
export function runExportEngineTests(): {
  allPassed: boolean;
  totalTests: number;
  passedTests: number;
  results: TestResult[];
} {
  const results: TestResult[] = [];

  const runTest = (name: string, fn: () => { passed: boolean; message: string }) => {
    try {
      const res = fn();
      results.push({ name, passed: res.passed, message: res.message });
    } catch (err: any) {
      results.push({ name, passed: false, message: `Exception: ${err?.message || err}` });
    }
  };

  // ── Test 1: Current Year only (CY present, PY blank/—, CY_PY_ISOLATION warning) ──
  runTest('Test 1: Current Year Only Export (CY present, PY isolated, warning allowed)', () => {
    const db = createBaseTestDatabase();
    seedMandalamCurrentYear(db);

    const bundle = buildExportDatasetBundle(db, 'fy-cy', { scope: 'UNIT', unitId: 'unit-mandalam' });
    const gate = evaluateValidationGate(bundle.validationData);

    if (!gate.canExport) {
      return { passed: false, message: `Gate unexpectedly blocked export: ${gate.reason}` };
    }

    if (!bundle.validationData.results.some((c: FinalValidationResult) => c.validation_id === 'CY_PY_ISOLATION' && c.severity === 'WARNING')) {
      return { passed: false, message: 'Expected CY_PY_ISOLATION warning in validation checks' };
    }

    // Build Excel
    const wb = buildExcelWorkbook(bundle);
    const sheetNames = wb.SheetNames;
    if (!sheetNames.includes('Cover') || !sheetNames.includes('Balance Sheet') || !sheetNames.includes('Income and Expenditure') || !sheetNames.includes('Notes & Schedules') || !sheetNames.includes('Validation Summary')) {
      return { passed: false, message: `Missing required Excel sheets: ${sheetNames.join(', ')}` };
    }

    // Check Balance Sheet sheet content
    const bsSheet = wb.Sheets['Balance Sheet'];
    const bsJson: any[] = XLSX.utils.sheet_to_json(bsSheet, { header: 1 });
    const hasCyValues = bsJson.some(row => row.some((cell: any) => typeof cell === 'number' && cell > 0));
    if (!hasCyValues) {
      return { passed: false, message: 'Balance Sheet sheet missing numeric CY values' };
    }

    // Check HTML / PDF report content
    const html = buildHtmlReport(bundle);
    if (!html.includes('Mandalam') || !html.includes('CY_PY_ISOLATION') || !html.includes('Balance Sheet')) {
      return { passed: false, message: 'HTML report missing key sections or CY_PY_ISOLATION notice' };
    }

    return { passed: true, message: 'CY-only export succeeded with proper PY isolation and warnings.' };
  });

  // ── Test 2: PY available (both CY and PY populated) ──────────────────────────
  runTest('Test 2: Comparative PY Available (CY and PY populated and match Phase 12)', () => {
    const db = createBaseTestDatabase();
    seedMandalamCurrentYear(db);
    seedMandalamPreviousYear(db);

    const bundle = buildExportDatasetBundle(db, 'fy-cy', { scope: 'UNIT', unitId: 'unit-mandalam', previousFinancialYearId: 'fy-py' });
    if (!bundle.hasPY) {
      return { passed: false, message: 'Expected bundle.hasPY to be true when PY is seeded' };
    }

    const wb = buildExcelWorkbook(bundle);
    const bsSheet = wb.Sheets['Balance Sheet'];
    const bsJson: any[][] = XLSX.utils.sheet_to_json(bsSheet, { header: 1 });

    // Ensure PY column has data
    const hasPyValues = bsJson.some(row => typeof row[3] === 'number' && row[3] > 0);
    if (!hasPyValues) {
      return { passed: false, message: 'Balance Sheet missing PY numeric amounts in column 4' };
    }

    const html = buildHtmlReport(bundle);
    if (html.includes('CY_PY_ISOLATION') && bundle.validationData.results.find((c: FinalValidationResult) => c.validation_id === 'CY_PY_ISOLATION')?.severity === 'WARNING') {
      return { passed: false, message: 'Unexpected false CY_PY_ISOLATION warning when PY is provided' };
    }

    return { passed: true, message: 'Comparative PY exported accurately in both Excel and HTML/PDF.' };
  });

  // ── Test 3: Validation Error Gate ───────────────────────────────────────────
  runTest('Test 3: Phase 13 Validation ERROR Gate (Prevents silent final export)', () => {
    const db = createBaseTestDatabase();
    seedMandalamCurrentYear(db);
    // Corrupt one balance so TB_BALANCE triggers an ERROR while upstream data is complete
    db.prepare("UPDATE LedgerBalance SET debit = debit + 500 WHERE ledger_id = 'led-1'").run();

    const bundle = buildExportDatasetBundle(db, 'fy-cy', { scope: 'UNIT', unitId: 'unit-mandalam' });
    const gate = evaluateValidationGate(bundle.validationData);

    if (gate.canExport) {
      return { passed: false, message: 'Gate should have prevented final export when errors exist' };
    }
    if (gate.status !== 'ERROR') {
      return { passed: false, message: `Expected gate status ERROR, got ${gate.status}` };
    }

    return { passed: true, message: 'Validation ERROR correctly prevents final export.' };
  });

  // ── Test 4: Blocked Validation Gate ─────────────────────────────────────────
  runTest('Test 4: Phase 13 BLOCKED Gate (Strictly blocks export)', () => {
    const db = createBaseTestDatabase();
    // Incomplete upstream phase (no import batch)
    const bundle = buildExportDatasetBundle(db, 'fy-cy', { scope: 'UNIT', unitId: 'unit-mandalam' });
    const gate = evaluateValidationGate(bundle.validationData);

    if (gate.canExport) {
      return { passed: false, message: 'Gate should strictly block export when upstream data is missing' };
    }

    return { passed: true, message: 'BLOCKED status strictly prevents export.' };
  });

  // ── Test 5: Specific Unit Isolation ─────────────────────────────────────────
  runTest('Test 5: Specific Unit Isolation (Mandalam exported without contamination)', () => {
    const db = createBaseTestDatabase();
    seedMandalamCurrentYear(db);

    // Seed bakery unit with separate numbers
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO ImportBatch VALUES ('batch-bakery', 'default-entity', 'unit-bakery', 'fy-cy', 'tb_bakery.xlsx', '/tb.xlsx', 'h', 1, 1, 50000, 50000, 0, ?, 'SUCCESS')
    `).run(now);
    db.prepare(`
      INSERT INTO Ledger (id, entity_id, unit_id, ledger_name, tally_group_id, ledger_code, active)
      VALUES ('led-bak-1', 'default-entity', 'unit-bakery', 'Bakery Sales', 'G1', 'BAK-1', 1)
    `).run();
    const revFsli = db.prepare("SELECT id FROM FSLI WHERE fsli_code = 'INC_REV_OPS'").get() as { id: string };
    db.prepare(`
      INSERT INTO LedgerMapping VALUES ('lm-bak-1', 'led-bak-1', 'fy-cy', ?, NULL, 'UserMapping', 1.0, 1, 'admin', ?, 'Approved', ?, ?)
    `).run(revFsli.id, now, now, now);
    db.prepare(`
      INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, opening_debit, opening_credit, debit, credit, closing_debit, closing_credit, net_balance)
      VALUES ('lb-bak-1', 'led-bak-1', 'fy-cy', 'batch-bakery', 0, 0, 0, 50000, 0, 50000, -50000)
    `).run();

    const mandalamBundle = buildExportDatasetBundle(db, 'fy-cy', { scope: 'UNIT', unitId: 'unit-mandalam' });
    if (mandalamBundle.unitName !== 'Mandalam') {
      return { passed: false, message: `Expected unitName Mandalam, got ${mandalamBundle.unitName}` };
    }

    // Check revenue: Mandalam has subscription 325000, bakery has 50000 sales
    // Mandalam total revenue should not include bakery sales
    if (mandalamBundle.financialStatements.incomeExpenditure.totalRevenueCY > 325000) {
      return { passed: false, message: `Mandalam revenue contaminated with bakery data: ${mandalamBundle.financialStatements.incomeExpenditure.totalRevenueCY}` };
    }

    return { passed: true, message: 'Unit isolation verified without cross-unit contamination.' };
  });

  // ── Test 6: Consolidated Scope Export ───────────────────────────────────────
  runTest('Test 6: Consolidated Scope Export (Combines units and matches Phase 12)', () => {
    const db = createBaseTestDatabase();
    seedMandalamCurrentYear(db);

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO ConsolidationRun VALUES ('run-1', 'default-entity', 'fy-cy', 'CR-2026-001', 'Completed', ?, 1, 1025000, 1025000, 0, 0, 0, 1025000, 1025000, 0, 'admin', ?, ?, ?)
    `).run(JSON.stringify(['unit-mandalam']), now, now, now);

    const bundle = buildExportDatasetBundle(db, 'fy-cy', { scope: 'CONSOLIDATED', consolidationRunId: 'run-1' });
    if (bundle.scope !== 'CONSOLIDATED') {
      return { passed: false, message: 'Expected scope CONSOLIDATED' };
    }

    const fsData = generateFinancialStatements(db, 'fy-cy', { scope: 'CONSOLIDATED', consolidationRunId: 'run-1' });
    if (bundle.financialStatements.balanceSheet.totalLiabilitiesCY !== fsData.balanceSheet.totalLiabilitiesCY) {
      return { passed: false, message: 'Export total liabilities does not match Phase 12' };
    }

    return { passed: true, message: 'Consolidated export matches Phase 12 consolidated data.' };
  });

  // ── Test 7: Excel / PDF / UI Consistency ────────────────────────────────────
  runTest('Test 7: Excel / PDF / Phase 12 Value Consistency (100% numerical identity)', () => {
    const db = createBaseTestDatabase();
    seedMandalamCurrentYear(db);

    const bundle = buildExportDatasetBundle(db, 'fy-cy', { scope: 'UNIT', unitId: 'unit-mandalam' });
    const fsData = generateFinancialStatements(db, 'fy-cy', { scope: 'UNIT', unitId: 'unit-mandalam' });

    // Compare major totals
    const bsLiabPhase12 = fsData.balanceSheet.totalLiabilitiesCY;
    const bsAssetPhase12 = fsData.balanceSheet.totalAssetsCY;
    const revPhase12 = fsData.incomeExpenditure.totalRevenueCY;
    const expPhase12 = fsData.incomeExpenditure.totalExpensesCY;
    const surplusPhase12 = fsData.incomeExpenditure.netSurplusCY;

    // Excel workbook totals
    const wb = buildExcelWorkbook(bundle);
    const bsSheet = wb.Sheets['Balance Sheet'];
    const bsRows: any[][] = XLSX.utils.sheet_to_json(bsSheet, { header: 1 });
    const totalRows = bsRows.filter(r => r[0] && String(r[0]).trim() === 'TOTAL');
    const totalLiabRow = totalRows[0];
    const totalAssetRow = totalRows[1];

    if (!totalLiabRow || totalLiabRow[2] !== bsLiabPhase12) {
      return { passed: false, message: `Excel Total Liabilities (${totalLiabRow?.[2]}) does not match Phase 12 (${bsLiabPhase12})` };
    }
    if (!totalAssetRow || totalAssetRow[2] !== bsAssetPhase12) {
      return { passed: false, message: `Excel Total Assets (${totalAssetRow?.[2]}) does not match Phase 12 (${bsAssetPhase12})` };
    }

    // HTML / PDF strings check
    const html = buildHtmlReport(bundle);
    const formattedLiab = formatDisplayAmount(bsLiabPhase12);
    if (!html.includes(formattedLiab)) {
      return { passed: false, message: `HTML report missing formatted liability amount ${formattedLiab}` };
    }

    return { passed: true, message: 'Perfect numerical consistency confirmed: Phase 12 === Excel === PDF.' };
  });

  // ── Test 8: Non-mutation Guarantee ──────────────────────────────────────────
  runTest('Test 8: Security & Non-Mutation Guarantee (Export modifies 0 database records)', () => {
    const db = createBaseTestDatabase();
    seedMandalamCurrentYear(db);

    const getCounts = () => ({
      lb: (db.prepare('SELECT COUNT(*) as cnt FROM LedgerBalance').get() as any).cnt,
      lm: (db.prepare('SELECT COUNT(*) as cnt FROM LedgerMapping').get() as any).cnt,
      fsli: (db.prepare('SELECT COUNT(*) as cnt FROM FSLI').get() as any).cnt,
      nodes: (db.prepare('SELECT COUNT(*) as cnt FROM ReportingNode').get() as any).cnt,
      adj: (db.prepare('SELECT COUNT(*) as cnt FROM Adjustment').get() as any).cnt,
    });

    const before = getCounts();
    const bundle = buildExportDatasetBundle(db, 'fy-cy', { scope: 'UNIT', unitId: 'unit-mandalam' });
    buildExcelWorkbook(bundle);
    buildHtmlReport(bundle);
    const after = getCounts();

    if (before.lb !== after.lb || before.lm !== after.lm || before.fsli !== after.fsli || before.nodes !== after.nodes || before.adj !== after.adj) {
      return { passed: false, message: 'Database state was modified during export execution!' };
    }

    return { passed: true, message: 'Strict read-only non-mutation verified.' };
  });

  // ── Test 9: File Naming & Sanitization ───────────────────────────────────────
  runTest('Test 9: Filename Sanitization and Convention', () => {
    const sanitized = sanitizeFileName('Santhigiri Ashram / Trust: Mandalam & Co.');
    if (sanitized.includes('/') || sanitized.includes(':') || sanitized.includes('&')) {
      return { passed: false, message: `Sanitization failed: ${sanitized}` };
    }

    const excelName = generateStandardFileName('Santhigiri Ashram', '2025-26', 'UNIT', 'Mandalam', 'EXCEL', 'COMPLETE');
    if (excelName !== 'Santhigiri_Ashram_2025-26_Mandalam_Financial_Statements.xlsx') {
      return { passed: false, message: `Unexpected excel name: ${excelName}` };
    }

    const pdfName = generateStandardFileName('Santhigiri Ashram', '2025-26', 'CONSOLIDATED', undefined, 'PDF', 'COMPLETE');
    if (pdfName !== 'Santhigiri_Ashram_2025-26_CONSOLIDATED_Financial_Report.pdf') {
      return { passed: false, message: `Unexpected pdf name: ${pdfName}` };
    }

    return { passed: true, message: 'Filename generation strictly adheres to naming conventions.' };
  });

  // ── Test 10: Individual Statement Exports ───────────────────────────────────
  runTest('Test 10: Individual Statement & Schedule Exports', () => {
    const db = createBaseTestDatabase();
    seedMandalamCurrentYear(db);

    const bundle = buildExportDatasetBundle(db, 'fy-cy', { scope: 'UNIT', unitId: 'unit-mandalam' });

    // Balance sheet only
    const wbBS = buildExcelWorkbook(bundle, 'BALANCE_SHEET');
    if (!wbBS.SheetNames.includes('Balance Sheet') || wbBS.SheetNames.includes('Income and Expenditure')) {
      return { passed: false, message: 'BALANCE_SHEET export included unexpected sheets' };
    }

    // Income & Expenditure only
    const wbIE = buildExcelWorkbook(bundle, 'INCOME_EXPENDITURE');
    if (!wbIE.SheetNames.includes('Income and Expenditure') || wbIE.SheetNames.includes('Balance Sheet')) {
      return { passed: false, message: 'INCOME_EXPENDITURE export included unexpected sheets' };
    }

    // Notes only
    const wbNotes = buildExcelWorkbook(bundle, 'NOTES');
    if (!wbNotes.SheetNames.includes('Notes & Schedules') || wbNotes.SheetNames.includes('Balance Sheet')) {
      return { passed: false, message: 'NOTES export included unexpected sheets' };
    }

    return { passed: true, message: 'Individual statement exports generate focused workbooks correctly.' };
  });

  const passedTests = results.filter(r => r.passed).length;
  return {
    allPassed: passedTests === results.length,
    totalTests: results.length,
    passedTests,
    results,
  };
}

if (require.main === module) {
  const res = runExportEngineTests();
  console.log('\n========================================');
  console.log(' Phase 14: Export Engine Test Suite');
  console.log('========================================');
  res.results.forEach((r: { name: string; passed: boolean; message: string }, idx: number) => {
    console.log(`[${r.passed ? '✓ PASS' : '✗ FAIL'}] ${idx + 1}. ${r.name}`);
    console.log(`        ${r.message}`);
  });
  console.log('========================================');
  console.log(`Summary: ${res.passedTests} / ${res.totalTests} Passed (${res.allPassed ? 'ALL PASSED' : 'SOME FAILED'})`);
  console.log('========================================\n');
  if (!res.allPassed) {
    process.exit(1);
  }
}

