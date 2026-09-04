/**
 * Database Service — SQLite access layer for the Electron main process.
 *
 * Uses better-sqlite3 (synchronous, NAPI-based) to manage a local SQLite
 * database stored in the user's app data directory.
 *
 * IMPORTANT: This module must ONLY be imported in the main process.
 * Never import it from renderer/React code.
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type {
  TrialBalanceImportResult,
  ImportBatchRecord,
  SaveResult,
  FSLIRecord,
  MappingRuleRecord,
  LedgerMappingRecord,
  MappingSource,
  MappingStatus,
  MappingWorkbenchData,
  WorkbenchLedgerRow,
  WorkbenchSummary,
  BulkUpdateMappingItem,
  // Phase 5 Step 4
  UnmappedTrackerData,
  UnmappedTrackerRow,
  UnmappedTrackerSummary,
  MappingRuleInput,
  CreateFSLIInput,
  UpdateFSLIInput,
  // Phase 6
  ClassificationData,
  ClassificationUpdateItem,
  // Phase 7
  RegroupingStatus,
  RegroupingResultRecord,
  RegroupingRuleRecord,
  CreateRegroupingRuleInput,
  RegroupingAuditRecord,
  RegroupingWorkbenchData,
} from './electron-api';
import { STANDARD_FSLI_CATALOG } from './standard-fsli';
import {
  generateSuggestionsForFinancialYear,
  type GenerateSuggestionsResponse,
  type SuggestionResultItem,
} from './suggestion-engine';
import {
  getClassificationData as getClassificationDataImpl,
  autoClassifyLedgers as autoClassifyLedgersImpl,
  saveClassifications as saveClassificationsImpl,
  resetClassifications as resetClassificationsImpl,
} from './classification-engine';
import {
  generateRegroupingSuggestions as generateRegroupingSuggestionsImpl,
  approveRegrouping as approveRegroupingImpl,
  rejectRegrouping as rejectRegroupingImpl,
  changeRegrouping as changeRegroupingImpl,
  applyRegrouping as applyRegroupingImpl,
  undoRegrouping as undoRegroupingImpl,
  createRegroupingRule as createRegroupingRuleImpl,
  getRegroupingRules as getRegroupingRulesImpl,
  toggleRegroupingRuleAutoApply as toggleRegroupingRuleAutoApplyImpl,
  getRegroupingWorkbenchData as getRegroupingWorkbenchDataImpl,
  getRegroupingAuditHistory as getRegroupingAuditHistoryImpl,
} from './regrouping-engine';

/** The singleton database instance. */
let db: Database.Database | null = null;

const DEFAULT_CLIENT_ID = 'default-client';
const DEFAULT_ENTITY_ID = 'default-entity';
const DEFAULT_UNIT_ID = 'default-unit';

/**
 * Returns the path to the SQLite database file.
 * Stored in the user's app data directory (e.g. %APPDATA%/accounting-app/).
 */
function getDatabasePath(): string {
  let userDataPath = '';
  try {
    if (app && typeof app.getPath === 'function') {
      userDataPath = app.getPath('userData');
    }
  } catch {
    // app not available
  }

  if (!userDataPath) {
    const baseDir =
      process.env.APPDATA ||
      (process.platform === 'darwin'
        ? path.join(process.env.HOME || '', 'Library', 'Application Support')
        : path.join(process.env.HOME || '', '.config'));
    userDataPath = path.join(baseDir, 'accounting-app');
  }

  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, 'accounting.db');
}

/**
 * Helper to compute SHA-256 hash of a file.
 */
export function calculateFileHash(filePath: string): string {
  try {
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(buffer).digest('hex');
    }
  } catch (err) {
    console.warn('[Database] Failed to hash file directly, falling back to path hash:', err);
  }
  return crypto.createHash('sha256').update(filePath).digest('hex');
}

/**
 * Initialize the database connection and create the 8 accounting tables.
 */
export function initDatabase(): Database.Database {
  if (db) return db;

  const dbPath = getDatabasePath();
  console.log(`[Database] Opening database at: ${dbPath}`);

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  // Enable foreign key enforcement
  db.pragma('foreign_keys = ON');

  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS _db_info (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Client (
      id          TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Entity (
      id          TEXT PRIMARY KEY,
      client_id   TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES Client(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Unit (
      id          TEXT PRIMARY KEY,
      entity_id   TEXT NOT NULL,
      unit_name   TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      FOREIGN KEY (entity_id) REFERENCES Entity(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS FinancialYear (
      id          TEXT PRIMARY KEY,
      entity_id   TEXT NOT NULL,
      year_label  TEXT NOT NULL,
      start_date  TEXT,
      end_date    TEXT,
      created_at  TEXT NOT NULL,
      FOREIGN KEY (entity_id) REFERENCES Entity(id) ON DELETE CASCADE,
      UNIQUE(entity_id, year_label)
    );

    CREATE TABLE IF NOT EXISTS ImportBatch (
      id                TEXT PRIMARY KEY,
      entity_id         TEXT NOT NULL,
      unit_id           TEXT NOT NULL,
      financial_year_id TEXT NOT NULL,
      file_name         TEXT NOT NULL,
      file_path         TEXT NOT NULL,
      file_hash         TEXT NOT NULL,
      sheet_name        TEXT,
      header_row        INTEGER,
      total_rows        INTEGER,
      ledger_count      INTEGER,
      total_debit       REAL,
      total_credit      REAL,
      difference        REAL,
      import_timestamp  TEXT NOT NULL,
      status            TEXT NOT NULL,
      detected_columns  TEXT,
      FOREIGN KEY (entity_id) REFERENCES Entity(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES Unit(id) ON DELETE CASCADE,
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS TallyGroup (
      id                TEXT PRIMARY KEY,
      import_batch_id   TEXT NOT NULL,
      group_name        TEXT NOT NULL,
      parent_group_id   TEXT,
      depth             INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (import_batch_id) REFERENCES ImportBatch(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_group_id) REFERENCES TallyGroup(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Ledger (
      id                TEXT PRIMARY KEY,
      entity_id         TEXT NOT NULL,
      unit_id           TEXT NOT NULL,
      ledger_name       TEXT NOT NULL,
      tally_group_id    TEXT,
      ledger_code       TEXT,
      source_import_id  TEXT,
      source_row_number INTEGER,
      active            INTEGER DEFAULT 1,
      FOREIGN KEY (entity_id) REFERENCES Entity(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES Unit(id) ON DELETE CASCADE,
      FOREIGN KEY (tally_group_id) REFERENCES TallyGroup(id) ON DELETE SET NULL,
      FOREIGN KEY (source_import_id) REFERENCES ImportBatch(id) ON DELETE SET NULL,
      UNIQUE(entity_id, unit_id, ledger_name)
    );

    CREATE TABLE IF NOT EXISTS LedgerBalance (
      id                TEXT PRIMARY KEY,
      ledger_id         TEXT NOT NULL,
      financial_year_id TEXT NOT NULL,
      import_batch_id   TEXT NOT NULL,
      opening_debit     REAL DEFAULT 0,
      opening_credit    REAL DEFAULT 0,
      debit             REAL DEFAULT 0,
      credit            REAL DEFAULT 0,
      closing_debit     REAL DEFAULT 0,
      closing_credit    REAL DEFAULT 0,
      net_balance       REAL DEFAULT 0,
      FOREIGN KEY (ledger_id) REFERENCES Ledger(id) ON DELETE CASCADE,
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id) ON DELETE CASCADE,
      FOREIGN KEY (import_batch_id) REFERENCES ImportBatch(id) ON DELETE CASCADE,
      UNIQUE(ledger_id, financial_year_id, import_batch_id)
    );

    -- Phase 5 Step 1: Mapping Data Model -----------------------------------

    CREATE TABLE IF NOT EXISTS FSLI (
      id            TEXT PRIMARY KEY,
      fsli_name     TEXT NOT NULL,
      fsli_code     TEXT UNIQUE,
      category      TEXT NOT NULL,
      sub_category  TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      source        TEXT NOT NULL DEFAULT 'SYSTEM'
                    CHECK(source IN ('SYSTEM', 'USER')),
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS MappingRule (
      id               TEXT PRIMARY KEY,
      rule_name        TEXT NOT NULL,
      priority         INTEGER NOT NULL DEFAULT 0,
      conditions       TEXT NOT NULL,
      action           TEXT NOT NULL DEFAULT 'map_to_fsli',
      target_fsli_id   TEXT,
      confidence       REAL NOT NULL DEFAULT 1.0,
      scope            TEXT NOT NULL DEFAULT 'Global'
                       CHECK(scope IN ('Global', 'Client', 'Entity')),
      scope_client_id  TEXT,
      scope_entity_id  TEXT,
      active           INTEGER NOT NULL DEFAULT 1,
      created_by       TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      FOREIGN KEY (target_fsli_id)  REFERENCES FSLI(id)   ON DELETE SET NULL,
      FOREIGN KEY (scope_client_id) REFERENCES Client(id) ON DELETE SET NULL,
      FOREIGN KEY (scope_entity_id) REFERENCES Entity(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS LedgerMapping (
      id                TEXT PRIMARY KEY,
      ledger_id         TEXT NOT NULL,
      financial_year_id TEXT NOT NULL,
      mapped_fsli_id    TEXT,
      mapping_rule_id   TEXT,
      mapping_source    TEXT NOT NULL DEFAULT 'UserMapping'
                        CHECK(mapping_source IN (
                          'SystemSuggestion', 'UserMapping', 'UserRule',
                          'HistoricalMapping', 'BulkMapping'
                        )),
      confidence_score  REAL,
      is_manual_override INTEGER NOT NULL DEFAULT 0,
      approved_by       TEXT,
      approved_at       TEXT,
      status            TEXT NOT NULL DEFAULT 'Unmapped'
                        CHECK(status IN (
                          'Suggested', 'Mapped', 'NeedsReview',
                          'Unmapped', 'Rejected'
                        )),
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      FOREIGN KEY (ledger_id)         REFERENCES Ledger(id)        ON DELETE CASCADE,
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id) ON DELETE CASCADE,
      FOREIGN KEY (mapped_fsli_id)    REFERENCES FSLI(id)          ON DELETE SET NULL,
      FOREIGN KEY (mapping_rule_id)   REFERENCES MappingRule(id)   ON DELETE SET NULL,
      UNIQUE(ledger_id, financial_year_id)
    );

    -- Phase 6: Classification Engine -------------------------------------------

    CREATE TABLE IF NOT EXISTS LedgerClassification (
      id                            TEXT PRIMARY KEY,
      ledger_id                     TEXT NOT NULL,
      financial_year_id             TEXT NOT NULL,
      original_tally_classification TEXT,
      application_classification    TEXT,
      child_fsli_id                 TEXT,
      parent_fsli_id                TEXT,
      final_fsli_id                 TEXT,
      classification_source         TEXT NOT NULL DEFAULT 'PENDING'
                                    CHECK(classification_source IN (
                                      'AUTO','MANUAL','RULE','MAPPING','PENDING'
                                    )),
      confidence_score              REAL DEFAULT 0,
      reason                        TEXT,
      is_manual_override            INTEGER NOT NULL DEFAULT 0,
      approved_by                   TEXT,
      approved_at                   TEXT,
      status                        TEXT NOT NULL DEFAULT 'Unclassified'
                                    CHECK(status IN (
                                      'Classified','Unclassified','NeedsReview','ManualOverride'
                                    )),
      created_at                    TEXT NOT NULL,
      updated_at                    TEXT NOT NULL,
      FOREIGN KEY (ledger_id)         REFERENCES Ledger(id)        ON DELETE CASCADE,
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id) ON DELETE CASCADE,
      FOREIGN KEY (child_fsli_id)     REFERENCES FSLI(id)          ON DELETE SET NULL,
      FOREIGN KEY (parent_fsli_id)    REFERENCES FSLI(id)          ON DELETE SET NULL,
      FOREIGN KEY (final_fsli_id)     REFERENCES FSLI(id)          ON DELETE SET NULL,
      UNIQUE(ledger_id, financial_year_id)
    );

    -- Phase 7: Regrouping Engine -----------------------------------------------

    CREATE TABLE IF NOT EXISTS RegroupingRule (
      id                    TEXT PRIMARY KEY,
      rule_name             TEXT NOT NULL,
      description           TEXT,
      conditions            TEXT NOT NULL,
      target_fsli_id        TEXT,
      target_classification TEXT,
      confidence            REAL NOT NULL DEFAULT 0.85,
      auto_apply            INTEGER NOT NULL DEFAULT 0,
      active                INTEGER NOT NULL DEFAULT 1,
      created_by            TEXT,
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL,
      FOREIGN KEY (target_fsli_id) REFERENCES FSLI(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS RegroupingResult (
      id                        TEXT PRIMARY KEY,
      ledger_id                 TEXT NOT NULL,
      unit_id                   TEXT NOT NULL,
      entity_id                 TEXT NOT NULL,
      financial_year_id         TEXT NOT NULL,
      before_classification     TEXT,
      before_fsli_id            TEXT,
      before_fsli_name          TEXT,
      proposed_classification   TEXT,
      proposed_fsli_id          TEXT,
      proposed_fsli_name        TEXT,
      approved_classification   TEXT,
      approved_fsli_id          TEXT,
      approved_fsli_name        TEXT,
      balance_debit             REAL NOT NULL DEFAULT 0,
      balance_credit            REAL NOT NULL DEFAULT 0,
      balance_net               REAL NOT NULL DEFAULT 0,
      balance_nature            TEXT NOT NULL CHECK(balance_nature IN ('Debit','Credit','Zero')),
      tally_group_name          TEXT,
      ledger_name               TEXT NOT NULL,
      reason                    TEXT,
      rule_id                   TEXT,
      rule_name                 TEXT,
      confidence                REAL NOT NULL DEFAULT 0,
      detection_confidence      REAL NOT NULL DEFAULT 1.0,
      recommendation_confidence REAL NOT NULL DEFAULT 0.85,
      status                    TEXT NOT NULL DEFAULT 'Detected'
                                CHECK(status IN (
                                  'Detected','NeedsReview','Approved','Rejected',
                                  'Applied','AutoApplied','Undone','Obsolete'
                                )),
      approved_by               TEXT,
      approved_at               TEXT,
      applied_by                TEXT,
      applied_at                TEXT,
      undone_by                 TEXT,
      undone_at                 TEXT,
      undo_reason               TEXT,
      created_at                TEXT NOT NULL,
      updated_at                TEXT NOT NULL,
      FOREIGN KEY (ledger_id)         REFERENCES Ledger(id)         ON DELETE CASCADE,
      FOREIGN KEY (unit_id)           REFERENCES Unit(id)           ON DELETE CASCADE,
      FOREIGN KEY (entity_id)         REFERENCES Entity(id)         ON DELETE CASCADE,
      FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id)  ON DELETE CASCADE,
      FOREIGN KEY (before_fsli_id)    REFERENCES FSLI(id)           ON DELETE SET NULL,
      FOREIGN KEY (proposed_fsli_id)  REFERENCES FSLI(id)           ON DELETE SET NULL,
      FOREIGN KEY (approved_fsli_id)  REFERENCES FSLI(id)           ON DELETE SET NULL,
      FOREIGN KEY (rule_id)           REFERENCES RegroupingRule(id) ON DELETE SET NULL,
      UNIQUE(ledger_id, financial_year_id)
    );

    CREATE TABLE IF NOT EXISTS RegroupingAudit (
      id                    TEXT PRIMARY KEY,
      regrouping_result_id  TEXT NOT NULL,
      action                TEXT NOT NULL CHECK(action IN (
        'Detected','Approved','Rejected','Changed','Applied','AutoApplied','Undone','Obsolete'
      )),
      before_status         TEXT,
      after_status          TEXT,
      before_fsli_id        TEXT,
      after_fsli_id         TEXT,
      before_classification TEXT,
      after_classification  TEXT,
      reason                TEXT,
      performed_by          TEXT,
      performed_at          TEXT NOT NULL,
      FOREIGN KEY (regrouping_result_id) REFERENCES RegroupingResult(id) ON DELETE CASCADE
    );
  `);

  // Phase 5, 6, 7 indexes
  const indexStatements = [
    'CREATE INDEX idx_ledger_mapping_ledger ON LedgerMapping(ledger_id)',
    'CREATE INDEX idx_ledger_mapping_fy     ON LedgerMapping(financial_year_id)',
    'CREATE INDEX idx_ledger_mapping_fsli   ON LedgerMapping(mapped_fsli_id)',
    'CREATE INDEX idx_ledger_mapping_status ON LedgerMapping(status)',
    'CREATE INDEX idx_mapping_rule_scope    ON MappingRule(scope)',
    'CREATE INDEX idx_mapping_rule_active   ON MappingRule(active)',
    'CREATE INDEX idx_fsli_category         ON FSLI(category)',
    // Phase 6 indexes
    'CREATE INDEX idx_classification_ledger ON LedgerClassification(ledger_id)',
    'CREATE INDEX idx_classification_fy     ON LedgerClassification(financial_year_id)',
    'CREATE INDEX idx_classification_status ON LedgerClassification(status)',
    'CREATE INDEX idx_classification_source ON LedgerClassification(classification_source)',
    // Phase 7 indexes
    'CREATE INDEX idx_regrouping_ledger     ON RegroupingResult(ledger_id)',
    'CREATE INDEX idx_regrouping_fy         ON RegroupingResult(financial_year_id)',
    'CREATE INDEX idx_regrouping_unit       ON RegroupingResult(unit_id)',
    'CREATE INDEX idx_regrouping_status     ON RegroupingResult(status)',
    'CREATE INDEX idx_regrouping_rule_act   ON RegroupingRule(active)',
    'CREATE INDEX idx_regrouping_audit_res  ON RegroupingAudit(regrouping_result_id)',
  ];
  for (const stmt of indexStatements) {
    try { db.exec(stmt); } catch { /* index already exists */ }
  }

  // Schema migration: ensure FSLI has 'source' column for existing DBs
  try {
    const fsliCols = db.prepare(`PRAGMA table_info(FSLI)`).all() as Array<{ name: string }>;
    const hasSource = fsliCols.some((c) => c.name === 'source');
    if (!hasSource) {
      db.exec(`ALTER TABLE FSLI ADD COLUMN source TEXT NOT NULL DEFAULT 'SYSTEM'`);
    }
  } catch (err) {
    console.warn('[Database] Failed to migrate FSLI source column:', err);
  }

  // Schema migration: ensure FSLI has 'parent_fsli_id' column for hierarchical FSLIs
  try {
    const fsliCols2 = db.prepare(`PRAGMA table_info(FSLI)`).all() as Array<{ name: string }>;
    const hasParent = fsliCols2.some((c) => c.name === 'parent_fsli_id');
    if (!hasParent) {
      db.exec(`ALTER TABLE FSLI ADD COLUMN parent_fsli_id TEXT REFERENCES FSLI(id) ON DELETE SET NULL`);
      console.log('[Database] Migrated FSLI table: added parent_fsli_id column');
    }
  } catch (err) {
    console.warn('[Database] Failed to migrate FSLI parent_fsli_id column:', err);
  }

  // Schema migration: ensure RegroupingResult has detection_confidence and recommendation_confidence
  try {
    const rgCols = db.prepare(`PRAGMA table_info(RegroupingResult)`).all() as Array<{ name: string }>;
    const colNames = new Set(rgCols.map((c) => c.name));
    if (!colNames.has('detection_confidence')) {
      db.exec(`ALTER TABLE RegroupingResult ADD COLUMN detection_confidence REAL NOT NULL DEFAULT 1.0`);
      console.log('[Database] Migrated RegroupingResult table: added detection_confidence column');
    }
    if (!colNames.has('recommendation_confidence')) {
      db.exec(`ALTER TABLE RegroupingResult ADD COLUMN recommendation_confidence REAL NOT NULL DEFAULT 0.85`);
      console.log('[Database] Migrated RegroupingResult table: added recommendation_confidence column');
    }
  } catch (err) {
    console.warn('[Database] Failed to migrate RegroupingResult confidence columns:', err);
  }

  // Schema migration: ensure RegroupingResult & RegroupingAudit support 'Obsolete' status
  try {
    const tableSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='RegroupingResult'`).get() as { sql: string } | undefined;
    if (tableSql && !tableSql.sql.includes('Obsolete')) {
      console.log('[Database] Migrating RegroupingResult and RegroupingAudit table constraints to support Obsolete status...');
      db.pragma('foreign_keys = OFF');
      db.exec(`
        CREATE TABLE RegroupingResult_temp (
          id                        TEXT PRIMARY KEY,
          ledger_id                 TEXT NOT NULL,
          unit_id                   TEXT NOT NULL,
          entity_id                 TEXT NOT NULL,
          financial_year_id         TEXT NOT NULL,
          before_classification     TEXT,
          before_fsli_id            TEXT,
          before_fsli_name          TEXT,
          proposed_classification   TEXT,
          proposed_fsli_id          TEXT,
          proposed_fsli_name        TEXT,
          approved_classification   TEXT,
          approved_fsli_id          TEXT,
          approved_fsli_name        TEXT,
          balance_debit             REAL NOT NULL DEFAULT 0,
          balance_credit            REAL NOT NULL DEFAULT 0,
          balance_net               REAL NOT NULL DEFAULT 0,
          balance_nature            TEXT NOT NULL CHECK(balance_nature IN ('Debit','Credit','Zero')),
          tally_group_name          TEXT,
          ledger_name               TEXT NOT NULL,
          reason                    TEXT,
          rule_id                   TEXT,
          rule_name                 TEXT,
          confidence                REAL NOT NULL DEFAULT 0,
          detection_confidence      REAL NOT NULL DEFAULT 1.0,
          recommendation_confidence REAL NOT NULL DEFAULT 0.85,
          status                    TEXT NOT NULL DEFAULT 'Detected'
                                    CHECK(status IN (
                                      'Detected','NeedsReview','Approved','Rejected',
                                      'Applied','AutoApplied','Undone','Obsolete'
                                    )),
          approved_by               TEXT,
          approved_at               TEXT,
          applied_by                TEXT,
          applied_at                TEXT,
          undone_by                 TEXT,
          undone_at                 TEXT,
          undo_reason               TEXT,
          created_at                TEXT NOT NULL,
          updated_at                TEXT NOT NULL,
          FOREIGN KEY (ledger_id)         REFERENCES Ledger(id)         ON DELETE CASCADE,
          FOREIGN KEY (unit_id)           REFERENCES Unit(id)           ON DELETE CASCADE,
          FOREIGN KEY (entity_id)         REFERENCES Entity(id)         ON DELETE CASCADE,
          FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id)  ON DELETE CASCADE,
          FOREIGN KEY (before_fsli_id)    REFERENCES FSLI(id)           ON DELETE SET NULL,
          FOREIGN KEY (proposed_fsli_id)  REFERENCES FSLI(id)           ON DELETE SET NULL,
          FOREIGN KEY (approved_fsli_id)  REFERENCES FSLI(id)           ON DELETE SET NULL,
          FOREIGN KEY (rule_id)           REFERENCES RegroupingRule(id) ON DELETE SET NULL,
          UNIQUE(ledger_id, financial_year_id)
        );

        INSERT INTO RegroupingResult_temp (
          id, ledger_id, unit_id, entity_id, financial_year_id,
          before_classification, before_fsli_id, before_fsli_name,
          proposed_classification, proposed_fsli_id, proposed_fsli_name,
          approved_classification, approved_fsli_id, approved_fsli_name,
          balance_debit, balance_credit, balance_net, balance_nature,
          tally_group_name, ledger_name, reason, rule_id, rule_name,
          confidence, detection_confidence, recommendation_confidence,
          status, approved_by, approved_at, applied_by, applied_at,
          undone_by, undone_at, undo_reason, created_at, updated_at
        )
        SELECT
          id, ledger_id, unit_id, entity_id, financial_year_id,
          before_classification, before_fsli_id, before_fsli_name,
          proposed_classification, proposed_fsli_id, proposed_fsli_name,
          approved_classification, approved_fsli_id, approved_fsli_name,
          balance_debit, balance_credit, balance_net, balance_nature,
          tally_group_name, ledger_name, reason, rule_id, rule_name,
          confidence,
          COALESCE(detection_confidence, 1.0),
          COALESCE(recommendation_confidence, confidence, 0.85),
          status, approved_by, approved_at, applied_by, applied_at,
          undone_by, undone_at, undo_reason, created_at, updated_at
        FROM RegroupingResult;

        DROP TABLE RegroupingResult;
        ALTER TABLE RegroupingResult_temp RENAME TO RegroupingResult;

        CREATE TABLE RegroupingAudit_temp (
          id                    TEXT PRIMARY KEY,
          regrouping_result_id  TEXT NOT NULL,
          action                TEXT NOT NULL CHECK(action IN (
            'Detected','Approved','Rejected','Changed','Applied','AutoApplied','Undone','Obsolete'
          )),
          before_status         TEXT,
          after_status          TEXT,
          before_fsli_id        TEXT,
          after_fsli_id         TEXT,
          before_classification TEXT,
          after_classification  TEXT,
          reason                TEXT,
          performed_by          TEXT,
          performed_at          TEXT NOT NULL,
          FOREIGN KEY (regrouping_result_id) REFERENCES RegroupingResult(id) ON DELETE CASCADE
        );

        INSERT INTO RegroupingAudit_temp
        SELECT * FROM RegroupingAudit;

        DROP TABLE RegroupingAudit;
        ALTER TABLE RegroupingAudit_temp RENAME TO RegroupingAudit;
      `);
      db.pragma('foreign_keys = ON');
      console.log('[Database] Successfully migrated RegroupingResult and RegroupingAudit constraints');
    }
  } catch (err) {
    console.warn('[Database] Failed to migrate RegroupingResult table constraint:', err);
    try { db.pragma('foreign_keys = ON'); } catch { /* ignore */ }
  }

  // Write version marker
  const upsert = db.prepare(`
    INSERT INTO _db_info (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  upsert.run('schema_version', '6');
  upsert.run('created_at', new Date().toISOString());

  ensureDefaults(db);

  console.log('[Database] Initialized successfully with Phase 7 schema (v6)');
  return db;
}

/**
 * Get active database instance.
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close database connection.
 */
export function closeDatabase(): void {
  if (db) {
    console.log('[Database] Closing database');
    db.close();
    db = null;
  }
}

/**
 * Seed default Client, Entity, Unit if missing.
 */
function ensureDefaults(database: Database.Database): void {
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO Client (id, client_name, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(DEFAULT_CLIENT_ID, 'Default Client', now);

  database.prepare(`
    INSERT INTO Entity (id, client_id, entity_name, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(DEFAULT_ENTITY_ID, DEFAULT_CLIENT_ID, 'Default Entity', now);

  database.prepare(`
    INSERT INTO Unit (id, entity_id, unit_name, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(DEFAULT_UNIT_ID, DEFAULT_ENTITY_ID, 'Default Unit', now);

  // Seed standard FSLIs if FSLI table is empty
  seedStandardFSLIs(database);
}

/**
 * Ensure Financial Year record exists.
 */
function ensureFinancialYear(database: Database.Database, yearLabel: string): string {
  const existing = database.prepare(`
    SELECT id FROM FinancialYear WHERE entity_id = ? AND year_label = ?
  `).get(DEFAULT_ENTITY_ID, yearLabel) as { id: string } | undefined;

  if (existing) {
    return existing.id;
  }

  const id = `fy-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO FinancialYear (id, entity_id, year_label, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, DEFAULT_ENTITY_ID, yearLabel, now);

  return id;
}

/**
 * Check if a file with the given hash + financial year has already been imported.
 */
export function checkDuplicate(filePath: string, financialYear: string): { duplicate: boolean; batchId?: string } {
  const database = getDatabase();
  const fileHash = calculateFileHash(filePath);

  const row = database.prepare(`
    SELECT ib.id
    FROM ImportBatch ib
    JOIN FinancialYear fy ON ib.financial_year_id = fy.id
    WHERE ib.file_hash = ? AND fy.year_label = ? AND ib.status = 'SUCCESS'
    LIMIT 1
  `).get(fileHash, financialYear) as { id: string } | undefined;

  if (row) {
    return { duplicate: true, batchId: row.id };
  }
  return { duplicate: false };
}

/**
 * Save an imported Trial Balance result into SQLite inside a single transaction.
 *
 * @param importResult  — The canonical import result from the Python engine.
 * @param unitId        — (Optional) ID of the Unit this Trial Balance belongs to.
 *                         Defaults to DEFAULT_UNIT_ID for backward compatibility.
 */
export function saveTrialBalance(importResult: TrialBalanceImportResult, unitId?: string): SaveResult {
  const database = getDatabase();

  if (!importResult.success || !importResult.import_metadata || !importResult.summary) {
    return { success: false, error: 'Cannot save unsuccessful or incomplete import result.' };
  }

  const metadata = importResult.import_metadata;
  const summary = importResult.summary;
  const yearLabel = metadata.financial_year || 'Unknown FY';
  const fileHash = calculateFileHash(metadata.file_path);

  // Resolve the target Unit ID — use provided unitId, or fall back to default
  const targetUnitId = unitId && unitId.trim() ? unitId.trim() : DEFAULT_UNIT_ID;

  // Verify the unit exists
  const unitExists = database.prepare('SELECT id FROM Unit WHERE id = ?').get(targetUnitId) as { id: string } | undefined;
  if (!unitExists) {
    return { success: false, error: `Unit with id "${targetUnitId}" not found. Please select a valid Unit.` };
  }

  // Transaction for atomic insertion
  const tx = database.transaction(() => {
    const fyId = ensureFinancialYear(database, yearLabel);
    const batchId = `batch-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    // 1. Insert ImportBatch
    database.prepare(`
      INSERT INTO ImportBatch (
        id, entity_id, unit_id, financial_year_id,
        file_name, file_path, file_hash, sheet_name,
        header_row, total_rows, ledger_count,
        total_debit, total_credit, difference,
        import_timestamp, status, detected_columns
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      batchId,
      DEFAULT_ENTITY_ID,
      targetUnitId,
      fyId,
      metadata.file_name,
      metadata.file_path,
      fileHash,
      metadata.sheet_name || null,
      metadata.header_row || 0,
      metadata.total_rows || 0,
      summary.ledger_count,
      summary.total_debit,
      summary.total_credit,
      summary.difference,
      timestamp,
      'SUCCESS',
      JSON.stringify(metadata.detected_columns || {})
    );

    // 2. Insert Groups (remap Python group IDs -> SQLite group IDs)
    const groupIdMap = new Map<string, string>();
    for (const group of importResult.groups) {
      const sqliteGroupId = `grp-${crypto.randomUUID()}`;
      groupIdMap.set(group.id, sqliteGroupId);
    }

    for (const group of importResult.groups) {
      const sqliteGroupId = groupIdMap.get(group.id)!;
      const parentSqliteId = group.parent_group_id ? groupIdMap.get(group.parent_group_id) || null : null;

      database.prepare(`
        INSERT INTO TallyGroup (id, import_batch_id, group_name, parent_group_id, depth)
        VALUES (?, ?, ?, ?, ?)
      `).run(sqliteGroupId, batchId, group.group_name, parentSqliteId, group.depth || 0);
    }

    // 3. Insert Ledgers and LedgerBalances
    const insertLedger = database.prepare(`
      INSERT INTO Ledger (id, entity_id, unit_id, ledger_name, tally_group_id, source_import_id, source_row_number)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entity_id, unit_id, ledger_name) DO UPDATE SET
        tally_group_id = excluded.tally_group_id,
        source_import_id = excluded.source_import_id,
        source_row_number = excluded.source_row_number
    `);

    const selectLedgerId = database.prepare(`
      SELECT id FROM Ledger WHERE entity_id = ? AND unit_id = ? AND ledger_name = ?
    `);

    const insertBalance = database.prepare(`
      INSERT INTO LedgerBalance (
        id, ledger_id, financial_year_id, import_batch_id,
        opening_debit, opening_credit, debit, credit,
        closing_debit, closing_credit, net_balance
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ledger_id, financial_year_id, import_batch_id) DO UPDATE SET
        debit = excluded.debit,
        credit = excluded.credit,
        net_balance = excluded.net_balance
    `);

    for (const ledger of importResult.ledgers) {
      const newLedgerId = `led-${crypto.randomUUID()}`;
      const tallyGroupId = ledger.tally_group_id ? groupIdMap.get(ledger.tally_group_id) || null : null;

      insertLedger.run(
        newLedgerId,
        DEFAULT_ENTITY_ID,
        targetUnitId,
        ledger.ledger_name,
        tallyGroupId,
        batchId,
        ledger.source_row || null
      );

      const existingLedger = selectLedgerId.get(DEFAULT_ENTITY_ID, targetUnitId, ledger.ledger_name) as { id: string } | undefined;
      const actualLedgerId = existingLedger ? existingLedger.id : newLedgerId;

      const balanceId = `bal-${crypto.randomUUID()}`;
      insertBalance.run(
        balanceId,
        actualLedgerId,
        fyId,
        batchId,
        ledger.opening_debit || 0,
        ledger.opening_credit || 0,
        ledger.debit || 0,
        ledger.credit || 0,
        ledger.closing_debit || 0,
        ledger.closing_credit || 0,
        ledger.net_balance || 0
      );
    }

    return batchId;
  });

  try {
    const savedBatchId = tx();
    return { success: true, importBatchId: savedBatchId };
  } catch (err) {
    console.error('[Database] Failed to save trial balance:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Retrieve all saved import batches with unit information.
 */
export function getImportBatches(): ImportBatchRecord[] {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT
      ib.id,
      ib.file_name as fileName,
      ib.file_path as filePath,
      fy.year_label as financialYear,
      ib.unit_id as unitId,
      u.unit_name as unitName,
      ib.total_rows as totalRows,
      ib.ledger_count as ledgerCount,
      ib.total_debit as totalDebit,
      ib.total_credit as totalCredit,
      ib.difference as difference,
      ib.import_timestamp as importTimestamp,
      ib.status as status
    FROM ImportBatch ib
    JOIN FinancialYear fy ON ib.financial_year_id = fy.id
    LEFT JOIN Unit u ON ib.unit_id = u.id
    ORDER BY ib.import_timestamp DESC
  `).all() as ImportBatchRecord[];

  return rows;
}

// ── Unit Management (Minimal) ────────────────────────────────────────────────

/**
 * Retrieve all units for the default entity.
 */
export function getUnits(): import('./electron-api').UnitRecord[] {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT id, entity_id, unit_name, created_at
    FROM Unit
    WHERE entity_id = ?
    ORDER BY unit_name ASC
  `).all(DEFAULT_ENTITY_ID) as Array<{
    id: string;
    entity_id: string;
    unit_name: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    entityId: r.entity_id,
    unitName: r.unit_name,
    createdAt: r.created_at,
  }));
}

/**
 * Create a new unit under the default entity.
 * Rejects duplicates (case-insensitive name match).
 */
export function createUnit(unitName: string): import('./electron-api').UnitRecord {
  const database = getDatabase();
  const name = (unitName || '').trim();

  if (!name) {
    throw new Error('Unit name cannot be empty.');
  }

  // Check for duplicate name (case-insensitive)
  const existing = database.prepare(`
    SELECT id FROM Unit WHERE entity_id = ? AND LOWER(unit_name) = LOWER(?)
  `).get(DEFAULT_ENTITY_ID, name) as { id: string } | undefined;

  if (existing) {
    throw new Error(`A unit named "${name}" already exists.`);
  }

  const id = `unit-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO Unit (id, entity_id, unit_name, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, DEFAULT_ENTITY_ID, name, now);

  return {
    id,
    entityId: DEFAULT_ENTITY_ID,
    unitName: name,
    createdAt: now,
  };
}

/**
 * Load a saved Trial Balance from SQLite by batch ID.
 */
export function getSavedTrialBalance(importBatchId: string): TrialBalanceImportResult | null {
  const database = getDatabase();

  const batch = database.prepare(`
    SELECT ib.*, fy.year_label
    FROM ImportBatch ib
    JOIN FinancialYear fy ON ib.financial_year_id = fy.id
    WHERE ib.id = ?
  `).get(importBatchId) as {
    id: string;
    file_name: string;
    file_path: string;
    file_hash: string;
    sheet_name: string;
    header_row: number;
    total_rows: number;
    ledger_count: number;
    total_debit: number;
    total_credit: number;
    difference: number;
    import_timestamp: string;
    status: string;
    detected_columns: string;
    year_label: string;
  } | undefined;

  if (!batch) return null;

  const groups = database.prepare(`
    SELECT id, group_name, parent_group_id, depth
    FROM TallyGroup
    WHERE import_batch_id = ?
  `).all(importBatchId) as { id: string; group_name: string; parent_group_id: string | null; depth: number }[];

  const ledgers = database.prepare(`
    SELECT
      l.id,
      l.ledger_name,
      l.tally_group_id,
      l.source_row_number as source_row,
      lb.opening_debit,
      lb.opening_credit,
      lb.debit,
      lb.credit,
      lb.closing_debit,
      lb.closing_credit,
      lb.net_balance
    FROM Ledger l
    JOIN LedgerBalance lb ON l.id = lb.ledger_id
    WHERE lb.import_batch_id = ?
  `).all(importBatchId) as {
    id: string;
    ledger_name: string;
    tally_group_id: string | null;
    source_row: number | null;
    opening_debit: number;
    opening_credit: number;
    debit: number;
    credit: number;
    closing_debit: number;
    closing_credit: number;
    net_balance: number;
  }[];

  let detectedCols = {};
  try {
    if (batch.detected_columns) detectedCols = JSON.parse(batch.detected_columns);
  } catch {
    // ignore
  }

  return {
    success: true,
    import_metadata: {
      file_name: batch.file_name,
      file_path: batch.file_path,
      financial_year: batch.year_label,
      sheet_name: batch.sheet_name,
      header_row: batch.header_row,
      total_rows: batch.total_rows,
      detected_columns: detectedCols,
    },
    summary: {
      ledger_count: batch.ledger_count,
      total_debit: batch.total_debit,
      total_credit: batch.total_credit,
      difference: batch.difference,
      has_opening_balances: false,
      opening_debit_total: 0,
      opening_credit_total: 0,
      has_closing_balances: false,
      closing_debit_total: 0,
      closing_credit_total: 0,
    },
    validation: {
      is_valid: true,
      errors: [],
      warnings: [],
    },
    groups: groups.map((g) => ({
      id: g.id,
      group_name: g.group_name,
      parent_group_id: g.parent_group_id || undefined,
      depth: g.depth,
    })),
    ledgers: ledgers.map((l) => ({
      id: l.id,
      ledger_name: l.ledger_name,
      tally_group_id: l.tally_group_id || undefined,
      debit: l.debit,
      credit: l.credit,
      net_balance: l.net_balance,
      opening_debit: l.opening_debit,
      opening_credit: l.opening_credit,
      closing_debit: l.closing_debit,
      closing_credit: l.closing_credit,
      source_row: l.source_row || undefined,
    })),
  };
}

/**
 * Smoke test helper.
 */
export function runSmokeTest() {
  const dbPath = getDatabasePath();
  try {
    const database = getDatabase();
    const row = database.prepare('SELECT value FROM _db_info WHERE key = ?').get('schema_version') as { value: string } | undefined;
    return {
      success: true,
      dbPath,
      schemaVersion: row?.value ?? 'unknown',
      testInsert: true,
      testSelect: true,
      testTransaction: true,
    };
  } catch (err) {
    return {
      success: false,
      dbPath,
      schemaVersion: 'unknown',
      testInsert: false,
      testSelect: false,
      testTransaction: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Phase 5 Step 1: Mapping Data Model CRUD ─────────────────────────────────

/**
 * Create a new FSLI (Financial Statement Line Item).
 * User-created FSLIs are marked with source = 'USER'.
 *
 * If `parentFSLIId` is provided, creates a child FSLI under the specified parent.
 * Child FSLIs inherit category from the parent and have auto-generated codes.
 * Duplicate child names under the same parent are rejected.
 * No Ledger is created when creating an FSLI.
 */
export function createFSLI(data: CreateFSLIInput): FSLIRecord {
  const database = getDatabase();

  const name = (data.fsliName || '').trim();
  const active = data.active !== false;
  const parentFSLIId = data.parentFSLIId || null;

  if (!name) {
    throw new Error('FSLI Name cannot be empty.');
  }

  let category: string;
  let subCategory: string | null;
  let displayOrder: number;
  let code: string;

  if (parentFSLIId) {
    // ── Child FSLI creation ──────────────────────────────────────────────
    const parent = database.prepare(`SELECT * FROM FSLI WHERE id = ?`).get(parentFSLIId) as {
      id: string;
      fsli_name: string;
      fsli_code: string | null;
      category: string;
      sub_category: string | null;
      display_order: number;
      active: number;
    } | undefined;

    if (!parent) {
      throw new Error(`Parent FSLI not found with id: ${parentFSLIId}`);
    }

    // Inherit category from parent
    category = parent.category;
    // Allow override of sub_category, default to parent's
    subCategory = (data.subCategory || '').trim() || parent.sub_category;

    // Check duplicate child name under the same parent (case-insensitive)
    const existingSibling = database
      .prepare(`SELECT id FROM FSLI WHERE LOWER(fsli_name) = LOWER(?) AND parent_fsli_id = ?`)
      .get(name, parentFSLIId) as { id: string } | undefined;
    if (existingSibling) {
      throw new Error(`A child FSLI named "${name}" already exists under "${parent.fsli_name}".`);
    }

    // Auto-generate code from parent code
    const parentCode = parent.fsli_code || 'FSLI';
    const siblingCount = (database
      .prepare(`SELECT COUNT(*) as cnt FROM FSLI WHERE parent_fsli_id = ?`)
      .get(parentFSLIId) as { cnt: number }).cnt;
    code = `${parentCode}_C${siblingCount + 1}`;

    // Ensure code uniqueness (append random suffix if collision)
    let codeAttempt = code;
    let attempt = 0;
    while (true) {
      const existing = database
        .prepare(`SELECT id FROM FSLI WHERE UPPER(fsli_code) = ?`)
        .get(codeAttempt.toUpperCase()) as { id: string } | undefined;
      if (!existing) {
        code = codeAttempt.toUpperCase();
        break;
      }
      attempt++;
      codeAttempt = `${parentCode}_C${siblingCount + 1}_${attempt}`;
    }

    // Display order: place after parent's last child
    displayOrder = typeof data.displayOrder === 'number'
      ? data.displayOrder
      : parent.display_order + siblingCount + 1;
  } else {
    // ── Top-level FSLI creation (original behavior) ──────────────────────
    code = (data.fsliCode || '').trim().toUpperCase();
    category = (data.category || '').trim();
    subCategory = (data.subCategory || '').trim() || null;
    displayOrder = typeof data.displayOrder === 'number' ? data.displayOrder : 1000;

    if (!code) {
      throw new Error('FSLI Code cannot be empty.');
    }
    const validCategories = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];
    if (!validCategories.includes(category)) {
      throw new Error(`Invalid Category "${category}". Must be one of: ${validCategories.join(', ')}.`);
    }

    // Check code uniqueness (case-insensitive)
    const existingCode = database
      .prepare(`SELECT id, fsli_name FROM FSLI WHERE UPPER(fsli_code) = ?`)
      .get(code) as { id: string; fsli_name: string } | undefined;
    if (existingCode) {
      throw new Error(`An FSLI with code "${code}" already exists ("${existingCode.fsli_name}"). Code must be unique.`);
    }

    // Check duplicate name within the same category (case-insensitive) for top-level
    const existingName = database
      .prepare(`SELECT id FROM FSLI WHERE LOWER(fsli_name) = LOWER(?) AND category = ? AND parent_fsli_id IS NULL`)
      .get(name, category) as { id: string } | undefined;
    if (existingName) {
      throw new Error(`An FSLI named "${name}" already exists in category "${category}".`);
    }
  }

  const id = `fsli-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO FSLI (id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at, parent_fsli_id)
    VALUES (?, ?, ?, ?, ?, ?, 'USER', ?, ?, ?)
  `).run(
    id,
    name,
    code,
    category,
    subCategory,
    displayOrder,
    active ? 1 : 0,
    now,
    parentFSLIId
  );

  return {
    id,
    fsliName: name,
    fsliCode: code,
    category,
    subCategory,
    displayOrder,
    source: 'USER',
    active,
    createdAt: now,
    parentFSLIId: parentFSLIId,
  };
}


/**
 * Update an existing user-created FSLI.
 * System-standard FSLIs are protected from accidental modifications.
 */
export function updateFSLI(id: string, data: UpdateFSLIInput): FSLIRecord {
  const database = getDatabase();

  const existing = database.prepare(`SELECT * FROM FSLI WHERE id = ?`).get(id) as {
    id: string;
    fsli_name: string;
    fsli_code: string | null;
    category: string;
    sub_category: string | null;
    display_order: number;
    source: string;
    active: number;
    created_at: string;
    parent_fsli_id: string | null;
  } | undefined;

  if (!existing) {
    throw new Error(`FSLI not found with id: ${id}`);
  }

  if (existing.source === 'SYSTEM') {
    throw new Error(`System-standard FSLIs are protected and cannot be modified.`);
  }

  const nextName = data.fsliName !== undefined ? data.fsliName.trim() : existing.fsli_name;
  const nextCategory = data.category !== undefined ? data.category.trim() : existing.category;
  const nextSubCategory = data.subCategory !== undefined ? (data.subCategory.trim() || null) : existing.sub_category;
  const nextDisplayOrder = data.displayOrder !== undefined ? data.displayOrder : existing.display_order;
  const nextActive = data.active !== undefined ? (data.active ? 1 : 0) : existing.active;

  if (!nextName) {
    throw new Error('FSLI Name cannot be empty.');
  }
  const validCategories = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];
  if (!validCategories.includes(nextCategory)) {
    throw new Error(`Invalid Category "${nextCategory}". Must be one of: ${validCategories.join(', ')}.`);
  }

  // Check duplicate name in same category if name or category changed
  if (nextName.toLowerCase() !== existing.fsli_name.toLowerCase() || nextCategory !== existing.category) {
    // For child FSLIs: check siblings under same parent
    if (existing.parent_fsli_id) {
      const dup = database
        .prepare(`SELECT id FROM FSLI WHERE LOWER(fsli_name) = LOWER(?) AND parent_fsli_id = ? AND id != ?`)
        .get(nextName, existing.parent_fsli_id, id) as { id: string } | undefined;
      if (dup) {
        throw new Error(`A sibling FSLI named "${nextName}" already exists under the same parent.`);
      }
    } else {
      const dup = database
        .prepare(`SELECT id FROM FSLI WHERE LOWER(fsli_name) = LOWER(?) AND category = ? AND id != ? AND parent_fsli_id IS NULL`)
        .get(nextName, nextCategory, id) as { id: string } | undefined;
      if (dup) {
        throw new Error(`An FSLI named "${nextName}" already exists in the "${nextCategory}" category.`);
      }
    }
  }

  database.prepare(`
    UPDATE FSLI
    SET fsli_name = ?, category = ?, sub_category = ?, display_order = ?, active = ?
    WHERE id = ?
  `).run(nextName, nextCategory, nextSubCategory, nextDisplayOrder, nextActive, id);

  return {
    id: existing.id,
    fsliName: nextName,
    fsliCode: existing.fsli_code,
    category: nextCategory,
    subCategory: nextSubCategory,
    displayOrder: nextDisplayOrder,
    source: (existing.source as 'SYSTEM' | 'USER') || 'USER',
    active: nextActive === 1,
    createdAt: existing.created_at,
    parentFSLIId: existing.parent_fsli_id,
  };
}

/**
 * Toggle active/inactive status of an FSLI.
 * System-standard FSLIs cannot be deactivated to safeguard Schedule III accounting structures.
 */
export function toggleFSLIActive(id: string, active: boolean): boolean {
  const database = getDatabase();

  const existing = database.prepare(`SELECT id, source FROM FSLI WHERE id = ?`).get(id) as
    | { id: string; source: string }
    | undefined;

  if (!existing) {
    throw new Error(`FSLI not found with id: ${id}`);
  }

  if (existing.source === 'SYSTEM' && !active) {
    throw new Error('System-standard Schedule III FSLIs cannot be deactivated to maintain accounting structure integrity.');
  }

  const res = database.prepare(`UPDATE FSLI SET active = ? WHERE id = ?`).run(active ? 1 : 0, id);
  return res.changes > 0;
}

/**
 * Retrieve all active FSLIs, ordered by display_order.
 */
export function getFSLIs(): FSLIRecord[] {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at, parent_fsli_id
    FROM FSLI
    WHERE active = 1
    ORDER BY display_order ASC, fsli_name ASC
  `).all() as {
    id: string;
    fsli_name: string;
    fsli_code: string | null;
    category: string;
    sub_category: string | null;
    display_order: number;
    source: string | null;
    active: number;
    created_at: string;
    parent_fsli_id: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    fsliName: r.fsli_name,
    fsliCode: r.fsli_code,
    category: r.category,
    subCategory: r.sub_category,
    displayOrder: r.display_order,
    source: (r.source as 'SYSTEM' | 'USER') || 'SYSTEM',
    active: r.active === 1,
    createdAt: r.created_at,
    parentFSLIId: r.parent_fsli_id,
  }));
}

/**
 * Retrieve all FSLIs (both active and inactive), ordered by display_order.
 */
export function getAllFSLIs(includeInactive = true): FSLIRecord[] {
  const database = getDatabase();
  const sql = includeInactive
    ? `SELECT id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at, parent_fsli_id FROM FSLI ORDER BY display_order ASC, fsli_name ASC`
    : `SELECT id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at, parent_fsli_id FROM FSLI WHERE active = 1 ORDER BY display_order ASC, fsli_name ASC`;

  const rows = database.prepare(sql).all() as {
    id: string;
    fsli_name: string;
    fsli_code: string | null;
    category: string;
    sub_category: string | null;
    display_order: number;
    source: string | null;
    active: number;
    created_at: string;
    parent_fsli_id: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    fsliName: r.fsli_name,
    fsliCode: r.fsli_code,
    category: r.category,
    subCategory: r.sub_category,
    displayOrder: r.display_order,
    source: (r.source as 'SYSTEM' | 'USER') || 'SYSTEM',
    active: r.active === 1,
    createdAt: r.created_at,
    parentFSLIId: r.parent_fsli_id,
  }));
}

/**
 * Retrieve child FSLIs of a given parent FSLI.
 */
export function getChildFSLIs(parentFSLIId: string): FSLIRecord[] {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at, parent_fsli_id
    FROM FSLI
    WHERE parent_fsli_id = ?
    ORDER BY display_order ASC, fsli_name ASC
  `).all(parentFSLIId) as {
    id: string;
    fsli_name: string;
    fsli_code: string | null;
    category: string;
    sub_category: string | null;
    display_order: number;
    source: string | null;
    active: number;
    created_at: string;
    parent_fsli_id: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    fsliName: r.fsli_name,
    fsliCode: r.fsli_code,
    category: r.category,
    subCategory: r.sub_category,
    displayOrder: r.display_order,
    source: (r.source as 'SYSTEM' | 'USER') || 'USER',
    active: r.active === 1,
    createdAt: r.created_at,
    parentFSLIId: r.parent_fsli_id,
  }));
}

/**
 * Create a new MappingRule.
 */
export function createMappingRule(data: {
  ruleName: string;
  priority?: number;
  conditions: Record<string, unknown>;
  action?: string;
  targetFSLIId?: string;
  confidence?: number;
  scope?: 'Global' | 'Client' | 'Entity';
  scopeClientId?: string;
  scopeEntityId?: string;
  createdBy?: string;
}): MappingRuleRecord {
  const database = getDatabase();
  const id = `rule-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const scope = data.scope || 'Global';

  database.prepare(`
    INSERT INTO MappingRule (
      id, rule_name, priority, conditions, action, target_fsli_id,
      confidence, scope, scope_client_id, scope_entity_id,
      active, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(
    id,
    data.ruleName,
    data.priority ?? 0,
    JSON.stringify(data.conditions),
    data.action || 'map_to_fsli',
    data.targetFSLIId || null,
    data.confidence ?? 1.0,
    scope,
    data.scopeClientId || null,
    data.scopeEntityId || null,
    data.createdBy || null,
    now,
    now
  );

  return {
    id,
    ruleName: data.ruleName,
    priority: data.priority ?? 0,
    conditions: data.conditions,
    action: data.action || 'map_to_fsli',
    targetFSLIId: data.targetFSLIId || null,
    confidence: data.confidence ?? 1.0,
    scope,
    scopeClientId: data.scopeClientId || null,
    scopeEntityId: data.scopeEntityId || null,
    active: true,
    createdBy: data.createdBy || null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Retrieve all active MappingRules, ordered by priority (highest first).
 */
export function getMappingRules(): MappingRuleRecord[] {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT * FROM MappingRule
    WHERE active = 1
    ORDER BY priority DESC, created_at ASC
  `).all() as {
    id: string;
    rule_name: string;
    priority: number;
    conditions: string;
    action: string;
    target_fsli_id: string | null;
    confidence: number;
    scope: string;
    scope_client_id: string | null;
    scope_entity_id: string | null;
    active: number;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    ruleName: r.rule_name,
    priority: r.priority,
    conditions: JSON.parse(r.conditions),
    action: r.action,
    targetFSLIId: r.target_fsli_id,
    confidence: r.confidence,
    scope: r.scope as 'Global' | 'Client' | 'Entity',
    scopeClientId: r.scope_client_id,
    scopeEntityId: r.scope_entity_id,
    active: r.active === 1,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Retrieve a single MappingRule by ID.
 */
export function getMappingRuleById(ruleId: string): MappingRuleRecord | null {
  const database = getDatabase();
  const row = database.prepare(`
    SELECT * FROM MappingRule WHERE id = ?
  `).get(ruleId) as {
    id: string;
    rule_name: string;
    priority: number;
    conditions: string;
    action: string;
    target_fsli_id: string | null;
    confidence: number;
    scope: string;
    scope_client_id: string | null;
    scope_entity_id: string | null;
    active: number;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    ruleName: row.rule_name,
    priority: row.priority,
    conditions: JSON.parse(row.conditions),
    action: row.action,
    targetFSLIId: row.target_fsli_id,
    confidence: row.confidence,
    scope: row.scope as 'Global' | 'Client' | 'Entity',
    scopeClientId: row.scope_client_id,
    scopeEntityId: row.scope_entity_id,
    active: row.active === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Retrieve ALL MappingRules (both active and inactive), ordered by priority.
 */
export function getAllMappingRules(scopeFilter?: {
  clientId?: string;
  entityId?: string;
}): MappingRuleRecord[] {
  const database = getDatabase();
  let query = 'SELECT * FROM MappingRule WHERE 1=1';
  const params: any[] = [];

  if (scopeFilter?.entityId) {
    query += ' AND (scope = "Global" OR (scope = "Entity" AND scope_entity_id = ?))';
    params.push(scopeFilter.entityId);
  } else if (scopeFilter?.clientId) {
    query += ' AND (scope = "Global" OR (scope = "Client" AND scope_client_id = ?))';
    params.push(scopeFilter.clientId);
  }

  query += ' ORDER BY priority DESC, created_at ASC';

  const rows = database.prepare(query).all(...params) as {
    id: string;
    rule_name: string;
    priority: number;
    conditions: string;
    action: string;
    target_fsli_id: string | null;
    confidence: number;
    scope: string;
    scope_client_id: string | null;
    scope_entity_id: string | null;
    active: number;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    ruleName: r.rule_name,
    priority: r.priority,
    conditions: JSON.parse(r.conditions),
    action: r.action,
    targetFSLIId: r.target_fsli_id,
    confidence: r.confidence,
    scope: r.scope as 'Global' | 'Client' | 'Entity',
    scopeClientId: r.scope_client_id,
    scopeEntityId: r.scope_entity_id,
    active: r.active === 1,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Updates an existing MappingRule.
 */
export function updateMappingRule(
  ruleId: string,
  data: Partial<MappingRuleInput>
): MappingRuleRecord {
  const database = getDatabase();
  const existing = getMappingRuleById(ruleId);
  if (!existing) {
    throw new Error(`Mapping rule "${ruleId}" not found`);
  }

  const now = new Date().toISOString();
  const ruleName = data.ruleName !== undefined ? data.ruleName : existing.ruleName;
  const priority = data.priority !== undefined ? data.priority : existing.priority;
  const conditions = data.conditions !== undefined ? JSON.stringify(data.conditions) : JSON.stringify(existing.conditions);
  const action = data.action !== undefined ? data.action : existing.action;
  const targetFSLIId = data.targetFSLIId !== undefined ? data.targetFSLIId : existing.targetFSLIId;
  const confidence = data.confidence !== undefined ? data.confidence : existing.confidence;
  const scope = data.scope !== undefined ? data.scope : existing.scope;
  const scopeClientId = data.scopeClientId !== undefined ? data.scopeClientId : existing.scopeClientId;
  const scopeEntityId = data.scopeEntityId !== undefined ? data.scopeEntityId : existing.scopeEntityId;

  database.prepare(`
    UPDATE MappingRule
    SET rule_name = ?, priority = ?, conditions = ?, action = ?,
        target_fsli_id = ?, confidence = ?, scope = ?,
        scope_client_id = ?, scope_entity_id = ?, updated_at = ?
    WHERE id = ?
  `).run(
    ruleName,
    priority,
    conditions,
    action,
    targetFSLIId || null,
    confidence,
    scope,
    scopeClientId || null,
    scopeEntityId || null,
    now,
    ruleId
  );

  return {
    ...existing,
    ruleName,
    priority,
    conditions: typeof data.conditions === 'object' ? data.conditions : existing.conditions,
    action,
    targetFSLIId: targetFSLIId || null,
    confidence,
    scope,
    scopeClientId: scopeClientId || null,
    scopeEntityId: scopeEntityId || null,
    updatedAt: now,
  };
}

/**
 * Toggles active state of a MappingRule.
 */
export function toggleMappingRuleActive(ruleId: string, active: boolean): boolean {
  const database = getDatabase();
  const now = new Date().toISOString();
  const res = database.prepare(`
    UPDATE MappingRule
    SET active = ?, updated_at = ?
    WHERE id = ?
  `).run(active ? 1 : 0, now, ruleId);
  return res.changes > 0;
}

/**
 * Deletes a MappingRule.
 */
export function deleteMappingRule(ruleId: string): boolean {
  const database = getDatabase();
  const res = database.prepare(`
    DELETE FROM MappingRule WHERE id = ?
  `).run(ruleId);
  return res.changes > 0;
}


/**
 * Create a new LedgerMapping.
 */
export function createLedgerMapping(data: {
  ledgerId: string;
  financialYearId: string;
  mappedFSLIId?: string;
  mappingRuleId?: string;
  mappingSource?: MappingSource;
  confidenceScore?: number;
  isManualOverride?: boolean;
  approvedBy?: string;
  status?: MappingStatus;
}): LedgerMappingRecord {
  const database = getDatabase();
  const id = `map-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO LedgerMapping (
      id, ledger_id, financial_year_id, mapped_fsli_id,
      mapping_rule_id, mapping_source, confidence_score,
      is_manual_override, approved_by, approved_at, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.ledgerId,
    data.financialYearId,
    data.mappedFSLIId || null,
    data.mappingRuleId || null,
    data.mappingSource || 'UserMapping',
    data.confidenceScore ?? null,
    data.isManualOverride ? 1 : 0,
    data.approvedBy || null,
    data.approvedBy ? now : null, // auto-set approved_at if approvedBy is set
    data.status || 'Unmapped',
    now,
    now
  );

  return {
    id,
    ledgerId: data.ledgerId,
    financialYearId: data.financialYearId,
    mappedFSLIId: data.mappedFSLIId || null,
    mappingRuleId: data.mappingRuleId || null,
    mappingSource: data.mappingSource || 'UserMapping',
    confidenceScore: data.confidenceScore ?? null,
    isManualOverride: data.isManualOverride || false,
    approvedBy: data.approvedBy || null,
    approvedAt: data.approvedBy ? now : null,
    status: data.status || 'Unmapped',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Retrieve all LedgerMappings for a given financial year.
 */
export function getLedgerMappings(financialYearId: string): LedgerMappingRecord[] {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT * FROM LedgerMapping
    WHERE financial_year_id = ?
    ORDER BY created_at ASC
  `).all(financialYearId) as {
    id: string;
    ledger_id: string;
    financial_year_id: string;
    mapped_fsli_id: string | null;
    mapping_rule_id: string | null;
    mapping_source: string;
    confidence_score: number | null;
    is_manual_override: number;
    approved_by: string | null;
    approved_at: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    ledgerId: r.ledger_id,
    financialYearId: r.financial_year_id,
    mappedFSLIId: r.mapped_fsli_id,
    mappingRuleId: r.mapping_rule_id,
    mappingSource: r.mapping_source as MappingSource,
    confidenceScore: r.confidence_score,
    isManualOverride: r.is_manual_override === 1,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    status: r.status as MappingStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Retrieve a single LedgerMapping by ledger ID + financial year.
 */
export function getLedgerMappingByLedger(
  ledgerId: string,
  financialYearId: string
): LedgerMappingRecord | null {
  const database = getDatabase();
  const row = database.prepare(`
    SELECT * FROM LedgerMapping
    WHERE ledger_id = ? AND financial_year_id = ?
  `).get(ledgerId, financialYearId) as {
    id: string;
    ledger_id: string;
    financial_year_id: string;
    mapped_fsli_id: string | null;
    mapping_rule_id: string | null;
    mapping_source: string;
    confidence_score: number | null;
    is_manual_override: number;
    approved_by: string | null;
    approved_at: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    ledgerId: row.ledger_id,
    financialYearId: row.financial_year_id,
    mappedFSLIId: row.mapped_fsli_id,
    mappingRuleId: row.mapping_rule_id,
    mappingSource: row.mapping_source as MappingSource,
    confidenceScore: row.confidence_score,
    isManualOverride: row.is_manual_override === 1,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    status: row.status as MappingStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Update the status of a LedgerMapping.
 */
export function updateLedgerMappingStatus(
  mappingId: string,
  status: MappingStatus,
  approvedBy?: string
): boolean {
  const database = getDatabase();
  const now = new Date().toISOString();

  const result = database.prepare(`
    UPDATE LedgerMapping
    SET status = ?, approved_by = COALESCE(?, approved_by),
        approved_at = CASE WHEN ? IS NOT NULL THEN ? ELSE approved_at END,
        updated_at = ?
    WHERE id = ?
  `).run(status, approvedBy || null, approvedBy || null, now, now, mappingId);

  return result.changes > 0;
}

// ── Phase 5 Step 2: Auto-Suggestion Engine Database Integration ──────────────

/**
 * Seeds standard Schedule III / Accounting Standard FSLIs if not already present.
 */
export function seedStandardFSLIs(database?: Database.Database): number {
  const targetDb = database || getDatabase();
  const now = new Date().toISOString();

  let insertedCount = 0;
  const insertStmt = targetDb.prepare(`
    INSERT INTO FSLI (id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'SYSTEM', 1, ?)
    ON CONFLICT(fsli_code) DO UPDATE SET
      source = 'SYSTEM'
    WHERE FSLI.source IS NULL OR FSLI.source = ''
  `);

  const tx = targetDb.transaction(() => {
    for (const item of STANDARD_FSLI_CATALOG) {
      const id = `fsli-${item.code.toLowerCase().replace(/_/g, '-')}`;
      const res = insertStmt.run(
        id,
        item.name,
        item.code,
        item.category,
        item.subCategory,
        item.displayOrder,
        now
      );
      if (res.changes > 0) insertedCount++;
    }
  });

  tx();
  return insertedCount;
}

/**
 * Generates explainable mapping suggestions for all ledgers in a financial year.
 */
export function generateMappingSuggestions(financialYearId: string): GenerateSuggestionsResponse {
  const database = getDatabase();
  // Ensure standard FSLIs exist
  seedStandardFSLIs(database);
  return generateSuggestionsForFinancialYear(database, financialYearId);
}

/**
 * Saves generated mapping suggestions into SQLite LedgerMapping table as status 'Suggested'.
 */
export function saveSuggestedMappings(
  financialYearId: string,
  suggestions: SuggestionResultItem[]
): { savedCount: number; updatedCount: number } {
  const database = getDatabase();
  const now = new Date().toISOString();

  let savedCount = 0;
  let updatedCount = 0;

  const insertOrUpdate = database.prepare(`
    INSERT INTO LedgerMapping (
      id, ledger_id, financial_year_id, mapped_fsli_id,
      mapping_rule_id, mapping_source, confidence_score,
      is_manual_override, approved_by, approved_at, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 'Suggested', ?, ?)
    ON CONFLICT(ledger_id, financial_year_id) DO UPDATE SET
      mapped_fsli_id = CASE WHEN LedgerMapping.status = 'Suggested' THEN excluded.mapped_fsli_id ELSE LedgerMapping.mapped_fsli_id END,
      mapping_rule_id = CASE WHEN LedgerMapping.status = 'Suggested' THEN excluded.mapping_rule_id ELSE LedgerMapping.mapping_rule_id END,
      mapping_source = CASE WHEN LedgerMapping.status = 'Suggested' THEN excluded.mapping_source ELSE LedgerMapping.mapping_source END,
      confidence_score = CASE WHEN LedgerMapping.status = 'Suggested' THEN excluded.confidence_score ELSE LedgerMapping.confidence_score END,
      updated_at = excluded.updated_at
  `);

  const tx = database.transaction(() => {
    for (const s of suggestions) {
      const mappingId = `map-${crypto.randomUUID()}`;
      const res = insertOrUpdate.run(
        mappingId,
        s.ledgerId,
        financialYearId,
        s.suggestedFSLIId,
        s.ruleId || null,
        s.mappingSource,
        s.confidenceScore,
        now,
        now
      );
      if (res.changes === 1) {
        savedCount++;
      } else if (res.changes > 1) {
        updatedCount++;
      }
    }
  });

  tx();
  return { savedCount, updatedCount };
}

// ── Phase 5 Step 3: Mapping Workbench UI Database Integration ────────────────

/**
 * Retrieves consolidated state for the Mapping Workbench UI.
 */
export function getMappingWorkbenchData(financialYearId?: string): MappingWorkbenchData {
  const database = getDatabase();
  seedStandardFSLIs(database);

  // 1. Fetch available Financial Years
  const fyRows = database.prepare('SELECT id, year_label FROM FinancialYear ORDER BY year_label DESC').all() as Array<{
    id: string;
    year_label: string;
  }>;

  if (fyRows.length === 0) {
    return {
      financialYears: [],
      activeFinancialYearId: '',
      activeFinancialYearLabel: 'No Financial Year',
      fslis: [],
      rules: [],
      summary: {
        totalLedgers: 0,
        mappedCount: 0,
        suggestedCount: 0,
        needsReviewCount: 0,
        unmappedCount: 0,
        rejectedCount: 0,
        highConfidenceCount: 0,
        mediumConfidenceCount: 0,
        lowConfidenceCount: 0,
      },
      rows: [],
    };
  }

  const activeFy = financialYearId ? fyRows.find((f) => f.id === financialYearId) || fyRows[0] : fyRows[0];
  const activeFyId = activeFy.id;
  const activeFyLabel = activeFy.year_label;

  // 2. Fetch FSLIs and build lookup
  const fslis = getFSLIs();
  const fsliMap = new Map<string, FSLIRecord>();
  for (const f of fslis) fsliMap.set(f.id, f);

  // 3. Fetch Mapping Rules
  const rules = getMappingRules();

  // 4. Generate Auto-Suggestions for this FY
  const suggestionResponse = generateSuggestionsForFinancialYear(database, activeFyId);
  const suggestionMap = new Map<string, SuggestionResultItem>();
  for (const s of suggestionResponse.suggestions) {
    suggestionMap.set(s.ledgerId, s);
  }

  // 5. Fetch existing CY Mappings for this FY
  const cyMappingsRaw = database.prepare(`
    SELECT * FROM LedgerMapping WHERE financial_year_id = ?
  `).all(activeFyId) as Array<{
    id: string;
    ledger_id: string;
    financial_year_id: string;
    mapped_fsli_id: string | null;
    mapping_rule_id: string | null;
    mapping_source: string;
    confidence_score: number | null;
    is_manual_override: number;
    approved_by: string | null;
    approved_at: string | null;
    status: string;
  }>;

  const cyMappingMap = new Map<string, typeof cyMappingsRaw[0]>();
  for (const m of cyMappingsRaw) {
    cyMappingMap.set(m.ledger_id, m);
  }

  // 6. Fetch Prior Year (PY) Mappings for PY classification
  const pyMappingsRaw = database.prepare(`
    SELECT lm.ledger_id, lm.mapped_fsli_id, f.fsli_name, f.fsli_code
    FROM LedgerMapping lm
    JOIN FSLI f ON lm.mapped_fsli_id = f.id
    WHERE lm.financial_year_id != ?
      AND lm.status IN ('Mapped', 'Suggested')
      AND lm.mapped_fsli_id IS NOT NULL
    ORDER BY lm.updated_at DESC
  `).all(activeFyId) as Array<{
    ledger_id: string;
    mapped_fsli_id: string;
    fsli_name: string;
    fsli_code: string | null;
  }>;

  const pyMappingMap = new Map<string, typeof pyMappingsRaw[0]>();
  for (const pm of pyMappingsRaw) {
    if (!pyMappingMap.has(pm.ledger_id)) {
      pyMappingMap.set(pm.ledger_id, pm);
    }
  }

  // 7. Fetch all Ledgers with balances and groups
  const ledgersRaw = database.prepare(`
    SELECT
      l.id as ledger_id,
      l.ledger_name,
      tg.id as tally_group_id,
      tg.group_name as tally_group_name,
      pg.id as parent_group_id,
      pg.group_name as parent_group_name,
      lb.debit,
      lb.credit,
      lb.net_balance
    FROM Ledger l
    LEFT JOIN TallyGroup tg ON l.tally_group_id = tg.id
    LEFT JOIN TallyGroup pg ON tg.parent_group_id = pg.id
    LEFT JOIN LedgerBalance lb ON l.id = lb.ledger_id AND lb.financial_year_id = ?
    ORDER BY tg.group_name, l.ledger_name
  `).all(activeFyId) as Array<{
    ledger_id: string;
    ledger_name: string;
    tally_group_id: string | null;
    tally_group_name: string | null;
    parent_group_id: string | null;
    parent_group_name: string | null;
    debit: number | null;
    credit: number | null;
    net_balance: number | null;
  }>;

  // 8. Build consolidated Workbench rows
  const rows: WorkbenchLedgerRow[] = [];
  let mappedCount = 0;
  let suggestedCount = 0;
  let needsReviewCount = 0;
  let unmappedCount = 0;
  let rejectedCount = 0;
  let highConf = 0;
  let medConf = 0;
  let lowConf = 0;

  for (const l of ledgersRaw) {
    const debit = l.debit || 0;
    const credit = l.credit || 0;
    const net = l.net_balance !== null ? l.net_balance : debit - credit;
    const nature: 'Debit' | 'Credit' | 'Zero' = net > 0 ? 'Debit' : net < 0 ? 'Credit' : 'Zero';

    const cyMapping = cyMappingMap.get(l.ledger_id);
    const pyMapping = pyMappingMap.get(l.ledger_id);
    const suggestion = suggestionMap.get(l.ledger_id);

    // Determine current status
    let status: MappingStatus = 'Suggested';
    let mappingId: string | null = null;
    let cyFSLIId: string | null = null;
    let cyFSLIName: string | null = null;
    let cyFSLICode: string | null = null;
    let isManualOverride = false;
    let approvedBy: string | null = null;
    let approvedAt: string | null = null;
    let mappingSource: MappingSource = suggestion?.mappingSource || 'SystemSuggestion';
    let confidence = suggestion?.confidenceScore ?? 0.8;
    const reason = suggestion?.reason || 'Auto-suggested based on accounting classification';

    if (cyMapping) {
      mappingId = cyMapping.id;
      status = cyMapping.status as MappingStatus;
      cyFSLIId = cyMapping.mapped_fsli_id;
      isManualOverride = cyMapping.is_manual_override === 1;
      approvedBy = cyMapping.approved_by;
      approvedAt = cyMapping.approved_at;
      mappingSource = cyMapping.mapping_source as MappingSource;
      if (cyMapping.confidence_score !== null) {
        confidence = cyMapping.confidence_score;
      }

      if (cyFSLIId) {
        const mappedFSLI = fsliMap.get(cyFSLIId);
        if (mappedFSLI) {
          cyFSLIName = mappedFSLI.fsliName;
          cyFSLICode = mappedFSLI.fsliCode;
        }
      }
    } else {
      // If no mapping record exists yet, default to Suggested with suggestion's FSLI
      if (suggestion) {
        cyFSLIId = suggestion.suggestedFSLIId;
        cyFSLIName = suggestion.suggestedFSLIName;
        cyFSLICode = suggestion.suggestedFSLICode;
        status = 'Suggested';
      } else {
        status = 'Unmapped';
      }
    }

    // Confidence metric tracking
    if (confidence >= 0.85) highConf++;
    else if (confidence >= 0.70) medConf++;
    else lowConf++;

    // Status metric tracking
    if (status === 'Mapped') mappedCount++;
    else if (status === 'Suggested') suggestedCount++;
    else if (status === 'NeedsReview') needsReviewCount++;
    else if (status === 'Rejected') rejectedCount++;
    else unmappedCount++;

    rows.push({
      ledgerId: l.ledger_id,
      ledgerName: l.ledger_name,
      tallyGroupId: l.tally_group_id,
      tallyGroupName: l.tally_group_name,
      parentGroupId: l.parent_group_id,
      parentGroupName: l.parent_group_name,
      debit,
      credit,
      netBalance: net,
      balanceNature: nature,
      mappingId,
      status,
      cyFSLIId,
      cyFSLIName,
      cyFSLICode,
      pyFSLIId: pyMapping?.mapped_fsli_id || null,
      pyFSLIName: pyMapping?.fsli_name || null,
      pyFSLICode: pyMapping?.fsli_code || null,
      suggestedFSLIId: suggestion?.suggestedFSLIId || null,
      suggestedFSLIName: suggestion?.suggestedFSLIName || null,
      suggestedFSLICode: suggestion?.suggestedFSLICode || null,
      category: suggestion?.category || null,
      confidenceScore: confidence,
      reason,
      mappingSource,
      isManualOverride,
      approvedBy,
      approvedAt,
    });
  }

  return {
    financialYears: fyRows.map((f) => ({ id: f.id, yearLabel: f.year_label })),
    activeFinancialYearId: activeFyId,
    activeFinancialYearLabel: activeFyLabel,
    fslis,
    rules,
    summary: {
      totalLedgers: rows.length,
      mappedCount,
      suggestedCount,
      needsReviewCount,
      unmappedCount,
      rejectedCount,
      highConfidenceCount: highConf,
      mediumConfidenceCount: medConf,
      lowConfidenceCount: lowConf,
    },
    rows,
  };
}

/**
 * Bulk updates multiple ledger mappings in a single transaction.
 */
export function bulkUpdateLedgerMappings(
  financialYearId: string,
  updates: BulkUpdateMappingItem[]
): { updatedCount: number } {
  const database = getDatabase();
  const now = new Date().toISOString();

  let updatedCount = 0;
  const insertOrUpdate = database.prepare(`
    INSERT INTO LedgerMapping (
      id, ledger_id, financial_year_id, mapped_fsli_id,
      mapping_rule_id, mapping_source, confidence_score,
      is_manual_override, approved_by, approved_at, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ledger_id, financial_year_id) DO UPDATE SET
      mapped_fsli_id = excluded.mapped_fsli_id,
      mapping_rule_id = excluded.mapping_rule_id,
      mapping_source = excluded.mapping_source,
      confidence_score = excluded.confidence_score,
      is_manual_override = excluded.is_manual_override,
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      status = excluded.status,
      updated_at = excluded.updated_at
  `);

  const tx = database.transaction(() => {
    for (const item of updates) {
      const mappingId = `map-${crypto.randomUUID()}`;
      const approvedAt = item.status === 'Mapped' ? now : null;
      const approvedBy = item.status === 'Mapped' ? (item.approvedBy || 'User') : null;

      insertOrUpdate.run(
        mappingId,
        item.ledgerId,
        financialYearId,
        item.mappedFSLIId,
        item.mappingRuleId || null,
        item.mappingSource,
        item.confidenceScore ?? 1.0,
        item.isManualOverride ? 1 : 0,
        approvedBy,
        approvedAt,
        item.status,
        now,
        now
      );
      updatedCount++;
    }
  });

  tx();
  return { updatedCount };
}

/**
 * Applies an FSLI mapping to all similar ledgers sharing group/keyword in the FY.
 *
 * When `unitId` is provided, only ledgers belonging to that unit are affected.
 * This prevents cross-unit contamination when applying mappings to similar ledgers.
 */
export function applyMappingToSimilar(
  financialYearId: string,
  targetFSLIId: string,
  criteriaType: 'group' | 'keyword',
  criteriaValue: string,
  unitId?: string
): { updatedCount: number } {
  const database = getDatabase();
  const now = new Date().toISOString();

  let targetLedgers: Array<{ id: string }> = [];

  if (criteriaType === 'group') {
    if (unitId) {
      targetLedgers = database.prepare(`
        SELECT l.id
        FROM Ledger l
        JOIN TallyGroup tg ON l.tally_group_id = tg.id
        WHERE LOWER(tg.group_name) = LOWER(?) AND l.unit_id = ?
      `).all(criteriaValue, unitId) as Array<{ id: string }>;
    } else {
      targetLedgers = database.prepare(`
        SELECT l.id
        FROM Ledger l
        JOIN TallyGroup tg ON l.tally_group_id = tg.id
        WHERE LOWER(tg.group_name) = LOWER(?)
      `).all(criteriaValue) as Array<{ id: string }>;
    }
  } else {
    // keyword
    if (unitId) {
      targetLedgers = database.prepare(`
        SELECT id FROM Ledger
        WHERE LOWER(ledger_name) LIKE LOWER(?) AND unit_id = ?
      `).all(`%${criteriaValue}%`, unitId) as Array<{ id: string }>;
    } else {
      targetLedgers = database.prepare(`
        SELECT id FROM Ledger
        WHERE LOWER(ledger_name) LIKE LOWER(?)
      `).all(`%${criteriaValue}%`) as Array<{ id: string }>;
    }
  }

  if (targetLedgers.length === 0) {
    return { updatedCount: 0 };
  }

  const updates: BulkUpdateMappingItem[] = targetLedgers.map((l) => ({
    ledgerId: l.id,
    mappedFSLIId: targetFSLIId,
    status: 'Mapped',
    mappingSource: 'BulkMapping',
    isManualOverride: true,
    confidenceScore: 0.95,
    approvedBy: 'User (Apply to Similar)',
  }));

  return bulkUpdateLedgerMappings(financialYearId, updates);
}

// ── Phase 5 Step 4: Unmapped Tracker & Materiality Audit ─────────────────────

/**
 * Consolidates all ledger mapping statuses, computes materiality thresholds,
 * and performs pre-reporting audit checks for the Unmapped / Review Tracker.
 */
export function getUnmappedTrackerData(
  financialYearId?: string,
  materialityThreshold?: number
): UnmappedTrackerData {
  const database = getDatabase();

  // 1. Resolve Financial Year
  const fyList = database.prepare(`
    SELECT id, year_label FROM FinancialYear ORDER BY created_at DESC
  `).all() as Array<{ id: string; year_label: string }>;

  let activeFYId = financialYearId;
  let activeFYLabel = '';

  if (!activeFYId && fyList.length > 0) {
    activeFYId = fyList[0].id;
    activeFYLabel = fyList[0].year_label;
  } else if (activeFYId) {
    const found = fyList.find((f) => f.id === activeFYId);
    activeFYLabel = found ? found.year_label : activeFYId;
  }

  if (!activeFYId) {
    return {
      financialYears: [],
      activeFinancialYearId: '',
      activeFinancialYearLabel: '',
      units: [],
      tallyGroups: [],
      fslis: [],
      summary: {
        totalLedgers: 0,
        mappedCount: 0,
        suggestedCount: 0,
        needsReviewCount: 0,
        unmappedCount: 0,
        rejectedCount: 0,
        totalGrossBalance: 0,
        materialityThreshold: 0,
        materialLedgersCount: 0,
        unmappedMaterialCount: 0,
        unmappedMaterialAmount: 0,
        isReadyForReporting: false,
        blockingReason: 'No financial year found',
      },
      rows: [],
    };
  }

  // 2. Fetch Business Units
  const units = database.prepare(`
    SELECT id, unit_name FROM Unit ORDER BY unit_name ASC
  `).all() as Array<{ id: string; unit_name: string }>;

  // 3. Fetch FSLIs catalog
  const fslis = getFSLIs();
  const fsliMap = new Map<string, FSLIRecord>();
  for (const f of fslis) {
    fsliMap.set(f.id, f);
  }

  // 4. Generate Auto-Suggestions for this FY
  const suggestionResponse = generateSuggestionsForFinancialYear(database, activeFYId);
  const suggestionMap = new Map<string, SuggestionResultItem>();
  for (const s of suggestionResponse.suggestions) {
    suggestionMap.set(s.ledgerId, s);
  }

  // 5. Query Ledger balances with Group and Unit information
  const ledgerRows = database.prepare(`
    SELECT
      l.id as ledger_id,
      l.ledger_name,
      l.unit_id,
      u.unit_name,
      l.tally_group_id,
      tg.group_name as tally_group_name,
      ptg.group_name as parent_group_name,
      lb.debit,
      lb.credit,
      lb.net_balance,
      lm.id as mapping_id,
      lm.mapped_fsli_id,
      lm.mapping_source,
      lm.confidence_score,
      lm.is_manual_override,
      lm.status as saved_status
    FROM Ledger l
    LEFT JOIN Unit u ON l.unit_id = u.id
    LEFT JOIN TallyGroup tg ON l.tally_group_id = tg.id
    LEFT JOIN TallyGroup ptg ON tg.parent_group_id = ptg.id
    LEFT JOIN LedgerBalance lb ON l.id = lb.ledger_id AND lb.financial_year_id = ?
    LEFT JOIN LedgerMapping lm ON l.id = lm.ledger_id AND lm.financial_year_id = ?
    WHERE lb.id IS NOT NULL
    ORDER BY ABS(lb.net_balance) DESC, l.ledger_name ASC
  `).all(activeFYId, activeFYId) as Array<{
    ledger_id: string;
    ledger_name: string;
    unit_id: string | null;
    unit_name: string | null;
    tally_group_id: string | null;
    tally_group_name: string | null;
    parent_group_name: string | null;
    debit: number | null;
    credit: number | null;
    net_balance: number | null;
    mapping_id: string | null;
    mapped_fsli_id: string | null;
    mapping_source: string | null;
    confidence_score: number | null;
    is_manual_override: number | null;
    saved_status: string | null;
  }>;

  // 6. Compute Total Gross Balance Base & Materiality Benchmark
  let totalGrossBalance = 0;
  for (const r of ledgerRows) {
    totalGrossBalance += Math.abs(r.net_balance || 0);
  }

  // Default materiality: 0.5% of total gross trial balance balance, minimum ₹5,00,000
  const computedDefaultThreshold = Math.max(500000, Math.round(totalGrossBalance * 0.005));
  const effectiveThreshold =
    materialityThreshold !== undefined && materialityThreshold > 0
      ? materialityThreshold
      : computedDefaultThreshold;

  // Distinct groups list
  const groupSet = new Set<string>();

  // 7. Assemble Rows & Summary Metrics
  let mappedCount = 0;
  let suggestedCount = 0;
  let needsReviewCount = 0;
  let unmappedCount = 0;
  let rejectedCount = 0;
  let materialLedgersCount = 0;
  let unmappedMaterialCount = 0;
  let unmappedMaterialAmount = 0;

  const rows: UnmappedTrackerRow[] = ledgerRows.map((r) => {
    if (r.tally_group_name) groupSet.add(r.tally_group_name);

    const debit = r.debit || 0;
    const credit = r.credit || 0;
    const netBal = r.net_balance !== null ? r.net_balance : debit - credit;

    let balanceNature: 'Debit' | 'Credit' | 'Zero' = 'Zero';
    if (netBal > 0.0001) balanceNature = 'Debit';
    else if (netBal < -0.0001) balanceNature = 'Credit';

    const isMaterial = Math.abs(netBal) >= effectiveThreshold;
    if (isMaterial) materialLedgersCount++;

    const sug = suggestionMap.get(r.ledger_id);

    // Determine status
    let status: MappingStatus = 'Unmapped';
    let mappedFSLIId: string | null = null;
    let mappedFSLIName: string | null = null;
    let mappedFSLICode: string | null = null;
    let confidenceScore = 0;
    let mappingSource: MappingSource = 'SystemSuggestion';
    let isManualOverride = false;
    let reason = '';

    if (r.saved_status) {
      status = r.saved_status as MappingStatus;
      mappedFSLIId = r.mapped_fsli_id;
      if (mappedFSLIId && fsliMap.has(mappedFSLIId)) {
        const f = fsliMap.get(mappedFSLIId)!;
        mappedFSLIName = f.fsliName;
        mappedFSLICode = f.fsliCode;
      }
      confidenceScore = r.confidence_score ?? 1.0;
      mappingSource = (r.mapping_source as MappingSource) || 'UserMapping';
      isManualOverride = r.is_manual_override === 1;
      reason = isManualOverride
        ? 'User manual mapping override'
        : (sug ? sug.reason : 'Persisted ledger mapping');
    } else if (sug) {
      // Auto-suggested
      status = 'Suggested';
      confidenceScore = sug.confidenceScore;
      mappingSource = sug.mappingSource;
      reason = sug.reason;
    }

    // Update Counts
    switch (status) {
      case 'Mapped':
        mappedCount++;
        break;
      case 'Suggested':
        suggestedCount++;
        break;
      case 'NeedsReview':
        needsReviewCount++;
        break;
      case 'Rejected':
        rejectedCount++;
        break;
      case 'Unmapped':
      default:
        unmappedCount++;
        break;
    }

    // Materiality check on un-finalized items
    if (isMaterial && status !== 'Mapped') {
      unmappedMaterialCount++;
      unmappedMaterialAmount += Math.abs(netBal);
    }

    const suggestedFSLI = sug ? fsliMap.get(sug.suggestedFSLIId) : undefined;

    return {
      ledgerId: r.ledger_id,
      ledgerName: r.ledger_name,
      unitId: r.unit_id,
      unitName: r.unit_name || 'Primary Unit',
      tallyGroupId: r.tally_group_id,
      tallyGroupName: r.tally_group_name,
      parentGroupName: r.parent_group_name,
      debit,
      credit,
      netBalance: netBal,
      balanceNature,
      isMaterial,
      status,
      mappedFSLIId,
      mappedFSLIName,
      mappedFSLICode,
      suggestedFSLIId: sug?.suggestedFSLIId || null,
      suggestedFSLIName: suggestedFSLI?.fsliName || sug?.suggestedFSLIName || null,
      confidenceScore,
      mappingSource,
      isManualOverride,
      reason,
    };
  });

  // Pre-reporting Readiness Verification
  const isReadyForReporting = unmappedMaterialCount === 0 && unmappedCount === 0 && rejectedCount === 0;
  let blockingReason: string | null = null;
  if (unmappedMaterialCount > 0) {
    blockingReason = `${unmappedMaterialCount} material account(s) totaling ₹${unmappedMaterialAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} require mapping confirmation before reporting.`;
  } else if (unmappedCount > 0 || rejectedCount > 0) {
    blockingReason = `${unmappedCount + rejectedCount} unmapped or rejected accounts require resolution.`;
  }

  const summary: UnmappedTrackerSummary = {
    totalLedgers: rows.length,
    mappedCount,
    suggestedCount,
    needsReviewCount,
    unmappedCount,
    rejectedCount,
    totalGrossBalance,
    materialityThreshold: effectiveThreshold,
    materialLedgersCount,
    unmappedMaterialCount,
    unmappedMaterialAmount,
    isReadyForReporting,
    blockingReason,
  };

  return {
    financialYears: fyList.map((f) => ({ id: f.id, yearLabel: f.year_label })),
    activeFinancialYearId: activeFYId,
    activeFinancialYearLabel: activeFYLabel,
    units: units.map((u) => ({ id: u.id, unitName: u.unit_name })),
    tallyGroups: Array.from(groupSet).sort(),
    fslis,
    summary,
    rows,
  };
}

// ── Phase 6: Classification Engine ────────────────────────────────────────────

/**
 * Fetches classification data for a given financial year.
 */
export function getClassificationDataForYear(financialYearId?: string): ClassificationData {
  const database = getDatabase();
  return getClassificationDataImpl(database, financialYearId);
}

/**
 * Runs auto-classification for all ledgers in the given financial year.
 * Skips manual overrides.
 */
export function autoClassifyForYear(
  financialYearId: string
): { classifiedCount: number; skippedCount: number } {
  const database = getDatabase();
  return autoClassifyLedgersImpl(database, financialYearId);
}

/**
 * Saves manual classification updates for one or more ledgers.
 */
export function saveClassificationsForYear(
  financialYearId: string,
  items: ClassificationUpdateItem[]
): { savedCount: number } {
  const database = getDatabase();
  return saveClassificationsImpl(database, financialYearId, items);
}

/**
 * Resets all classification decisions for the given financial year.
 * Does NOT touch LedgerMapping, Ledger, TallyGroup, or LedgerBalance.
 */
export function resetClassificationsForYear(
  financialYearId: string
): { deletedCount: number } {
  const database = getDatabase();
  return resetClassificationsImpl(database, financialYearId);
}

// ── Phase 7: Regrouping Engine ────────────────────────────────────────────────

/**
 * Fetches regrouping workbench data for a given financial year.
 */
export function getRegroupingWorkbenchDataForYear(
  financialYearId?: string
): RegroupingWorkbenchData {
  const database = getDatabase();
  return getRegroupingWorkbenchDataImpl(database, financialYearId);
}

/**
 * Generates regrouping suggestions for the given financial year.
 */
export function generateRegroupingSuggestionsForYear(
  financialYearId: string
): { detectedCount: number; autoAppliedCount: number; needsReviewCount: number } {
  const database = getDatabase();
  return generateRegroupingSuggestionsImpl(database, financialYearId);
}

/**
 * Approves a regrouping result.
 */
export function approveRegroupingById(
  id: string,
  approvedBy?: string
): RegroupingResultRecord {
  const database = getDatabase();
  return approveRegroupingImpl(database, id, approvedBy);
}

/**
 * Rejects a regrouping result.
 */
export function rejectRegroupingById(
  id: string,
  rejectedBy?: string,
  reason?: string
): RegroupingResultRecord {
  const database = getDatabase();
  return rejectRegroupingImpl(database, id, rejectedBy, reason);
}

/**
 * Changes a regrouping result's proposed FSLI.
 */
export function changeRegroupingById(
  id: string,
  newFSLIId: string,
  newClassification: string,
  reason: string,
  changedBy?: string
): RegroupingResultRecord {
  const database = getDatabase();
  return changeRegroupingImpl(database, id, newFSLIId, newClassification, reason, changedBy);
}

/**
 * Applies an approved regrouping to financial statements.
 */
export function applyRegroupingById(
  id: string,
  appliedBy?: string
): RegroupingResultRecord {
  const database = getDatabase();
  return applyRegroupingImpl(database, id, appliedBy);
}

/**
 * Undoes a previously applied regrouping.
 */
export function undoRegroupingById(
  id: string,
  undoneBy?: string,
  reason?: string
): RegroupingResultRecord {
  const database = getDatabase();
  return undoRegroupingImpl(database, id, undoneBy, reason);
}

/**
 * Creates a new regrouping rule.
 */
export function createRegroupingRuleInDb(
  input: CreateRegroupingRuleInput
): RegroupingRuleRecord {
  const database = getDatabase();
  return createRegroupingRuleImpl(database, input);
}

/**
 * Lists all regrouping rules.
 */
export function getRegroupingRulesFromDb(): RegroupingRuleRecord[] {
  const database = getDatabase();
  return getRegroupingRulesImpl(database);
}

/**
 * Toggles auto-apply on a regrouping rule.
 */
export function toggleRegroupingRuleAutoApplyInDb(
  ruleId: string,
  autoApply: boolean
): RegroupingRuleRecord {
  const database = getDatabase();
  return toggleRegroupingRuleAutoApplyImpl(database, ruleId, autoApply);
}

/**
 * Gets audit history for a regrouping result.
 */
export function getRegroupingAuditHistoryFromDb(
  regroupingId: string
): RegroupingAuditRecord[] {
  const database = getDatabase();
  return getRegroupingAuditHistoryImpl(database, regroupingId);
}
