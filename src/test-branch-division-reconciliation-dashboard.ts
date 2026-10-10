/**
 * Phase 15.7: Branch/Division Reconciliation Dashboard Test Suite
 *
 * Dedicated verification covering all Phase 15.7 requirements:
 * Test 1 (Test A) — Individual Unit Scope & Isolation (Ma Bakery / Kollam)
 * Test 2 (Test B) — Different Unit Isolation (Zero cross-unit data leakage)
 * Test 3 (Test C) — Authoritative Consolidated Scope & Batch Association
 * Test 4 (Test D) — Unreconciled Items & Net-Zero Accounting Semantics (Net 0 -> Reconciled, Non-zero -> Not Reconciled)
 * Test 5 (Test E) — No Data / Missing Data Handling (Clean empty state, no fabricated zeros)
 * Test 6 (Test F) — Filter & Context Isolation (FY, Scope, Unit, Status, and Search filtering)
 * Test 7 (Test G) — Read-Only Safety Guarantee (0 DB mutations across all compilation calls)
 * Test 8 (Test H) — Architectural Non-Duplication (Strict delegation to Phase 9 engine)
 * Test 9 (Test I) — Detailed Line Items & Provenance Preservation (ConsolidationEliminationLine)
 * Test 10 (Test J) — Reversal Status Fidelity (Preserves 'Reversed' status and reversal reason)
 */

import Database from 'better-sqlite3';
import {
  compileBranchDivisionReconciliationDashboardData,
  runBranchDivisionReconciliationTests as runEngineTests,
} from './dashboard-reporting-engine';
import { createComparativeWithPyTestDatabase } from './test-comparative-reporting';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

/**
 * Creates an in-memory SQLite database initialized with full Phase 9 schema and realistic test data.
 */
export function createBranchDivisionReconciliationTestDatabase(): Database.Database {
  const db = createComparativeWithPyTestDatabase();

  // Re-create ConsolidationElimination with full production columns if needed
  db.exec(`
    DROP TABLE IF EXISTS ConsolidationEliminationLine;
    DROP TABLE IF EXISTS ConsolidationElimination;

    CREATE TABLE ConsolidationElimination (
      id                      TEXT PRIMARY KEY,
      consolidation_run_id    TEXT NOT NULL,
      elimination_number      TEXT NOT NULL,
      entity_id               TEXT NOT NULL,
      financial_year_id       TEXT NOT NULL,
      source_unit_id          TEXT NOT NULL,
      counterparty_unit_id    TEXT,
      source_ledger_id        TEXT,
      source_ledger_name      TEXT NOT NULL,
      counterparty_ledger_id  TEXT,
      counterparty_ledger_name TEXT,
      internal_account_type   TEXT NOT NULL CHECK(internal_account_type IN ('Branch/Division','Santhigiri Ashram HO','Other Internal')),
      fsli_id                 TEXT,
      fsli_name               TEXT,
      debit_amount            REAL NOT NULL DEFAULT 0,
      credit_amount           REAL NOT NULL DEFAULT 0,
      eliminated_amount       REAL NOT NULL DEFAULT 0,
      unmatched_amount        REAL NOT NULL DEFAULT 0,
      matching_basis          TEXT,
      confidence              REAL NOT NULL DEFAULT 0,
      match_status            TEXT NOT NULL DEFAULT 'NeedsReview'
                              CHECK(match_status IN ('Matched','PartiallyMatched','Unmatched','NeedsReview','Approved','Applied','Rejected','Reversed')),
      reason                  TEXT,
      status                  TEXT NOT NULL DEFAULT 'Draft'
                              CHECK(status IN ('Draft','PendingReview','Approved','Applied','Rejected','Reversed')),
      reversal_of_id          TEXT,
      reversed_by_id          TEXT,
      created_by              TEXT,
      created_at              TEXT NOT NULL,
      updated_at              TEXT NOT NULL,
      applied_by              TEXT,
      applied_at              TEXT,
      reversed_by             TEXT,
      reversed_at             TEXT,
      reversal_reason         TEXT
    );

    CREATE TABLE ConsolidationEliminationLine (
      id            TEXT PRIMARY KEY,
      elimination_id TEXT NOT NULL,
      line_number   INTEGER NOT NULL,
      unit_id       TEXT NOT NULL,
      ledger_id     TEXT,
      ledger_name   TEXT NOT NULL,
      fsli_id       TEXT,
      fsli_name     TEXT,
      debit         REAL NOT NULL DEFAULT 0,
      credit        REAL NOT NULL DEFAULT 0,
      description   TEXT,
      FOREIGN KEY (elimination_id) REFERENCES ConsolidationElimination(id) ON DELETE CASCADE
    );
  `);

  const now = new Date().toISOString();

  // Add additional unit: Kollam and Kozhikode
  db.prepare("INSERT OR IGNORE INTO Unit (id, entity_id, unit_name, created_at) VALUES ('unit-kollam', 'default-entity', 'Kollam Branch', ?)").run(now);
  db.prepare("INSERT OR IGNORE INTO Unit (id, entity_id, unit_name, created_at) VALUES ('unit-kozhikode', 'default-entity', 'Kozhikode Branch', ?)").run(now);

  // Add Consolidation Run for FY 2025-26
  db.prepare(`
    INSERT OR REPLACE INTO ConsolidationRun (
      id, entity_id, financial_year_id, run_number, status, selected_unit_ids, total_units,
      consolidated_debit, consolidated_credit, created_by, created_at, updated_at
    ) VALUES (
      'run-2025-26-01', 'default-entity', 'fy-2025-26', 'CR-2025-001', 'Completed',
      '["unit-ma-bakery","unit-sa-bioproducts","unit-kollam","unit-kozhikode"]', 4,
      1000000, 1000000, 'System Admin', ?, ?
    )
  `).run(now, now);

  // 1. Matched / Reconciled Item (Net Difference: 0) — Kollam & Kozhikode
  db.prepare(`
    INSERT INTO ConsolidationElimination (
      id, consolidation_run_id, elimination_number, entity_id, financial_year_id,
      source_unit_id, counterparty_unit_id, source_ledger_id, source_ledger_name,
      counterparty_ledger_id, counterparty_ledger_name, internal_account_type,
      fsli_id, fsli_name, debit_amount, credit_amount, eliminated_amount, unmatched_amount,
      matching_basis, confidence, match_status, reason, status, created_at, updated_at
    ) VALUES (
      'elim-001', 'run-2025-26-01', 'ELIM-001', 'default-entity', 'fy-2025-26',
      'unit-kollam', 'unit-kozhikode', 'led-kol-1', 'Kozhikode Branch Divn',
      'led-koz-1', 'Kollam Branch Divn', 'Branch/Division',
      'fsli-branch', 'Branch / Division Account', 100000, 100000, 100000, 0,
      'Exact reciprocal name and equal balance match', 1.0, 'Matched',
      'TallyGroup:Branch/Divisions; CrossUnit:Kozhikode Branch', 'Approved', ?, ?
    )
  `).run(now, now);

  db.prepare(`
    INSERT INTO ConsolidationEliminationLine (id, elimination_id, line_number, unit_id, ledger_name, debit, credit, description)
    VALUES ('line-001-1', 'elim-001', 1, 'unit-kollam', 'Kozhikode Branch Divn', 100000, 0, 'Kollam reciprocal debit balance')
  `).run();
  db.prepare(`
    INSERT INTO ConsolidationEliminationLine (id, elimination_id, line_number, unit_id, ledger_name, debit, credit, description)
    VALUES ('line-001-2', 'elim-001', 2, 'unit-kozhikode', 'Kollam Branch Divn', 0, 100000, 'Kozhikode reciprocal credit balance')
  `).run();

  // 2. Unreconciled / Partially Matched Item (Net Difference: 10,000) — Ma Bakery & SA Bioproducts
  db.prepare(`
    INSERT INTO ConsolidationElimination (
      id, consolidation_run_id, elimination_number, entity_id, financial_year_id,
      source_unit_id, counterparty_unit_id, source_ledger_id, source_ledger_name,
      counterparty_ledger_id, counterparty_ledger_name, internal_account_type,
      fsli_id, fsli_name, debit_amount, credit_amount, eliminated_amount, unmatched_amount,
      matching_basis, confidence, match_status, reason, status, created_at, updated_at
    ) VALUES (
      'elim-002', 'run-2025-26-01', 'ELIM-002', 'default-entity', 'fy-2025-26',
      'unit-ma-bakery', 'unit-sa-bioproducts', 'led-mb-inter', 'Bio Unit Branch Current A/c',
      'led-sb-inter', 'Bakery Division Current A/c', 'Branch/Division',
      'fsli-branch', 'Branch / Division Account', 50000, 40000, 40000, 10000,
      'Partial balance match across reciprocal units', 0.85, 'PartiallyMatched',
      'LedgerName:Branch/Division; CrossUnit:SA Bioproducts', 'Draft', ?, ?
    )
  `).run(now, now);

  db.prepare(`
    INSERT INTO ConsolidationEliminationLine (id, elimination_id, line_number, unit_id, ledger_name, debit, credit, description)
    VALUES ('line-002-1', 'elim-002', 1, 'unit-ma-bakery', 'Bio Unit Branch Current A/c', 50000, 0, 'Ma Bakery debit claim')
  `).run();
  db.prepare(`
    INSERT INTO ConsolidationEliminationLine (id, elimination_id, line_number, unit_id, ledger_name, debit, credit, description)
    VALUES ('line-002-2', 'elim-002', 2, 'unit-sa-bioproducts', 'Bakery Division Current A/c', 0, 40000, 'SA Bioproducts credit acknowledge')
  `).run();

  // 3. Santhigiri Ashram HO Internal Reciprocal Item — Ma Bakery
  db.prepare(`
    INSERT INTO ConsolidationElimination (
      id, consolidation_run_id, elimination_number, entity_id, financial_year_id,
      source_unit_id, counterparty_unit_id, source_ledger_id, source_ledger_name,
      counterparty_ledger_id, counterparty_ledger_name, internal_account_type,
      fsli_id, fsli_name, debit_amount, credit_amount, eliminated_amount, unmatched_amount,
      matching_basis, confidence, match_status, reason, status, created_at, updated_at
    ) VALUES (
      'elim-003', 'run-2025-26-01', 'ELIM-003', 'default-entity', 'fy-2025-26',
      'unit-ma-bakery', NULL, 'led-mb-ho', 'Santhigiri Ashram Head Office A/c',
      NULL, NULL, 'Santhigiri Ashram HO',
      'fsli-ho', 'Head Office Current Account', 25000, 25000, 25000, 0,
      'HO ledger reciprocal audit reconciliation', 0.95, 'Applied',
      'LedgerName:SanthigiriHO', 'Applied', ?, ?
    )
  `).run(now, now);

  // 4. Reversed Elimination Item
  db.prepare(`
    INSERT INTO ConsolidationElimination (
      id, consolidation_run_id, elimination_number, entity_id, financial_year_id,
      source_unit_id, counterparty_unit_id, source_ledger_id, source_ledger_name,
      counterparty_ledger_id, counterparty_ledger_name, internal_account_type,
      fsli_id, fsli_name, debit_amount, credit_amount, eliminated_amount, unmatched_amount,
      matching_basis, confidence, match_status, reason, status, created_at, updated_at,
      reversal_reason, reversed_at
    ) VALUES (
      'elim-004', 'run-2025-26-01', 'ELIM-004', 'default-entity', 'fy-2025-26',
      'unit-kollam', 'unit-ma-bakery', 'led-kol-rev', 'Bakery Transit Account',
      'led-mb-rev', 'Kollam Transit Account', 'Branch/Division',
      'fsli-branch', 'Branch / Division Account', 15000, 15000, 0, 0,
      'Reversed interbranch adjustment', 0.9, 'Reversed',
      'Adjustment entered in error and cancelled', 'Reversed', ?, ?,
      'Erroneous duplicate entry reversed', ?
    )
  `).run(now, now, now);

  // 5. Prior Year Consolidation Run (FY 2024-25) with known reconciliation data
  db.prepare(`
    INSERT OR REPLACE INTO ConsolidationRun (
      id, entity_id, financial_year_id, run_number, status, selected_unit_ids, total_units,
      consolidated_debit, consolidated_credit, created_by, created_at, updated_at
    ) VALUES (
      'run-2024-25-01', 'default-entity', 'fy-2024-25', 'CR-2024-001', 'Completed',
      '["unit-ma-bakery","unit-sa-bioproducts"]', 2,
      800000, 800000, 'System Admin', ?, ?
    )
  `).run(now, now);

  db.prepare(`
    INSERT INTO ConsolidationElimination (
      id, consolidation_run_id, elimination_number, entity_id, financial_year_id,
      source_unit_id, counterparty_unit_id, source_ledger_id, source_ledger_name,
      counterparty_ledger_id, counterparty_ledger_name, internal_account_type,
      fsli_id, fsli_name, debit_amount, credit_amount, eliminated_amount, unmatched_amount,
      matching_basis, confidence, match_status, reason, status, created_at, updated_at
    ) VALUES (
      'elim-py-001', 'run-2024-25-01', 'ELIM-PY-001', 'default-entity', 'fy-2024-25',
      'unit-ma-bakery', 'unit-sa-bioproducts', 'led-mb-py', 'Bio Unit Current PY',
      'led-sb-py', 'Bakery Division PY', 'Branch/Division',
      'fsli-branch', 'Branch / Division Account', 35000, 35000, 35000, 0,
      'PY Exact reciprocal match', 1.0, 'Matched', 'PY Reconciliation', 'Applied', ?, ?
    )
  `).run(now, now);

  return db;
}

/**
 * Runs the Phase 15.7 Automated Verification Test Suite.
 */
export function runBranchDivisionReconciliationTests(database?: Database.Database): {
  allPassed: boolean;
  totalTests: number;
  passedTests: number;
  results: TestResult[];
} {
  const db = database || createBranchDivisionReconciliationTestDatabase();
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

  // 1. Run engine suite
  const suiteResults = runEngineTests(db);
  for (const r of suiteResults.results) {
    add(r.name, r.passed, r.message);
  }

  // 2. Additional Acceptance Criteria Tests from User Specification
  try {
    // Acceptance Test 1: Unit Ma Bakery Context Isolation
    const mbData = compileBranchDivisionReconciliationDashboardData(db, 'fy-2025-26', {
      scope: 'UNIT',
      unitId: 'unit-ma-bakery',
    });

    const mbHasKollamOnly = mbData.items.some(
      (i) => i.sourceUnitId === 'unit-kollam' && i.counterpartyUnitId === 'unit-kozhikode'
    );
    add(
      'Test 11 — Ma Bakery Excludes Pure Third-Party Items',
      !mbHasKollamOnly,
      'Kollam-Kozhikode internal reconciliation items are strictly excluded from Ma Bakery unit view.',
    );

    // Acceptance Test 2: Net-zero difference -> Reconciled flag
    const matchedItem = mbData.items.find((i) => i.eliminationNumber === 'ELIM-003');
    add(
      'Test 12 — Net-Zero Reconciliation Difference Semantics',
      matchedItem !== undefined && matchedItem.isReconciled === true && matchedItem.unmatchedAmount === 0,
      'Item ELIM-003 with net-zero unmatched difference is authoritatively flagged as Reconciled.',
    );

    // Acceptance Test 3: Non-zero difference -> Not Reconciled flag
    const unmatchedItem = mbData.items.find((i) => i.eliminationNumber === 'ELIM-002');
    add(
      'Test 13 — Non-Zero Reconciliation Difference Semantics',
      unmatchedItem !== undefined && unmatchedItem.isReconciled === false && unmatchedItem.unmatchedAmount === 10000,
      'Item ELIM-002 with ₹10,000 difference is authoritatively flagged as Not Reconciled.',
    );

    // Acceptance Test 4: Underlying Lines Preservation
    const itemWithLines = mbData.items.find((i) => i.eliminationNumber === 'ELIM-002');
    add(
      'Test 14 — Underlying Line Records Preservation',
      Boolean(itemWithLines && Array.isArray(itemWithLines.lines) && itemWithLines.lines.length === 2),
      'Detailed matching line items from ConsolidationEliminationLine are correctly preserved and exposed.',
    );

    // Acceptance Test 5: Reversal Status Preservation
    const allConsData = compileBranchDivisionReconciliationDashboardData(db, 'fy-2025-26', {
      scope: 'CONSOLIDATED',
    });
    const revItem = allConsData.items.find((i) => i.eliminationNumber === 'ELIM-004');
    add(
      'Test 15 — Authoritative Reversal Status Preservation',
      revItem !== undefined && revItem.matchStatus === 'Reversed' && revItem.status === 'Reversed',
      'Reversed elimination ELIM-004 preserves authoritative "Reversed" match_status without silent categorization.',
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    add('Acceptance Criteria Extended Tests', false, `Exception: ${message}`);
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
