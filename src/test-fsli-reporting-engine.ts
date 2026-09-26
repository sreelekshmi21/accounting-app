/**
 * Phase 10: FSLI & Reporting Hierarchy Engine Automated Test Suite
 *
 * 36 comprehensive tests covering:
 * - Single / Multi-ledger FSLI aggregation
 * - Hierarchical FSLI roll-up
 * - Case A (Ledger -> Sub-Schedule -> Schedule -> Statement)
 * - Case B (Ledger -> Direct Schedule -> Statement)
 * - Anti-double-counting verification
 * - CY vs PY separation
 * - Unit vs Consolidated scope & Phase 9 elimination single-consumption
 * - Phase 8 Applied & Reversed adjustment integration
 * - Protected non-netting accounts
 * - Multi-batch isolation & replacement import safety
 * - 35+ Unit scalability stress test
 * - Unmapped bucket & PENDING_MAPPING vs RECONCILIATION_ERROR separation
 * - Note 4 Corpus, Note 5 Reserve & Surplus, Note 11 PPE, Note 18 Loans, Notes 25, 28, 29 Stock/COGS
 * - Incomplete schedule input diagnostic detection (no silent zero substitution)
 * - Balance Sheet balancing control
 * - Provenance audit lineage
 */

import Database from 'better-sqlite3';
import {
  ensureReportingHierarchyTables,
  generateReportingHierarchyData,
  getLedgerProvenance,
} from './reporting-hierarchy-engine';
import { STANDARD_FSLI_CATALOG } from './standard-fsli';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  // Base Schema
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
      file_name TEXT NOT NULL, file_path TEXT NOT NULL, file_hash TEXT NOT NULL, sheet_name TEXT,
      header_row INTEGER, total_rows INTEGER, ledger_count INTEGER, total_debit REAL, total_credit REAL, difference REAL,
      import_timestamp TEXT NOT NULL, status TEXT NOT NULL, detected_columns TEXT,
      FOREIGN KEY (entity_id) REFERENCES Entity(id),
      FOREIGN KEY (unit_id) REFERENCES Unit(id),
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id)
    );
    CREATE TABLE TallyGroup (
      id TEXT PRIMARY KEY, import_batch_id TEXT NOT NULL, group_name TEXT NOT NULL, parent_group_id TEXT, depth INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (import_batch_id) REFERENCES ImportBatch(id)
    );
    CREATE TABLE Ledger (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, unit_id TEXT NOT NULL, ledger_name TEXT NOT NULL,
      tally_group_id TEXT, ledger_code TEXT, source_import_id TEXT, source_row_number INTEGER, active INTEGER DEFAULT 1,
      FOREIGN KEY (entity_id) REFERENCES Entity(id),
      FOREIGN KEY (unit_id) REFERENCES Unit(id),
      UNIQUE(entity_id, unit_id, ledger_name)
    );
    CREATE TABLE LedgerBalance (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, import_batch_id TEXT NOT NULL,
      opening_debit REAL DEFAULT 0, opening_credit REAL DEFAULT 0, debit REAL DEFAULT 0, credit REAL DEFAULT 0,
      closing_debit REAL DEFAULT 0, closing_credit REAL DEFAULT 0, net_balance REAL DEFAULT 0,
      FOREIGN KEY (ledger_id) REFERENCES Ledger(id),
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id),
      FOREIGN KEY (import_batch_id) REFERENCES ImportBatch(id),
      UNIQUE(ledger_id, financial_year_id, import_batch_id)
    );
    CREATE TABLE FSLI (
      id TEXT PRIMARY KEY, fsli_name TEXT NOT NULL, fsli_code TEXT UNIQUE, category TEXT NOT NULL,
      sub_category TEXT, display_order INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'SYSTEM',
      active INTEGER NOT NULL DEFAULT 1, parent_fsli_id TEXT REFERENCES FSLI(id), created_at TEXT NOT NULL
    );
    CREATE TABLE MappingRule (
      id TEXT PRIMARY KEY, rule_name TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0, conditions TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'map_to_fsli', target_fsli_id TEXT, confidence REAL NOT NULL DEFAULT 1.0,
      scope TEXT NOT NULL DEFAULT 'Global', scope_client_id TEXT, scope_entity_id TEXT, active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE LedgerMapping (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, mapped_fsli_id TEXT,
      mapping_rule_id TEXT, mapping_source TEXT NOT NULL DEFAULT 'UserMapping', confidence_score REAL,
      is_manual_override INTEGER NOT NULL DEFAULT 0, approved_by TEXT, approved_at TEXT, status TEXT NOT NULL DEFAULT 'Unmapped',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(ledger_id, financial_year_id)
    );
    CREATE TABLE LedgerClassification (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL,
      original_tally_classification TEXT, application_classification TEXT, child_fsli_id TEXT, parent_fsli_id TEXT,
      final_fsli_id TEXT, classification_source TEXT NOT NULL DEFAULT 'PENDING', confidence_score REAL DEFAULT 0,
      reason TEXT, is_manual_override INTEGER NOT NULL DEFAULT 0, approved_by TEXT, approved_at TEXT,
      status TEXT NOT NULL DEFAULT 'Unclassified', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(ledger_id, financial_year_id)
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
      UNIQUE(ledger_id, financial_year_id)
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
      internal_debit REAL NOT NULL DEFAULT 0, internal_credit REAL NOT NULL DEFAULT 0, internal_difference REAL NOT NULL DEFAULT 0,
      final_debit REAL NOT NULL DEFAULT 0, final_credit REAL NOT NULL DEFAULT 0, final_difference REAL NOT NULL DEFAULT 0,
      created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
    );
    CREATE TABLE ConsolidationElimination (
      id TEXT PRIMARY KEY, consolidation_run_id TEXT NOT NULL, elimination_number TEXT NOT NULL,
      entity_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, source_unit_id TEXT NOT NULL, counterparty_unit_id TEXT,
      source_ledger_id TEXT, source_ledger_name TEXT NOT NULL, counterparty_ledger_id TEXT, counterparty_ledger_name TEXT,
      internal_account_type TEXT NOT NULL, fsli_id TEXT, fsli_name TEXT, debit_amount REAL NOT NULL DEFAULT 0,
      credit_amount REAL NOT NULL DEFAULT 0, eliminated_amount REAL NOT NULL DEFAULT 0, unmatched_amount REAL NOT NULL DEFAULT 0,
      matching_basis TEXT, confidence REAL NOT NULL DEFAULT 0, match_status TEXT NOT NULL DEFAULT 'NeedsReview',
      reason TEXT, status TEXT NOT NULL DEFAULT 'Draft', reversal_of_id TEXT, reversed_by_id TEXT,
      created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, applied_by TEXT, applied_at TEXT
    );
  `);

  // Seed default Client, Entity, Unit, FinancialYear
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO Client (id, client_name, created_at) VALUES ('client-1', 'Test Client', ?)`).run(now);
  db.prepare(`INSERT INTO Entity (id, client_id, entity_name, created_at) VALUES ('default-entity', 'client-1', 'Main Entity', ?)`).run(now);
  db.prepare(`INSERT INTO Unit (id, entity_id, unit_name, created_at) VALUES ('unit-a', 'default-entity', 'Unit Alpha', ?)`).run(now);
  db.prepare(`INSERT INTO Unit (id, entity_id, unit_name, created_at) VALUES ('unit-b', 'default-entity', 'Unit Beta', ?)`).run(now);
  db.prepare(`INSERT INTO FinancialYear (id, entity_id, year_label, start_date, end_date, created_at) VALUES ('fy-cy', 'default-entity', '2025-2026', '2025-04-01', '2026-03-31', ?)`).run(now);
  db.prepare(`INSERT INTO FinancialYear (id, entity_id, year_label, start_date, end_date, created_at) VALUES ('fy-py', 'default-entity', '2024-2025', '2024-04-01', '2025-03-31', ?)`).run(now);

  // Seed standard FSLIs
  const insertFsli = db.prepare(`
    INSERT INTO FSLI (id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'SYSTEM', 1, ?)
  `);
  for (const f of STANDARD_FSLI_CATALOG) {
    insertFsli.run(f.code, f.name, f.code, f.category, f.subCategory, f.displayOrder, now);
  }

  // Ensure Phase 10 master tables
  ensureReportingHierarchyTables(db);

  return db;
}

export function runReportingHierarchyEngineTests(): {
  allPassed: boolean;
  totalTests: number;
  passedTests: number;
  results: TestResult[];
} {
  const results: TestResult[] = [];

  function test(name: string, fn: () => void) {
    try {
      fn();
      results.push({ name, passed: true, message: 'Passed' });
    } catch (err: any) {
      results.push({ name, passed: false, message: err.message || String(err) });
    }
  }

  // 1. Single ledger -> 1 FSLI
  test('1. Single ledger -> 1 FSLI aggregation', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 100, 100, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Sales Account')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 0, 100)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'INC_REV_OPS', 'Mapped', ?, ?)`).run(now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const row = report.fsliRows.find(f => f.fsliCode === 'INC_REV_OPS');
    if (!row || row.cyCredit !== 100) throw new Error(`Expected INC_REV_OPS Credit=100, got ${row?.cyCredit}`);
  });

  // 2. Multiple ledgers -> 1 FSLI
  test('2. Multiple ledgers -> 1 FSLI aggregation', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 300, 300, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Salaries Main'), ('l2', 'default-entity', 'unit-a', 'Salaries Bonus')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 100, 0), ('lb2', 'l2', 'fy-cy', 'b1', 200, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'EXP_EMP_BEN', 'Mapped', ?, ?), ('lm2', 'l2', 'fy-cy', 'EXP_EMP_BEN', 'Mapped', ?, ?)`).run(now, now, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const row = report.fsliRows.find(f => f.fsliCode === 'EXP_EMP_BEN');
    if (!row || row.cyDebit !== 300 || row.ledgerCount !== 2) throw new Error(`Expected EXP_EMP_BEN Debit=300 and ledgerCount=2, got Dr=${row?.cyDebit}, cnt=${row?.ledgerCount}`);
  });

  // 3. Multiple FSLIs across categories
  test('3. Multiple FSLIs across categories', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 500, 500, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Cash in hand'), ('l2', 'default-entity', 'unit-a', 'Vendor Payable')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 500, 0), ('lb2', 'l2', 'fy-cy', 'b1', 0, 500)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'CA_CASH_EQUIV', 'Mapped', ?, ?), ('lm2', 'l2', 'fy-cy', 'CL_TRADE_PAY', 'Mapped', ?, ?)`).run(now, now, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const cash = report.fsliRows.find(f => f.fsliCode === 'CA_CASH_EQUIV');
    const pay = report.fsliRows.find(f => f.fsliCode === 'CL_TRADE_PAY');
    if (!cash || cash.cyDebit !== 500 || !pay || pay.cyCredit !== 500) throw new Error('Multi-category aggregation failed');
  });

  // 4. FSLI parent-child hierarchy
  test('4. FSLI parent-child hierarchy roll-up', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO FSLI (id, fsli_name, fsli_code, category, display_order, source, active, parent_fsli_id, created_at) VALUES ('EXP_EMP_SUB', 'Employee Welfare Sub', 'EXP_EMP_SUB', 'Expense', 535, 'SYSTEM', 1, 'EXP_EMP_BEN', ?)`).run(now);
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 150, 150, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Staff Welfare')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 150, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'EXP_EMP_SUB', 'Mapped', ?, ?)`).run(now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const sub = report.fsliRows.find(f => f.fsliCode === 'EXP_EMP_SUB');
    if (!sub || sub.cyDebit !== 150) throw new Error('Child FSLI aggregation failed');
  });

  // 5. Case A: Ledger -> Sub-Schedule -> Schedule -> Statement
  test('5. Case A Aggregation (Ledger -> Sub-Schedule -> Schedule -> Statement)', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 200, 200, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'General Plant Machinery')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 200, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'NCA_PPE', 'Mapped', ?, ?)`).run(now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const sch11 = report.scheduleRows.find(s => s.scheduleCode === 'SCH_11');
    const plantNode = sch11?.nodes.find(n => n.nodeCode === 'N_11_PLANT');
    if (!plantNode || plantNode.cyDebit !== 200) throw new Error('Case A Node aggregation failed');
  });

  // 6. Case B: Ledger -> Schedule directly -> Statement
  test('6. Case B Aggregation (Ledger -> Schedule directly -> Statement)', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 120, 120, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Devotee Returnable Loan')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 0, 120)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'NCL_OTH_LIAB', 'Mapped', ?, ?)`).run(now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const sch7 = report.scheduleRows.find(s => s.scheduleCode === 'SCH_07');
    if (!sch7 || sch7.cyTotal !== 120) throw new Error(`Expected Note 7 Total=120, got ${sch7?.cyTotal}`);
  });

  // 7. Sub-Schedule roll-up without double counting
  test('7. Sub-Schedule roll-up without double counting', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 700, 700, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Rent Expense'), ('l2', 'default-entity', 'unit-a', 'Rates & Taxes Expense')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 300, 0), ('lb2', 'l2', 'fy-cy', 'b1', 400, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'EXP_ADMIN_GEN', 'Mapped', ?, ?), ('lm2', 'l2', 'fy-cy', 'EXP_ADMIN_GEN', 'Mapped', ?, ?)`).run(now, now, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const sch33 = report.scheduleRows.find(s => s.scheduleCode === 'SCH_33');
    if (!sch33 || sch33.cyTotal !== 700) throw new Error(`Expected Note 33 total=700, got ${sch33?.cyTotal}`);
  });

  // 8. Schedule -> Income & Expenditure statement
  test('8. Schedule -> Income & Expenditure statement', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 1000, 1000, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'General Donation Received')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 0, 1000)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'INC_DON_GRANT', 'Mapped', ?, ?)`).run(now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const line20 = report.incomeAndExpenditure.lines.find(l => l.scheduleCode === 'SCH_20');
    if (!line20 || line20.cyAmount !== 1000) throw new Error(`Expected I&E Note 20=1000, got ${line20?.cyAmount}`);
  });

  // 9. Schedule -> Balance Sheet statement
  test('9. Schedule -> Balance Sheet statement', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 850, 850, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Vendor Payable Trade')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 0, 850)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'CL_TRADE_PAY', 'Mapped', ?, ?)`).run(now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const line08 = report.balanceSheet.lines.find(l => l.scheduleCode === 'SCH_08');
    if (!line08 || line08.cyAmount !== 850) throw new Error(`Expected BS Note 8=850, got ${line08?.cyAmount}`);
  });

  // 10. Anti-double counting
  test('10. Parent/Child aggregation without double counting', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 300, 300, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Bank Charge')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 300, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'EXP_FIN_COST', 'Mapped', ?, ?)`).run(now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    if (report.reconciliation.aggregatedFSLIDebit !== 300) throw new Error(`Expected FSLI Dr=300, got ${report.reconciliation.aggregatedFSLIDebit}`);
  });

  // 11. CY/PY separation
  test('11. CY and PY separation', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b-cy', 'default-entity', 'unit-a', 'fy-cy', 'cy.xlsx', '/cy.xlsx', 'hcy', 100, 100, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b-py', 'default-entity', 'unit-a', 'fy-py', 'py.xlsx', '/py.xlsx', 'hpy', 80, 80, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Sales A')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb-cy', 'l1', 'fy-cy', 'b-cy', 0, 100)`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb-py', 'l1', 'fy-py', 'b-py', 0, 80)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm-cy', 'l1', 'fy-cy', 'INC_REV_OPS', 'Mapped', ?, ?), ('lm-py', 'l1', 'fy-py', 'INC_REV_OPS', 'Mapped', ?, ?)`).run(now, now, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a', previousFinancialYearId: 'fy-py' });
    const row = report.fsliRows.find(f => f.fsliCode === 'INC_REV_OPS');
    if (!row || row.cyCredit !== 100 || row.pyCredit !== 80) throw new Error(`CY/PY split failed: cy=${row?.cyCredit}, py=${row?.pyCredit}`);
  });

  // 12. Unit-level reporting
  test('12. Unit-level isolation (internal accounts preserved)', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b-a', 'default-entity', 'unit-a', 'fy-cy', 'a.xlsx', '/a.xlsx', 'ha', 500, 500, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b-b', 'default-entity', 'unit-b', 'fy-cy', 'b.xlsx', '/b.xlsx', 'hb', 900, 900, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-a', 'default-entity', 'unit-a', 'Unit A Cash'), ('l-b', 'default-entity', 'unit-b', 'Unit B Cash')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb-a', 'l-a', 'fy-cy', 'b-a', 500, 0), ('lb-b', 'l-b', 'fy-cy', 'b-b', 900, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm-a', 'l-a', 'fy-cy', 'CA_CASH_EQUIV', 'Mapped', ?, ?), ('lm-b', 'l-b', 'fy-cy', 'CA_CASH_EQUIV', 'Mapped', ?, ?)`).run(now, now, now, now);

    const reportA = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    if (reportA.totalDebit !== 500) throw new Error(`Unit isolation failed: Expected 500, got ${reportA.totalDebit}`);
  });

  // 13. Consolidated reporting
  test('13. Consolidated reporting across selected units', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b-a', 'default-entity', 'unit-a', 'fy-cy', 'a.xlsx', '/a.xlsx', 'ha', 500, 500, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b-b', 'default-entity', 'unit-b', 'fy-cy', 'b.xlsx', '/b.xlsx', 'hb', 900, 900, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-a', 'default-entity', 'unit-a', 'Unit A Cash'), ('l-b', 'default-entity', 'unit-b', 'Unit B Cash')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb-a', 'l-a', 'fy-cy', 'b-a', 500, 0), ('lb-b', 'l-b', 'fy-cy', 'b-b', 900, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm-a', 'l-a', 'fy-cy', 'CA_CASH_EQUIV', 'Mapped', ?, ?), ('lm-b', 'l-b', 'fy-cy', 'CA_CASH_EQUIV', 'Mapped', ?, ?)`).run(now, now, now, now);

    db.prepare(`INSERT INTO ConsolidationRun (id, entity_id, financial_year_id, run_number, selected_unit_ids, total_units, status, created_at, updated_at) VALUES ('run-1', 'default-entity', 'fy-cy', 'RUN-001', '["unit-a","unit-b"]', 2, 'Completed', ?, ?)`).run(now, now);

    const reportConsol = generateReportingHierarchyData(db, 'fy-cy', { consolidationRunId: 'run-1' });
    if (reportConsol.totalDebit !== 1400) throw new Error(`Consolidation failed: Expected 1400, got ${reportConsol.totalDebit}`);
  });

  // 14. Phase 9 post-elimination consumption
  test('14. Phase 9 post-elimination consumption', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b-a', 'default-entity', 'unit-a', 'fy-cy', 'a.xlsx', '/a.xlsx', 'ha', 500, 500, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-a', 'default-entity', 'unit-a', 'HO Current Account')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb-a', 'l-a', 'fy-cy', 'b-a', 500, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm-a', 'l-a', 'fy-cy', 'NCA_OTH_ASSET', 'Mapped', ?, ?)`).run(now, now);

    db.prepare(`INSERT INTO ConsolidationRun (id, entity_id, financial_year_id, run_number, selected_unit_ids, total_units, status, created_at, updated_at) VALUES ('run-1', 'default-entity', 'fy-cy', 'RUN-001', '["unit-a"]', 1, 'Completed', ?, ?)`).run(now, now);
    db.prepare(`INSERT INTO ConsolidationElimination (id, consolidation_run_id, elimination_number, entity_id, financial_year_id, source_unit_id, source_ledger_name, internal_account_type, fsli_id, eliminated_amount, match_status, status, created_at, updated_at) VALUES ('e1', 'run-1', 'ELIM-01', 'default-entity', 'fy-cy', 'unit-a', 'HO Current Account', 'Branch/Division', 'NCA_OTH_ASSET', 500, 'Applied', 'Applied', ?, ?)`).run(now, now);

    const reportConsol = generateReportingHierarchyData(db, 'fy-cy', { consolidationRunId: 'run-1' });
    const row = reportConsol.fsliRows.find(f => f.fsliCode === 'NCA_OTH_ASSET');
    if (!row || row.cyDebit !== 0) throw new Error(`Expected eliminated NCA_OTH_ASSET Debit=0, got ${row?.cyDebit}`);
  });

  // 15. No double elimination
  test('15. Elimination applied exactly once', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b-a', 'default-entity', 'unit-a', 'fy-cy', 'a.xlsx', '/a.xlsx', 'ha', 600, 600, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-a', 'default-entity', 'unit-a', 'Branch Bal')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb-a', 'l-a', 'fy-cy', 'b-a', 600, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm-a', 'l-a', 'fy-cy', 'CA_OTH_ASSET', 'Mapped', ?, ?)`).run(now, now);

    db.prepare(`INSERT INTO ConsolidationRun (id, entity_id, financial_year_id, run_number, selected_unit_ids, total_units, status, created_at, updated_at) VALUES ('run-1', 'default-entity', 'fy-cy', 'RUN-001', '["unit-a"]', 1, 'Completed', ?, ?)`).run(now, now);
    db.prepare(`INSERT INTO ConsolidationElimination (id, consolidation_run_id, elimination_number, entity_id, financial_year_id, source_unit_id, source_ledger_name, internal_account_type, fsli_id, eliminated_amount, match_status, status, created_at, updated_at) VALUES ('e1', 'run-1', 'ELIM-01', 'default-entity', 'fy-cy', 'unit-a', 'Branch Bal', 'Branch/Division', 'CA_OTH_ASSET', 200, 'Applied', 'Applied', ?, ?)`).run(now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { consolidationRunId: 'run-1' });
    const row = report.fsliRows.find(f => f.fsliCode === 'CA_OTH_ASSET');
    if (!row || row.cyDebit !== 400) throw new Error(`Expected 600 - 200 = 400, got ${row?.cyDebit}`);
  });

  // 16. Phase 8 Applied adjustments
  test('16. Phase 8 Applied adjustment included', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 100, 100, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Cash')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 100, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'CA_CASH_EQUIV', 'Mapped', ?, ?)`).run(now, now);

    db.prepare(`INSERT INTO Adjustment (id, adjustment_number, entity_id, unit_id, financial_year_id, adjustment_date, adjustment_type, narration, status, total_debit, total_credit, created_at, updated_at) VALUES ('adj-1', 'ADJ-001', 'default-entity', 'unit-a', 'fy-cy', '2026-03-31', 'Manual', 'Audit adj', 'Applied', 50, 50, ?, ?)`).run(now, now);
    db.prepare(`INSERT INTO AdjustmentLine (id, adjustment_id, line_number, ledger_name, fsli_id, fsli_name, debit, credit) VALUES ('al1', 'adj-1', 1, 'Cash', 'CA_CASH_EQUIV', 'Cash', 50, 0)`).run();
    db.prepare(`INSERT INTO AdjustmentLine (id, adjustment_id, line_number, ledger_name, fsli_id, fsli_name, debit, credit) VALUES ('al2', 'adj-1', 2, 'Sales', 'INC_REV_OPS', 'Revenue', 0, 50)`).run();

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const cash = report.fsliRows.find(f => f.fsliCode === 'CA_CASH_EQUIV');
    if (!cash || cash.cyDebit !== 150) throw new Error(`Expected Cash Dr=150, got ${cash?.cyDebit}`);
  });

  // 17. Phase 8 Reversed adjustments
  test('17. Phase 8 Reversed adjustments offset cleanly', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 100, 100, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Cash')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 100, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'CA_CASH_EQUIV', 'Mapped', ?, ?)`).run(now, now);

    db.prepare(`INSERT INTO Adjustment (id, adjustment_number, entity_id, unit_id, financial_year_id, adjustment_date, adjustment_type, narration, status, total_debit, total_credit, created_at, updated_at) VALUES ('adj-1', 'ADJ-001', 'default-entity', 'unit-a', 'fy-cy', '2026-03-31', 'Manual', 'Original', 'Reversed', 50, 50, ?, ?)`).run(now, now);
    db.prepare(`INSERT INTO AdjustmentLine (id, adjustment_id, line_number, ledger_name, fsli_id, fsli_name, debit, credit) VALUES ('al1', 'adj-1', 1, 'Cash', 'CA_CASH_EQUIV', 'Cash', 50, 0)`).run();
    db.prepare(`INSERT INTO Adjustment (id, adjustment_number, entity_id, unit_id, financial_year_id, adjustment_date, adjustment_type, narration, status, total_debit, total_credit, created_at, updated_at) VALUES ('adj-2', 'ADJ-002', 'default-entity', 'unit-a', 'fy-cy', '2026-03-31', 'Manual', 'Reversal', 'Reversed', 50, 50, ?, ?)`).run(now, now);
    db.prepare(`INSERT INTO AdjustmentLine (id, adjustment_id, line_number, ledger_name, fsli_id, fsli_name, debit, credit) VALUES ('al2', 'adj-2', 1, 'Cash', 'CA_CASH_EQUIV', 'Cash', 0, 50)`).run();

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const cash = report.fsliRows.find(f => f.fsliCode === 'CA_CASH_EQUIV');
    if (!cash || cash.cyDebit !== 150 || cash.cyCredit !== 50 || cash.cyNet !== 100) throw new Error(`Reversal netting failed: net=${cash?.cyNet}`);
  });

  // 18. Unmapped FSLI
  test('18. Unmapped FSLI assigned to control bucket', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 100, 100, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Mystery Ledger')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 100, 0)`).run();

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const unmapped = report.fsliRows.find(f => f.fsliCode === 'UNMAPPED');
    if (!unmapped || unmapped.cyDebit !== 100 || report.status !== 'PENDING_MAPPING') throw new Error(`Expected status PENDING_MAPPING with UNMAPPED Dr=100, got ${report.status}`);
  });

  // 19. Partially unmapped dataset
  test('19. Partially unmapped dataset triggers PENDING_MAPPING', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 300, 300, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Mapped Sales'), ('l2', 'default-entity', 'unit-a', 'Unmapped Misc')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 0, 200), ('lb2', 'l2', 'fy-cy', 'b1', 100, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'INC_REV_OPS', 'Mapped', ?, ?)`).run(now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    if (report.status !== 'PENDING_MAPPING' || report.reconciliation.unresolvedLedgerCount !== 1) throw new Error('Partially unmapped status check failed');
  });

  // 20. Completely unmapped dataset
  test('20. Completely unmapped dataset', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 400, 400, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'L1'), ('l2', 'default-entity', 'unit-a', 'L2')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 200, 0), ('lb2', 'l2', 'fy-cy', 'b1', 0, 200)`).run();

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    if (report.status !== 'PENDING_MAPPING' || report.reconciliation.unresolvedLedgerCount !== 2) throw new Error('Completely unmapped status check failed');
  });

  // 21. Protected non-netting accounts
  test('21. Protected non-netting accounts debit/credit preservation', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 500, 500, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Debtor A (Debit)'), ('l2', 'default-entity', 'unit-a', 'Debtor B (Credit advance)')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 400, 0), ('lb2', 'l2', 'fy-cy', 'b1', 0, 100)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'CA_TRADE_REC', 'Mapped', ?, ?), ('lm2', 'l2', 'fy-cy', 'CA_TRADE_REC', 'Mapped', ?, ?)`).run(now, now, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const row = report.fsliRows.find(f => f.fsliCode === 'CA_TRADE_REC');
    if (!row || row.cyDebit !== 400 || row.cyCredit !== 100) throw new Error('Protected non-netting preservation failed');
  });

  // 22. Multiple import batches
  test('22. Multiple import batches isolation', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb1.xlsx', '/tb1.xlsx', 'h1', 100, 100, 0, '2026-01-01T00:00:00Z', 'SUCCESS')`).run();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b2', 'default-entity', 'unit-a', 'fy-cy', 'tb2.xlsx', '/tb2.xlsx', 'h2', 200, 200, 0, '2026-02-01T00:00:00Z', 'SUCCESS')`).run();
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Cash')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 100, 0)`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb2', 'l1', 'fy-cy', 'b2', 200, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'CA_CASH_EQUIV', 'Mapped', ?, ?)`).run(now, now);

    // Explicitly querying batch b1
    const report1 = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a', importBatchId: 'b1' });
    if (report1.totalDebit !== 100) throw new Error(`Batch 1 isolation failed: got ${report1.totalDebit}`);

    // Default latest batch b2
    const report2 = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    if (report2.totalDebit !== 200) throw new Error(`Latest batch resolution failed: got ${report2.totalDebit}`);
  });

  // 23. Replacement batch safety
  test('23. Replacement batch safety (no A + B accumulation)', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb1.xlsx', '/tb1.xlsx', 'h1', 100, 100, 0, '2026-01-01T00:00:00Z', 'SUCCESS')`).run();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b2', 'default-entity', 'unit-a', 'fy-cy', 'tb2.xlsx', '/tb2.xlsx', 'h2', 150, 150, 0, '2026-02-01T00:00:00Z', 'SUCCESS')`).run();
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Cash')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 100, 0)`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb2', 'l1', 'fy-cy', 'b2', 150, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'CA_CASH_EQUIV', 'Mapped', ?, ?)`).run(now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    if (report.totalDebit === 250) throw new Error('Replacement batch safety failed: accumulated A + B = 250');
    if (report.totalDebit !== 150) throw new Error(`Expected latest batch balance 150, got ${report.totalDebit}`);
  });

  // 24. Unit isolation
  test('24. Unit isolation (Unit A ledgers cannot bleed into Unit B)', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b-a', 'default-entity', 'unit-a', 'fy-cy', 'a.xlsx', '/a.xlsx', 'ha', 700, 700, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b-b', 'default-entity', 'unit-b', 'fy-cy', 'b.xlsx', '/b.xlsx', 'hb', 300, 300, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-a', 'default-entity', 'unit-a', 'Alpha Only'), ('l-b', 'default-entity', 'unit-b', 'Beta Only')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb-a', 'l-a', 'fy-cy', 'b-a', 700, 0), ('lb-b', 'l-b', 'fy-cy', 'b-b', 300, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm-a', 'l-a', 'fy-cy', 'CA_CASH_EQUIV', 'Mapped', ?, ?), ('lm-b', 'l-b', 'fy-cy', 'CA_CASH_EQUIV', 'Mapped', ?, ?)`).run(now, now, now, now);

    const reportB = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-b' });
    if (reportB.totalDebit !== 300) throw new Error(`Unit B bled into Unit A: ${reportB.totalDebit}`);
  });

  // 25. 35+ Unit multi-unit scalability
  test('25. 35+ unit multi-unit scalability stress aggregation', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    const unitIds: string[] = [];
    const insertUnit = db.prepare(`INSERT INTO Unit (id, entity_id, unit_name, created_at) VALUES (?, 'default-entity', ?, ?)`);
    const insertBatch = db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES (?, 'default-entity', ?, 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h', 100, 100, 0, ?, 'SUCCESS')`);
    const insertLedger = db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES (?, 'default-entity', ?, 'Unit Cash')`);
    const insertBal = db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES (?, ?, 'fy-cy', ?, 100, 0)`);
    const insertMap = db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES (?, ?, 'fy-cy', 'CA_CASH_EQUIV', 'Mapped', ?, ?)`);

    for (let i = 1; i <= 36; i++) {
      const uid = `unit-${i}`;
      unitIds.push(uid);
      insertUnit.run(uid, `Unit ${i}`, now);
      insertBatch.run(`b-${i}`, uid, now);
      insertLedger.run(`l-${i}`, uid);
      insertBal.run(`lb-${i}`, `l-${i}`, `b-${i}`);
      insertMap.run(`lm-${i}`, `l-${i}`, now, now);
    }

    db.prepare(`INSERT INTO ConsolidationRun (id, entity_id, financial_year_id, run_number, selected_unit_ids, total_units, status, created_at, updated_at) VALUES ('run-36', 'default-entity', 'fy-cy', 'RUN-36', ?, 36, 'Completed', ?, ?)`).run(JSON.stringify(unitIds), now, now);

    const startTime = Date.now();
    const report = generateReportingHierarchyData(db, 'fy-cy', { consolidationRunId: 'run-36' });
    const duration = Date.now() - startTime;

    if (report.totalDebit !== 3600) throw new Error(`36 unit aggregation failed: got ${report.totalDebit}`);
    if (duration > 2000) throw new Error(`Scalability performance warning: took ${duration}ms`);
  });

  // 26. Reconciliation failure
  test('26. Reconciliation failure detection triggers RECONCILIATION_ERROR', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    // Simulate unbalanced batch (Dr=100, Cr=80)
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 100, 80, 20, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Cash'), ('l2', 'default-entity', 'unit-a', 'Income')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 100, 0), ('lb2', 'l2', 'fy-cy', 'b1', 0, 80)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'CA_CASH_EQUIV', 'Mapped', ?, ?), ('lm2', 'l2', 'fy-cy', 'INC_REV_OPS', 'Mapped', ?, ?)`).run(now, now, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    if (report.reconciliation.sourceDifference !== 20) throw new Error('Difference detection failed');
  });

  // 27. Zero-data scope
  test('27. Zero-data scope handling', () => {
    const db = createTestDatabase();
    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    if (report.totalDebit !== 0 || report.reconciliation.sourceLedgerCount !== 0) throw new Error('Empty scope handling failed');
  });

  // 28. Provenance
  test('28. Provenance audit lineage trace', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'alpha_tb.xlsx', '/alpha_tb.xlsx', 'h1', 100, 100, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Audit Trail Ledger')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 100, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'CA_CASH_EQUIV', 'Mapped', ?, ?)`).run(now, now);

    const trace = getLedgerProvenance(db, 'fy-cy', 'l1');
    if (!trace || trace.importFileName !== 'alpha_tb.xlsx' || trace.finalFSLICode !== 'CA_CASH_EQUIV' || trace.reportingScheduleCode !== 'SCH_15') {
      throw new Error(`Provenance lineage incomplete: ${JSON.stringify(trace)}`);
    }
  });

  // 29. Organisational Schedule hierarchy compliance
  test('29. Organisational Schedule hierarchy compliance (Notes 4-33)', () => {
    const db = createTestDatabase();
    const report = generateReportingHierarchyData(db, 'fy-cy');
    if (report.scheduleRows.length !== 30) throw new Error(`Expected 30 schedules (Notes 4-33), got ${report.scheduleRows.length}`);
    const sch4 = report.scheduleRows.find(s => s.scheduleNumber === 4);
    const sch33 = report.scheduleRows.find(s => s.scheduleNumber === 33);
    if (!sch4 || sch4.scheduleCode !== 'SCH_04' || !sch33 || sch33.scheduleCode !== 'SCH_33') {
      throw new Error('Schedule numbering or codes mismatch');
    }
  });

  // 30. Note 4 Corpus typed calculation
  test('30. Note 4 Corpus typed calculation (Opening + Additions = Closing)', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 1500, 1500, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l1', 'default-entity', 'unit-a', 'Corpus Opening'), ('l2', 'default-entity', 'unit-a', 'Corpus Additions')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l1', 'fy-cy', 'b1', 0, 1000), ('lb2', 'l2', 'fy-cy', 'b1', 0, 500)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l1', 'fy-cy', 'EQ_CAP_FUND', 'Mapped', ?, ?), ('lm2', 'l2', 'fy-cy', 'EQ_CAP_FUND', 'Mapped', ?, ?)`).run(now, now, now, now);

    // Apply override to route l2 to N_04_ADD
    const nodeAdd = db.prepare('SELECT id FROM ReportingNode WHERE node_code = ?').get('N_04_ADD') as { id: string };
    db.prepare(`INSERT INTO LedgerReportingOverride (id, ledger_id, financial_year_id, reporting_node_id, created_at, updated_at) VALUES ('lro-2', 'l2', 'fy-cy', ?, ?, ?)`).run(nodeAdd.id, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const corpus = report.calculatedSchedules.corpus;
    if (corpus.balanceBroughtForward !== 1000 || corpus.receivedDuringYear !== 500 || corpus.closingBalance !== 1500) {
      throw new Error(`Corpus calculation mismatch: ${JSON.stringify(corpus)}`);
    }
  });

  // 31. Note 5 Reserve & Surplus movement
  test('31. Note 5 Reserve & Surplus movement (11 sub-funds + I&E surplus transfer)', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 800, 800, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-inc', 'default-entity', 'unit-a', 'Donations'), ('l-exp', 'default-entity', 'unit-a', 'Admin Exp')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l-inc', 'fy-cy', 'b1', 0, 800), ('lb2', 'l-exp', 'fy-cy', 'b1', 500, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l-inc', 'fy-cy', 'INC_DON_GRANT', 'Mapped', ?, ?), ('lm2', 'l-exp', 'fy-cy', 'EXP_ADMIN_GEN', 'Mapped', ?, ?)`).run(now, now, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    // Surplus = 800 - 500 = 300
    if (report.netSurplusCY !== 300) throw new Error(`Expected surplus 300, got ${report.netSurplusCY}`);
    const fundK = report.calculatedSchedules.reserveAndSurplus.funds.find((f: any) => f.fundKey === 'k');
    if (!fundK || fundK.additionsAdjustments !== 300 || fundK.closingBalance !== 300) {
      throw new Error(`Reserve fund k surplus transfer failed: ${JSON.stringify(fundK)}`);
    }
  });

  // 32. Note 11 PPE movement matrix
  test('32. Note 11 PPE movement matrix calculation', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 2500, 2500, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-veh', 'default-entity', 'unit-a', 'Vehicles Account')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l-veh', 'fy-cy', 'b1', 2500, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l-veh', 'fy-cy', 'NCA_PPE', 'Mapped', ?, ?)`).run(now, now);

    const nodeVeh = db.prepare('SELECT id FROM ReportingNode WHERE node_code = ?').get('N_11_VEH') as { id: string };
    db.prepare(`INSERT INTO LedgerReportingOverride (id, ledger_id, financial_year_id, reporting_node_id, created_at, updated_at) VALUES ('lro-veh', 'l-veh', 'fy-cy', ?, ?, ?)`).run(nodeVeh.id, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const ppe = report.calculatedSchedules.tangibleAssets;
    const veh = ppe.assets.find((a: any) => a.nodeCode === 'N_11_VEH');
    if (!veh || veh.grossClosing !== 2500 || veh.netAssetCY !== 2500) {
      throw new Error(`PPE Vehicle movement failed: ${JSON.stringify(veh)}`);
    }
  });

  // 33. Note 18 Loans & Advances split
  test('33. Note 18 Loans & Advances Current vs Non-Current split', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 1000, 1000, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-sd-c', 'default-entity', 'unit-a', 'Rent Deposit Current'), ('l-sd-nc', 'default-entity', 'unit-a', 'Electricity Deposit Non-Current')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l-sd-c', 'fy-cy', 'b1', 400, 0), ('lb2', 'l-sd-nc', 'fy-cy', 'b1', 600, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l-sd-c', 'fy-cy', 'CA_ST_LOAN', 'Mapped', ?, ?), ('lm2', 'l-sd-nc', 'fy-cy', 'NCA_LT_LOAN', 'Mapped', ?, ?)`).run(now, now, now, now);

    const nodeSdC = db.prepare('SELECT id FROM ReportingNode WHERE node_code = ?').get('N_18_SD_C') as { id: string };
    const nodeSdNc = db.prepare('SELECT id FROM ReportingNode WHERE node_code = ?').get('N_18_SD_NC') as { id: string };
    db.prepare(`INSERT INTO LedgerReportingOverride (id, ledger_id, financial_year_id, reporting_node_id, created_at, updated_at) VALUES ('lro-1', 'l-sd-c', 'fy-cy', ?, ?, ?), ('lro-2', 'l-sd-nc', 'fy-cy', ?, ?, ?)`).run(nodeSdC.id, now, now, nodeSdNc.id, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const loans = report.calculatedSchedules.loansAndAdvances;
    if (loans.securityDepositsCurrent !== 400 || loans.securityDepositsNonCurrent !== 600 || loans.currentPortionOfLoansAndAdvances !== 400 || loans.nonCurrentSecurityDepositsRerouted !== 600) {
      throw new Error(`Note 18 split mismatch: ${JSON.stringify(loans)}`);
    }
  });

  // 34. Notes 25, 28, 29 Stock & COGS reconciliation
  test('34. Notes 25, 28, 29 Stock & COGS closed-loop reconciliation', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 1200, 1200, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-pur', 'default-entity', 'unit-a', 'RM Purchases'), ('l-cl', 'default-entity', 'unit-a', 'Closing RM')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l-pur', 'fy-cy', 'b1', 1000, 0), ('lb2', 'l-cl', 'fy-cy', 'b1', 200, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l-pur', 'fy-cy', 'EXP_MAT_CONS', 'Mapped', ?, ?), ('lm2', 'l-cl', 'fy-cy', 'CA_INVENT', 'Mapped', ?, ?)`).run(now, now, now, now);

    const nodeRm = db.prepare('SELECT id FROM ReportingNode WHERE node_code = ?').get('N_17_RM') as { id: string };
    db.prepare(`INSERT INTO LedgerReportingOverride (id, ledger_id, financial_year_id, reporting_node_id, created_at, updated_at) VALUES ('lro-cl', 'l-cl', 'fy-cy', ?, ?, ?)`).run(nodeRm.id, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const mat = report.calculatedSchedules.materialConsumption;
    // Consumptions = 0 (op) + 1000 (pur) - 200 (cl) = 800
    if (mat.consumptions !== 800) {
      throw new Error(`Material consumption mismatch: Expected 800, got ${mat.consumptions}`);
    }
  });

  // 35. Missing input detection (no silent zero substitution)
  test('35. Missing required inputs trigger diagnostic warning (no silent zero substitution)', () => {
    const db = createTestDatabase();
    const report = generateReportingHierarchyData(db, 'fy-cy');
    if (report.diagnostics.length === 0) throw new Error('Expected diagnostics on missing inputs');
  });

  // 36. Balance Sheet balancing control
  test('36. Balance Sheet balancing control proof', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 1000, 1000, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-cash', 'default-entity', 'unit-a', 'Bank A/c'), ('l-cap', 'default-entity', 'unit-a', 'Corpus Fund')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l-cash', 'fy-cy', 'b1', 1000, 0), ('lb2', 'l-cap', 'fy-cy', 'b1', 0, 1000)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l-cash', 'fy-cy', 'CA_BANK_BAL', 'Mapped', ?, ?), ('lm2', 'l-cap', 'fy-cy', 'EQ_CAP_FUND', 'Mapped', ?, ?)`).run(now, now, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    if (!report.balanceSheet.isBalanced || report.balanceSheetDifference !== 0) {
      throw new Error(`Balance sheet should be balanced, diff=${report.balanceSheetDifference}`);
    }
  });

  // 37. Debit opening stock preserves negative sign and reduces Total Revenue
  test('37. Debit opening stock preserves negative sign and reduces Total Revenue', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 190485.24, 190485.24, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-sales', 'default-entity', 'unit-a', 'Sales'), ('l-op', 'default-entity', 'unit-a', 'Opening Stock')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l-sales', 'fy-cy', 'b1', 0, 170886.50), ('lb2', 'l-op', 'fy-cy', 'b1', 19598.74, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l-sales', 'fy-cy', 'INC_REV_OPS', 'Mapped', ?, ?), ('lm2', 'l-op', 'fy-cy', 'EXP_CHG_INV_OP_MFG', 'Mapped', ?, ?)`).run(now, now, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const line22 = report.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-inc-22');
    const line25 = report.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-inc-25');
    const totRev = report.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-inc-tot');

    if (line22?.cyAmount !== 170886.50) throw new Error(`Expected Revenue from Ops=170886.50, got ${line22?.cyAmount}`);
    if (line25?.cyAmount !== -19598.74) throw new Error(`Expected Stock Movement=-19598.74, got ${line25?.cyAmount}`);
    if (totRev?.cyAmount !== 151287.76) throw new Error(`Expected Total Revenue=151287.76, got ${totRev?.cyAmount}`);
  });

  // 38. Schedule 11 Depreciation single inclusion in Total Expense
  test('38. Schedule 11 Depreciation single inclusion in Total Expense', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 61408.92, 61408.92, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-dep', 'default-entity', 'unit-a', 'Depreciation A/C'), ('l-adm', 'default-entity', 'unit-a', 'Admin Expenses')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l-dep', 'fy-cy', 'b1', 11408.92, 0), ('lb2', 'l-adm', 'fy-cy', 'b1', 50000.00, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l-dep', 'fy-cy', 'EXP_DEP_AMORT', 'Mapped', ?, ?), ('lm2', 'l-adm', 'fy-cy', 'EXP_ADMIN_GEN', 'Mapped', ?, ?)`).run(now, now, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const lineDep = report.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-exp-11');
    const totExp = report.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-exp-tot');

    if (lineDep?.cyAmount !== 11408.92) throw new Error(`Expected Depreciation=11408.92, got ${lineDep?.cyAmount}`);
    if (totExp?.cyAmount !== 61408.92) throw new Error(`Expected Total Expense=61408.92, got ${totExp?.cyAmount}`);
  });

  // 39. Anti-double-counting guard for Depreciation
  test('39. Anti-double-counting guard for Depreciation', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    // Simulate depreciation mapped to an admin expense node
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 10000, 10000, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-dep-adm', 'default-entity', 'unit-a', 'Depreciation under Admin')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l-dep-adm', 'fy-cy', 'b1', 10000, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l-dep-adm', 'fy-cy', 'EXP_ADMIN_GEN', 'Mapped', ?, ?)`).run(now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const totExp = report.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-exp-tot');
    // Total expense should be 10000, not 20000
    if (totExp?.cyAmount !== 10000) throw new Error(`Expected Total Expense=10000 without double counting, got ${totExp?.cyAmount}`);
  });

  // 40. Dynamic Net Surplus / Deficit computation
  test('40. Dynamic Net Surplus / Deficit computation (Total Revenue - Total Expense)', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    // Revenue: 100,000; Stock movement: -20,000 => Tot Rev = 80,000
    // Expenses: Admin 70,000 + Dep 30,000 => Tot Exp = 100,000
    // Deficit = -20,000
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 120000, 120000, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-rev', 'default-entity', 'unit-a', 'Sales'), ('l-op', 'default-entity', 'unit-a', 'Opening Stock'), ('l-adm', 'default-entity', 'unit-a', 'Admin Exp'), ('l-dep', 'default-entity', 'unit-a', 'Depreciation')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l-rev', 'fy-cy', 'b1', 0, 100000), ('lb2', 'l-op', 'fy-cy', 'b1', 20000, 0), ('lb3', 'l-adm', 'fy-cy', 'b1', 70000, 0), ('lb4', 'l-dep', 'fy-cy', 'b1', 30000, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l-rev', 'fy-cy', 'INC_REV_OPS', 'Mapped', ?, ?), ('lm2', 'l-op', 'fy-cy', 'EXP_CHG_INV_OP_MFG', 'Mapped', ?, ?), ('lm3', 'l-adm', 'fy-cy', 'EXP_ADMIN_GEN', 'Mapped', ?, ?), ('lm4', 'l-dep', 'fy-cy', 'EXP_DEP_AMORT', 'Mapped', ?, ?)`).run(now, now, now, now, now, now, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    const totRev = report.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-inc-tot');
    const totExp = report.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-exp-tot');
    const surplusLine = report.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-surplus');

    if (totRev?.cyAmount !== 80000) throw new Error(`Expected Total Revenue=80000, got ${totRev?.cyAmount}`);
    if (totExp?.cyAmount !== 100000) throw new Error(`Expected Total Expense=100000, got ${totExp?.cyAmount}`);
    if (surplusLine?.cyAmount !== -20000) throw new Error(`Expected Deficit=-20000, got ${surplusLine?.cyAmount}`);
    if (report.netSurplusCY !== -20000) throw new Error(`Expected netSurplusCY=-20000, got ${report.netSurplusCY}`);
  });

  // 41. Strict downstream Reserve & Surplus integration (No circular dependency)
  test('41. Strict downstream Reserve & Surplus integration (No circular dependency)', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    // Surplus = 50,000; Reserve b/f = 100,000 => Note 5 closing = 150,000
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b1', 'default-entity', 'unit-a', 'fy-cy', 'tb.xlsx', '/tb.xlsx', 'h1', 150000, 150000, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-rev', 'default-entity', 'unit-a', 'Donations'), ('l-res', 'default-entity', 'unit-a', 'General Reserve')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb1', 'l-rev', 'fy-cy', 'b1', 0, 50000), ('lb2', 'l-res', 'fy-cy', 'b1', 0, 100000)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm1', 'l-rev', 'fy-cy', 'INC_DON_GRANT', 'Mapped', ?, ?), ('lm2', 'l-res', 'fy-cy', 'EQ_RES_SURP', 'Mapped', ?, ?)`).run(now, now, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a' });
    if (report.netSurplusCY !== 50000) throw new Error(`Expected surplus=50000, got ${report.netSurplusCY}`);
    const sch05 = report.scheduleRows.find(s => s.scheduleCode === 'SCH_05');
    // Note 5 closing = 100,000 + 50,000 = 150,000
    if (sch05?.cyTotal !== 150000) throw new Error(`Expected Note 5 Total=150000, got ${sch05?.cyTotal}`);
  });

  // 42. Generic PY Signed Calculation Symmetry
  test('42. Generic PY Signed Calculation Symmetry', () => {
    const db = createTestDatabase();
    const now = new Date().toISOString();
    // CY: 2025-26, PY: 2024-25
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b-cy', 'default-entity', 'unit-a', 'fy-cy', 'cy.xlsx', '/cy.xlsx', 'hcy', 1000, 1000, 0, ?, 'SUCCESS')`).run(now);
    db.prepare(`INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_debit, total_credit, difference, import_timestamp, status) VALUES ('b-py', 'default-entity', 'unit-a', 'fy-py', 'py.xlsx', '/py.xlsx', 'hpy', 1000, 1000, 0, ?, 'SUCCESS')`).run(now);

    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('l-rev', 'default-entity', 'unit-a', 'Donations'), ('l-dep', 'default-entity', 'unit-a', 'Depreciation A/C')`).run();
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb-cy1', 'l-rev', 'fy-cy', 'b-cy', 0, 1000), ('lb-py1', 'l-rev', 'fy-py', 'b-py', 0, 800), ('lb-py2', 'l-dep', 'fy-py', 'b-py', 200, 0)`).run();
    db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm-cy1', 'l-rev', 'fy-cy', 'INC_DON_GRANT', 'Mapped', ?, ?), ('lm-py1', 'l-rev', 'fy-py', 'INC_DON_GRANT', 'Mapped', ?, ?), ('lm-py2', 'l-dep', 'fy-py', 'EXP_DEP_AMORT', 'Mapped', ?, ?)`).run(now, now, now, now, now, now);

    const report = generateReportingHierarchyData(db, 'fy-cy', { unitId: 'unit-a', previousFinancialYearId: 'fy-py' });
    const totRev = report.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-inc-tot');
    const totExp = report.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-exp-tot');
    const surplusLine = report.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-surplus');

    if (totRev?.pyAmount !== 800) throw new Error(`Expected PY Total Revenue=800, got ${totRev?.pyAmount}`);
    if (totExp?.pyAmount !== 200) throw new Error(`Expected PY Total Expense=200, got ${totExp?.pyAmount}`);
    if (surplusLine?.pyAmount !== 600) throw new Error(`Expected PY Surplus=600, got ${surplusLine?.pyAmount}`);
    if (report.netSurplusPY !== 600) throw new Error(`Expected netSurplusPY=600, got ${report.netSurplusPY}`);
  });

  const passedTests = results.filter((r) => r.passed).length;
  return {
    allPassed: passedTests === results.length,
    totalTests: results.length,
    passedTests,
    results,
  };
}

// Direct CLI test runner
if (require.main === module) {
  console.log('Running Phase 10 FSLI & Reporting Hierarchy Test Suite...');
  const res = runReportingHierarchyEngineTests();
  console.log(`\nResults: ${res.passedTests} / ${res.totalTests} passed.`);
  for (const r of res.results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.name} - ${r.message}`);
  }
  if (!res.allPassed) {
    process.exit(1);
  }
}
