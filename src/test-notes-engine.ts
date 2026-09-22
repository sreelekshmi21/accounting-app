/**
 * Phase 11: Notes & Schedules Engine Test Suite
 */

import Database from 'better-sqlite3';
import { NOTE_DEFINITIONS } from './notes-master-data';
import { generateNotesData, getNoteDrillDown } from './notes-engine';
import { ensureReportingHierarchyTables } from './reporting-hierarchy-engine';
import { STANDARD_FSLI_CATALOG } from './standard-fsli';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, errorDetail?: any) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${passed}. ${testName} - Passed`);
  } else {
    failed++;
    console.error(`[FAIL] ${testName} - FAILED:`, errorDetail || '');
  }
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
      difference REAL NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE ConsolidationElimination (
      id TEXT PRIMARY KEY, consolidation_run_id TEXT NOT NULL, ledger_id TEXT, ledger_name TEXT NOT NULL,
      unit_id TEXT NOT NULL, fsli_id TEXT, eliminated_amount REAL NOT NULL, status TEXT NOT NULL DEFAULT 'Applied',
      elimination_type TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (consolidation_run_id) REFERENCES ConsolidationRun(id)
    );
  `);

  // Seed Standard FSLI catalog
  const insertFSLI = db.prepare(`
    INSERT OR IGNORE INTO FSLI (id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'SYSTEM', 1, datetime('now'))
  `);
  for (const f of STANDARD_FSLI_CATALOG) {
    insertFSLI.run(f.code, f.name, f.code, f.category, f.subCategory || null, f.displayOrder);
  }

  // Ensure Reporting Hierarchy tables & Master Data (links FSLI to Reporting Nodes)
  ensureReportingHierarchyTables(db);

  // Seed default entities
  db.prepare(`INSERT INTO Client (id, client_name, created_at) VALUES ('default-client', 'Default Client', datetime('now'))`).run();
  db.prepare(`INSERT INTO Entity (id, client_id, entity_name, created_at) VALUES ('default-entity', 'default-client', 'Default Entity', datetime('now'))`).run();

  return db;
}

function runAllTests() {
  console.log('Running Phase 11 Notes & Schedules Engine Test Suite...\n');

  // ── Test 1: Complete 30-Note Inventory ──────────────────────────────────────
  assert(NOTE_DEFINITIONS.length === 30, 'All 30 Notes (Notes 4 through 33) present in master data');
  const noteNumbers = NOTE_DEFINITIONS.map(n => n.noteNumber);
  const expectedNumbers = Array.from({ length: 30 }, (_, i) => i + 4);
  assert(
    JSON.stringify(noteNumbers) === JSON.stringify(expectedNumbers),
    'Note numbers are sequentially numbered exactly 4 to 33'
  );

  // ── Test 2: Note 4 to 19 on Balance Sheet, Note 20 to 33 on I&E ──────────────
  const bsNotes = NOTE_DEFINITIONS.filter(n => n.statementCode === 'BS');
  const ieNotes = NOTE_DEFINITIONS.filter(n => n.statementCode === 'IE');
  assert(bsNotes.length === 16 && bsNotes.every(n => n.noteNumber >= 4 && n.noteNumber <= 19), 'Notes 4-19 map to Balance Sheet');
  assert(ieNotes.length === 14 && ieNotes.every(n => n.noteNumber >= 20 && n.noteNumber <= 33), 'Notes 20-33 map to Income & Expenditure');

  // ── Test 3: Note 5 Reserve & Surplus Per-Sub-Fund Movement Exposure ─────────
  const n5Def = NOTE_DEFINITIONS.find(n => n.noteNumber === 5);
  assert(n5Def !== undefined && n5Def.calculationMethod === 'RESERVE_SURPLUS', 'Note 5 uses RESERVE_SURPLUS calculation method');
  assert(n5Def!.lineItems.length === 12, 'Note 5 contains 11 sub-funds (a-k) plus Total row');

  // ── Test 4: Note 12 CWIP Dedicated Movement Structure ───────────────────────
  const n12Def = NOTE_DEFINITIONS.find(n => n.noteNumber === 12);
  assert(n12Def !== undefined && n12Def.calculationMethod === 'CWIP', 'Note 12 uses dedicated CWIP calculation method');
  assert(n12Def!.lineItems.some(l => l.lineLabel.includes('Community and other Charitable Building')), 'Note 12 contains Charitable Building category');

  // ── Test 5: Note 13 Live Stock Dedicated Movement Structure ──────────────────
  const n13Def = NOTE_DEFINITIONS.find(n => n.noteNumber === 13);
  assert(n13Def !== undefined && n13Def.calculationMethod === 'LIVE_STOCK', 'Note 13 uses dedicated LIVE_STOCK calculation method');
  assert(n13Def!.lineItems.some(l => l.lineLabel.includes('Cows#')), 'Note 13 contains Cows# line item');

  // ── Test 6: Footnote References Preserved Exactly As In Workbook ─────────────
  const n6Def = NOTE_DEFINITIONS.find(n => n.noteNumber === 6)!;
  assert(n6Def.footnotes.some(f => f.includes('Refer foot notes')), 'Note 6 preserves workbook footnote text');

  const n7Def = NOTE_DEFINITIONS.find(n => n.noteNumber === 7)!;
  assert(n7Def.footnotes.includes('* Refer Note 3.6'), 'Note 7 preserves "* Refer Note 3.6"');

  const n9Def = NOTE_DEFINITIONS.find(n => n.noteNumber === 9)!;
  assert(n9Def.footnotes.includes('* Refer Note 3.6 in reference of above figure'), 'Note 9 preserves "* Refer Note 3.6 in reference of above figure"');

  const n17Def = NOTE_DEFINITIONS.find(n => n.noteNumber === 17)!;
  assert(n17Def.footnotes.includes('*Refer Note no 3.9'), 'Note 17 preserves "*Refer Note no 3.9"');

  const n18Def = NOTE_DEFINITIONS.find(n => n.noteNumber === 18)!;
  assert(n18Def.footnotes.includes('*Refer note no 3.6'), 'Note 18 preserves "*Refer note no 3.6"');

  // ── Test 7: Notes Engine Execution against Database ─────────────────────────
  const db = createTestDatabase();

  // Insert Financial Years
  db.prepare(`
    INSERT INTO FinancialYear (id, entity_id, year_label, start_date, end_date, created_at)
    VALUES ('fy-25-26', 'default-entity', '2025-2026', '2025-04-01', '2026-03-31', datetime('now')),
           ('fy-24-25', 'default-entity', '2024-2025', '2024-04-01', '2025-03-31', datetime('now'))
  `).run();

  // Insert Unit
  db.prepare(`
    INSERT INTO Unit (id, entity_id, unit_name, created_at)
    VALUES ('unit-sa-bio', 'default-entity', 'SA Bioproducts', datetime('now'))
  `).run();

  // Insert Import Batch
  db.prepare(`
    INSERT INTO ImportBatch (id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash, total_rows, ledger_count, total_debit, total_credit, difference, import_timestamp, status)
    VALUES ('batch-cy-01', 'default-entity', 'unit-sa-bio', 'fy-25-26', 'trial_balance_cy.xlsx', '/tmp/tb.xlsx', 'hash123', 10, 6, 1622952.84, 1622952.84, 0, datetime('now'), 'SUCCESS')
  `).run();

  // Insert Ledgers & Balances
  // Note 4: Corpus
  db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('led-corp-bf', 'default-entity', 'unit-sa-bio', 'Opening Corpus')`).run();
  db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb-1', 'led-corp-bf', 'fy-25-26', 'batch-cy-01', 0, 1000000)`).run();
  db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm-1', 'led-corp-bf', 'fy-25-26', 'EQ_CAP_FUND', 'Mapped', datetime('now'), datetime('now'))`).run();

  // Note 12: CWIP
  db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('led-cwip-bld', 'default-entity', 'unit-sa-bio', 'CWIP Charitable Building')`).run();
  db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb-2', 'led-cwip-bld', 'fy-25-26', 'batch-cy-01', 500000, 0)`).run();
  db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm-2', 'led-cwip-bld', 'fy-25-26', 'NCA_CWIP', 'Mapped', datetime('now'), datetime('now'))`).run();

  // Note 13: Live Stock
  db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('led-cows', 'default-entity', 'unit-sa-bio', 'Dairy Cows Asset')`).run();
  db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb-3', 'led-cows', 'fy-25-26', 'batch-cy-01', 250000, 0)`).run();
  db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm-3', 'led-cows', 'fy-25-26', 'NCA_LIVESTOCK', 'Mapped', datetime('now'), datetime('now'))`).run();

  // Note 22: Revenue (Sales Kerala)
  db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('led-sales-k', 'default-entity', 'unit-sa-bio', 'Sales in Kerala')`).run();
  db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb-4', 'led-sales-k', 'fy-25-26', 'batch-cy-01', 0, 750000)`).run();
  db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm-4', 'led-sales-k', 'fy-25-26', 'INC_REV_OPS', 'Mapped', datetime('now'), datetime('now'))`).run();

  // Note 33: Rent Expense
  db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('led-rent', 'default-entity', 'unit-sa-bio', 'Factory Rent')`).run();
  db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb-5', 'led-rent', 'fy-25-26', 'batch-cy-01', 120000, 0)`).run();
  db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm-5', 'led-rent', 'fy-25-26', 'EXP_ADMIN_GEN_C3', 'Mapped', datetime('now'), datetime('now'))`).run();

  // Note 25 Opening Stock: Debit 152,952.84
  db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES ('led-op-stk', 'default-entity', 'unit-sa-bio', 'Opening Finished Goods')`).run();
  db.prepare(`INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit) VALUES ('lb-6', 'led-op-stk', 'fy-25-26', 'batch-cy-01', 152952.84, 0)`).run();
  db.prepare(`INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at) VALUES ('lm-6', 'led-op-stk', 'fy-25-26', 'EXP_CHG_INV_OP_MFG', 'Mapped', datetime('now'), datetime('now'))`).run();

  // Run Notes Engine
  const notesResult = generateNotesData(db, 'fy-25-26');

  assert(notesResult.notes.length === 30, 'Engine returns all 30 notes');

  // Test Note 4 generated values
  const genN4 = notesResult.notes.find(n => n.noteNumber === 4)!;
  assert(genN4.cyTotal === 1000000, 'Note 4 Corpus CY Total = ₹1,000,000');
  const n4BfLine = genN4.lines.find(l => l.lineId === 'n4-bf')!;
  assert(n4BfLine.cyAmount === 1000000, 'Note 4 Balance b/f = ₹1,000,000');

  // Test Note 12 CWIP generated values
  const genN12 = notesResult.notes.find(n => n.noteNumber === 12)!;
  assert(genN12.cyTotal === 500000, 'Note 12 CWIP CY Total = ₹500,000');
  const n12BldLine = genN12.lines.find(l => l.lineId === 'n12-bld-ch')!;
  assert(n12BldLine.closingBalance === 500000, 'Note 12 Charitable Building Closing = ₹500,000');
  assert(n12BldLine.additions === 500000, 'Note 12 Charitable Building Additions = ₹500,000');

  // Test Note 13 Live Stock generated values
  const genN13 = notesResult.notes.find(n => n.noteNumber === 13)!;
  assert(genN13.cyTotal === 250000, 'Note 13 Live Stock CY Total = ₹250,000');
  const n13CowsLine = genN13.lines.find(l => l.lineId === 'n13-cows')!;
  assert(n13CowsLine.closingBalance === 250000, 'Note 13 Cows Closing = ₹250,000');

  // Test Note 22 Revenue generated values
  const genN22 = notesResult.notes.find(n => n.noteNumber === 22)!;
  assert(genN22.cyTotal === 750000, 'Note 22 Revenue CY Total = ₹750,000');

  // Test Note 25 Stock Movement signed value
  const genN25 = notesResult.notes.find(n => n.noteNumber === 25)!;
  assert(genN25.cyTotal === -152952.84, 'Note 25 Net Stock Movement = -₹152,952.84');
  const n25OpLine = genN25.lines.find(l => l.lineId === 'n25-op-mfg')!;
  assert(n25OpLine.cyAmount === 152952.84, 'Note 25 Opening Stock Mfg = ₹152,952.84');

  // Test Note 33 Admin Expense
  const genN33 = notesResult.notes.find(n => n.noteNumber === 33)!;
  assert(genN33.cyTotal === 120000, 'Note 33 Admin Expense Total = ₹120,000');

  // Test Note 5 Reserve & Surplus I&E Surplus Transfer
  // Revenue = 750,000 - 152,952.84 = 597,047.16
  // Expense = 120,000
  // Net Surplus = 597,047.16 - 120,000 = 477,047.16
  const genN5 = notesResult.notes.find(n => n.noteNumber === 5)!;
  const n5KLine = genN5.lines.find(l => l.lineId === 'n5-k')!;
  assert(Math.abs((n5KLine.additions || 0) - 477047.16) < 0.01, 'Note 5 sub-fund (k) received I&E Surplus of ₹477,047.16');
  assert(Math.abs((n5KLine.closingBalance || 0) - 477047.16) < 0.01, 'Note 5 sub-fund (k) Closing Balance = ₹477,047.16');
  assert(Math.abs((genN5.cyTotal || 0) - 477047.16) < 0.01, 'Note 5 Total Closing Balance = ₹477,047.16');

  // Test Reconciliation with Statement Lines
  assert(genN4.reconciliation !== null && genN4.reconciliation.isReconciledCY, 'Note 4 reconciled with Balance Sheet Corpus line');
  assert(genN5.reconciliation !== null && genN5.reconciliation.isReconciledCY, 'Note 5 reconciled with Balance Sheet Reserve & Surplus line');
  assert(genN12.reconciliation !== null && genN12.reconciliation.isReconciledCY, 'Note 12 reconciled with Balance Sheet CWIP line');
  assert(genN13.reconciliation !== null && genN13.reconciliation.isReconciledCY, 'Note 13 reconciled with Balance Sheet Live Stock line');
  assert(genN22.reconciliation !== null && genN22.reconciliation.isReconciledCY, 'Note 22 reconciled with I&E Revenue from operations line');
  assert(genN25.reconciliation !== null && genN25.reconciliation.isReconciledCY, 'Note 25 reconciled with I&E Stock Movement line');
  assert(genN33.reconciliation !== null && genN33.reconciliation.isReconciledCY, 'Note 33 reconciled with I&E Admin expenses line');

  // Test Drill-down functionality
  const drillDownN22 = getNoteDrillDown(db, 'fy-25-26', 22, 'n22-sal-ker');
  assert(drillDownN22.ledgers.length === 1, 'Drill-down for Note 22 line returns 1 ledger');
  assert(drillDownN22.ledgers[0].ledgerName === 'Sales in Kerala', 'Drill-down returns correct ledger name');
  assert(drillDownN22.ledgers[0].cyCredit === 750000, 'Drill-down returns correct credit balance');

  console.log(`\n========================================`);
  console.log(`Phase 11 Results: ${passed} / ${passed + failed} passed.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
