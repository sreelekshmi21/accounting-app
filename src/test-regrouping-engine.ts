/**
 * Test Suite: Phase 7 Regrouping Engine (Updated with Strict Eligible-Group Gate & Safeguards)
 *
 * Runs comprehensive automated verification for:
 * 1. Strict 5-Group Whitelist Gate
 * 2. Fixed Assets, Investments, and Branch/Division/Interbranch Safeguards
 * 3. Separate Detection Confidence vs Recommendation Confidence
 * 4. Obsolete/Superseded Status Handling for Ineligible Detections
 * 5. Lifecycle Actions (Approve, Reject, Change, Apply, Undo) & Audit Trail
 * 6. Multi-Unit Isolation & CY/PY Independence
 * 7. Immutability of Raw Ledger Balances, Phase 5 Mappings, and Phase 6 Classifications
 */

import Database from 'better-sqlite3';
import { STANDARD_FSLI_CATALOG } from './standard-fsli';
import {
  generateRegroupingSuggestions,
  approveRegrouping,
  rejectRegrouping,
  changeRegrouping,
  applyRegrouping,
  undoRegrouping,
  createRegroupingRule,
  getRegroupingRules,
  toggleRegroupingRuleAutoApply,
  getRegroupingWorkbenchData,
  getRegroupingAuditHistory,
  isEligibleRegroupingGroup,
} from './regrouping-engine';

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
      detected_columns TEXT,
      FOREIGN KEY (entity_id) REFERENCES Entity(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES Unit(id) ON DELETE CASCADE,
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id) ON DELETE CASCADE
    );

    CREATE TABLE TallyGroup (
      id TEXT PRIMARY KEY,
      import_batch_id TEXT NOT NULL,
      group_name TEXT NOT NULL,
      parent_group_id TEXT,
      depth INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (import_batch_id) REFERENCES ImportBatch(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_group_id) REFERENCES TallyGroup(id) ON DELETE CASCADE
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
      active INTEGER DEFAULT 1,
      FOREIGN KEY (entity_id) REFERENCES Entity(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES Unit(id) ON DELETE CASCADE,
      FOREIGN KEY (tally_group_id) REFERENCES TallyGroup(id) ON DELETE SET NULL,
      FOREIGN KEY (source_import_id) REFERENCES ImportBatch(id) ON DELETE SET NULL,
      UNIQUE(entity_id, unit_id, ledger_name)
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
      net_balance REAL DEFAULT 0,
      FOREIGN KEY (ledger_id) REFERENCES Ledger(id) ON DELETE CASCADE,
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id) ON DELETE CASCADE,
      FOREIGN KEY (import_batch_id) REFERENCES ImportBatch(id) ON DELETE CASCADE,
      UNIQUE(ledger_id, financial_year_id, import_batch_id)
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
      created_at TEXT NOT NULL,
      parent_fsli_id TEXT,
      FOREIGN KEY (parent_fsli_id) REFERENCES FSLI(id) ON DELETE SET NULL
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
      updated_at TEXT NOT NULL,
      FOREIGN KEY (ledger_id) REFERENCES Ledger(id) ON DELETE CASCADE,
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id) ON DELETE CASCADE,
      FOREIGN KEY (child_fsli_id) REFERENCES FSLI(id) ON DELETE SET NULL,
      FOREIGN KEY (parent_fsli_id) REFERENCES FSLI(id) ON DELETE SET NULL,
      FOREIGN KEY (final_fsli_id) REFERENCES FSLI(id) ON DELETE SET NULL,
      UNIQUE(ledger_id, financial_year_id)
    );

    CREATE TABLE RegroupingRule (
      id TEXT PRIMARY KEY,
      rule_name TEXT NOT NULL,
      description TEXT,
      conditions TEXT NOT NULL,
      target_fsli_id TEXT,
      target_classification TEXT,
      confidence REAL NOT NULL DEFAULT 0.85,
      auto_apply INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (target_fsli_id) REFERENCES FSLI(id) ON DELETE SET NULL
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
      balance_nature TEXT NOT NULL CHECK(balance_nature IN ('Debit','Credit','Zero')),
      tally_group_name TEXT,
      ledger_name TEXT NOT NULL,
      reason TEXT,
      rule_id TEXT,
      rule_name TEXT,
      confidence REAL NOT NULL DEFAULT 0,
      detection_confidence REAL NOT NULL DEFAULT 1.0,
      recommendation_confidence REAL NOT NULL DEFAULT 0.85,
      status TEXT NOT NULL DEFAULT 'Detected'
            CHECK(status IN (
              'Detected','NeedsReview','Approved','Rejected',
              'Applied','AutoApplied','Undone','Obsolete'
            )),
      approved_by TEXT,
      approved_at TEXT,
      applied_by TEXT,
      applied_at TEXT,
      undone_by TEXT,
      undone_at TEXT,
      undo_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (ledger_id) REFERENCES Ledger(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES Unit(id) ON DELETE CASCADE,
      FOREIGN KEY (entity_id) REFERENCES Entity(id) ON DELETE CASCADE,
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id) ON DELETE CASCADE,
      FOREIGN KEY (before_fsli_id) REFERENCES FSLI(id) ON DELETE SET NULL,
      FOREIGN KEY (proposed_fsli_id) REFERENCES FSLI(id) ON DELETE SET NULL,
      FOREIGN KEY (approved_fsli_id) REFERENCES FSLI(id) ON DELETE SET NULL,
      FOREIGN KEY (rule_id) REFERENCES RegroupingRule(id) ON DELETE SET NULL
    );

    CREATE TABLE RegroupingAudit (
      id TEXT PRIMARY KEY,
      regrouping_result_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN (
        'Detected','Approved','Rejected','Changed','Applied','AutoApplied','Undone','Obsolete'
      )),
      before_status TEXT,
      after_status TEXT,
      before_fsli_id TEXT,
      after_fsli_id TEXT,
      before_classification TEXT,
      after_classification TEXT,
      reason TEXT,
      performed_by TEXT,
      performed_at TEXT NOT NULL,
      FOREIGN KEY (regrouping_result_id) REFERENCES RegroupingResult(id) ON DELETE CASCADE
    );
  `);

  // Seed standard FSLIs
  const now = new Date().toISOString();
  const insertFSLI = db.prepare(`
    INSERT INTO FSLI (id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'SYSTEM', 1, ?)
  `);

  for (const f of STANDARD_FSLI_CATALOG) {
    insertFSLI.run(`fsli-${f.code.toLowerCase().replace(/_/g, '-')}`, f.name, f.code, f.category, f.subCategory, f.displayOrder, now);
  }

  // Seed default Client, Entity, Unit, FYs
  db.prepare(`INSERT INTO Client VALUES ('cli-1', 'Test Client', ?)`).run(now);
  db.prepare(`INSERT INTO Entity VALUES ('ent-1', 'cli-1', 'Test Entity', ?)`).run(now);
  db.prepare(`INSERT INTO Unit VALUES ('unit-1', 'ent-1', 'Head Office', ?)`).run(now);
  db.prepare(`INSERT INTO Unit VALUES ('unit-2', 'ent-1', 'Plant 1', ?)`).run(now);
  db.prepare(`INSERT INTO FinancialYear VALUES ('fy-cy', 'ent-1', '2024-25', '2024-04-01', '2025-03-31', ?)`).run(now);
  db.prepare(`INSERT INTO FinancialYear VALUES ('fy-py', 'ent-1', '2023-24', '2023-04-01', '2024-03-31', ?)`).run(now);

  return db;
}

export function runRegroupingEngineTests(): boolean {
  console.log('\n======================================================');
  console.log('🧪 Starting Phase 7 Regrouping Engine Test Suite');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  const db = createTestDatabase();
  const now = new Date().toISOString();

  // Helper to add sample ledgers
  function setupLedger(
    id: string,
    unitId: string,
    fyId: string,
    batchId: string,
    ledgerName: string,
    groupName: string,
    debit: number,
    credit: number,
    classificationFSLICode?: string,
  ) {
    // ImportBatch
    db.prepare(`
      INSERT OR IGNORE INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, import_timestamp, status)
      VALUES (?, 'ent-1', ?, ?, 'tb.xlsx', '/tb.xlsx', 'hash', ?, 'SUCCESS')
    `).run(batchId, unitId, fyId, now);

    // TallyGroup
    const groupId = `grp-${groupName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    db.prepare(`
      INSERT OR IGNORE INTO TallyGroup (id, import_batch_id, group_name)
      VALUES (?, ?, ?)
    `).run(groupId, batchId, groupName);

    // Ledger
    db.prepare(`
      INSERT OR IGNORE INTO Ledger (id, entity_id, unit_id, ledger_name, tally_group_id)
      VALUES (?, 'ent-1', ?, ?, ?)
    `).run(id, unitId, ledgerName, groupId);

    // LedgerBalance
    const net = debit - credit;
    db.prepare(`
      INSERT OR REPLACE INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit, net_balance)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`lb-${id}-${fyId}`, id, fyId, batchId, debit, credit, net);

    // LedgerClassification (Phase 6 snapshot)
    if (classificationFSLICode) {
      const fsliRow = db.prepare(`SELECT id, fsli_name FROM FSLI WHERE fsli_code = ?`).get(classificationFSLICode) as { id: string; fsli_name: string } | undefined;
      if (fsliRow) {
        db.prepare(`
          INSERT OR REPLACE INTO LedgerClassification (
            id, ledger_id, financial_year_id, original_tally_classification,
            application_classification, child_fsli_id, final_fsli_id,
            classification_source, confidence_score, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'AUTO', 0.95, 'Classified', ?, ?)
        `).run(`cls-${id}-${fyId}`, id, fyId, groupName, fsliRow.fsli_name, fsliRow.id, fsliRow.id, now, now);
      }
    }
  }

  // Set up test data for CY:

  // --- Whitelist Eligible Candidates ---
  // 1. Sundry Creditors (Trade) with Debit balance -> VALID candidate
  setupLedger('l-cred-trade-deb', 'unit-1', 'fy-cy', 'b1', 'ABC Supplier Advance', 'Sundry Creditors (Trade)', 75000, 0, 'CL_TRADE_PAY');

  // 2. Sundry Creditors (Others) with Debit balance -> VALID candidate
  setupLedger('l-cred-oth-deb', 'unit-1', 'fy-cy', 'b1', 'XYZ Expense Creditor Advance', 'Sundry Creditors (Others)', 25000, 0, 'CL_TRADE_PAY');

  // 3. Sundry Debtors with Credit balance -> VALID candidate
  setupLedger('l-debt-cred', 'unit-1', 'fy-cy', 'b1', 'Acme Customer Overpayment', 'Sundry Debtors', 0, 30000, 'CA_TRADE_REC');

  // 4. Loans and Advances (Asset) with Credit balance -> VALID candidate (NeedsReview)
  setupLedger('l-loan-adv-cred', 'unit-1', 'fy-cy', 'b1', 'Staff Advance Over-Recovery', 'Loans and Advances (Asset)', 0, 12000, 'CA_ST_LOAN');

  // 5. Advance from Customers with Debit balance -> VALID candidate (NeedsReview)
  setupLedger('l-adv-cust-deb', 'unit-1', 'fy-cy', 'b1', 'Client Deposit Refund Due', 'Advance from Customers', 18000, 0, 'CL_OTH_LIAB');

  // --- Normal Balances (Should NOT be detected) ---
  // 6. Normal Sundry Creditor with Credit balance
  setupLedger('l-cred-norm', 'unit-1', 'fy-cy', 'b1', 'Vendor Normal Ltd', 'Sundry Creditors (Trade)', 0, 50000, 'CL_TRADE_PAY');

  // 7. Normal Sundry Debtor with Debit balance
  setupLedger('l-debt-norm', 'unit-1', 'fy-cy', 'b1', 'Customer Normal Ltd', 'Sundry Debtors', 120000, 0, 'CA_TRADE_REC');

  // --- Safeguard Exclusions (Must NEVER be detected as regrouping candidates) ---
  // 8. Fixed Assets under Sundry Creditors (Debit balance)
  setupLedger('l-fa-deb', 'unit-1', 'fy-cy', 'b1', 'Fixed Assets', 'Sundry Creditors', 353276320.49, 0, 'NCA_PPE');

  // 9. Investments under Sundry Creditors (Debit balance)
  setupLedger('l-inv-deb', 'unit-1', 'fy-cy', 'b1', 'Investments', 'Sundry Creditors', 19367003.00, 0, 'NCA_OTH_ASSET');

  // 10. Santhigiri Ashram HO under Branch / Divisions (Debit balance) -> Protected for Phase 9
  setupLedger('l-ho-deb', 'unit-1', 'fy-cy', 'b1', 'Santhigiri Ashram HO', 'Branch / Divisions', 100167484.11, 0, 'CL_OTH_LIAB');

  // 11. Duties & Taxes with Debit balance -> Must NOT be detected (catch-all disabled)
  setupLedger('l-tax-deb', 'unit-1', 'fy-cy', 'b1', 'GST Input Credit (IGST)', 'Duties & Taxes', 45000, 0, 'CL_DUTIES_TAX');

  // 12. Bank Account with Credit balance -> Must NOT be detected (catch-all disabled)
  setupLedger('l-bank-od', 'unit-1', 'fy-cy', 'b1', 'HDFC Bank OD A/c', 'Bank Accounts', 0, 95000, 'CA_CASH_EQUIV');

  // 13. Expense with Credit balance -> Must NOT be detected (catch-all disabled)
  setupLedger('l-exp-cred', 'unit-1', 'fy-cy', 'b1', 'Audit Fee Discount', 'Indirect Expenses', 0, 5000, 'EXP_ADMIN_GEN');

  // Set up PY data (CY and PY independence verification)
  setupLedger('l-cred-trade-deb', 'unit-1', 'fy-py', 'b2', 'ABC Supplier Advance', 'Sundry Creditors (Trade)', 0, 40000, 'CL_TRADE_PAY');

  // Set up Unit 2 data (Multi-Unit isolation verification)
  setupLedger('l-u2-cred-norm', 'unit-2', 'fy-cy', 'b3', 'Plant 1 Normal Supplier', 'Sundry Creditors (Trade)', 0, 80000, 'CL_TRADE_PAY');

  console.log('\n--- 1. Strict Whitelist & Safeguard Tests ---');

  // Test isEligibleRegroupingGroup helper directly
  const faElig = isEligibleRegroupingGroup('Sundry Creditors', null, 'Fixed Assets');
  assert(!faElig.eligible, 'Fixed Assets under Sundry Creditors is NOT eligible');

  const invElig = isEligibleRegroupingGroup('Sundry Creditors', null, 'Investments');
  assert(!invElig.eligible, 'Investments under Sundry Creditors is NOT eligible');

  const hoElig = isEligibleRegroupingGroup('Branch / Divisions', null, 'Santhigiri Ashram HO');
  assert(!hoElig.eligible, 'Santhigiri Ashram HO under Branch / Divisions is NOT eligible');

  const credTradeElig = isEligibleRegroupingGroup('Sundry Creditors (Trade)', null, 'ABC Supplier');
  assert(credTradeElig.eligible && credTradeElig.groupCategory === 'CreditorsTrade', 'Sundry Creditors (Trade) is eligible');

  const credOthElig = isEligibleRegroupingGroup('Sundry Creditors (Others)', null, 'XYZ Vendor');
  assert(credOthElig.eligible && credOthElig.groupCategory === 'CreditorsOthers', 'Sundry Creditors (Others) is eligible');

  const debtElig = isEligibleRegroupingGroup('Sundry Debtors', null, 'Acme Customer');
  assert(debtElig.eligible && debtElig.groupCategory === 'Debtors', 'Sundry Debtors is eligible');

  const loanElig = isEligibleRegroupingGroup('Loans and Advances (Asset)', null, 'Staff Advance');
  assert(loanElig.eligible && loanElig.groupCategory === 'LoansAdvancesAsset', 'Loans and Advances (Asset) is eligible');

  const custAdvElig = isEligibleRegroupingGroup('Advance from Customers', null, 'Client Advance');
  assert(custAdvElig.eligible && custAdvElig.groupCategory === 'AdvanceFromCustomers', 'Advance from Customers is eligible');

  console.log('\n--- 2. Detection Engine Execution Tests ---');

  const detRes = generateRegroupingSuggestions(db, 'fy-cy');
  assert(detRes.detectedCount >= 3, `Detection generated ${detRes.detectedCount} detected anomalies`);

  const wbData = getRegroupingWorkbenchData(db, 'fy-cy');

  // Verify non-detections (Safeguards)
  const faRow = wbData.rows.find((r) => r.ledgerName === 'Fixed Assets');
  assert(!faRow || faRow.status === 'Obsolete', 'Fixed Assets is NOT an active regrouping candidate');

  const invRow = wbData.rows.find((r) => r.ledgerName === 'Investments');
  assert(!invRow || invRow.status === 'Obsolete', 'Investments is NOT an active regrouping candidate');

  const hoRow = wbData.rows.find((r) => r.ledgerName === 'Santhigiri Ashram HO');
  assert(!hoRow || hoRow.status === 'Obsolete', 'Santhigiri Ashram HO is NOT an active regrouping candidate');

  const taxRow = wbData.rows.find((r) => r.ledgerName === 'GST Input Credit (IGST)');
  assert(!taxRow || taxRow.status === 'Obsolete', 'Duties & Taxes with debit balance is NOT an active candidate');

  const bankRow = wbData.rows.find((r) => r.ledgerName === 'HDFC Bank OD A/c');
  assert(!bankRow || bankRow.status === 'Obsolete', 'Bank account with credit balance is NOT an active candidate');

  const expRow = wbData.rows.find((r) => r.ledgerName === 'Audit Fee Discount');
  assert(!expRow || expRow.status === 'Obsolete', 'Expense with credit balance is NOT an active candidate');

  const normCredRow = wbData.rows.find((r) => r.ledgerName === 'Vendor Normal Ltd');
  assert(!normCredRow, 'Normal creditor is NOT detected');

  const normDebtRow = wbData.rows.find((r) => r.ledgerName === 'Customer Normal Ltd');
  assert(!normDebtRow, 'Normal debtor is NOT detected');

  // Verify valid detections
  const credTradeRow = wbData.rows.find((r) => r.ledgerName === 'ABC Supplier Advance');
  assert(!!credTradeRow && credTradeRow.status === 'Detected', 'Sundry Creditors (Trade) with debit balance detected');
  assert(credTradeRow?.proposedClassification?.includes('Supplier Advance') ?? false, 'Proposed classification is Supplier Advance');
  assert(credTradeRow?.detectionConfidence === 1.0, 'Detection confidence is 1.0 (100%)');
  assert(credTradeRow?.recommendationConfidence === 0.85, 'Recommendation confidence is 0.85 (85%)');

  const credOthRow = wbData.rows.find((r) => r.ledgerName === 'XYZ Expense Creditor Advance');
  assert(!!credOthRow && credOthRow.status === 'Detected', 'Sundry Creditors (Others) with debit balance detected');

  const debtCredRow = wbData.rows.find((r) => r.ledgerName === 'Acme Customer Overpayment');
  assert(!!debtCredRow && debtCredRow.status === 'Detected', 'Sundry Debtors with credit balance detected');
  assert(debtCredRow?.proposedClassification?.includes('Customer Advance') ?? false, 'Proposed classification is Customer Advance');

  const loanAdvRow = wbData.rows.find((r) => r.ledgerName === 'Staff Advance Over-Recovery');
  assert(!!loanAdvRow && loanAdvRow.status === 'NeedsReview', 'Loans and Advances with credit balance detected as NeedsReview');

  const advCustRow = wbData.rows.find((r) => r.ledgerName === 'Client Deposit Refund Due');
  assert(!!advCustRow && advCustRow.status === 'NeedsReview', 'Advance from Customers with debit balance detected as NeedsReview');

  console.log('\n--- 3. Obsolete Status Transition & Audit Trail Tests ---');

  // Simulate an old invalid candidate in DB (e.g. Santhigiri Ashram HO from prior run)
  db.prepare(`
    INSERT OR REPLACE INTO RegroupingResult (
      id, ledger_id, unit_id, entity_id, financial_year_id,
      balance_debit, balance_credit, balance_net, balance_nature,
      ledger_name, tally_group_name, confidence, detection_confidence, recommendation_confidence,
      status, created_at, updated_at
    ) VALUES (
      'rg-test-legacy-ho', 'l-ho-deb', 'unit-1', 'ent-1', 'fy-cy',
      100167484.11, 0, 100167484.11, 'Debit',
      'Santhigiri Ashram HO', 'Branch / Divisions', 0.75, 1.0, 0.75,
      'NeedsReview', ?, ?
    )
  `).run(now, now);

  // Run suggestions -> should transition legacy HO candidate to 'Obsolete' instead of hard delete
  generateRegroupingSuggestions(db, 'fy-cy');
  const hoLegacyRow = db.prepare(`SELECT status, reason FROM RegroupingResult WHERE id = 'rg-test-legacy-ho'`).get() as { status: string; reason: string } | undefined;
  assert(hoLegacyRow?.status === 'Obsolete', 'Legacy ineligible candidate transitioned to Obsolete status');
  assert(hoLegacyRow?.reason?.includes('Branch / Division') ?? false, 'Obsolete reason explains Branch/Division protection');

  const hoAudit = getRegroupingAuditHistory(db, 'rg-test-legacy-ho');
  assert(hoAudit.some((a) => a.action === 'Obsolete'), 'Audit trail recorded Obsolete transition');

  console.log('\n--- 4. Regrouping Actions & State Lifecycle Tests ---');

  if (credTradeRow) {
    // Approve
    const approved = approveRegrouping(db, credTradeRow.id, 'Test Auditor');
    assert(approved.status === 'Approved', 'Approve action sets status to Approved');
    assert(approved.approvedBy === 'Test Auditor', 'Approved by auditor recorded');

    // Change target FSLI
    const othAssetFSLI = db.prepare(`SELECT id, fsli_name FROM FSLI WHERE fsli_code = 'CA_OTH_ASSET'`).get() as { id: string; fsli_name: string };
    const changed = changeRegrouping(db, credTradeRow.id, othAssetFSLI.id, 'Direct Supplier Advance', 'Reclassified target', 'Test Auditor');
    assert(changed.approvedClassification === 'Direct Supplier Advance', 'Target classification updated');
    assert(changed.approvedFSLIId === othAssetFSLI.id, 'Target FSLI ID updated');

    // Apply
    const applied = applyRegrouping(db, credTradeRow.id, 'Test Auditor');
    assert(applied.status === 'Applied', 'Apply action sets status to Applied');

    // Undo
    const undone = undoRegrouping(db, credTradeRow.id, 'Test Auditor', 'Reversing for audit adjustment');
    assert(undone.status === 'Undone', 'Undo action sets status to Undone');
  }

  if (debtCredRow) {
    // Reject
    const rejected = rejectRegrouping(db, debtCredRow.id, 'Test Auditor', 'Valid operational advance');
    assert(rejected.status === 'Rejected', 'Reject action sets status to Rejected');
  }

  console.log('\n--- 5. User Rules on Whitelisted Groups ---');

  // Create user rule on eligible group
  const userRule = createRegroupingRule(db, {
    ruleName: 'Custom Trade Creditor Advance Rule',
    description: 'Custom rule for trade advances',
    conditions: {
      rules: [
        { field: 'tally_group', operator: 'contains', value: 'Trade' },
        { field: 'balance_nature', operator: 'equals', value: 'Debit' },
      ],
    },
    targetFSLIId: (db.prepare(`SELECT id FROM FSLI WHERE fsli_code = 'CA_OTH_ASSET'`).get() as { id: string }).id,
    targetClassification: 'Other Current Assets - Trade Advances',
    confidence: 0.92,
    autoApply: false,
  });
  assert(!!userRule.id, 'Created user regrouping rule');

  const rulesList = getRegroupingRules(db);
  assert(rulesList.length >= 1, 'getRegroupingRules returns created rule');

  toggleRegroupingRuleAutoApply(db, userRule.id, true);
  const updatedRule = getRegroupingRules(db).find((r) => r.id === userRule.id);
  assert(updatedRule?.autoApply === true, 'Rule auto-apply enabled');

  console.log('\n--- 6. Safeguards: Unit Isolation, CY/PY, Data Preservation ---');

  // CY and PY independence
  const pyData = getRegroupingWorkbenchData(db, 'fy-py');
  assert(pyData.rows.length === 0, 'PY has NO regrouping anomalies initially');
  const pyRes = generateRegroupingSuggestions(db, 'fy-py');
  assert(pyRes.detectedCount === 0, 'PY suggestions detected 0 anomalies (ABC was credit in PY)');

  // Unit 2 isolation
  const u2Rows = wbData.rows.filter((r) => r.unitId === 'unit-2' && r.status !== 'Obsolete');
  assert(u2Rows.length === 0, 'Unit 2 has NO regrouping candidates because its supplier balance was credit');

  // Immutability of raw ledger balance and Phase 6 classification
  const origBalance = db.prepare(`SELECT debit, credit, net_balance FROM LedgerBalance WHERE ledger_id = 'l-cred-trade-deb' AND financial_year_id = 'fy-cy'`).get() as { debit: number; credit: number; net_balance: number };
  assert(origBalance.debit === 75000 && origBalance.credit === 0, 'Original LedgerBalance debit/credit preserved');

  const origClassification = db.prepare(`SELECT application_classification FROM LedgerClassification WHERE ledger_id = 'l-cred-trade-deb' AND financial_year_id = 'fy-cy'`).get() as { application_classification: string };
  assert(origClassification.application_classification === 'Trade Payables', 'Original Phase 6 LedgerClassification unchanged');

  console.log('\n--- 7. Non-Netting Verification for Specific 5 Groups ---');

  // Insert ledger with BOTH debit and credit on Sundry Creditors (Trade)
  // Example: Ledger A has Credit ₹10,00,000 and Debit ₹2,00,000
  setupLedger(
    'l-split-cred',
    'unit-1',
    'fy-cy',
    'b-split-1',
    'Consolidated Trade Creditor',
    'Sundry Creditors (Trade)',
    200000,
    1000000,
    'CL_TRD_PAY',
  );

  // Run detection
  generateRegroupingSuggestions(db, 'fy-cy');
  const wbSplit = getRegroupingWorkbenchData(db, 'fy-cy');

  const splitDebCandidate = wbSplit.rows.find((r) => r.ledgerId === 'l-split-cred' && r.balanceNature === 'Debit');
  assert(!!splitDebCandidate, 'Un-netted Debit component (₹2,00,000) preserved and detected as candidate');
  assert(splitDebCandidate?.balanceDebit === 200000 && splitDebCandidate?.balanceCredit === 0, 'Debit component balance is exactly gross ₹2,00,000 (not netted to -₹8,00,000)');
  assert(
    (splitDebCandidate?.proposedClassification?.includes('Supplier Advance') ||
      splitDebCandidate?.proposedClassification?.includes('Trade Advances')) ??
      false,
    'Debit component proposed for advance regrouping',
  );

  // Verify other groups (e.g. Sales, Expenses) remain normally netted
  setupLedger(
    'l-netted-sales',
    'unit-1',
    'fy-cy',
    'b-split-2',
    'Sales Mixed Account',
    'Sales Accounts',
    1000,
    50000,
    'REV_OPS',
  );

  generateRegroupingSuggestions(db, 'fy-cy');
  const wbSales = getRegroupingWorkbenchData(db, 'fy-cy');
  const salesCandidate = wbSales.rows.find((r) => r.ledgerId === 'l-netted-sales');
  assert(!salesCandidate || salesCandidate.status === 'Obsolete', 'Non-eligible groups (Sales) are netted and not created as separate un-netted candidates');

  console.log('\n======================================================');
  console.log(`📊 Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  return failed === 0;
}

if (require.main === module) {
  const success = runRegroupingEngineTests();
  process.exit(success ? 0 : 1);
}
