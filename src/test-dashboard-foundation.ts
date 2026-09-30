/**
 * Phase 15.1: Dashboard & Financial Reporting Layer Foundation Test Suite
 *
 * Automated verification tests covering:
 * Test 1: Dynamic Financial Year Loading (no hardcoding, loads from DB with active balance indicators)
 * Test 2: Active FY Context Propagation (selected FY updates reporting context and labels)
 * Test 3: Dynamic Unit and Entity Loading (all units and entity metadata loaded from DB)
 * Test 4: Reporting Scope Toggling (CONSOLIDATED vs UNIT mode with proper unit isolation)
 * Test 5: Unit Isolation & Filtering (selecting a specific unit filters dependent options)
 * Test 6: Pipeline Readiness Metrics Summary (read-only counts for batches, mappings, adjustments)
 * Test 7: Non-Mutation / Read-Only Guarantee (0 writes/mutations to database during dashboard queries)
 * Test 8: Consolidation Run Resolution (consolidation runs dynamically discovered for selected FY)
 * Test 9: Architectural Separation (strictly presentation/context, no duplicated financial math)
 * Test 10: Empty State & Fallback Resilience (graceful degradation on invalid or empty FY/Unit)
 */

import Database from 'better-sqlite3';
import {
  runDashboardFoundationTests,
} from './dashboard-reporting-engine';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

function createTestDatabase(): Database.Database {
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
      FOREIGN KEY (entity_id) REFERENCES Entity(id), FOREIGN KEY (unit_id) REFERENCES Unit(id),
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id)
    );
    CREATE TABLE Ledger (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, unit_id TEXT NOT NULL, ledger_name TEXT NOT NULL,
      tally_group_id TEXT, ledger_code TEXT, active INTEGER DEFAULT 1,
      FOREIGN KEY (entity_id) REFERENCES Entity(id), FOREIGN KEY (unit_id) REFERENCES Unit(id)
    );
    CREATE TABLE LedgerBalance (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, import_batch_id TEXT NOT NULL,
      debit REAL DEFAULT 0, credit REAL DEFAULT 0, closing_debit REAL DEFAULT 0, closing_credit REAL DEFAULT 0, net_balance REAL DEFAULT 0,
      FOREIGN KEY (ledger_id) REFERENCES Ledger(id), FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id),
      FOREIGN KEY (import_batch_id) REFERENCES ImportBatch(id)
    );
    CREATE TABLE FSLI (
      id TEXT PRIMARY KEY, fsli_name TEXT NOT NULL, fsli_code TEXT UNIQUE, category TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'SYSTEM', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
    );
    CREATE TABLE LedgerMapping (
      id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, mapped_fsli_id TEXT,
      status TEXT NOT NULL DEFAULT 'Suggested', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (ledger_id) REFERENCES Ledger(id), FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id),
      FOREIGN KEY (mapped_fsli_id) REFERENCES FSLI(id)
    );
    CREATE TABLE Adjustment (
      id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, adjustment_number TEXT NOT NULL,
      type TEXT NOT NULL, status TEXT NOT NULL, effective_date TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE ConsolidationRun (
      id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, financial_year_id TEXT NOT NULL, run_number TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);

  // Insert seed data
  const now = new Date().toISOString();
  db.prepare("INSERT INTO Client VALUES ('client-1', 'Santhigiri Group', ?)").run(now);
  db.prepare("INSERT INTO Entity VALUES ('default-entity', 'client-1', 'Santhigiri Ashram', ?)").run(now);

  // 3 Units
  db.prepare("INSERT INTO Unit VALUES ('unit-mandalam', 'default-entity', 'Santhigiri Ashram - Mandalam', ?)").run(now);
  db.prepare("INSERT INTO Unit VALUES ('unit-hospital', 'default-entity', 'Santhigiri Ayurveda Hospital', ?)").run(now);
  db.prepare("INSERT INTO Unit VALUES ('unit-reserach', 'default-entity', 'Santhigiri Research Centre', ?)").run(now);

  // 2 Financial Years
  db.prepare("INSERT INTO FinancialYear VALUES ('fy-2025-26', 'default-entity', '2025-26', '2025-04-01', '2026-03-31', ?)").run(now);
  db.prepare("INSERT INTO FinancialYear VALUES ('fy-2024-25', 'default-entity', '2024-25', '2024-04-01', '2025-03-31', ?)").run(now);

  // Import batches
  db.prepare("INSERT INTO ImportBatch VALUES ('batch-1', 'default-entity', 'unit-mandalam', 'fy-2025-26', 'tb_mandalam.xlsx', '/path/1', 'hash1', 50, 20, 100000, 100000, 0, ?, 'Completed')").run(now);
  db.prepare("INSERT INTO ImportBatch VALUES ('batch-2', 'default-entity', 'unit-hospital', 'fy-2025-26', 'tb_hospital.xlsx', '/path/2', 'hash2', 40, 15, 80000, 80000, 0, ?, 'Completed')").run(now);

  // Ledgers and Balances
  db.prepare("INSERT INTO Ledger VALUES ('led-1', 'default-entity', 'unit-mandalam', 'General Donation', NULL, '4001', 1)").run();
  db.prepare("INSERT INTO LedgerBalance VALUES ('lb-1', 'led-1', 'fy-2025-26', 'batch-1', 0, 50000, 0, 50000, -50000)").run();

  db.prepare("INSERT INTO Ledger VALUES ('led-2', 'default-entity', 'unit-hospital', 'Hospital Treatment Fees', NULL, '4002', 1)").run();
  db.prepare("INSERT INTO LedgerBalance VALUES ('lb-2', 'led-2', 'fy-2025-26', 'batch-2', 0, 80000, 0, 80000, -80000)").run();

  // FSLI & Mapping
  db.prepare("INSERT INTO FSLI VALUES ('fsli-income', 'General Donations', 'INC_01', 'Income', 'SYSTEM', 1, ?)").run(now);
  db.prepare("INSERT INTO LedgerMapping VALUES ('map-1', 'led-1', 'fy-2025-26', 'fsli-income', 'Mapped', ?, ?)").run(now, now);
  db.prepare("INSERT INTO LedgerMapping VALUES ('map-2', 'led-2', 'fy-2025-26', 'fsli-income', 'Mapped', ?, ?)").run(now, now);

  // Applied Adjustment
  db.prepare("INSERT INTO Adjustment VALUES ('adj-1', 'unit-mandalam', 'fy-2025-26', 'ADJ-2025-001', 'Accrual', 'Applied', '2026-03-31', 'Year-end accrual', ?)").run(now);

  // Consolidation Run
  db.prepare("INSERT INTO ConsolidationRun VALUES ('crun-1', 'default-entity', 'fy-2025-26', 'RUN-2025-001', 'Completed', ?)").run(now);

  return db;
}

export function runTests(): void {
  console.log('====================================================');
  console.log(' Phase 15.1: Dashboard & Reporting Foundation Tests');
  console.log('====================================================');

  const db = createTestDatabase();
  const testResults = runDashboardFoundationTests(db);

  for (const r of testResults.results) {
    const symbol = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${symbol}] ${r.name}`);
    console.log(`        ${r.message}`);
  }

  console.log('====================================================');
  console.log(`Summary: ${testResults.passedTests} / ${testResults.totalTests} Passed (${testResults.allPassed ? 'ALL PASSED' : 'SOME FAILED'})`);
  console.log('====================================================');

  if (!testResults.allPassed) {
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runTests();
}
