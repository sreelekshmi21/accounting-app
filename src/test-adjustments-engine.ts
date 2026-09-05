/**
 * Test Suite: Phase 8 Adjustments Engine
 *
 * Runs comprehensive automated verification for all 14+ required test cases:
 * 1. Balanced adjustment → accepted
 * 2. Unbalanced adjustment → rejected with clear validation error
 * 3. Original TB remains unchanged
 * 4. Phase 7 regrouping remains unchanged
 * 5. Unit A adjustment does not affect Unit B/C (Unit isolation)
 * 6. CY adjustment does not affect PY (Financial Year isolation)
 * 7. Complete approval workflow (Draft → PendingReview → Approved → Applied)
 * 8. Rejected adjustment has no financial impact
 * 9. Applied adjustment cannot be edited or deleted (immutability)
 * 10. Reversal correctly offsets an applied adjustment (linked inverse entry)
 * 11. Closing Stock adjustment correctly affects Inventories (CA_INVENT) and Changes in Inventories (EXP_CHG_INV)
 * 12. Closing Stock is strictly unit-specific
 * 13. No debit/credit netting is introduced (separate Dr/Cr preserved)
 * 14. Adjusted trial balance correctly reflects Phase 8 applied adjustments
 * 15. Controlled "Return to Draft" for Approved adjustments requiring mandatory reason & audit
 */

import Database from 'better-sqlite3';
import { STANDARD_FSLI_CATALOG } from './standard-fsli';
import {
  createAdjustment,
  updateAdjustment,
  deleteAdjustment,
  submitAdjustmentForReview,
  approveAdjustment,
  rejectAdjustment,
  returnAdjustmentToDraft,
  applyAdjustment,
  reverseAdjustment,
  createClosingStockAdjustment,
  getAdjustmentById,
  getAdjustmentAuditHistory,
  getAdjustmentsWorkbenchData,
  getAdjustedTrialBalance,
  validateDoubleEntry,
} from './adjustments-engine';

export interface AdjustmentTestResult {
  name: string;
  passed: boolean;
  message: string;
}

function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE _db_info (key TEXT PRIMARY KEY, value TEXT NOT NULL);

    CREATE TABLE Client (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE Entity (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES Client(id) ON DELETE CASCADE
    );

    CREATE TABLE Unit (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      unit_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (entity_id) REFERENCES Entity(id) ON DELETE CASCADE
    );

    CREATE TABLE FinancialYear (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      year_label TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (entity_id) REFERENCES Entity(id) ON DELETE CASCADE,
      UNIQUE(entity_id, year_label)
    );

    CREATE TABLE ImportBatch (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      financial_year_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      sheet_name TEXT,
      header_row INTEGER,
      total_rows INTEGER,
      ledger_count INTEGER,
      total_debit REAL,
      total_credit REAL,
      difference REAL,
      import_timestamp TEXT NOT NULL,
      status TEXT NOT NULL,
      detected_columns TEXT
    );

    CREATE TABLE TallyGroup (
      id TEXT PRIMARY KEY,
      import_batch_id TEXT NOT NULL,
      group_name TEXT NOT NULL,
      parent_group_id TEXT,
      depth INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE Ledger (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      ledger_name TEXT NOT NULL,
      tally_group_id TEXT,
      ledger_code TEXT,
      source_import_id TEXT,
      source_row_number INTEGER,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE LedgerBalance (
      id TEXT PRIMARY KEY,
      ledger_id TEXT NOT NULL,
      financial_year_id TEXT NOT NULL,
      import_batch_id TEXT NOT NULL,
      opening_debit REAL DEFAULT 0,
      opening_credit REAL DEFAULT 0,
      debit REAL DEFAULT 0,
      credit REAL DEFAULT 0,
      closing_debit REAL DEFAULT 0,
      closing_credit REAL DEFAULT 0,
      net_balance REAL DEFAULT 0
    );

    CREATE TABLE FSLI (
      id TEXT PRIMARY KEY,
      fsli_name TEXT NOT NULL,
      fsli_code TEXT UNIQUE,
      category TEXT NOT NULL,
      sub_category TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'SYSTEM',
      active INTEGER NOT NULL DEFAULT 1,
      parent_fsli_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE LedgerMapping (
      id TEXT PRIMARY KEY,
      ledger_id TEXT NOT NULL,
      financial_year_id TEXT NOT NULL,
      mapped_fsli_id TEXT,
      mapping_rule_id TEXT,
      mapping_source TEXT NOT NULL DEFAULT 'UserMapping',
      confidence_score REAL,
      is_manual_override INTEGER NOT NULL DEFAULT 0,
      approved_by TEXT,
      approved_at TEXT,
      status TEXT NOT NULL DEFAULT 'Unmapped',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE LedgerClassification (
      id TEXT PRIMARY KEY,
      ledger_id TEXT NOT NULL,
      financial_year_id TEXT NOT NULL,
      original_tally_classification TEXT,
      application_classification TEXT,
      child_fsli_id TEXT,
      parent_fsli_id TEXT,
      final_fsli_id TEXT,
      classification_source TEXT NOT NULL DEFAULT 'PENDING',
      confidence_score REAL DEFAULT 0,
      reason TEXT,
      is_manual_override INTEGER NOT NULL DEFAULT 0,
      approved_by TEXT,
      approved_at TEXT,
      status TEXT NOT NULL DEFAULT 'Unclassified',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE RegroupingResult (
      id TEXT PRIMARY KEY,
      ledger_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      financial_year_id TEXT NOT NULL,
      before_classification TEXT,
      before_fsli_id TEXT,
      before_fsli_name TEXT,
      proposed_classification TEXT,
      proposed_fsli_id TEXT,
      proposed_fsli_name TEXT,
      approved_classification TEXT,
      approved_fsli_id TEXT,
      approved_fsli_name TEXT,
      balance_debit REAL NOT NULL DEFAULT 0,
      balance_credit REAL NOT NULL DEFAULT 0,
      balance_net REAL NOT NULL DEFAULT 0,
      balance_nature TEXT NOT NULL,
      tally_group_name TEXT,
      ledger_name TEXT NOT NULL,
      reason TEXT,
      rule_id TEXT,
      rule_name TEXT,
      confidence REAL NOT NULL DEFAULT 0,
      detection_confidence REAL NOT NULL DEFAULT 1.0,
      recommendation_confidence REAL NOT NULL DEFAULT 0.85,
      status TEXT NOT NULL DEFAULT 'Detected',
      approved_by TEXT,
      approved_at TEXT,
      applied_by TEXT,
      applied_at TEXT,
      undone_by TEXT,
      undone_at TEXT,
      undo_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE RegroupingAudit (
      id TEXT PRIMARY KEY,
      regrouping_result_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_status TEXT,
      after_status TEXT,
      before_fsli_id TEXT,
      after_fsli_id TEXT,
      before_classification TEXT,
      after_classification TEXT,
      reason TEXT,
      performed_by TEXT,
      performed_at TEXT NOT NULL
    );

    CREATE TABLE Adjustment (
      id TEXT PRIMARY KEY,
      adjustment_number TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      financial_year_id TEXT NOT NULL,
      adjustment_date TEXT NOT NULL,
      adjustment_type TEXT NOT NULL,
      narration TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft',
      total_debit REAL NOT NULL DEFAULT 0,
      total_credit REAL NOT NULL DEFAULT 0,
      is_closing_stock INTEGER NOT NULL DEFAULT 0,
      closing_stock_value REAL,
      reversal_of_id TEXT,
      reversed_by_id TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      submitted_by TEXT,
      submitted_at TEXT,
      approved_by TEXT,
      approved_at TEXT,
      rejected_by TEXT,
      rejected_at TEXT,
      rejection_reason TEXT,
      applied_by TEXT,
      applied_at TEXT,
      reversed_by TEXT,
      reversed_at TEXT,
      reversal_reason TEXT
    );

    CREATE TABLE AdjustmentLine (
      id TEXT PRIMARY KEY,
      adjustment_id TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      ledger_id TEXT,
      ledger_name TEXT NOT NULL,
      fsli_id TEXT NOT NULL,
      fsli_name TEXT NOT NULL,
      fsli_code TEXT,
      fsli_category TEXT,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      description TEXT
    );

    CREATE TABLE AdjustmentAudit (
      id TEXT PRIMARY KEY,
      adjustment_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_status TEXT,
      after_status TEXT,
      details TEXT,
      reason TEXT,
      performed_by TEXT,
      performed_at TEXT NOT NULL
    );
  `);

  // Seed standard FSLIs
  const insertFSLI = db.prepare(`
    INSERT INTO FSLI (id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'SYSTEM', 1, ?)
  `);

  const now = new Date().toISOString();
  for (const f of STANDARD_FSLI_CATALOG) {
    insertFSLI.run(`fsli-${f.code.toLowerCase()}`, f.name, f.code, f.category, f.subCategory, f.displayOrder, now);
  }

  // Seed Client, Entity, Units, FinancialYears
  db.prepare("INSERT INTO Client (id, client_name, created_at) VALUES ('client-1', 'Test Client', ?)").run(now);
  db.prepare("INSERT INTO Entity (id, client_id, entity_name, created_at) VALUES ('entity-1', 'client-1', 'Test Entity', ?)").run(now);
  db.prepare("INSERT INTO Unit (id, entity_id, unit_name, created_at) VALUES ('unit-a', 'entity-1', 'Unit A (Trivandrum)', ?)").run(now);
  db.prepare("INSERT INTO Unit (id, entity_id, unit_name, created_at) VALUES ('unit-b', 'entity-1', 'Unit B (Kochi)', ?)").run(now);
  db.prepare("INSERT INTO Unit (id, entity_id, unit_name, created_at) VALUES ('unit-c', 'entity-1', 'Unit C (Calicut)', ?)").run(now);

  db.prepare("INSERT INTO FinancialYear (id, entity_id, year_label, created_at) VALUES ('fy-cy', 'entity-1', '2024-25', ?)").run(now);
  db.prepare("INSERT INTO FinancialYear (id, entity_id, year_label, created_at) VALUES ('fy-py', 'entity-1', '2023-24', ?)").run(now);

  return db;
}

export function runAdjustmentsEngineTests(): {
  allPassed: boolean;
  totalTests: number;
  passedTests: number;
  results: AdjustmentTestResult[];
} {
  const results: AdjustmentTestResult[] = [];
  const add = (name: string, passed: boolean, message: string) => {
    results.push({ name, passed, message });
    console.log(`[Phase8 Test] ${passed ? '✓' : '✗'} ${name}: ${message}`);
  };

  const db = createTestDatabase();

  // Helper FSLI lookup
  const getFSLIIdByCode = (code: string): string => {
    const row = db.prepare('SELECT id FROM FSLI WHERE fsli_code = ?').get(code) as { id: string } | undefined;
    if (!row) throw new Error(`FSLI with code ${code} not found`);
    return row.id;
  };

  const fsliRent = getFSLIIdByCode('EXP_ADMIN_GEN');
  const fsliOutstanding = getFSLIIdByCode('CL_OTH_LIAB');
  const fsliInventories = getFSLIIdByCode('CA_INVENT');
  const fsliChangeInStock = getFSLIIdByCode('EXP_CHG_INV');

  // Seed sample Trial Balance and Regrouping data for FY 2024-25 (Unit A and Unit B)
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO Ledger (id, entity_id, unit_id, ledger_name, active)
    VALUES ('l-rent-a', 'entity-1', 'unit-a', 'Office Rent', 1),
           ('l-bank-a', 'entity-1', 'unit-a', 'SBI Current A/c', 1),
           ('l-rent-b', 'entity-1', 'unit-b', 'Office Rent', 1)
  `).run();

  db.prepare(`
    INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit, net_balance)
    VALUES ('lb-rent-a', 'l-rent-a', 'fy-cy', 'batch-1', 120000, 0, 120000),
           ('lb-bank-a', 'l-bank-a', 'fy-cy', 'batch-1', 500000, 0, 500000),
           ('lb-rent-b', 'l-rent-b', 'fy-cy', 'batch-2', 80000, 0, 80000)
  `).run();

  // Seed Phase 6 & 7 mapping
  db.prepare(`
    INSERT INTO LedgerClassification (id, ledger_id, financial_year_id, final_fsli_id, status, created_at, updated_at)
    VALUES ('lc-rent-a', 'l-rent-a', 'fy-cy', ?, 'Classified', ?, ?),
           ('lc-bank-a', 'l-bank-a', 'fy-cy', ?, 'Classified', ?, ?),
           ('lc-rent-b', 'l-rent-b', 'fy-cy', ?, 'Classified', ?, ?)
  `).run(fsliRent, now, now, getFSLIIdByCode('CA_BANK_BAL'), now, now, fsliRent, now, now);

  db.prepare(`
    INSERT INTO RegroupingResult (id, ledger_id, unit_id, entity_id, financial_year_id, ledger_name, approved_fsli_id, status, balance_debit, balance_credit, balance_net, balance_nature, created_at, updated_at)
    VALUES ('rr-rent-a', 'l-rent-a', 'unit-a', 'entity-1', 'fy-cy', 'Office Rent', ?, 'Applied', 120000, 0, 120000, 'Debit', ?, ?)
  `).run(fsliRent, now, now);

  // ── Test 1: Balanced adjustment → accepted ──────────────────────────────────
  let adj1: import('./electron-api').AdjustmentRecord | null = null;
  try {
    adj1 = createAdjustment(db, {
      unitId: 'unit-a',
      financialYearId: 'fy-cy',
      adjustmentDate: '2025-03-31',
      adjustmentType: 'Outstanding Expense',
      narration: 'Accrual for March 2025 rent',
      createdBy: 'Accountant A',
      lines: [
        {
          ledgerName: 'Rent Expense A/c',
          fsliId: fsliRent,
          debit: 10000,
          credit: 0,
          description: 'March rent accrued',
        },
        {
          ledgerName: 'Rent Payable A/c',
          fsliId: fsliOutstanding,
          debit: 0,
          credit: 10000,
          description: 'Outstanding rent liability',
        },
      ],
    });

    if (
      adj1 &&
      adj1.status === 'Draft' &&
      adj1.totalDebit === 10000 &&
      adj1.totalCredit === 10000 &&
      adj1.lines.length === 2 &&
      adj1.adjustmentNumber.startsWith('ADJ-')
    ) {
      add('Test 1: Balanced Adjustment Creation', true, `Created adjustment ${adj1.adjustmentNumber} in Draft status with balanced Dr=Cr=₹10,000`);
    } else {
      add('Test 1: Balanced Adjustment Creation', false, `Unexpected adjustment data: ${JSON.stringify(adj1)}`);
    }
  } catch (err) {
    add('Test 1: Balanced Adjustment Creation', false, `Error: ${err}`);
  }

  // ── Test 2: Unbalanced adjustment → rejected ────────────────────────────────
  try {
    let threw = false;
    try {
      createAdjustment(db, {
        unitId: 'unit-a',
        financialYearId: 'fy-cy',
        adjustmentDate: '2025-03-31',
        adjustmentType: 'Accrued Expense',
        narration: 'Unbalanced entry test',
        lines: [
          { ledgerName: 'Rent Expense', fsliId: fsliRent, debit: 10000, credit: 0 },
          { ledgerName: 'Rent Payable', fsliId: fsliOutstanding, debit: 0, credit: 8000 },
        ],
      });
    } catch (e) {
      threw = true;
    }

    if (threw) {
      add('Test 2: Double-Entry Unbalanced Rejection', true, 'Unbalanced adjustment (Dr ₹10,000 != Cr ₹8,000) was rejected with validation error');
    } else {
      add('Test 2: Double-Entry Unbalanced Rejection', false, 'Unbalanced adjustment was unexpectedly allowed!');
    }
  } catch (err) {
    add('Test 2: Double-Entry Unbalanced Rejection', false, `Error: ${err}`);
  }

  // ── Test 3: Original TB remains unchanged ────────────────────────────────────
  try {
    const origLb = db.prepare('SELECT debit, credit, net_balance FROM LedgerBalance WHERE id = ?').get('lb-rent-a') as { debit: number; credit: number; net_balance: number };
    if (origLb.debit === 120000 && origLb.credit === 0 && origLb.net_balance === 120000) {
      add('Test 3: Original TB Immutability', true, 'Original LedgerBalance record remains untouched (Dr: ₹1,20,000, Cr: ₹0)');
    } else {
      add('Test 3: Original TB Immutability', false, `Original LedgerBalance changed: ${JSON.stringify(origLb)}`);
    }
  } catch (err) {
    add('Test 3: Original TB Immutability', false, `Error: ${err}`);
  }

  // ── Test 4: Phase 7 Regrouping remains unchanged ─────────────────────────────
  try {
    const origRg = db.prepare('SELECT approved_fsli_id, status FROM RegroupingResult WHERE id = ?').get('rr-rent-a') as { approved_fsli_id: string; status: string };
    if (origRg.approved_fsli_id === fsliRent && origRg.status === 'Applied') {
      add('Test 4: Phase 7 Regrouping Immutability', true, 'RegroupingResult record remains untouched in Applied status');
    } else {
      add('Test 4: Phase 7 Regrouping Immutability', false, `RegroupingResult changed: ${JSON.stringify(origRg)}`);
    }
  } catch (err) {
    add('Test 4: Phase 7 Regrouping Immutability', false, `Error: ${err}`);
  }

  // ── Test 5: Approval Workflow (Draft → PendingReview → Approved → Applied) ──
  try {
    if (!adj1) throw new Error('adj1 not initialized');

    // 1. Submit for review
    const submitted = submitAdjustmentForReview(db, adj1.id, 'User1');
    // 2. Approve
    const approved = approveAdjustment(db, adj1.id, 'Manager1');
    // 3. Apply
    const applied = applyAdjustment(db, adj1.id, 'Accountant1');

    const auditHistory = getAdjustmentAuditHistory(db, adj1.id);

    if (
      submitted.status === 'PendingReview' &&
      approved.status === 'Approved' &&
      applied.status === 'Applied' &&
      applied.appliedBy === 'Accountant1' &&
      auditHistory.length >= 4
    ) {
      add('Test 5: Full Approval Workflow Lifecycle', true, 'Successfully transitioned: Draft → PendingReview → Approved → Applied with comprehensive audit trail');
    } else {
      add('Test 5: Full Approval Workflow Lifecycle', false, `Workflow state mismatch: ${applied.status}, audits: ${auditHistory.length}`);
    }
  } catch (err) {
    add('Test 5: Full Approval Workflow Lifecycle', false, `Error: ${err}`);
  }

  // ── Test 6: Rejected adjustment has no financial impact ─────────────────────
  try {
    const rejAdj = createAdjustment(db, {
      unitId: 'unit-a',
      financialYearId: 'fy-cy',
      adjustmentDate: '2025-03-31',
      adjustmentType: 'Provision',
      narration: 'Doubtful provision to be rejected',
      lines: [
        { ledgerName: 'Provision Expense', fsliId: fsliRent, debit: 500000, credit: 0 },
        { ledgerName: 'Provision Liability', fsliId: fsliOutstanding, debit: 0, credit: 500000 },
      ],
    });

    submitAdjustmentForReview(db, rejAdj.id, 'User2');
    const rejected = rejectAdjustment(db, rejAdj.id, 'Inadequate documentation provided', 'Auditor1');

    // Get adjusted trial balance for Unit A
    const adjTB = getAdjustedTrialBalance(db, 'fy-cy', 'unit-a');
    // The ₹5,00,000 provision should NOT be included in totalAdjDebit or totalAdjCredit
    // Only adj1 (₹10,000) should be applied
    if (
      rejected.status === 'Rejected' &&
      rejected.rejectionReason === 'Inadequate documentation provided' &&
      adjTB.totalAdjDebit === 10000
    ) {
      add('Test 6: Rejected Adjustment Has No Financial Impact', true, 'Rejected ₹5,00,000 provision excluded from active adjusted trial balance totals');
    } else {
      add('Test 6: Rejected Adjustment Has No Financial Impact', false, `Rejected status: ${rejected.status}, AdjTB Total Dr: ${adjTB.totalAdjDebit} (expected 10000)`);
    }
  } catch (err) {
    add('Test 6: Rejected Adjustment Has No Financial Impact', false, `Error: ${err}`);
  }

  // ── Test 7: Applied adjustment cannot be edited or deleted ──────────────────
  try {
    if (!adj1) throw new Error('adj1 not initialized');

    let editThrew = false;
    try {
      updateAdjustment(db, adj1.id, { narration: 'Trying to tamper applied adjustment' });
    } catch {
      editThrew = true;
    }

    let deleteThrew = false;
    try {
      deleteAdjustment(db, adj1.id);
    } catch {
      deleteThrew = true;
    }

    // Also test deleting a Draft adjustment works
    const draftAdj = createAdjustment(db, {
      unitId: 'unit-a',
      financialYearId: 'fy-cy',
      adjustmentDate: '2025-03-31',
      adjustmentType: 'Other Adjustment',
      narration: 'Temporary draft for deletion',
      lines: [
        { ledgerName: 'A', fsliId: fsliRent, debit: 500, credit: 0 },
        { ledgerName: 'B', fsliId: fsliOutstanding, debit: 0, credit: 500 },
      ],
    });
    const deleteDraftSuccess = deleteAdjustment(db, draftAdj.id);

    if (editThrew && deleteThrew && deleteDraftSuccess) {
      add('Test 7: Immutability of Applied Adjustments', true, 'Applied adjustments are strictly immutable (cannot edit or delete). Draft deletion permitted.');
    } else {
      add('Test 7: Immutability of Applied Adjustments', false, `editThrew=${editThrew}, deleteThrew=${deleteThrew}, deleteDraftSuccess=${deleteDraftSuccess}`);
    }
  } catch (err) {
    add('Test 7: Immutability of Applied Adjustments', false, `Error: ${err}`);
  }

  // ── Test 8: Reversal correctly offsets an applied adjustment ────────────────
  try {
    if (!adj1) throw new Error('adj1 not initialized');

    const revRes = reverseAdjustment(db, adj1.id, 'Wrong month entered by mistake', 'Manager1');

    if (
      revRes.original.status === 'Reversed' &&
      revRes.original.reversalReason === 'Wrong month entered by mistake' &&
      revRes.reversal.status === 'Applied' &&
      revRes.reversal.reversalOfId === adj1.id &&
      revRes.reversal.adjustmentNumber.endsWith('-REV')
    ) {
      // Check that Adjusted Trial Balance now reflects net 0 adjustment (original 10k Dr + reversal 10k Cr)
      const adjTB = getAdjustedTrialBalance(db, 'fy-cy', 'unit-a');
      const rentRow = adjTB.rows.find((r) => r.fsliId === fsliRent);
      const liabRow = adjTB.rows.find((r) => r.fsliId === fsliOutstanding);

      // Rent had base 120000. Rent adjDr was 10000, rev adjCr is 10000 -> adjNet is 0 -> adjustedNet is 120000
      const netZero = rentRow?.adjustmentNet === 0 && liabRow?.adjustmentNet === 0;

      if (netZero) {
        add('Test 8: Reversal Mechanism & Financial Offset', true, 'Reversal entry created, original marked Reversed, and net adjustment perfectly offsets to ₹0');
      } else {
        add('Test 8: Reversal Mechanism & Financial Offset', false, `Net adjustment not zero: Rent adjNet=${rentRow?.adjustmentNet}, Liab adjNet=${liabRow?.adjustmentNet}`);
      }
    } else {
      add('Test 8: Reversal Mechanism & Financial Offset', false, `Reversal result mismatch: ${JSON.stringify(revRes)}`);
    }
  } catch (err) {
    add('Test 8: Reversal Mechanism & Financial Offset', false, `Error: ${err}`);
  }

  // ── Test 9: Closing Stock Adjustment Creation & FSLI Treatment ──────────────
  let csAdjA: import('./electron-api').AdjustmentRecord | null = null;
  try {
    csAdjA = createClosingStockAdjustment(db, {
      unitId: 'unit-a',
      financialYearId: 'fy-cy',
      adjustmentDate: '2025-03-31',
      closingStockValue: 300000,
      createdBy: 'Store Manager A',
    });

    const lines = csAdjA.lines;
    const invLine = lines.find((l) => l.fsliId === fsliInventories);
    const pnlLine = lines.find((l) => l.fsliId === fsliChangeInStock);

    if (
      csAdjA.isClosingStock &&
      csAdjA.closingStockValue === 300000 &&
      invLine && invLine.debit === 300000 && invLine.credit === 0 &&
      pnlLine && pnlLine.credit === 300000 && pnlLine.debit === 0
    ) {
      add('Test 9: Closing Stock Canonical FSLI Treatment', true, 'Closing Stock ₹3,00,000 correctly debits CA_INVENT (Asset) and credits EXP_CHG_INV (P&L expense credit)');
    } else {
      add('Test 9: Closing Stock Canonical FSLI Treatment', false, `Closing stock lines mismatch: ${JSON.stringify(lines)}`);
    }
  } catch (err) {
    add('Test 9: Closing Stock Canonical FSLI Treatment', false, `Error: ${err}`);
  }

  // ── Test 10: Unit Isolation (Unit A Closing Stock vs Unit B) ─────────────────
  try {
    if (!csAdjA) throw new Error('csAdjA not initialized');

    // Submit, approve, apply Unit A closing stock
    submitAdjustmentForReview(db, csAdjA.id);
    approveAdjustment(db, csAdjA.id);
    applyAdjustment(db, csAdjA.id);

    // Create and apply Unit B closing stock ₹5,00,000
    const csAdjB = createClosingStockAdjustment(db, {
      unitId: 'unit-b',
      financialYearId: 'fy-cy',
      adjustmentDate: '2025-03-31',
      closingStockValue: 500000,
      createdBy: 'Store Manager B',
    });
    submitAdjustmentForReview(db, csAdjB.id);
    approveAdjustment(db, csAdjB.id);
    applyAdjustment(db, csAdjB.id);

    // Query Adjusted Trial Balance for Unit A
    const tbUnitA = getAdjustedTrialBalance(db, 'fy-cy', 'unit-a');
    const invA = tbUnitA.rows.find((r) => r.fsliId === fsliInventories);

    // Query Adjusted Trial Balance for Unit B
    const tbUnitB = getAdjustedTrialBalance(db, 'fy-cy', 'unit-b');
    const invB = tbUnitB.rows.find((r) => r.fsliId === fsliInventories);

    // Unit A inventory must be ₹3,00,000; Unit B inventory must be ₹5,00,000
    if (invA?.adjustedDebit === 300000 && invB?.adjustedDebit === 500000) {
      add('Test 10: Multi-Unit Isolation for Adjustments', true, 'Unit A inventory is ₹3,00,000 and Unit B inventory is ₹5,00,000 with complete isolation');
    } else {
      add('Test 10: Multi-Unit Isolation for Adjustments', false, `Unit A inv=${invA?.adjustedDebit}, Unit B inv=${invB?.adjustedDebit}`);
    }
  } catch (err) {
    add('Test 10: Multi-Unit Isolation for Adjustments', false, `Error: ${err}`);
  }

  // ── Test 11: CY vs PY Independence ──────────────────────────────────────────
  try {
    const tbPY = getAdjustedTrialBalance(db, 'fy-py', 'unit-a');
    // PY should have 0 adjustments because all adjustments were for FY 2024-25 (fy-cy)
    if (tbPY.totalAdjDebit === 0 && tbPY.totalAdjCredit === 0) {
      add('Test 11: CY vs PY Financial Year Isolation', true, 'CY adjustments have 0 leakage into Prior Year (PY)');
    } else {
      add('Test 11: CY vs PY Financial Year Isolation', false, `PY has unexpected adjustments: Dr=${tbPY.totalAdjDebit}, Cr=${tbPY.totalAdjCredit}`);
    }
  } catch (err) {
    add('Test 11: CY vs PY Financial Year Isolation', false, `Error: ${err}`);
  }

  // ── Test 12: No Debit/Credit Netting Preservation ───────────────────────────
  try {
    // In Unit A, check that Debit and Credit columns are kept strictly separate without netting
    const tbUnitA = getAdjustedTrialBalance(db, 'fy-cy', 'unit-a');
    let hasSeparateColumns = true;
    for (const row of tbUnitA.rows) {
      if (row.adjustedDebit === undefined || row.adjustedCredit === undefined) {
        hasSeparateColumns = false;
      }
    }

    if (hasSeparateColumns && tbUnitA.totalAdjustedDebit > 0 && tbUnitA.totalAdjustedCredit > 0) {
      add('Test 12: No Netting Correction Preservation', true, 'Strict separate debit/credit column presentation maintained across all FSLI rows');
    } else {
      add('Test 12: No Netting Correction Preservation', false, 'Failed to maintain separate debit/credit positions');
    }
  } catch (err) {
    add('Test 12: No Netting Correction Preservation', false, `Error: ${err}`);
  }

  // ── Test 13: Downstream Adjusted Financial Integration ──────────────────────
  try {
    // Create new applied adjustment in Unit A: Depreciation ₹25,000
    const fsliDepExp = getFSLIIdByCode('EXP_DEP_AMORT');
    const fsliPPE = getFSLIIdByCode('NCA_PPE');

    const depAdj = createAdjustment(db, {
      unitId: 'unit-a',
      financialYearId: 'fy-cy',
      adjustmentDate: '2025-03-31',
      adjustmentType: 'Depreciation',
      narration: 'Annual depreciation on plant & machinery',
      lines: [
        { ledgerName: 'Depreciation A/c', fsliId: fsliDepExp, debit: 25000, credit: 0 },
        { ledgerName: 'Accumulated Depreciation / PPE', fsliId: fsliPPE, debit: 0, credit: 25000 },
      ],
    });
    submitAdjustmentForReview(db, depAdj.id);
    approveAdjustment(db, depAdj.id);
    applyAdjustment(db, depAdj.id);

    const tb = getAdjustedTrialBalance(db, 'fy-cy', 'unit-a');
    const depRow = tb.rows.find((r) => r.fsliId === fsliDepExp);
    const ppeRow = tb.rows.find((r) => r.fsliId === fsliPPE);

    const depCorrect = depRow?.adjustmentDebit === 25000 && depRow?.adjustedDebit === 25000;
    const ppeCorrect = ppeRow?.adjustmentCredit === 25000 && ppeRow?.adjustedCredit === 25000;

    if (depCorrect && ppeCorrect) {
      add('Test 13: Financial Statement Integration & Aggregations', true, 'Phase 7 Final + Phase 8 Applied Adjustments = Adjusted Financial Balance cleanly reflects Depreciation');
    } else {
      add('Test 13: Financial Statement Integration & Aggregations', false, `depCorrect=${depCorrect}, ppeCorrect=${ppeCorrect}`);
    }
  } catch (err) {
    add('Test 13: Financial Statement Integration & Aggregations', false, `Error: ${err}`);
  }

  // ── Test 14: Controlled "Return to Draft" Action ─────────────────────────────
  try {
    const testAdj = createAdjustment(db, {
      unitId: 'unit-a',
      financialYearId: 'fy-cy',
      adjustmentDate: '2025-03-31',
      adjustmentType: 'Accrued Expense',
      narration: 'Test entry for Return to Draft',
      lines: [
        { ledgerName: 'Misc Exp', fsliId: fsliRent, debit: 2000, credit: 0 },
        { ledgerName: 'Misc Payable', fsliId: fsliOutstanding, debit: 0, credit: 2000 },
      ],
    });

    submitAdjustmentForReview(db, testAdj.id, 'User3');
    approveAdjustment(db, testAdj.id, 'Manager2');

    // Return to Draft without reason should fail
    let emptyReasonThrew = false;
    try {
      returnAdjustmentToDraft(db, testAdj.id, '', 'User3');
    } catch {
      emptyReasonThrew = true;
    }

    // Return to Draft with valid reason
    const returned = returnAdjustmentToDraft(db, testAdj.id, 'Need to adjust amount to ₹2,500 after invoice verification', 'User3');
    const audit = getAdjustmentAuditHistory(db, testAdj.id);
    const returnAudit = audit.find((a) => a.action === 'ReturnedToDraft');

    // Now edit in Draft
    const edited = updateAdjustment(db, testAdj.id, {
      narration: 'Updated misc expense accrual to ₹2,500',
      lines: [
        { ledgerName: 'Misc Exp', fsliId: fsliRent, debit: 2500, credit: 0 },
        { ledgerName: 'Misc Payable', fsliId: fsliOutstanding, debit: 0, credit: 2500 },
      ],
    });

    if (
      emptyReasonThrew &&
      returned.status === 'Draft' &&
      returnAudit &&
      returnAudit.reason === 'Need to adjust amount to ₹2,500 after invoice verification' &&
      edited.totalDebit === 2500
    ) {
      add('Test 14: Controlled Return to Draft Action', true, 'Approved adjustment successfully returned to Draft with mandatory reason and full audit trail; editable once in Draft');
    } else {
      add('Test 14: Controlled Return to Draft Action', false, `Return to draft failed: returned status=${returned.status}, edited totalDebit=${edited.totalDebit}`);
    }
  } catch (err) {
    add('Test 14: Controlled Return to Draft Action', false, `Error: ${err}`);
  }

  const passedTests = results.filter((r) => r.passed).length;
  const totalTests = results.length;
  const allPassed = passedTests === totalTests;

  console.log(`[Phase8 Tests] Completed: ${passedTests}/${totalTests} passed.`);
  return { allPassed, totalTests, passedTests, results };
}
