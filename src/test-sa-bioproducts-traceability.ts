import Database from 'better-sqlite3';
import {
  ensureReportingHierarchyTables,
  generateReportingHierarchyData,
} from './reporting-hierarchy-engine';
import { autoClassifyLedgers } from './classification-engine';
import { seedStandardFSLIs } from './database';

function runSABioproductsVerification() {
  console.log('--- Starting SA Bioproducts Traceability Verification ---');

  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  // Create Schema
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
      confidence_score REAL, mapping_source TEXT, reason TEXT, status TEXT NOT NULL DEFAULT 'Suggested',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (ledger_id) REFERENCES Ledger(id),
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id),
      FOREIGN KEY (mapped_fsli_id) REFERENCES FSLI(id)
    );
    CREATE TABLE LedgerClassification (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL,
      original_tally_classification TEXT, application_classification TEXT,
      child_fsli_id TEXT, parent_fsli_id TEXT, final_fsli_id TEXT,
      classification_source TEXT NOT NULL, confidence_score REAL, reason TEXT,
      is_manual_override INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Classified',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (ledger_id) REFERENCES Ledger(id),
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id),
      FOREIGN KEY (child_fsli_id) REFERENCES FSLI(id),
      FOREIGN KEY (parent_fsli_id) REFERENCES FSLI(id),
      FOREIGN KEY (final_fsli_id) REFERENCES FSLI(id),
      UNIQUE(ledger_id, financial_year_id)
    );
    CREATE TABLE RegroupingResult (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL,
      rule_id TEXT, proposed_fsli_id TEXT, approved_fsli_id TEXT, status TEXT NOT NULL,
      confidence_score REAL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE Adjustment (
      id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, financial_year_id TEXT NOT NULL,
      adjustment_number TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL,
      effective_date TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE AdjustmentLine (
      id TEXT PRIMARY KEY, adjustment_id TEXT NOT NULL, fsli_id TEXT NOT NULL,
      debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (adjustment_id) REFERENCES Adjustment(id),
      FOREIGN KEY (fsli_id) REFERENCES FSLI(id)
    );
    CREATE TABLE ConsolidationElimination (
      id TEXT PRIMARY KEY, consolidation_run_id TEXT NOT NULL, fsli_id TEXT,
      eliminated_amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL
    );
    CREATE TABLE LedgerReportingOverride (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL,
      reporting_node_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);

  // 1. Seed FSLIs and Reporting Hierarchy
  seedStandardFSLIs(db);
  ensureReportingHierarchyTables(db);

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO Client VALUES ('client-1', 'Test Client', ?)`).run(now);
  db.prepare(`INSERT INTO Entity VALUES ('default-entity', 'client-1', 'SA Bioproducts Entity', ?)`).run(now);
  db.prepare(`INSERT INTO Unit VALUES ('sa-bio-unit', 'default-entity', 'SA Bioproducts', ?)`).run(now);
  db.prepare(`INSERT INTO FinancialYear VALUES ('fy-2025-26', 'default-entity', '2025-26', '2025-04-01', '2026-03-31', ?)`).run(now);

  const totalDr = 249180.00 + 1287.23 + 6000.00 + 50.00 + 152952.84;
  db.prepare(`
    INSERT INTO ImportBatch (
      id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash,
      total_debit, total_credit, difference, import_timestamp, status
    ) VALUES (
      'batch-1', 'default-entity', 'sa-bio-unit', 'fy-2025-26',
      'SA_Bioproducts_TB.xlsx', '/data/SA_Bioproducts_TB.xlsx', 'hash123',
      ?, ?, 0, ?, 'SUCCESS'
    )
  `).run(totalDr, totalDr, now);

  // Insert SA Bioproducts Trial Balance ledgers
  const ledgers = [
    { id: 'l1', name: 'Interest on borrowings', dr: 249180.00, cr: 0, mappedFsli: 'EXP_FIN_COST' },
    { id: 'l2', name: 'Financial Charges - Bank Charges - Finance Cost', dr: 1287.23, cr: 0, mappedFsli: 'EXP_FIN_COST' },
    { id: 'l3', name: 'Auditors Remuneration', dr: 6000.00, cr: 0, mappedFsli: 'EXP_OTH_EXP' },
    { id: 'l4', name: 'Advertisement Expenses - Business Promotion', dr: 50.00, cr: 0, mappedFsli: 'EXP_OTH_EXP' },
    { id: 'l5', name: 'Opening Stock - Raw Materials', dr: 152952.84, cr: 0, mappedFsli: 'EXP_CHG_INV' },
    { id: 'l6_bal', name: 'Corpus / Balancing Credit', dr: 0, cr: totalDr, mappedFsli: 'EQ_CAP_FUND' },
  ];

  for (const l of ledgers) {
    db.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES (?, 'default-entity', 'sa-bio-unit', ?)`).run(l.id, l.name);
    db.prepare(`
      INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit, net_balance)
      VALUES (?, ?, 'fy-2025-26', 'batch-1', ?, ?, ?)
    `).run(`lb-${l.id}`, l.id, l.dr, l.cr, l.dr - l.cr);

    const fsliRow = db.prepare('SELECT id FROM FSLI WHERE fsli_code = ?').get(l.mappedFsli) as { id: string };
    db.prepare(`
      INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at)
      VALUES (?, ?, 'fy-2025-26', ?, 'Mapped', ?, ?)
    `).run(`lm-${l.id}`, l.id, fsliRow.id, now, now);
  }

  // Run Phase 6 Auto Classification
  console.log('Running Phase 6 Auto Classification with keyword refinement...');
  const clsResult = autoClassifyLedgers(db, 'fy-2025-26', 'sa-bio-unit', 'batch-1');
  console.log(`Classified: ${clsResult.classifiedCount}, Skipped: ${clsResult.skippedCount}`);

  // Generate Phase 10 Reporting Hierarchy
  console.log('Generating Phase 10 Reporting Hierarchy...');
  const report = generateReportingHierarchyData(db, 'fy-2025-26', { unitId: 'sa-bio-unit' });

  // 1. Verify Schedule 32: Finance Costs
  const sch32 = report.scheduleRows.find(s => s.scheduleCode === 'SCH_32');
  if (!sch32) throw new Error('Schedule 32 not found!');
  console.log(`\nSchedule 32 Total: ₹${sch32.cyTotal.toFixed(2)} (Expected: ₹250467.23)`);
  if (Math.abs(sch32.cyTotal - 250467.23) > 0.01) {
    throw new Error(`Schedule 32 total mismatch: got ${sch32.cyTotal}, expected 250467.23`);
  }

  const intBorrNode = sch32.nodes.find(n => n.nodeCode === 'N_32_INT_BORR');
  const bankChgNode = sch32.nodes.find(n => n.nodeCode === 'N_32_BANK_CHG');

  console.log(`  - Interest on Borrowings (N_32_INT_BORR): ₹${intBorrNode?.cyNet} (Expected: ₹249180.00)`);
  console.log(`    Contributing ledgers: ${JSON.stringify(intBorrNode?.ledgerDetails?.map(l => ({ name: l.ledgerName, net: l.net })))}`);
  console.log(`  - Bank Charges (N_32_BANK_CHG): ₹${bankChgNode?.cyNet} (Expected: ₹1287.23)`);
  console.log(`    Contributing ledgers: ${JSON.stringify(bankChgNode?.ledgerDetails?.map(l => ({ name: l.ledgerName, net: l.net })))}`);

  if (Math.abs((intBorrNode?.cyNet || 0) - 249180.00) > 0.01) {
    throw new Error(`N_32_INT_BORR mismatch: got ${intBorrNode?.cyNet}, expected 249180.00`);
  }
  if (Math.abs((bankChgNode?.cyNet || 0) - 1287.23) > 0.01) {
    throw new Error(`N_32_BANK_CHG mismatch: got ${bankChgNode?.cyNet}, expected 1287.23`);
  }

  // 2. Verify Schedule 33: Other Expenses
  const sch33 = report.scheduleRows.find(s => s.scheduleCode === 'SCH_33');
  if (!sch33) throw new Error('Schedule 33 not found!');
  console.log(`\nSchedule 33 Total: ₹${sch33.cyTotal.toFixed(2)} (Expected: ₹6050.00)`);
  if (Math.abs(sch33.cyTotal - 6050.00) > 0.01) {
    throw new Error(`Schedule 33 total mismatch: got ${sch33.cyTotal}, expected 6050.00`);
  }

  const auditNode = sch33.nodes.find(n => n.nodeCode === 'N_33_AUDIT');
  const promNode = sch33.nodes.find(n => n.nodeCode === 'N_33_PROM');
  const tradeNode = sch33.nodes.find(n => n.nodeCode === 'N_33_TRADE');

  console.log(`  - Auditors Remuneration (N_33_AUDIT): ₹${auditNode?.cyNet} (Expected: ₹6000.00)`);
  console.log(`    Contributing ledgers: ${JSON.stringify(auditNode?.ledgerDetails?.map(l => ({ name: l.ledgerName, net: l.net })))}`);
  console.log(`  - Business Promotion (N_33_PROM): ₹${promNode?.cyNet} (Expected: ₹50.00)`);
  console.log(`    Contributing ledgers: ${JSON.stringify(promNode?.ledgerDetails?.map(l => ({ name: l.ledgerName, net: l.net })))}`);
  console.log(`  - Trading Charges (N_33_TRADE): ₹${tradeNode?.cyNet || 0} (Expected: ₹0.00)`);

  if (Math.abs((auditNode?.cyNet || 0) - 6000.00) > 0.01) {
    throw new Error(`N_33_AUDIT mismatch: got ${auditNode?.cyNet}, expected 6000.00`);
  }
  if (Math.abs((promNode?.cyNet || 0) - 50.00) > 0.01) {
    throw new Error(`N_33_PROM mismatch: got ${promNode?.cyNet}, expected 50.00`);
  }
  if ((tradeNode?.cyNet || 0) !== 0) {
    throw new Error(`N_33_TRADE should be 0, but got ${tradeNode?.cyNet}`);
  }

  // 3. Verify Schedule 25: Stock Movement Opening Stock & Signed Net Movement
  const sch25 = report.scheduleRows.find(s => s.scheduleCode === 'SCH_25');
  if (!sch25) throw new Error('Schedule 25 not found!');
  const opMfgNode = sch25.nodes.find(n => n.nodeCode === 'N_25_OP_MFG');
  console.log(`\nSchedule 25 Opening Stock Mfg (N_25_OP_MFG): ₹${opMfgNode?.cyNet} (Expected: ₹152952.84)`);
  console.log(`  Contributing ledgers: ${JSON.stringify(opMfgNode?.ledgerDetails?.map(l => ({ name: l.ledgerName, net: l.net })))}`);
  if (Math.abs((opMfgNode?.cyNet || 0) - 152952.84) > 0.01) {
    throw new Error(`N_25_OP_MFG mismatch: got ${opMfgNode?.cyNet}, expected 152952.84`);
  }

  // Verify Schedule 25 Total is -152952.84 (signed decrease in inventory)
  console.log(`Schedule 25 Total (Net Movement): ₹${sch25.cyTotal} (Expected: -₹152952.84)`);
  if (Math.abs(sch25.cyTotal - (-152952.84)) > 0.01) {
    throw new Error(`Schedule 25 Total mismatch: got ${sch25.cyTotal}, expected -152952.84`);
  }

  // 4. Verify Income & Expenditure Statement
  const ieLine25 = report.incomeAndExpenditure.lines.find(l => l.scheduleCode === 'SCH_25');
  if (!ieLine25) throw new Error('Schedule 25 line not found in I&E statement!');
  console.log(`\nI&E Line 25 cyAmount: ₹${ieLine25.cyAmount} (Expected: -₹152952.84)`);
  if (Math.abs(ieLine25.cyAmount - (-152952.84)) > 0.01) {
    throw new Error(`I&E Line 25 amount mismatch: got ${ieLine25.cyAmount}, expected -152952.84`);
  }

  // 5. Test with existing child FSLI INC_DECR_FG_C1
  console.log('\n--- Testing with existing child FSLI INC_DECR_FG_C1 ---');
  const db2 = new Database(':memory:');
  db2.pragma('foreign_keys = ON');

  // Copy tables to db2
  db2.exec(`
    CREATE TABLE Client (id TEXT PRIMARY KEY, client_name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE Entity (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, entity_name TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (client_id) REFERENCES Client(id));
    CREATE TABLE Unit (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, unit_name TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (entity_id) REFERENCES Entity(id));
    CREATE TABLE FinancialYear (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, year_label TEXT NOT NULL, start_date TEXT, end_date TEXT, created_at TEXT NOT NULL, FOREIGN KEY (entity_id) REFERENCES Entity(id), UNIQUE(entity_id, year_label));
    CREATE TABLE ImportBatch (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, unit_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL, file_hash TEXT NOT NULL, sheet_name TEXT, header_row INTEGER, total_rows INTEGER, ledger_count INTEGER, total_debit REAL, total_credit REAL, difference REAL, import_timestamp TEXT NOT NULL, status TEXT NOT NULL, detected_columns TEXT, FOREIGN KEY (entity_id) REFERENCES Entity(id), FOREIGN KEY (unit_id) REFERENCES Unit(id), FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id));
    CREATE TABLE TallyGroup (id TEXT PRIMARY KEY, import_batch_id TEXT NOT NULL, group_name TEXT NOT NULL, parent_group_id TEXT, depth INTEGER NOT NULL DEFAULT 0, FOREIGN KEY (import_batch_id) REFERENCES ImportBatch(id));
    CREATE TABLE Ledger (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, unit_id TEXT NOT NULL, ledger_name TEXT NOT NULL, tally_group_id TEXT, ledger_code TEXT, source_import_id TEXT, source_row_number INTEGER, active INTEGER DEFAULT 1, FOREIGN KEY (entity_id) REFERENCES Entity(id), FOREIGN KEY (unit_id) REFERENCES Unit(id), UNIQUE(entity_id, unit_id, ledger_name));
    CREATE TABLE LedgerBalance (id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, import_batch_id TEXT NOT NULL, opening_debit REAL DEFAULT 0, opening_credit REAL DEFAULT 0, debit REAL DEFAULT 0, credit REAL DEFAULT 0, closing_debit REAL DEFAULT 0, closing_credit REAL DEFAULT 0, net_balance REAL DEFAULT 0, FOREIGN KEY (ledger_id) REFERENCES Ledger(id), FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id), FOREIGN KEY (import_batch_id) REFERENCES ImportBatch(id), UNIQUE(ledger_id, financial_year_id, import_batch_id));
    CREATE TABLE FSLI (id TEXT PRIMARY KEY, fsli_name TEXT NOT NULL, fsli_code TEXT UNIQUE, category TEXT NOT NULL, sub_category TEXT, display_order INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'SYSTEM', active INTEGER NOT NULL DEFAULT 1, parent_fsli_id TEXT REFERENCES FSLI(id), created_at TEXT NOT NULL);
    CREATE TABLE MappingRule (id TEXT PRIMARY KEY, rule_name TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0, conditions TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'map_to_fsli', target_fsli_id TEXT, confidence REAL NOT NULL DEFAULT 1.0, scope TEXT NOT NULL DEFAULT 'Global', scope_client_id TEXT, scope_entity_id TEXT, active INTEGER NOT NULL DEFAULT 1, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE LedgerMapping (id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, mapped_fsli_id TEXT, confidence_score REAL, mapping_source TEXT, reason TEXT, status TEXT NOT NULL DEFAULT 'Suggested', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (ledger_id) REFERENCES Ledger(id), FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id), FOREIGN KEY (mapped_fsli_id) REFERENCES FSLI(id));
    CREATE TABLE LedgerClassification (id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, original_tally_classification TEXT, application_classification TEXT, child_fsli_id TEXT, parent_fsli_id TEXT, final_fsli_id TEXT, classification_source TEXT NOT NULL, confidence_score REAL, reason TEXT, is_manual_override INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Classified', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (ledger_id) REFERENCES Ledger(id), FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id), FOREIGN KEY (child_fsli_id) REFERENCES FSLI(id), FOREIGN KEY (parent_fsli_id) REFERENCES FSLI(id), FOREIGN KEY (final_fsli_id) REFERENCES FSLI(id), UNIQUE(ledger_id, financial_year_id));
    CREATE TABLE RegroupingResult (id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, rule_id TEXT, proposed_fsli_id TEXT, approved_fsli_id TEXT, status TEXT NOT NULL, confidence_score REAL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE Adjustment (id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, adjustment_number TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, effective_date TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL);
    CREATE TABLE AdjustmentLine (id TEXT PRIMARY KEY, adjustment_id TEXT NOT NULL, fsli_id TEXT NOT NULL, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, FOREIGN KEY (adjustment_id) REFERENCES Adjustment(id), FOREIGN KEY (fsli_id) REFERENCES FSLI(id));
    CREATE TABLE ConsolidationElimination (id TEXT PRIMARY KEY, consolidation_run_id TEXT NOT NULL, fsli_id TEXT, eliminated_amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL);
    CREATE TABLE LedgerReportingOverride (id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, reporting_node_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  `);

  seedStandardFSLIs(db2);
  ensureReportingHierarchyTables(db2);

  // Insert existing user-created FSLIs: INC_DECR_FG and INC_DECR_FG_C1
  db2.prepare(`INSERT INTO FSLI (id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at, parent_fsli_id) VALUES ('fsli-inc-decr-fg', 'Increase / Decrease in Finished goods, Manufacturing items and WIP', 'INC_DECR_FG', 'Expense', 'increase / decrease in Finished goods,WIP', 1000, 'USER', 1, ?, NULL)`).run(now);
  db2.prepare(`INSERT INTO FSLI (id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at, parent_fsli_id) VALUES ('fsli-inc-decr-fg-c1', 'Increase/decrease in Finished goods, Mfg items and WIP', 'INC_DECR_FG_C1', 'Expense', 'increase / decrease in Finished goods,WIP', 1000, 'USER', 1, ?, 'fsli-inc-decr-fg')`).run(now);

  // Re-run ensureReportingHierarchyTables to sync default mappings
  ensureReportingHierarchyTables(db2);

  db2.prepare(`INSERT INTO Client VALUES ('client-1', 'Test Client', ?)`).run(now);
  db2.prepare(`INSERT INTO Entity VALUES ('default-entity', 'client-1', 'SA Bioproducts Entity', ?)`).run(now);
  db2.prepare(`INSERT INTO Unit VALUES ('sa-bio-unit', 'default-entity', 'SA Bioproducts', ?)`).run(now);
  db2.prepare(`INSERT INTO FinancialYear VALUES ('fy-2025-26', 'default-entity', '2025-26', '2025-04-01', '2026-03-31', ?)`).run(now);

  db2.prepare(`
    INSERT INTO ImportBatch (
      id, entity_id, unit_id, financial_year_id, file_name, file_path, file_hash,
      total_debit, total_credit, difference, import_timestamp, status
    ) VALUES (
      'batch-1', 'default-entity', 'sa-bio-unit', 'fy-2025-26',
      'SA_Bioproducts_TB.xlsx', '/data/SA_Bioproducts_TB.xlsx', 'hash123',
      ?, ?, 0, ?, 'SUCCESS'
    )
  `).run(totalDr, totalDr, now);

  for (const l of ledgers) {
    db2.prepare(`INSERT INTO Ledger (id, entity_id, unit_id, ledger_name) VALUES (?, 'default-entity', 'sa-bio-unit', ?)`).run(l.id, l.name);
    db2.prepare(`
      INSERT INTO LedgerBalance (id, ledger_id, financial_year_id, import_batch_id, debit, credit, net_balance)
      VALUES (?, ?, 'fy-2025-26', 'batch-1', ?, ?, ?)
    `).run(`lb-${l.id}`, l.id, l.dr, l.cr, l.dr - l.cr);

    const fsliRow = db2.prepare('SELECT id FROM FSLI WHERE fsli_code = ?').get(l.mappedFsli) as { id: string };
    db2.prepare(`
      INSERT INTO LedgerMapping (id, ledger_id, financial_year_id, mapped_fsli_id, status, created_at, updated_at)
      VALUES (?, ?, 'fy-2025-26', ?, 'Mapped', ?, ?)
    `).run(`lm-${l.id}`, l.id, fsliRow.id, now, now);
  }

  // Set Opening Stock classification to child FSLI INC_DECR_FG_C1
  db2.prepare(`
    INSERT INTO LedgerClassification (id, ledger_id, financial_year_id, application_classification, child_fsli_id, parent_fsli_id, final_fsli_id, classification_source, is_manual_override, status, created_at, updated_at)
    VALUES ('cls-l5', 'l5', 'fy-2025-26', 'Increase/decrease in Finished goods, Mfg items and WIP', 'fsli-inc-decr-fg-c1', 'fsli-inc-decr-fg', 'fsli-inc-decr-fg', 'MANUAL', 1, 'ManualOverride', ?, ?)
  `).run(now, now);

  const report2 = generateReportingHierarchyData(db2, 'fy-2025-26', { unitId: 'sa-bio-unit' });
  const sch25_2 = report2.scheduleRows.find(s => s.scheduleCode === 'SCH_25');
  if (!sch25_2) throw new Error('Schedule 25 not found in report2!');
  const opMfgNode2 = sch25_2.nodes.find(n => n.nodeCode === 'N_25_OP_MFG');

  console.log(`  - With child FSLI INC_DECR_FG_C1: Opening Stock = ₹${opMfgNode2?.cyNet} (Expected: ₹152952.84)`);
  console.log(`  - Schedule 25 Net Movement = ₹${sch25_2.cyTotal} (Expected: -₹152952.84)`);
  if (Math.abs((opMfgNode2?.cyNet || 0) - 152952.84) > 0.01) {
    throw new Error(`Report2 N_25_OP_MFG mismatch: got ${opMfgNode2?.cyNet}, expected 152952.84`);
  }
  if (Math.abs(sch25_2.cyTotal - (-152952.84)) > 0.01) {
    throw new Error(`Report2 Schedule 25 cyTotal mismatch: got ${sch25_2.cyTotal}, expected -152952.84`);
  }

  console.log('\n✅ All SA Bioproducts Traceability verifications passed successfully!');
}

runSABioproductsVerification();

