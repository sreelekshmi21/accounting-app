/**
 * Phase 9: Consolidation & Interbranch Elimination Test Suite
 *
 * 34 comprehensive automated tests covering:
 * - Multi-layer internal account detection (hierarchy of evidence)
 * - Sundry Debtors safeguard (not auto-treated as internal)
 * - Selected-unit scope enforcement
 * - Single FY scope enforcement
 * - Duplicate elimination prevention (one relationship = one elimination)
 * - Counterparty identification (reciprocal, HO, Branch/Division)
 * - Match status computation (Exact, Partial, Single-sided, Same-side)
 * - Elimination CRUD & workflow (Draft → PendingReview → Approved → Applied)
 * - Elimination immutability after application & reversal support
 * - Consolidated Trial Balance computation & internal controls
 * - Unit Balance Sheet / Trial Balance isolation guarantee (Phase 5-8 immutability)
 * - Consolidation run lifecycle (Draft → InProgress → Completed / Cancelled)
 * - Full audit trail verification
 * - 35+ Unit multi-unit consolidation stress scenario
 */

import Database from 'better-sqlite3';
import {
  createConsolidationRun,
  runInternalBalanceDetection,
  createElimination,
  updateElimination,
  deleteElimination,
  submitEliminationForReview,
  approveElimination,
  rejectElimination,
  applyElimination,
  reverseElimination,
  completeConsolidationRun,
  cancelConsolidationRun,
  getConsolidatedTrialBalance,
  getConsolidatedBalanceSheetPreview,
  getEliminationReviewData,
  getConsolidationAuditHistory,
  getConsolidationWorkbenchData,
} from './consolidation-engine';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

/**
 * Creates an in-memory SQLite database initialized with all tables up to Phase 9.
 */
function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE Client (
      id TEXT PRIMARY KEY, client_name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE Entity (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL, entity_name TEXT NOT NULL,
      entity_type TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE FinancialYear (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, year_label TEXT NOT NULL,
      start_date TEXT NOT NULL, end_date TEXT NOT NULL, is_closed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE Unit (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, unit_code TEXT, unit_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE TallyGroup (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, group_name TEXT NOT NULL,
      parent_group_id TEXT, primary_group_type TEXT, is_revenue INTEGER NOT NULL DEFAULT 0,
      is_deemed_positive INTEGER NOT NULL DEFAULT 1, affects_gross_profit INTEGER NOT NULL DEFAULT 0,
      sort_position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE FSLI (
      id TEXT PRIMARY KEY, fsli_code TEXT, fsli_name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('Asset','Liability','Equity','Income','Expense')),
      sub_category TEXT, normal_balance TEXT NOT NULL CHECK(normal_balance IN ('Debit','Credit')),
      display_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'SYSTEM', parent_fsli_id TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE Ledger (
      id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, tally_group_id TEXT,
      ledger_name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE LedgerBalance (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL,
      opening_balance REAL NOT NULL DEFAULT 0, debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0, closing_balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE LedgerMapping (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL,
      mapped_fsli_id TEXT, mapping_rule_id TEXT, mapping_source TEXT NOT NULL DEFAULT 'UserMapping',
      confidence_score REAL, is_manual_override INTEGER NOT NULL DEFAULT 0,
      approved_by TEXT, approved_at TEXT, status TEXT NOT NULL DEFAULT 'Unmapped',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE LedgerClassification (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL,
      original_tally_classification TEXT, application_classification TEXT,
      child_fsli_id TEXT, parent_fsli_id TEXT, final_fsli_id TEXT,
      classification_source TEXT NOT NULL DEFAULT 'PENDING', confidence_score REAL DEFAULT 0,
      reason TEXT, is_manual_override INTEGER NOT NULL DEFAULT 0,
      approved_by TEXT, approved_at TEXT, status TEXT NOT NULL DEFAULT 'Unclassified',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE RegroupingResult (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, unit_id TEXT NOT NULL,
      entity_id TEXT NOT NULL, financial_year_id TEXT NOT NULL,
      before_classification TEXT, before_fsli_id TEXT, before_fsli_name TEXT,
      proposed_classification TEXT, proposed_fsli_id TEXT, proposed_fsli_name TEXT,
      approved_classification TEXT, approved_fsli_id TEXT, approved_fsli_name TEXT,
      balance_debit REAL NOT NULL DEFAULT 0, balance_credit REAL NOT NULL DEFAULT 0,
      balance_net REAL NOT NULL DEFAULT 0, balance_nature TEXT NOT NULL,
      tally_group_name TEXT, ledger_name TEXT NOT NULL, reason TEXT,
      rule_id TEXT, rule_name TEXT, confidence REAL NOT NULL DEFAULT 0,
      detection_confidence REAL NOT NULL DEFAULT 1.0, recommendation_confidence REAL NOT NULL DEFAULT 0.85,
      status TEXT NOT NULL DEFAULT 'Detected', approved_by TEXT, approved_at TEXT,
      applied_by TEXT, applied_at TEXT, undone_by TEXT, undone_at TEXT,
      undo_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE Adjustment (
      id TEXT PRIMARY KEY, adjustment_number TEXT NOT NULL, entity_id TEXT NOT NULL,
      unit_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, adjustment_date TEXT NOT NULL,
      adjustment_type TEXT NOT NULL, narration TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Draft',
      total_debit REAL NOT NULL DEFAULT 0, total_credit REAL NOT NULL DEFAULT 0,
      is_closing_stock INTEGER NOT NULL DEFAULT 0, closing_stock_value REAL,
      reversal_of_id TEXT, reversed_by_id TEXT, created_by TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, submitted_by TEXT, submitted_at TEXT, approved_by TEXT,
      approved_at TEXT, rejected_by TEXT, rejected_at TEXT, rejection_reason TEXT,
      applied_by TEXT, applied_at TEXT, reversed_by TEXT, reversed_at TEXT, reversal_reason TEXT
    );
    CREATE TABLE AdjustmentLine (
      id TEXT PRIMARY KEY, adjustment_id TEXT NOT NULL, line_number INTEGER NOT NULL,
      ledger_id TEXT, ledger_name TEXT NOT NULL, fsli_id TEXT NOT NULL,
      fsli_name TEXT NOT NULL, fsli_code TEXT, fsli_category TEXT,
      debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, description TEXT
    );

    -- Phase 9 tables
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
  `);

  // Seed standard entity, FY, FSLIs
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO Entity (id, client_id, entity_name, entity_type, created_at) VALUES ('default-entity', 'default-client', 'Santhigiri Ashram', 'Trust', ?)`).run(now);
  db.prepare(`INSERT INTO FinancialYear (id, entity_id, year_label, start_date, end_date, created_at) VALUES ('fy-2025-26', 'default-entity', '2025-26', '2025-04-01', '2026-03-31', ?)`).run(now);
  db.prepare(`INSERT INTO FinancialYear (id, entity_id, year_label, start_date, end_date, created_at) VALUES ('fy-2024-25', 'default-entity', '2024-25', '2024-04-01', '2025-03-31', ?)`).run(now);

  // FSLIs
  const fslis = [
    { id: 'fsli-cash', code: '101', name: 'Cash and Cash Equivalents', category: 'Asset', normal: 'Debit', order: 1 },
    { id: 'fsli-bank', code: '102', name: 'Bank Balances', category: 'Asset', normal: 'Debit', order: 2 },
    { id: 'fsli-debtors', code: '103', name: 'Trade Receivables / Sundry Debtors', category: 'Asset', normal: 'Debit', order: 3 },
    { id: 'fsli-branch-asset', code: '104', name: 'Branch / Division Receivables', category: 'Asset', normal: 'Debit', order: 4 },
    { id: 'fsli-creditors', code: '201', name: 'Trade Payables / Sundry Creditors', category: 'Liability', normal: 'Credit', order: 5 },
    { id: 'fsli-branch-liab', code: '202', name: 'Branch / Division Payables', category: 'Liability', normal: 'Credit', order: 6 },
    { id: 'fsli-corpus', code: '301', name: 'Corpus / Capital Fund', category: 'Equity', normal: 'Credit', order: 7 },
    { id: 'fsli-sales', code: '401', name: 'Sales / Revenue', category: 'Income', normal: 'Credit', order: 8 },
    { id: 'fsli-expenses', code: '501', name: 'Operating Expenses', category: 'Expense', normal: 'Debit', order: 9 },
  ];
  for (const f of fslis) {
    db.prepare(`
      INSERT INTO FSLI (id, fsli_code, fsli_name, category, normal_balance, display_order, active, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'SYSTEM', ?, ?)
    `).run(f.id, f.code, f.name, f.category, f.normal, f.order, now, now);
  }

  // Tally Groups
  db.prepare(`INSERT INTO TallyGroup (id, entity_id, group_name, created_at) VALUES ('tg-branch-div', 'default-entity', 'Branch / Divisions', ?)`).run(now);
  db.prepare(`INSERT INTO TallyGroup (id, entity_id, group_name, created_at) VALUES ('tg-debtors', 'default-entity', 'Sundry Debtors', ?)`).run(now);
  db.prepare(`INSERT INTO TallyGroup (id, entity_id, group_name, created_at) VALUES ('tg-creditors', 'default-entity', 'Sundry Creditors', ?)`).run(now);
  db.prepare(`INSERT INTO TallyGroup (id, entity_id, group_name, created_at) VALUES ('tg-cash', 'default-entity', 'Cash-in-hand', ?)`).run(now);

  // Seed two default units: Unit A (Kollam) and Unit B (Kozhikode)
  db.prepare(`INSERT INTO Unit (id, entity_id, unit_code, unit_name, created_at) VALUES ('unit-kollam', 'default-entity', 'KLM', 'Kollam Branch', ?)`).run(now);
  db.prepare(`INSERT INTO Unit (id, entity_id, unit_code, unit_name, created_at) VALUES ('unit-kozhikode', 'default-entity', 'KKD', 'Kozhikode Branch', ?)`).run(now);
  db.prepare(`INSERT INTO Unit (id, entity_id, unit_code, unit_name, created_at) VALUES ('unit-ho', 'default-entity', 'HO', 'Head Office Ashram', ?)`).run(now);
  db.prepare(`INSERT INTO Unit (id, entity_id, unit_code, unit_name, created_at) VALUES ('unit-out-of-scope', 'default-entity', 'OOS', 'Out of Scope Branch', ?)`).run(now);

  return db;
}

export function runConsolidationEngineTests(): {
  allPassed: boolean;
  totalTests: number;
  passedTests: number;
  results: TestResult[];
} {
  const results: TestResult[] = [];
  const now = new Date().toISOString();

  function test(name: string, fn: (db: Database.Database) => void): void {
    const db = createTestDatabase();
    try {
      fn(db);
      results.push({ name, passed: true, message: 'Passed' });
    } catch (err: any) {
      results.push({ name, passed: false, message: err?.message || String(err) });
    }
  }

  // Helper to add ledger with balance
  function addLedger(
    db: Database.Database,
    id: string,
    unitId: string,
    tallyGroupId: string | null,
    name: string,
    fyId: string,
    debit: number,
    credit: number,
    fsliId?: string,
  ): void {
    db.prepare(`INSERT INTO Ledger (id, unit_id, tally_group_id, ledger_name, created_at) VALUES (?, ?, ?, ?, ?)`).run(id, unitId, tallyGroupId, name, now);
    db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, opening_balance, debit, credit, closing_balance, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`).run(`lb-${id}`, id, fyId, debit, credit, debit - credit, now, now);
    if (fsliId) {
      db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, mapping_source, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'UserMapping', 'Mapped', ?, ?)`).run(`lm-${id}`, id, fyId, fsliId, now, now);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Section 1: Multi-Layer Detection (T1 - T5)
  // ══════════════════════════════════════════════════════════════════════════════

  test('T01: Branch/Divisions Tally Group gives high confidence detection', (db) => {
    addLedger(db, 'l-1', 'unit-kollam', 'tg-branch-div', 'Kozhikode Branch Divn A/c', 'fy-2025-26', 50000, 0, 'fsli-branch-asset');
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const res = runInternalBalanceDetection(db, run.id);
    if (res.detectedCount !== 1) throw new Error(`Expected 1 detected, got ${res.detectedCount}`);
    const review = getEliminationReviewData(db, run.id);
    if (review.rows[0].confidence < 0.5) throw new Error(`Expected confidence >= 0.5, got ${review.rows[0].confidence}`);
    if (review.rows[0].internalAccountType !== 'Branch/Division') throw new Error(`Wrong type: ${review.rows[0].internalAccountType}`);
  });

  test('T02: Santhigiri Ashram HO pattern detected as HO internal', (db) => {
    addLedger(db, 'l-2', 'unit-kollam', null, 'Santhigiri Ashram Head Office Current A/c', 'fy-2025-26', 100000, 0, 'fsli-branch-asset');
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-ho'] });
    const res = runInternalBalanceDetection(db, run.id);
    if (res.detectedCount !== 1) throw new Error(`Expected 1 detected, got ${res.detectedCount}`);
    const review = getEliminationReviewData(db, run.id);
    if (review.rows[0].internalAccountType !== 'Santhigiri Ashram HO') throw new Error(`Wrong type: ${review.rows[0].internalAccountType}`);
  });

  test('T03: Branch/Division pattern without Tally Group detected as Branch/Division', (db) => {
    addLedger(db, 'l-3', 'unit-kollam', null, 'Branch Divn - Kozhikode', 'fy-2025-26', 25000, 0, 'fsli-branch-asset');
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const res = runInternalBalanceDetection(db, run.id);
    if (res.detectedCount !== 1) throw new Error(`Expected 1 detected, got ${res.detectedCount}`);
  });

  test('T04: Keyword-only match gives lower confidence resulting in NeedsReview', (db) => {
    addLedger(db, 'l-4', 'unit-kollam', null, 'Special Division Project', 'fy-2025-26', 15000, 0);
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const res = runInternalBalanceDetection(db, run.id);
    if (res.detectedCount !== 1) throw new Error(`Expected 1 detected, got ${res.detectedCount}`);
    const review = getEliminationReviewData(db, run.id);
    if (review.rows[0].matchStatus !== 'NeedsReview') throw new Error(`Expected NeedsReview, got ${review.rows[0].matchStatus}`);
  });

  test('T05: Ordinary external ledger is never detected as internal', (db) => {
    addLedger(db, 'l-5', 'unit-kollam', 'tg-cash', 'Cash In Hand', 'fy-2025-26', 10000, 0, 'fsli-cash');
    addLedger(db, 'l-6', 'unit-kollam', 'tg-creditors', 'ABC Suppliers Pvt Ltd', 'fy-2025-26', 0, 45000, 'fsli-creditors');
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const res = runInternalBalanceDetection(db, run.id);
    if (res.detectedCount !== 0) throw new Error(`Expected 0 detected, got ${res.detectedCount}`);
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Section 2: Safeguards (T6 - T10)
  // ══════════════════════════════════════════════════════════════════════════════

  test('T06: Sundry Debtors safeguard: ordinary external Sundry Debtors remain unchanged', (db) => {
    addLedger(db, 'l-sd-ext', 'unit-kollam', 'tg-debtors', 'Customer Ramesh Kumar', 'fy-2025-26', 75000, 0, 'fsli-debtors');
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const res = runInternalBalanceDetection(db, run.id);
    if (res.detectedCount !== 0) throw new Error(`Expected 0 detected for external Sundry Debtor, got ${res.detectedCount}`);
  });

  test('T07: Sundry Debtors with cross-unit relationship evidence is detected', (db) => {
    // Under Sundry Debtors, but references Kozhikode Branch explicitly
    addLedger(db, 'l-sd-rel', 'unit-kollam', 'tg-debtors', 'Kozhikode Branch Sundry Account', 'fy-2025-26', 30000, 0, 'fsli-debtors');
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const res = runInternalBalanceDetection(db, run.id);
    if (res.detectedCount !== 1) throw new Error(`Expected 1 detected with relationship evidence, got ${res.detectedCount}`);
  });

  test('T08: Strict Scope: Units outside consolidation run never participate', (db) => {
    addLedger(db, 'l-klm', 'unit-kollam', 'tg-branch-div', 'Kozhikode Branch Divn', 'fy-2025-26', 50000, 0, 'fsli-branch-asset');
    addLedger(db, 'l-oos', 'unit-out-of-scope', 'tg-branch-div', 'Kollam Branch Divn', 'fy-2025-26', 0, 50000, 'fsli-branch-liab');

    // Run created ONLY for Kollam and Kozhikode (unit-out-of-scope not selected)
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const res = runInternalBalanceDetection(db, run.id);

    // Only Kollam is in scope; out-of-scope unit is never detected or matched
    if (res.detectedCount !== 1) throw new Error(`Expected 1 detected (only Kollam), got ${res.detectedCount}`);
    const review = getEliminationReviewData(db, run.id);
    if (review.rows[0].counterpartyUnitId === 'unit-out-of-scope') {
      throw new Error('Out of scope unit participated in counterparty matching!');
    }
  });

  test('T09: FY Scope Isolation: Ledgers from other FYs never participate', (db) => {
    addLedger(db, 'l-fy26', 'unit-kollam', 'tg-branch-div', 'Kozhikode Branch', 'fy-2025-26', 50000, 0, 'fsli-branch-asset');
    addLedger(db, 'l-fy25', 'unit-kozhikode', 'tg-branch-div', 'Kollam Branch', 'fy-2024-25', 0, 50000, 'fsli-branch-liab');

    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const res = runInternalBalanceDetection(db, run.id);

    // Only FY 2025-26 ledger detected; FY 2024-25 ledger ignored
    if (res.detectedCount !== 1) throw new Error(`Expected 1 detected, got ${res.detectedCount}`);
    if (res.matchedCount !== 0) throw new Error(`Should not match against prior year ledger`);
  });

  test('T10: Duplicate Elimination Prevention: Reciprocal pair produces exactly ONE elimination', (db) => {
    // Unit A Dr 100,000 against Unit B
    addLedger(db, 'l-klm-b', 'unit-kollam', 'tg-branch-div', 'Kozhikode Branch Divn', 'fy-2025-26', 100000, 0, 'fsli-branch-asset');
    // Unit B Cr 100,000 against Unit A
    addLedger(db, 'l-kkd-a', 'unit-kozhikode', 'tg-branch-div', 'Kollam Branch Divn', 'fy-2025-26', 0, 100000, 'fsli-branch-liab');

    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const res = runInternalBalanceDetection(db, run.id);

    // Detection should create ONE elimination of ₹100,000, NOT TWO (£200,000)
    const review = getEliminationReviewData(db, run.id);
    if (review.summary.totalDetected !== 1) {
      throw new Error(`Expected exactly 1 elimination pair, got ${review.summary.totalDetected}`);
    }
    if (review.summary.totalProposedElimination !== 100000) {
      throw new Error(`Expected total proposed elimination 100,000, got ${review.summary.totalProposedElimination}`);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Section 3: Counterparty Matching & Match Status (T11 - T15)
  // ══════════════════════════════════════════════════════════════════════════════

  test('T11: Reciprocal name matching resolves counterparty correctly', (db) => {
    addLedger(db, 'l-a1', 'unit-kollam', 'tg-branch-div', 'Kozhikode Branch Account', 'fy-2025-26', 60000, 0, 'fsli-branch-asset');
    addLedger(db, 'l-b1', 'unit-kozhikode', 'tg-branch-div', 'Kollam Branch Account', 'fy-2025-26', 0, 60000, 'fsli-branch-liab');

    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    runInternalBalanceDetection(db, run.id);
    const review = getEliminationReviewData(db, run.id);
    const row = review.rows[0];
    if (row.counterpartyUnitId !== 'unit-kozhikode') throw new Error(`Wrong counterparty: ${row.counterpartyUnitId}`);
    if (row.matchStatus !== 'Matched') throw new Error(`Expected Matched, got ${row.matchStatus}`);
  });

  test('T12: Exact Match: Equal Dr and Cr -> 100% eliminable, unmatched=0', (db) => {
    addLedger(db, 'l-em-a', 'unit-kollam', 'tg-branch-div', 'Kozhikode Branch Account', 'fy-2025-26', 80000, 0, 'fsli-branch-asset');
    addLedger(db, 'l-em-b', 'unit-kozhikode', 'tg-branch-div', 'Kollam Branch Account', 'fy-2025-26', 0, 80000, 'fsli-branch-liab');

    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    runInternalBalanceDetection(db, run.id);
    const review = getEliminationReviewData(db, run.id);
    const row = review.rows[0];
    if (row.proposedElimination !== 80000) throw new Error(`Expected proposed 80000, got ${row.proposedElimination}`);
    if (row.unmatchedDifference !== 0) throw new Error(`Expected 0 unmatched, got ${row.unmatchedDifference}`);
  });

  test('T13: Partial Match: Dr != Cr -> lower amount eliminable, difference reported', (db) => {
    // Unit A Dr 100,000 vs Unit B Cr 80,000 -> Diff 20,000
    addLedger(db, 'l-pm-a', 'unit-kollam', 'tg-branch-div', 'Kozhikode Branch Divn', 'fy-2025-26', 100000, 0, 'fsli-branch-asset');
    addLedger(db, 'l-pm-b', 'unit-kozhikode', 'tg-branch-div', 'Kollam Branch Divn', 'fy-2025-26', 0, 80000, 'fsli-branch-liab');

    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    runInternalBalanceDetection(db, run.id);
    const review = getEliminationReviewData(db, run.id);
    const row = review.rows[0];
    if (row.matchStatus !== 'PartiallyMatched') throw new Error(`Expected PartiallyMatched, got ${row.matchStatus}`);
    if (row.proposedElimination !== 80000) throw new Error(`Expected proposed 80000, got ${row.proposedElimination}`);
    if (row.unmatchedDifference !== 20000) throw new Error(`Expected unmatched 20000, got ${row.unmatchedDifference}`);
  });

  test('T14: Single-Sided Balance (no counterparty): NeedsReview, 0 eliminable, 100% difference', (db) => {
    // Unit A has Dr 50,000 against Kozhikode, but Kozhikode has NO balance against Kollam
    addLedger(db, 'l-ss', 'unit-kollam', 'tg-branch-div', 'Kozhikode Branch Divn', 'fy-2025-26', 50000, 0, 'fsli-branch-asset');

    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    runInternalBalanceDetection(db, run.id);
    const review = getEliminationReviewData(db, run.id);
    const row = review.rows[0];
    if (row.matchStatus !== 'NeedsReview') throw new Error(`Expected NeedsReview, got ${row.matchStatus}`);
    if (row.proposedElimination !== 0) throw new Error(`Expected proposed 0, got ${row.proposedElimination}`);
    if (row.unmatchedDifference !== 50000) throw new Error(`Expected unmatched 50000, got ${row.unmatchedDifference}`);
  });

  test('T15: Same-side balances (both Dr): NeedsReview, 0 proposed elimination', (db) => {
    // Both Unit A and Unit B have Debit balances against each other
    addLedger(db, 'l-sd-a', 'unit-kollam', 'tg-branch-div', 'Kozhikode Branch Divn', 'fy-2025-26', 40000, 0, 'fsli-branch-asset');
    addLedger(db, 'l-sd-b', 'unit-kozhikode', 'tg-branch-div', 'Kollam Branch Divn', 'fy-2025-26', 40000, 0, 'fsli-branch-asset');

    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    runInternalBalanceDetection(db, run.id);
    const review = getEliminationReviewData(db, run.id);
    const row = review.rows[0];
    if (row.matchStatus !== 'NeedsReview') throw new Error(`Expected NeedsReview, got ${row.matchStatus}`);
    if (row.proposedElimination !== 0) throw new Error(`Expected 0 proposed elimination, got ${row.proposedElimination}`);
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Section 4: Elimination CRUD & Workflow (T16 - T23)
  // ══════════════════════════════════════════════════════════════════════════════

  test('T16: Draft creation allows edit and delete', (db) => {
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const elim = createElimination(db, {
      consolidationRunId: run.id,
      sourceUnitId: 'unit-kollam',
      counterpartyUnitId: 'unit-kozhikode',
      sourceLedgerName: 'Manual Branch Inter A/c',
      internalAccountType: 'Branch/Division',
      debitAmount: 10000,
      creditAmount: 0,
      eliminatedAmount: 10000,
      unmatchedAmount: 0,
    });
    if (elim.status !== 'Draft') throw new Error(`Expected Draft, got ${elim.status}`);

    const updated = updateElimination(db, elim.id, { debitAmount: 15000, eliminatedAmount: 15000 });
    if (updated.debitAmount !== 15000) throw new Error(`Update failed: ${updated.debitAmount}`);

    const deleted = deleteElimination(db, elim.id);
    if (!deleted) throw new Error('Delete failed');
  });

  test('T17: Submit for review transitions status to PendingReview', (db) => {
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const elim = createElimination(db, {
      consolidationRunId: run.id,
      sourceUnitId: 'unit-kollam',
      sourceLedgerName: 'Test Elimination',
      internalAccountType: 'Branch/Division',
      debitAmount: 5000,
      creditAmount: 0,
      eliminatedAmount: 5000,
      unmatchedAmount: 0,
    });
    const submitted = submitEliminationForReview(db, elim.id, 'User1');
    if (submitted.status !== 'PendingReview') throw new Error(`Expected PendingReview, got ${submitted.status}`);
  });

  test('T18: Approve elimination transitions status to Approved', (db) => {
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const elim = createElimination(db, {
      consolidationRunId: run.id,
      sourceUnitId: 'unit-kollam',
      sourceLedgerName: 'Test Elimination',
      internalAccountType: 'Branch/Division',
      debitAmount: 5000,
      creditAmount: 0,
      eliminatedAmount: 5000,
      unmatchedAmount: 0,
    });
    submitEliminationForReview(db, elim.id, 'User1');
    const approved = approveElimination(db, elim.id, 'Auditor1');
    if (approved.status !== 'Approved') throw new Error(`Expected Approved, got ${approved.status}`);
  });

  test('T19: Reject elimination requires mandatory reason', (db) => {
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const elim = createElimination(db, {
      consolidationRunId: run.id,
      sourceUnitId: 'unit-kollam',
      sourceLedgerName: 'Test Elimination',
      internalAccountType: 'Branch/Division',
      debitAmount: 5000,
      creditAmount: 0,
      eliminatedAmount: 5000,
      unmatchedAmount: 0,
    });
    submitEliminationForReview(db, elim.id, 'User1');

    let threw = false;
    try {
      rejectElimination(db, elim.id, '');
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Rejecting without reason should throw');

    const rejected = rejectElimination(db, elim.id, 'Counterparty balance disputed', 'Auditor1');
    if (rejected.status !== 'Rejected') throw new Error(`Expected Rejected, got ${rejected.status}`);
    if (rejected.rejectionReason !== 'Counterparty balance disputed') throw new Error('Rejection reason not stored');
  });

  test('T20: Apply elimination transitions status to Applied', (db) => {
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const elim = createElimination(db, {
      consolidationRunId: run.id,
      sourceUnitId: 'unit-kollam',
      sourceLedgerName: 'Test Elimination',
      internalAccountType: 'Branch/Division',
      debitAmount: 5000,
      creditAmount: 0,
      eliminatedAmount: 5000,
      unmatchedAmount: 0,
    });
    submitEliminationForReview(db, elim.id, 'User1');
    approveElimination(db, elim.id, 'Auditor1');
    const applied = applyElimination(db, elim.id, 'Auditor1');
    if (applied.status !== 'Applied') throw new Error(`Expected Applied, got ${applied.status}`);
  });

  test('T21: Applied elimination is immutable (cannot be edited)', (db) => {
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const elim = createElimination(db, {
      consolidationRunId: run.id,
      sourceUnitId: 'unit-kollam',
      sourceLedgerName: 'Test Elimination',
      internalAccountType: 'Branch/Division',
      debitAmount: 5000,
      creditAmount: 0,
      eliminatedAmount: 5000,
      unmatchedAmount: 0,
    });
    submitEliminationForReview(db, elim.id);
    approveElimination(db, elim.id);
    applyElimination(db, elim.id);

    let threw = false;
    try {
      updateElimination(db, elim.id, { debitAmount: 9999 });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Editing Applied elimination should throw');
  });

  test('T22: Applied elimination is immutable (cannot be deleted)', (db) => {
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const elim = createElimination(db, {
      consolidationRunId: run.id,
      sourceUnitId: 'unit-kollam',
      sourceLedgerName: 'Test Elimination',
      internalAccountType: 'Branch/Division',
      debitAmount: 5000,
      creditAmount: 0,
      eliminatedAmount: 5000,
      unmatchedAmount: 0,
    });
    submitEliminationForReview(db, elim.id);
    approveElimination(db, elim.id);
    applyElimination(db, elim.id);

    let threw = false;
    try {
      deleteElimination(db, elim.id);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Deleting Applied elimination should throw');
  });

  test('T23: Reverse elimination creates linked inverse entry with audit trail', (db) => {
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const elim = createElimination(db, {
      consolidationRunId: run.id,
      sourceUnitId: 'unit-kollam',
      sourceLedgerName: 'Test Elimination',
      internalAccountType: 'Branch/Division',
      debitAmount: 5000,
      creditAmount: 0,
      eliminatedAmount: 5000,
      unmatchedAmount: 0,
    });
    submitEliminationForReview(db, elim.id);
    approveElimination(db, elim.id);
    applyElimination(db, elim.id);

    const { original, reversal } = reverseElimination(db, elim.id, 'Wrong account eliminated', 'Auditor1');
    if (original.status !== 'Reversed') throw new Error(`Original status expected Reversed, got ${original.status}`);
    if (reversal.status !== 'Applied') throw new Error(`Reversal status expected Applied, got ${reversal.status}`);
    if (reversal.reversalOfId !== elim.id) throw new Error('Reversal not linked to original');
    if (original.reversedById !== reversal.id) throw new Error('Original not linked to reversal');
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Section 5: Consolidated Trial Balance & Isolation Guarantee (T24 - T28)
  // ══════════════════════════════════════════════════════════════════════════════

  test('T24: Pre-consolidation unit TBs are never modified by Phase 9', (db) => {
    addLedger(db, 'l-iso-1', 'unit-kollam', 'tg-branch-div', 'Kozhikode Branch Divn', 'fy-2025-26', 50000, 0, 'fsli-branch-asset');
    addLedger(db, 'l-iso-2', 'unit-kozhikode', 'tg-branch-div', 'Kollam Branch Divn', 'fy-2025-26', 0, 50000, 'fsli-branch-liab');

    // Run consolidation & apply elimination
    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    runInternalBalanceDetection(db, run.id);
    const review = getEliminationReviewData(db, run.id);
    submitEliminationForReview(db, review.rows[0].eliminationId);
    approveElimination(db, review.rows[0].eliminationId);
    applyElimination(db, review.rows[0].eliminationId);

    // Verify raw unit balances are 100% UNTOUCHED
    const lb1 = db.prepare('SELECT debit, credit FROM LedgerBalance WHERE ledger_id = ?').get('l-iso-1') as any;
    if (lb1.debit !== 50000) throw new Error(`Unit balance modified: debit = ${lb1.debit}`);
    const lb2 = db.prepare('SELECT debit, credit FROM LedgerBalance WHERE ledger_id = ?').get('l-iso-2') as any;
    if (lb2.credit !== 50000) throw new Error(`Unit balance modified: credit = ${lb2.credit}`);
  });

  test('T25: Consolidated TB aggregates all selected units', (db) => {
    addLedger(db, 'l-tb-1', 'unit-kollam', 'tg-cash', 'Cash Kollam', 'fy-2025-26', 10000, 0, 'fsli-cash');
    addLedger(db, 'l-tb-2', 'unit-kozhikode', 'tg-cash', 'Cash Kozhikode', 'fy-2025-26', 15000, 0, 'fsli-cash');

    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    const ctb = getConsolidatedTrialBalance(db, run.id);

    // Combined cash should be 25,000
    const cashRow = ctb.rows.find((r) => r.fsliId === 'fsli-cash');
    if (!cashRow) throw new Error('Cash FSLI row not found');
    if (cashRow.beforeEliminationDebit !== 25000) {
      throw new Error(`Expected combined cash 25000, got ${cashRow.beforeEliminationDebit}`);
    }
  });

  test('T26: Applied eliminations reduce consolidated totals appropriately', (db) => {
    addLedger(db, 'l-el-1', 'unit-kollam', 'tg-branch-div', 'Kozhikode Branch Divn', 'fy-2025-26', 50000, 0, 'fsli-branch-asset');
    addLedger(db, 'l-el-2', 'unit-kozhikode', 'tg-branch-div', 'Kollam Branch Divn', 'fy-2025-26', 0, 50000, 'fsli-branch-asset');

    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    runInternalBalanceDetection(db, run.id);
    const review = getEliminationReviewData(db, run.id);
    submitEliminationForReview(db, review.rows[0].eliminationId);
    approveElimination(db, review.rows[0].eliminationId);
    applyElimination(db, review.rows[0].eliminationId);

    const ctb = getConsolidatedTrialBalance(db, run.id);
    const branchRow = ctb.rows.find((r) => r.fsliId === 'fsli-branch-asset');
    if (!branchRow) throw new Error('Branch FSLI row not found');
    if (branchRow.afterEliminationDebit !== 0 || branchRow.afterEliminationCredit !== 0) {
      throw new Error(`Expected zero after elimination, got Dr=${branchRow.afterEliminationDebit}, Cr=${branchRow.afterEliminationCredit}`);
    }
  });

  test('T27: Internal control Dr, Cr, elimination, and unmatched difference computed correctly', (db) => {
    // Unit A Dr 100,000 vs Unit B Cr 75,000 -> Eliminated 75,000, Unmatched 25,000
    addLedger(db, 'l-ic-1', 'unit-kollam', 'tg-branch-div', 'Kozhikode Branch Divn', 'fy-2025-26', 100000, 0, 'fsli-branch-asset');
    addLedger(db, 'l-ic-2', 'unit-kozhikode', 'tg-branch-div', 'Kollam Branch Divn', 'fy-2025-26', 0, 75000, 'fsli-branch-asset');

    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    runInternalBalanceDetection(db, run.id);
    const review = getEliminationReviewData(db, run.id);
    submitEliminationForReview(db, review.rows[0].eliminationId);
    approveElimination(db, review.rows[0].eliminationId);
    applyElimination(db, review.rows[0].eliminationId);

    const ctb = getConsolidatedTrialBalance(db, run.id);
    if (ctb.internalControl.totalInternalDebit !== 100000) {
      throw new Error(`Expected total internal Dr 100000, got ${ctb.internalControl.totalInternalDebit}`);
    }
    if (ctb.internalControl.totalInternalCredit !== 75000) {
      throw new Error(`Expected total internal Cr 75000, got ${ctb.internalControl.totalInternalCredit}`);
    }
    if (ctb.internalControl.eliminationAmount !== 75000) {
      throw new Error(`Expected elimination amount 75000, got ${ctb.internalControl.eliminationAmount}`);
    }
    if (ctb.internalControl.unmatchedDifference !== 25000) {
      throw new Error(`Expected unmatched difference 25000, got ${ctb.internalControl.unmatchedDifference}`);
    }
  });

  test('T28: No artificial balancing figures are introduced', (db) => {
    // Single sided balance: Dr 30,000 unmatched
    addLedger(db, 'l-nb-1', 'unit-kollam', 'tg-branch-div', 'Kozhikode Branch Divn', 'fy-2025-26', 30000, 0, 'fsli-branch-asset');

    const run = createConsolidationRun(db, { financialYearId: 'fy-2025-26', selectedUnitIds: ['unit-kollam', 'unit-kozhikode'] });
    runInternalBalanceDetection(db, run.id);
    const ctb = getConsolidatedTrialBalance(db, run.id);

    // Difference must be accurately reported as 30,000, NOT forced to 0
    if (ctb.finalDifference !== 30000) {
      throw new Error(`Expected final difference 30000, got ${ctb.finalDifference}`);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Section 6: Consolidation Run Lifecycle (T29 - T32)
  // ══════════════════════════════════════════════════════════════════════════════

  test('T29: Create consolidation run with selected units', (db) => {
    const run = createConsolidationRun(db, {
      financialYearId: 'fy-2025-26',
      selectedUnitIds: ['unit-kollam', 'unit-kozhikode'],
      createdBy: 'Admin',
    });
    if (run.status !== 'Draft') throw new Error(`Expected Draft, got ${run.status}`);
    if (run.totalUnits !== 2) throw new Error(`Expected 2 units, got ${run.totalUnits}`);
    if (!run.runNumber.startsWith('CR-')) throw new Error(`Invalid run number: ${run.runNumber}`);
  });

  test('T30: Complete consolidation run freezes summary totals', (db) => {
    addLedger(db, 'l-cp-1', 'unit-kollam', 'tg-cash', 'Cash', 'fy-2025-26', 20000, 0, 'fsli-cash');
    const run = createConsolidationRun(db, {
      financialYearId: 'fy-2025-26',
      selectedUnitIds: ['unit-kollam', 'unit-kozhikode'],
    });
    const completed = completeConsolidationRun(db, run.id, 'Admin');
    if (completed.status !== 'Completed') throw new Error(`Expected Completed, got ${completed.status}`);
    if (!completed.completedAt) throw new Error('CompletedAt timestamp missing');
  });

  test('T31: Cancel consolidation run', (db) => {
    const run = createConsolidationRun(db, {
      financialYearId: 'fy-2025-26',
      selectedUnitIds: ['unit-kollam'],
    });
    const cancelled = cancelConsolidationRun(db, run.id, 'Admin');
    if (cancelled.status !== 'Cancelled') throw new Error(`Expected Cancelled, got ${cancelled.status}`);
  });

  test('T32: Re-detection deletes previous draft eliminations cleanly', (db) => {
    addLedger(db, 'l-rd-1', 'unit-kollam', 'tg-branch-div', 'Kozhikode Branch Divn', 'fy-2025-26', 50000, 0, 'fsli-branch-asset');
    const run = createConsolidationRun(db, {
      financialYearId: 'fy-2025-26',
      selectedUnitIds: ['unit-kollam', 'unit-kozhikode'],
    });
    runInternalBalanceDetection(db, run.id);
    let review = getEliminationReviewData(db, run.id);
    if (review.rows.length !== 1) throw new Error('Initial detection failed');

    // Run re-detection
    runInternalBalanceDetection(db, run.id);
    review = getEliminationReviewData(db, run.id);
    if (review.rows.length !== 1) throw new Error(`Re-detection should replace previous draft: got ${review.rows.length}`);
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Section 7: Audit Trail & 35+ Units Stress (T33 - T34)
  // ══════════════════════════════════════════════════════════════════════════════

  test('T33: Full audit trail recorded for all run and elimination lifecycle events', (db) => {
    const run = createConsolidationRun(db, {
      financialYearId: 'fy-2025-26',
      selectedUnitIds: ['unit-kollam', 'unit-kozhikode'],
      createdBy: 'User1',
    });
    const elim = createElimination(db, {
      consolidationRunId: run.id,
      sourceUnitId: 'unit-kollam',
      sourceLedgerName: 'Audit Test A/c',
      internalAccountType: 'Branch/Division',
      debitAmount: 10000,
      creditAmount: 0,
      eliminatedAmount: 10000,
      unmatchedAmount: 0,
      createdBy: 'User1',
    });
    submitEliminationForReview(db, elim.id, 'User1');
    approveElimination(db, elim.id, 'Auditor1');
    applyElimination(db, elim.id, 'Auditor1');
    reverseElimination(db, elim.id, 'Test reversal', 'Auditor1');

    const history = getConsolidationAuditHistory(db, run.id);
    const actions = history.map((h) => h.action);
    const expectedActions = ['RunCreated', 'UnitsSelected', 'EliminationCreated', 'EliminationSubmitted', 'EliminationApproved', 'EliminationApplied', 'EliminationReversed'];
    for (const ea of expectedActions) {
      if (!actions.includes(ea as any)) {
        throw new Error(`Missing expected audit action "${ea}". Found: ${actions.join(', ')}`);
      }
    }
  });

  test('T34: Multi-Unit Consolidation: 35+ units consolidate accurately with multiple interbranch eliminations', (db) => {
    const unitIds: string[] = [];
    // Create 35 units
    for (let i = 1; i <= 35; i++) {
      const uid = `unit-${String(i).padStart(3, '0')}`;
      const uname = `Unit ${i} Branch`;
      db.prepare(`INSERT INTO Unit (id, entity_id, unit_code, unit_name, created_at) VALUES (?, 'default-entity', ?, ?, ?)`).run(uid, `U${i}`, uname, now);
      unitIds.push(uid);

      // Add normal cash balance for each unit
      addLedger(db, `l-cash-${i}`, uid, 'tg-cash', `Cash U${i}`, 'fy-2025-26', 10000, 0, 'fsli-cash');
    }

    // Add 5 reciprocal interbranch pairs between pairs of units
    for (let p = 1; p <= 5; p++) {
      const uA = unitIds[p * 2 - 2];
      const uB = unitIds[p * 2 - 1];
      const uAName = `Unit ${p * 2 - 1} Branch`;
      const uBName = `Unit ${p * 2} Branch`;

      // Unit A has Dr 20,000 against Unit B
      addLedger(db, `l-ib-a-${p}`, uA, 'tg-branch-div', `${uBName} Divn`, 'fy-2025-26', 20000, 0, 'fsli-branch-asset');
      // Unit B has Cr 20,000 against Unit A
      addLedger(db, `l-ib-b-${p}`, uB, 'tg-branch-div', `${uAName} Divn`, 'fy-2025-26', 0, 20000, 'fsli-branch-asset');
    }

    // Create consolidation run for all 35 units
    const run = createConsolidationRun(db, {
      financialYearId: 'fy-2025-26',
      selectedUnitIds: unitIds,
    });
    if (run.totalUnits !== 35) throw new Error(`Expected 35 units, got ${run.totalUnits}`);

    // Detect internal balances
    const detRes = runInternalBalanceDetection(db, run.id);
    if (detRes.matchedCount !== 5) {
      throw new Error(`Expected 5 matched pairs across 35 units, got ${detRes.matchedCount}`);
    }

    // Approve and apply all 5 eliminations
    const review = getEliminationReviewData(db, run.id);
    for (const row of review.rows) {
      submitEliminationForReview(db, row.eliminationId);
      approveElimination(db, row.eliminationId);
      applyElimination(db, row.eliminationId);
    }

    // Compute consolidated TB
    const ctb = getConsolidatedTrialBalance(db, run.id);

    // Total cash = 35 * 10,000 = 350,000
    const cashRow = ctb.rows.find((r) => r.fsliId === 'fsli-cash');
    if (cashRow?.afterEliminationDebit !== 350000) {
      throw new Error(`Expected cash 350000, got ${cashRow?.afterEliminationDebit}`);
    }

    // Total eliminated interbranch = 5 * 20,000 = 100,000
    if (ctb.internalControl.eliminationAmount !== 100000) {
      throw new Error(`Expected elimination amount 100000, got ${ctb.internalControl.eliminationAmount}`);
    }

    // Complete run
    const completed = completeConsolidationRun(db, run.id, 'Auditor1');
    if (completed.status !== 'Completed') throw new Error('Run completion failed');
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Section 7: Consolidated Balance Sheet Unmapped State & Reconciliation (T35 - T38)
  // ══════════════════════════════════════════════════════════════════════════════

  test('T35: All balances mapped -> normal Balance Sheet without pending warning', (db) => {
    // Kollam: Cash 50,000 (Asset), Capital 50,000 (Equity)
    addLedger(db, 'l-bs-1', 'unit-kollam', 'tg-cash', 'Cash Kollam', 'fy-2025-26', 50000, 0, 'fsli-cash');
    addLedger(db, 'l-bs-2', 'unit-kollam', null, 'Corpus Fund Kollam', 'fy-2025-26', 0, 50000, 'fsli-corpus');

    // Kozhikode: Bank 30,000 (Asset), Payables 30,000 (Liability)
    addLedger(db, 'l-bs-3', 'unit-kozhikode', 'tg-cash', 'Bank Kozhikode', 'fy-2025-26', 30000, 0, 'fsli-cash');
    addLedger(db, 'l-bs-4', 'unit-kozhikode', null, 'Payables Kozhikode', 'fy-2025-26', 0, 30000, 'fsli-branch-liab');

    const run = createConsolidationRun(db, {
      financialYearId: 'fy-2025-26',
      selectedUnitIds: ['unit-kollam', 'unit-kozhikode'],
    });

    const bs = getConsolidatedBalanceSheetPreview(db, run.id);

    if (!bs.isComplete) throw new Error('Expected isComplete = true when all balances mapped');
    if (bs.hasUnmappedBalances) throw new Error('Expected hasUnmappedBalances = false');
    if (bs.warningMessage !== null) throw new Error(`Expected null warningMessage, got: ${bs.warningMessage}`);
    if (bs.unmappedDebit !== 0 || bs.unmappedCredit !== 0) {
      throw new Error(`Expected unmapped 0, got Dr=${bs.unmappedDebit}, Cr=${bs.unmappedCredit}`);
    }

    // Asset rows should contain Cash (50k + 30k = 80k)
    if (bs.assetRows.length === 0) throw new Error('Expected asset rows to be populated');
    const cashRow = bs.assetRows.find((r) => r.fsliId === 'fsli-cash');
    if (!cashRow || cashRow.afterEliminationDebit !== 80000) {
      throw new Error(`Expected consolidated cash 80000, got ${cashRow?.afterEliminationDebit}`);
    }

    // Total Assets = 80,000, Total Equity & Liabilities = 80,000
    if (bs.totalAssetsConsolidated !== 80000) {
      throw new Error(`Expected total assets 80000, got ${bs.totalAssetsConsolidated}`);
    }
    if (bs.totalEquityLiabilitiesConsolidated !== 80000) {
      throw new Error(`Expected total equity/liab 80000, got ${bs.totalEquityLiabilitiesConsolidated}`);
    }

    // Reconciliation
    if (!bs.reconciliation.isReconciled) throw new Error('Expected reconciliation to be balanced');
    if (bs.reconciliation.reconciliationDifference !== 0) {
      throw new Error(`Expected diff 0, got ${bs.reconciliation.reconciliationDifference}`);
    }
  });

  test('T36: Partially unmapped -> warning displayed, mapped balances in schedules, unmapped reported', (db) => {
    // Unit A (Kollam): Cash 50,000 mapped to fsli-cash, Capital 50,000 mapped to fsli-corpus
    addLedger(db, 'l-bs-p1', 'unit-kollam', 'tg-cash', 'Cash Kollam', 'fy-2025-26', 50000, 0, 'fsli-cash');
    addLedger(db, 'l-bs-p2', 'unit-kollam', null, 'Corpus Kollam', 'fy-2025-26', 0, 50000, 'fsli-corpus');

    // Unit B (Kozhikode): Unmapped ledgers (no FSLI mapping provided)
    addLedger(db, 'l-bs-p3', 'unit-kozhikode', null, 'Unmapped Stock Kozhikode', 'fy-2025-26', 20000, 0); // No fsliId
    addLedger(db, 'l-bs-p4', 'unit-kozhikode', null, 'Unmapped Creditor Kozhikode', 'fy-2025-26', 0, 20000); // No fsliId

    const run = createConsolidationRun(db, {
      financialYearId: 'fy-2025-26',
      selectedUnitIds: ['unit-kollam', 'unit-kozhikode'],
    });

    const bs = getConsolidatedBalanceSheetPreview(db, run.id);

    // Must be flagged incomplete with warning
    if (bs.isComplete) throw new Error('Expected isComplete = false for partially unmapped run');
    if (!bs.hasUnmappedBalances) throw new Error('Expected hasUnmappedBalances = true');
    if (!bs.warningMessage || !bs.warningMessage.includes('Partially unmapped balances detected')) {
      throw new Error(`Expected partial unmapped warning message, got: ${bs.warningMessage}`);
    }

    // Unmapped amounts must be reported
    if (bs.unmappedDebit !== 20000 || bs.unmappedCredit !== 20000) {
      throw new Error(`Expected unmapped Dr=20000, Cr=20000, got Dr=${bs.unmappedDebit}, Cr=${bs.unmappedCredit}`);
    }

    // Mapped balances must be displayed under normal schedules
    if (bs.assetRows.length !== 1) throw new Error(`Expected 1 mapped asset row, got ${bs.assetRows.length}`);
    if (bs.totalAssetsConsolidated !== 50000) {
      throw new Error(`Expected mapped assets 50000, got ${bs.totalAssetsConsolidated}`);
    }
    if (bs.equityLiabilityRows.length !== 1) {
      throw new Error(`Expected 1 mapped equity row, got ${bs.equityLiabilityRows.length}`);
    }
    if (bs.totalEquityLiabilitiesConsolidated !== 50000) {
      throw new Error(`Expected mapped equity/liab 50000, got ${bs.totalEquityLiabilitiesConsolidated}`);
    }

    // Reconciliation must accurately reflect unmapped amount
    if (bs.reconciliation.unmappedDebit !== 20000) {
      throw new Error(`Expected reconciliation unmapped debit 20000, got ${bs.reconciliation.unmappedDebit}`);
    }
  });

  test('T37: Completely unmapped -> warning displayed, no fabricated FSLI classifications, unmapped reported', (db) => {
    // Both units have zero FSLI mappings
    addLedger(db, 'l-bs-u1', 'unit-kollam', null, 'Raw Ledger 1', 'fy-2025-26', 15000, 0); // Unmapped
    addLedger(db, 'l-bs-u2', 'unit-kollam', null, 'Raw Ledger 2', 'fy-2025-26', 0, 15000); // Unmapped
    addLedger(db, 'l-bs-u3', 'unit-kozhikode', null, 'Raw Ledger 3', 'fy-2025-26', 25000, 0); // Unmapped
    addLedger(db, 'l-bs-u4', 'unit-kozhikode', null, 'Raw Ledger 4', 'fy-2025-26', 0, 25000); // Unmapped

    const run = createConsolidationRun(db, {
      financialYearId: 'fy-2025-26',
      selectedUnitIds: ['unit-kollam', 'unit-kozhikode'],
    });

    const bs = getConsolidatedBalanceSheetPreview(db, run.id);

    // Must be incomplete
    if (bs.isComplete) throw new Error('Expected isComplete = false for completely unmapped run');
    if (!bs.hasUnmappedBalances) throw new Error('Expected hasUnmappedBalances = true');

    // No fabricated FSLI rows in Asset or Equity & Liability schedules
    if (bs.assetRows.length !== 0) {
      throw new Error(`Expected 0 fabricated asset rows, got ${bs.assetRows.length}`);
    }
    if (bs.equityLiabilityRows.length !== 0) {
      throw new Error(`Expected 0 fabricated equity/liab rows, got ${bs.equityLiabilityRows.length}`);
    }
    if (bs.totalAssetsConsolidated !== 0) {
      throw new Error(`Expected total assets 0, got ${bs.totalAssetsConsolidated}`);
    }
    if (bs.totalEquityLiabilitiesConsolidated !== 0) {
      throw new Error(`Expected total equity/liab 0, got ${bs.totalEquityLiabilitiesConsolidated}`);
    }

    // Full unmapped amount reported: 15,000 + 25,000 = 40,000
    if (bs.unmappedDebit !== 40000 || bs.unmappedCredit !== 40000) {
      throw new Error(`Expected unmapped 40000, got Dr=${bs.unmappedDebit}, Cr=${bs.unmappedCredit}`);
    }
    if (!bs.warningMessage || !bs.warningMessage.includes('No approved FSLI classifications exist')) {
      throw new Error(`Expected complete unmapped warning message, got: ${bs.warningMessage}`);
    }
  });

  test('T38: Zero unmapped -> no pending-FSLI warning, isComplete = true, reconciliation verified', (db) => {
    // Normal mapped ledgers with zero unmapped
    addLedger(db, 'l-bs-z1', 'unit-kollam', 'tg-cash', 'Cash', 'fy-2025-26', 100000, 0, 'fsli-cash');
    addLedger(db, 'l-bs-z2', 'unit-kollam', null, 'Corpus', 'fy-2025-26', 0, 100000, 'fsli-corpus');

    const run = createConsolidationRun(db, {
      financialYearId: 'fy-2025-26',
      selectedUnitIds: ['unit-kollam'],
    });

    const bs = getConsolidatedBalanceSheetPreview(db, run.id);

    if (bs.hasUnmappedBalances !== false) throw new Error('Expected hasUnmappedBalances = false');
    if (bs.warningMessage !== null) throw new Error('Expected null warningMessage');
    if (bs.isComplete !== true) throw new Error('Expected isComplete = true');
    if (bs.totalAssetsConsolidated !== 100000) throw new Error(`Expected 100000, got ${bs.totalAssetsConsolidated}`);
    if (bs.totalEquityLiabilitiesConsolidated !== 100000) {
      throw new Error(`Expected 100000, got ${bs.totalEquityLiabilitiesConsolidated}`);
    }
    if (!bs.reconciliation.isReconciled) throw new Error('Expected reconciliation isReconciled = true');
  });

  const passedTests = results.filter((r) => r.passed).length;
  return {
    allPassed: passedTests === results.length,
    totalTests: results.length,
    passedTests,
    results,
  };
}
