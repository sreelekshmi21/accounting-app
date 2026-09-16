/**
 * Phase 10: FSLI & Reporting Hierarchy Engine
 * Authoritative reporting dataset generator and financial statements compiler.
 */

import Database from 'better-sqlite3';
import {
  REPORTING_STATEMENTS,
  REPORTING_SCHEDULES,
  REPORTING_NODES,
  DEFAULT_FSLI_TO_NODE_MAPPINGS,
} from './reporting-hierarchy-master-data';
import {
  executeAllCalculatedSchedules,
  type ScheduleCalculationContext,
  type ScheduleDiagnosticNotice,
  type AllCalculatedSchedulesResult,
  type LedgerResolvedBalance,
  type FSLIAggregatedBalance,
  type NodeAggregatedBalance,
} from './schedule-calculators';

export type ReportingEngineStatus =
  | 'READY'
  | 'PENDING_MAPPING'
  | 'INCOMPLETE_SCHEDULE_INPUT'
  | 'RECONCILIATION_ERROR'
  | 'BALANCE_SHEET_UNBALANCED';

export interface FSLISummaryRow {
  fsliId: string;
  fsliCode: string;
  fsliName: string;
  category: string;
  subCategory: string | null;
  cyDebit: number;
  cyCredit: number;
  cyNet: number;
  pyDebit: number;
  pyCredit: number;
  pyNet: number;
  ledgerCount: number;
  status: 'Mapped' | 'Unmapped';
}

export interface ReportingNodeRow {
  nodeId: string;
  nodeCode: string;
  nodeName: string;
  scheduleCode: string;
  scheduleNumber: number;
  parentNodeCode?: string;
  nodeType: string;
  balanceNature: string;
  isProtectedAccount: boolean;
  depth: number;
  displayOrder: number;
  cyDebit: number;
  cyCredit: number;
  cyNet: number;
  pyDebit: number;
  pyCredit: number;
  pyNet: number;
  ledgerCount: number;
}

export interface ReportingScheduleRow {
  scheduleId: string;
  statementCode: 'BS' | 'IE';
  scheduleNumber: number;
  scheduleCode: string;
  scheduleName: string;
  scheduleType: string;
  isCalculated: boolean;
  displayOrder: number;
  cyTotal: number;
  pyTotal: number;
  cyDebit: number;
  cyCredit: number;
  pyDebit: number;
  pyCredit: number;
  nodes: ReportingNodeRow[];
}

export interface StatementLineItem {
  lineId: string;
  section: 'LIABILITIES' | 'ASSETS' | 'INCOME' | 'EXPENSES';
  subSection?: string;
  lineNumber: string;
  lineTitle: string;
  scheduleNumber?: number;
  scheduleCode?: string;
  cyAmount: number;
  pyAmount: number;
  isSubtotal?: boolean;
  isTotal?: boolean;
}

export interface StatementSummary {
  statementCode: 'BS' | 'IE';
  statementName: string;
  cyTotal: number;
  pyTotal: number;
  lines: StatementLineItem[];
  difference?: number;
  isBalanced?: boolean;
}

export interface ReconciliationProof {
  sourceDebit: number;
  sourceCredit: number;
  sourceDifference: number;
  aggregatedFSLIDebit: number;
  aggregatedFSLICredit: number;
  aggregatedFSLIDifference: number;
  reportingNodesDebit: number;
  reportingNodesCredit: number;
  unmappedDebit: number;
  unmappedCredit: number;
  unmappedNet: number;
  sourceLedgerCount: number;
  processedLedgerCount: number;
  unresolvedLedgerCount: number;
  fslisCount: number;
  schedulesCount: number;
  isSourceReconciled: boolean;
  isFSLIReconciled: boolean;
  isNodesReconciled: boolean;
}

export interface UnmappedLedgerDetail {
  ledgerId: string;
  ledgerName: string;
  unitId: string;
  unitName: string;
  financialYearId: string;
  debit: number;
  credit: number;
  net: number;
  mappingStatus: string;
  classificationStatus: string;
}

export interface LedgerProvenanceTrace {
  ledgerId: string;
  ledgerName: string;
  unitId: string;
  unitName: string;
  financialYearId: string;
  importBatchId: string;
  importFileName: string;
  baseDebit: number;
  baseCredit: number;
  phase5MappedFSLI: string | null;
  phase6ClassifiedFSLI: string | null;
  phase7RegroupedFSLI: string | null;
  phase8AdjustmentsApplied: number;
  phase9ConsolidationElimination: number;
  finalFSLICode: string;
  finalFSLIName: string;
  reportingNodeCode: string;
  reportingNodeName: string;
  reportingScheduleCode: string;
  reportingStatementCode: string;
}

export interface ReportingHierarchyEngineResult {
  financialYearId: string;
  financialYearLabel: string;
  scope: 'UNIT' | 'CONSOLIDATED';
  unitId?: string;
  unitName?: string;
  consolidationRunId?: string;
  status: ReportingEngineStatus;
  statusMessage: string;
  reconciliation: ReconciliationProof;
  calculatedSchedules: AllCalculatedSchedulesResult;
  diagnostics: ScheduleDiagnosticNotice[];
  fsliRows: FSLISummaryRow[];
  scheduleRows: ReportingScheduleRow[];
  subScheduleRows: ReportingNodeRow[];
  incomeAndExpenditure: StatementSummary;
  balanceSheet: StatementSummary;
  unmappedLedgers: UnmappedLedgerDetail[];
  totalDebit: number;
  totalCredit: number;
  netSurplusCY: number;
  netSurplusPY: number;
  balanceSheetDifference: number;
  generatedAt: string;
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Ensures reporting hierarchy master tables exist and seeds them if empty.
 */
export function ensureReportingHierarchyTables(db: Database.Database): void {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ReportingStatement (
        id              TEXT PRIMARY KEY,
        statement_code  TEXT UNIQUE NOT NULL,
        statement_name  TEXT NOT NULL,
        display_order   INTEGER NOT NULL DEFAULT 0,
        active          INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS ReportingSchedule (
        id              TEXT PRIMARY KEY,
        statement_id    TEXT NOT NULL,
        schedule_number INTEGER NOT NULL,
        schedule_code   TEXT UNIQUE NOT NULL,
        schedule_name   TEXT NOT NULL,
        schedule_type   TEXT NOT NULL CHECK(schedule_type IN ('CAPITAL_RESERVE', 'LIABILITY', 'ASSET', 'INCOME', 'EXPENSE')),
        is_calculated   INTEGER NOT NULL DEFAULT 0,
        calculator_key  TEXT,
        display_order   INTEGER NOT NULL DEFAULT 0,
        active          INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (statement_id) REFERENCES ReportingStatement(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ReportingNode (
        id                  TEXT PRIMARY KEY,
        schedule_id         TEXT NOT NULL,
        parent_node_id      TEXT,
        node_code           TEXT UNIQUE NOT NULL,
        node_name           TEXT NOT NULL,
        node_type           TEXT NOT NULL CHECK(node_type IN ('HEADER', 'LINE_ITEM', 'SUB_SCHEDULE', 'SUBTOTAL', 'TOTAL', 'CALCULATED', 'MOVEMENT')),
        balance_nature      TEXT NOT NULL CHECK(balance_nature IN ('DEBIT', 'CREDIT', 'NET', 'BOTH')),
        movement_type       TEXT CHECK(movement_type IN ('OPENING', 'ADDITION', 'DEDUCTION', 'DISPOSAL', 'CLOSING', 'NONE')),
        is_protected_account INTEGER NOT NULL DEFAULT 0,
        display_order       INTEGER NOT NULL DEFAULT 0,
        depth               INTEGER NOT NULL DEFAULT 0,
        target_statement_line TEXT,
        active              INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (schedule_id) REFERENCES ReportingSchedule(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_node_id) REFERENCES ReportingNode(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS FSLIToReportingNode (
        id                TEXT PRIMARY KEY,
        fsli_id           TEXT NOT NULL,
        reporting_node_id TEXT NOT NULL,
        mapping_condition TEXT,
        is_default        INTEGER NOT NULL DEFAULT 1,
        created_at        TEXT NOT NULL,
        FOREIGN KEY (fsli_id) REFERENCES FSLI(id) ON DELETE CASCADE,
        FOREIGN KEY (reporting_node_id) REFERENCES ReportingNode(id) ON DELETE CASCADE,
        UNIQUE(fsli_id, reporting_node_id, mapping_condition)
      );

      CREATE TABLE IF NOT EXISTS LedgerReportingOverride (
        id                TEXT PRIMARY KEY,
        ledger_id         TEXT NOT NULL,
        financial_year_id TEXT NOT NULL,
        reporting_node_id TEXT NOT NULL,
        reason            TEXT,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        FOREIGN KEY (ledger_id) REFERENCES Ledger(id) ON DELETE CASCADE,
        FOREIGN KEY (financial_year_id) REFERENCES FinancialYear(id) ON DELETE CASCADE,
        FOREIGN KEY (reporting_node_id) REFERENCES ReportingNode(id) ON DELETE CASCADE,
        UNIQUE(ledger_id, financial_year_id)
      );
    `);

    // Check if ReportingStatement is already seeded
    const stmtCount = (db.prepare('SELECT COUNT(*) as cnt FROM ReportingStatement').get() as { cnt: number }).cnt;
    if (stmtCount === 0) {
      const insertStmt = db.prepare(`
        INSERT INTO ReportingStatement (id, statement_code, statement_name, display_order, active)
        VALUES (?, ?, ?, ?, 1)
      `);
      for (const s of REPORTING_STATEMENTS) {
        insertStmt.run(s.id, s.statementCode, s.statementName, s.displayOrder);
      }

      const insertSch = db.prepare(`
        INSERT INTO ReportingSchedule (id, statement_id, schedule_number, schedule_code, schedule_name, schedule_type, is_calculated, calculator_key, display_order, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      for (const sc of REPORTING_SCHEDULES) {
        const stmtId = sc.statementCode === 'BS' ? 'stmt-bs' : 'stmt-ie';
        insertSch.run(sc.id, stmtId, sc.scheduleNumber, sc.scheduleCode, sc.scheduleName, sc.scheduleType, sc.isCalculated ? 1 : 0, sc.calculatorKey || null, sc.displayOrder);
      }

      const insertNode = db.prepare(`
        INSERT INTO ReportingNode (id, schedule_id, parent_node_id, node_code, node_name, node_type, balance_nature, movement_type, is_protected_account, display_order, depth, target_statement_line, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      // Map scheduleCode to schedule_id
      const schCodeToId = new Map<string, string>();
      for (const sc of REPORTING_SCHEDULES) {
        schCodeToId.set(sc.scheduleCode, sc.id);
      }

      const nodeCodeToId = new Map<string, string>();
      for (const n of REPORTING_NODES) {
        nodeCodeToId.set(n.nodeCode, n.id);
      }

      for (const n of REPORTING_NODES) {
        const schId = schCodeToId.get(n.scheduleCode) || n.scheduleCode;
        const parentId = n.parentNodeCode ? (nodeCodeToId.get(n.parentNodeCode) || null) : null;
        insertNode.run(
          n.id,
          schId,
          parentId,
          n.nodeCode,
          n.nodeName,
          n.nodeType,
          n.balanceNature,
          n.movementType || 'NONE',
          n.isProtectedAccount ? 1 : 0,
          n.displayOrder,
          n.depth,
          n.targetStatementLine || null,
        );
      }
    }

    // Always sync default mappings from FSLI to Reporting Nodes (idempotently)
    const insertMapping = db.prepare(`
      INSERT OR IGNORE INTO FSLIToReportingNode (id, fsli_id, reporting_node_id, mapping_condition, is_default, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `);

    const now = new Date().toISOString();
    for (const m of DEFAULT_FSLI_TO_NODE_MAPPINGS) {
      const fsliRows = db.prepare('SELECT id FROM FSLI WHERE fsli_code = ?').all(m.fsliCode) as Array<{ id: string }>;
      const nodeRow = db.prepare('SELECT id FROM ReportingNode WHERE node_code = ?').get(m.nodeCode) as { id: string } | undefined;
      if (nodeRow && fsliRows.length > 0) {
        for (const fsliRow of fsliRows) {
          insertMapping.run(`fnm-${fsliRow.id}-${nodeRow.id}`, fsliRow.id, nodeRow.id, m.mappingCondition || null, now);
        }
      }
    }
  } catch (err: any) {
    if (!err.message?.includes('readonly')) {
      throw err;
    }
  }
}

/**
 * Main calculation entrypoint for Phase 10 Reporting Hierarchy Engine.
 */
export function generateReportingHierarchyData(
  db: Database.Database,
  financialYearId: string,
  options?: {
    scope?: 'UNIT' | 'CONSOLIDATED';
    unitId?: string;
    consolidationRunId?: string;
    importBatchId?: string;
    previousFinancialYearId?: string;
  },
): ReportingHierarchyEngineResult {
  ensureReportingHierarchyTables(db);

  const scope = options?.scope || (options?.consolidationRunId ? 'CONSOLIDATED' : 'UNIT');
  const unitId = options?.unitId;
  const consolidationRunId = options?.consolidationRunId;
  const specifiedBatchId = options?.importBatchId;

  // Resolve FY labels
  const fyRow = db.prepare('SELECT id, year_label FROM FinancialYear WHERE id = ?').get(financialYearId) as { id: string; year_label: string } | undefined;
  if (!fyRow) {
    throw new Error(`Financial Year with ID "${financialYearId}" not found.`);
  }
  const fyLabel = fyRow.year_label;

  // Resolve Previous FY if not provided
  let pyId = options?.previousFinancialYearId;
  if (!pyId) {
    const pyRow = db.prepare('SELECT id, year_label FROM FinancialYear WHERE year_label < ? ORDER BY year_label DESC LIMIT 1').get(fyLabel) as { id: string } | undefined;
    pyId = pyRow?.id;
  }

  // Resolve Unit Name
  let unitName = 'All Units';
  if (unitId && unitId !== 'ALL') {
    const u = db.prepare('SELECT unit_name FROM Unit WHERE id = ?').get(unitId) as { unit_name: string } | undefined;
    unitName = u?.unit_name || unitId;
  }

  // 1. Determine Units in scope
  let activeUnitIds: string[] = [];
  if (scope === 'CONSOLIDATED' && consolidationRunId) {
    const run = db.prepare('SELECT selected_unit_ids FROM ConsolidationRun WHERE id = ?').get(consolidationRunId) as { selected_unit_ids: string } | undefined;
    if (run) {
      activeUnitIds = JSON.parse(run.selected_unit_ids || '[]');
    }
  } else if (unitId && unitId !== 'ALL') {
    activeUnitIds = [unitId];
  } else {
    // All units
    const uRows = db.prepare('SELECT id FROM Unit').all() as Array<{ id: string }>;
    activeUnitIds = uRows.map((u) => u.id);
  }

  // 2. Multi-Batch Safe Query: Find active/selected import batch per Unit + FY
  const unitActiveBatchMap = new Map<string, string>();
  for (const uid of activeUnitIds) {
    if (specifiedBatchId && unitId === uid) {
      unitActiveBatchMap.set(uid, specifiedBatchId);
    } else {
      // Find latest successful batch for unit + fy
      const latestBatch = db.prepare(`
        SELECT id FROM ImportBatch
        WHERE entity_id = 'default-entity' AND unit_id = ? AND financial_year_id = ? AND status = 'SUCCESS'
        ORDER BY import_timestamp DESC LIMIT 1
      `).get(uid, financialYearId) as { id: string } | undefined;
      if (latestBatch) {
        unitActiveBatchMap.set(uid, latestBatch.id);
      }
    }
  }

  // 3. Prepare All Active FSLIs
  const allFslis = db.prepare(`
    SELECT id, fsli_code, fsli_name, category, sub_category, display_order, parent_fsli_id
    FROM FSLI WHERE active = 1
    ORDER BY display_order ASC, fsli_name ASC
  `).all() as Array<{
    id: string; fsli_code: string | null; fsli_name: string; category: string; sub_category: string | null; display_order: number; parent_fsli_id?: string | null;
  }>;

  const fsliMap = new Map<string, {
    fsliId: string; fsliCode: string; fsliName: string; category: string; subCategory: string | null;
    displayOrder: number; cyDebit: number; cyCredit: number; pyDebit: number; pyCredit: number; ledgerCount: number;
  }>();

  for (const f of allFslis) {
    fsliMap.set(f.id, {
      fsliId: f.id,
      fsliCode: f.fsli_code || f.id,
      fsliName: f.fsli_name,
      category: f.category,
      subCategory: f.sub_category,
      displayOrder: f.display_order,
      cyDebit: 0,
      cyCredit: 0,
      pyDebit: 0,
      pyCredit: 0,
      ledgerCount: 0,
    });
  }

  // Pre-seed unmapped bucket
  fsliMap.set('unmapped-pending', {
    fsliId: 'unmapped-pending',
    fsliCode: 'UNMAPPED',
    fsliName: 'Unmapped / Pending FSLI Assignment',
    category: 'Unmapped',
    subCategory: null,
    displayOrder: 9999,
    cyDebit: 0,
    cyCredit: 0,
    pyDebit: 0,
    pyCredit: 0,
    ledgerCount: 0,
  });

  // 4. Query All Master Reporting Nodes
  const dbNodes = db.prepare(`
    SELECT rn.*, rs.schedule_code, rs.schedule_number, rs.statement_id, rstmt.statement_code
    FROM ReportingNode rn
    JOIN ReportingSchedule rs ON rn.schedule_id = rs.id
    JOIN ReportingStatement rstmt ON rs.statement_id = rstmt.id
    WHERE rn.active = 1
    ORDER BY rs.display_order ASC, rn.display_order ASC
  `).all() as any[];

  const nodeMap = new Map<string, {
    nodeId: string; nodeCode: string; nodeName: string; scheduleCode: string; scheduleNumber: number;
    statementCode: 'BS' | 'IE'; parentNodeId: string | null; parentNodeCode?: string; nodeType: string;
    balanceNature: string; isProtectedAccount: boolean; depth: number; displayOrder: number;
    cyDebit: number; cyCredit: number; pyDebit: number; pyCredit: number; ledgerCount: number;
  }>();

  for (const n of dbNodes) {
    nodeMap.set(n.node_code, {
      nodeId: n.id,
      nodeCode: n.node_code,
      nodeName: n.node_name,
      scheduleCode: n.schedule_code,
      scheduleNumber: n.schedule_number,
      statementCode: n.statement_code,
      parentNodeId: n.parent_node_id,
      nodeType: n.node_type,
      balanceNature: n.balance_nature,
      isProtectedAccount: n.is_protected_account === 1,
      depth: n.depth,
      displayOrder: n.display_order,
      cyDebit: 0,
      cyCredit: 0,
      pyDebit: 0,
      pyCredit: 0,
      ledgerCount: 0,
    });
  }

  // Map FSLI ID -> Default Node Code (with hierarchical inheritance)
  const fsliToNodeCodeMap = new Map<string, string>();
  const mappingRows = db.prepare(`
    SELECT f.id as fsli_id, rn.node_code
    FROM FSLIToReportingNode fnm
    JOIN FSLI f ON fnm.fsli_id = f.id
    JOIN ReportingNode rn ON fnm.reporting_node_id = rn.id
  `).all() as Array<{ fsli_id: string; node_code: string }>;
  for (const mr of mappingRows) {
    if (!fsliToNodeCodeMap.has(mr.fsli_id)) {
      fsliToNodeCodeMap.set(mr.fsli_id, mr.node_code);
    }
  }

  // Build parent lookup map for hierarchical inheritance
  const fsliParentMap = new Map<string, string | null>();
  for (const f of allFslis) {
    fsliParentMap.set(f.id, f.parent_fsli_id || null);
  }

  function resolveNodeCodeForFsli(fid: string): string | null {
    if (fsliToNodeCodeMap.has(fid)) {
      return fsliToNodeCodeMap.get(fid)!;
    }
    // Traverse parent hierarchy
    let currentId: string | null = fid;
    const visited = new Set<string>();
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const parentId: string | null = fsliParentMap.get(currentId) || null;
      if (parentId && fsliToNodeCodeMap.has(parentId)) {
        return fsliToNodeCodeMap.get(parentId)!;
      }
      currentId = parentId;
    }
    return null;
  }

  // 5. Query and Aggregate Ledger Balances per Unit
  let sourceTotalDebit = 0;
  let sourceTotalCredit = 0;
  let sourceLedgerCount = 0;
  let unmappedCount = 0;
  const unmappedLedgers: UnmappedLedgerDetail[] = [];
  const sourceBalances = new Map<string, LedgerResolvedBalance>();

  for (const uid of activeUnitIds) {
    const activeBatchId = unitActiveBatchMap.get(uid);
    if (!activeBatchId) continue;

    const ledgerRows = db.prepare(`
      SELECT
        l.id as ledger_id,
        l.ledger_name,
        l.unit_id,
        u.unit_name,
        lb.debit as base_debit,
        lb.credit as base_credit,
        lb.import_batch_id,
        COALESCE(
          CASE WHEN rr.status IN ('Applied', 'AutoApplied') THEN rr.approved_fsli_id END,
          lc.final_fsli_id,
          lm.mapped_fsli_id
        ) as resolved_fsli_id,
        lro.reporting_node_id as override_node_id,
        lm.status as mapping_status,
        lc.status as classification_status
      FROM LedgerBalance lb
      JOIN Ledger l ON lb.ledger_id = l.id
      JOIN Unit u ON l.unit_id = u.id
      LEFT JOIN RegroupingResult rr ON l.id = rr.ledger_id AND lb.financial_year_id = rr.financial_year_id
      LEFT JOIN LedgerClassification lc ON l.id = lc.ledger_id AND lb.financial_year_id = lc.financial_year_id
      LEFT JOIN LedgerMapping lm ON l.id = lm.ledger_id AND lb.financial_year_id = lm.financial_year_id
      LEFT JOIN LedgerReportingOverride lro ON l.id = lro.ledger_id AND lb.financial_year_id = lro.financial_year_id
      WHERE lb.financial_year_id = ? AND l.unit_id = ? AND lb.import_batch_id = ?
    `).all(financialYearId, uid, activeBatchId) as any[];

    for (const lr of ledgerRows) {
      sourceLedgerCount++;
      const dr = Number(lr.base_debit) || 0;
      const cr = Number(lr.base_credit) || 0;
      sourceTotalDebit += dr;
      sourceTotalCredit += cr;

      const fsliId = lr.resolved_fsli_id && fsliMap.has(lr.resolved_fsli_id)
        ? lr.resolved_fsli_id
        : 'unmapped-pending';

      const fsliEntry = fsliMap.get(fsliId)!;
      fsliEntry.cyDebit += dr;
      fsliEntry.cyCredit += cr;
      fsliEntry.ledgerCount++;

      // Resolve Reporting Node
      let targetNodeCode: string | null = null;
      if (lr.override_node_id) {
        const ovNode = db.prepare('SELECT node_code FROM ReportingNode WHERE id = ?').get(lr.override_node_id) as { node_code: string } | undefined;
        if (ovNode && nodeMap.has(ovNode.node_code)) {
          targetNodeCode = ovNode.node_code;
        }
      } else if (fsliId !== 'unmapped-pending') {
        targetNodeCode = resolveNodeCodeForFsli(fsliId);
      }

      if (targetNodeCode && nodeMap.has(targetNodeCode)) {
        const nodeEntry = nodeMap.get(targetNodeCode)!;
        nodeEntry.cyDebit += dr;
        nodeEntry.cyCredit += cr;
        nodeEntry.ledgerCount++;
      } else {
        targetNodeCode = null;
      }

      sourceBalances.set(lr.ledger_id, {
        ledgerId: lr.ledger_id,
        ledgerName: lr.ledger_name,
        unitId: lr.unit_id,
        financialYearId,
        baseDebit: dr,
        baseCredit: cr,
        resolvedFsliId: fsliId === 'unmapped-pending' ? null : fsliId,
        resolvedNodeId: targetNodeCode || 'UNMAPPED',
      });

      if (fsliId === 'unmapped-pending' || !targetNodeCode) {
        unmappedCount++;
        unmappedLedgers.push({
          ledgerId: lr.ledger_id,
          ledgerName: lr.ledger_name,
          unitId: lr.unit_id,
          unitName: lr.unit_name,
          financialYearId,
          debit: dr,
          credit: cr,
          net: dr - cr,
          mappingStatus: lr.mapping_status || 'Unmapped',
          classificationStatus: lr.classification_status || 'Unclassified',
        });
      }
    }
  }

  // 6. Aggregate Phase 8 Applied Adjustments (and Reversed)
  for (const uid of activeUnitIds) {
    const adjRows = db.prepare(`
      SELECT
        al.fsli_id,
        SUM(al.debit) as adj_debit,
        SUM(al.credit) as adj_credit
      FROM AdjustmentLine al
      JOIN Adjustment a ON al.adjustment_id = a.id
      WHERE a.financial_year_id = ? AND a.unit_id = ? AND a.status IN ('Applied', 'Reversed')
      GROUP BY al.fsli_id
    `).all(financialYearId, uid) as Array<{ fsli_id: string; adj_debit: number; adj_credit: number }>;

    for (const ar of adjRows) {
      const dr = Number(ar.adj_debit) || 0;
      const cr = Number(ar.adj_credit) || 0;
      if (fsliMap.has(ar.fsli_id)) {
        const fEntry = fsliMap.get(ar.fsli_id)!;
        fEntry.cyDebit += dr;
        fEntry.cyCredit += cr;
      }
      const nodeCode = resolveNodeCodeForFsli(ar.fsli_id);
      if (nodeCode && nodeMap.has(nodeCode)) {
        const nEntry = nodeMap.get(nodeCode)!;
        nEntry.cyDebit += dr;
        nEntry.cyCredit += cr;
      }
      sourceTotalDebit += dr;
      sourceTotalCredit += cr;
    }
  }

  // 7. Phase 9 Consolidation Elimination (if consolidated scope)
  if (scope === 'CONSOLIDATED' && consolidationRunId) {
    const elimRows = db.prepare(`
      SELECT fsli_id, eliminated_amount
      FROM ConsolidationElimination
      WHERE consolidation_run_id = ? AND status IN ('Applied', 'Reversed')
    `).all(consolidationRunId) as Array<{ fsli_id: string | null; eliminated_amount: number }>;

    for (const er of elimRows) {
      const elimAmt = Number(er.eliminated_amount) || 0;
      if (er.fsli_id && fsliMap.has(er.fsli_id)) {
        const fEntry = fsliMap.get(er.fsli_id)!;
        fEntry.cyDebit -= elimAmt;
        fEntry.cyCredit -= elimAmt;
      }
      if (er.fsli_id) {
        const nodeCode = resolveNodeCodeForFsli(er.fsli_id);
        if (nodeCode && nodeMap.has(nodeCode)) {
          const nEntry = nodeMap.get(nodeCode)!;
          nEntry.cyDebit -= elimAmt;
          nEntry.cyCredit -= elimAmt;
        }
      }
      sourceTotalDebit -= elimAmt;
      sourceTotalCredit -= elimAmt;
    }
  }

  // 8. Previous Year Balances (if pyId exists)
  if (pyId) {
    for (const uid of activeUnitIds) {
      const pyBatch = db.prepare(`
        SELECT id FROM ImportBatch
        WHERE entity_id = 'default-entity' AND unit_id = ? AND financial_year_id = ? AND status = 'SUCCESS'
        ORDER BY import_timestamp DESC LIMIT 1
      `).get(uid, pyId) as { id: string } | undefined;
      if (!pyBatch) continue;

      const pyLedgerRows = db.prepare(`
        SELECT
          l.id as ledger_id,
          lb.debit as py_debit,
          lb.credit as py_credit,
          COALESCE(
          CASE WHEN rr.status IN ('Applied', 'AutoApplied') THEN rr.approved_fsli_id END,
          lc.final_fsli_id,
          lm.mapped_fsli_id
        ) as resolved_fsli_id
        FROM LedgerBalance lb
        JOIN Ledger l ON lb.ledger_id = l.id
        LEFT JOIN RegroupingResult rr ON l.id = rr.ledger_id AND lb.financial_year_id = rr.financial_year_id
        LEFT JOIN LedgerClassification lc ON l.id = lc.ledger_id AND lb.financial_year_id = lc.financial_year_id
        LEFT JOIN LedgerMapping lm ON l.id = lm.ledger_id AND lb.financial_year_id = lm.financial_year_id
        WHERE lb.financial_year_id = ? AND l.unit_id = ? AND lb.import_batch_id = ?
      `).all(pyId, uid, pyBatch.id) as any[];

      for (const lr of pyLedgerRows) {
        const dr = Number(lr.py_debit) || 0;
        const cr = Number(lr.py_credit) || 0;
        const fsliId = lr.resolved_fsli_id && fsliMap.has(lr.resolved_fsli_id)
          ? lr.resolved_fsli_id
          : 'unmapped-pending';

        const fEntry = fsliMap.get(fsliId)!;
        fEntry.pyDebit += dr;
        fEntry.pyCredit += cr;

        const nodeCode = fsliId !== 'unmapped-pending' ? resolveNodeCodeForFsli(fsliId) : null;
        if (nodeCode && nodeMap.has(nodeCode)) {
          const nEntry = nodeMap.get(nodeCode)!;
          nEntry.pyDebit += dr;
          nEntry.pyCredit += cr;
        }
      }
    }
  }

  // Prepare typed node balance maps for schedule calculators
  const typedNodeBalances = new Map<string, NodeAggregatedBalance>();
  for (const [code, n] of nodeMap.entries()) {
    typedNodeBalances.set(code, {
      nodeId: n.nodeId,
      nodeCode: n.nodeCode,
      nodeName: n.nodeName,
      scheduleCode: n.scheduleCode,
      debit: round2(n.cyDebit),
      credit: round2(n.cyCredit),
      net: round2(n.cyDebit - n.cyCredit),
    });
  }

  const typedPYNodeBalances = new Map<string, NodeAggregatedBalance>();
  for (const [code, n] of nodeMap.entries()) {
    typedPYNodeBalances.set(code, {
      nodeId: n.nodeId,
      nodeCode: n.nodeCode,
      nodeName: n.nodeName,
      scheduleCode: n.scheduleCode,
      debit: round2(n.pyDebit),
      credit: round2(n.pyCredit),
      net: round2(n.pyDebit - n.pyCredit),
    });
  }

  const typedFsliBalances = new Map<string, FSLIAggregatedBalance>();
  for (const [fid, f] of fsliMap.entries()) {
    typedFsliBalances.set(f.fsliCode, {
      fsliId: f.fsliId,
      fsliCode: f.fsliCode,
      fsliName: f.fsliName,
      category: f.category,
      debit: round2(f.cyDebit),
      credit: round2(f.cyCredit),
      net: round2(f.cyDebit - f.cyCredit),
    });
  }

  // 9. Preliminary Income & Expenditure Calculation to derive Net Surplus / (Deficit)
  // Income schedules: SCH_20 to SCH_25
  // Expense schedules: SCH_26 to SCH_33 + Note 11 Depreciation
  let preliminaryIncomeCY = 0;
  let preliminaryExpenseCY = 0;
  let preliminaryIncomePY = 0;
  let preliminaryExpensePY = 0;

  for (const n of nodeMap.values()) {
    if (n.statementCode === 'IE') {
      const netCY = n.balanceNature === 'CREDIT' ? (n.cyCredit - n.cyDebit) : (n.cyDebit - n.cyCredit);
      const netPY = n.balanceNature === 'CREDIT' ? (n.pyCredit - n.pyDebit) : (n.pyDebit - n.pyCredit);

      if (n.scheduleNumber >= 20 && n.scheduleNumber <= 25) {
        preliminaryIncomeCY += netCY;
        preliminaryIncomePY += netPY;
      } else if (n.scheduleNumber >= 26 && n.scheduleNumber <= 33) {
        preliminaryExpenseCY += netCY;
        preliminaryExpensePY += netPY;
      }
    }
  }

  const netSurplusCY = round2(preliminaryIncomeCY - preliminaryExpenseCY);
  const netSurplusPY = round2(preliminaryIncomePY - preliminaryExpensePY);

  // 10. Execute All Typed Schedule Calculators
  const diagnostics: ScheduleDiagnosticNotice[] = [];
  const calcContext: ScheduleCalculationContext = {
    financialYearId,
    previousFinancialYearId: pyId,
    unitId,
    consolidationRunId,
    sourceBalances,
    fsliBalances: typedFsliBalances,
    nodeBalances: typedNodeBalances,
    pyNodeBalances: typedPYNodeBalances,
    calculatedIncomeTotal: preliminaryIncomeCY,
    calculatedExpenseTotal: preliminaryExpenseCY,
    calculatedSurplus: netSurplusCY,
    calculatedSurplusPY: netSurplusPY,
    diagnostics,
  };

  const calculatedSchedules = executeAllCalculatedSchedules(calcContext);

  // 11. Build Schedule Rows (Notes 4 through 33)
  const scheduleRows: ReportingScheduleRow[] = [];
  const dbSchedules = db.prepare(`
    SELECT rs.*, rstmt.statement_code
    FROM ReportingSchedule rs
    JOIN ReportingStatement rstmt ON rs.statement_id = rstmt.id
    WHERE rs.active = 1
    ORDER BY rs.display_order ASC
  `).all() as any[];

  for (const sch of dbSchedules) {
    const schNodes: ReportingNodeRow[] = [];
    let schDrCY = 0, schCrCY = 0, schDrPY = 0, schCrPY = 0;

    for (const n of nodeMap.values()) {
      if (n.scheduleCode === sch.schedule_code) {
        schDrCY += n.cyDebit;
        schCrCY += n.cyCredit;
        schDrPY += n.pyDebit;
        schCrPY += n.pyCredit;

        const netCY = n.balanceNature === 'CREDIT' ? (n.cyCredit - n.cyDebit) : (n.cyDebit - n.cyCredit);
        const netPY = n.balanceNature === 'CREDIT' ? (n.pyCredit - n.pyDebit) : (n.pyDebit - n.pyCredit);

        schNodes.push({
          nodeId: n.nodeId,
          nodeCode: n.nodeCode,
          nodeName: n.nodeName,
          scheduleCode: n.scheduleCode,
          scheduleNumber: n.scheduleNumber,
          parentNodeCode: n.parentNodeCode,
          nodeType: n.nodeType,
          balanceNature: n.balanceNature,
          isProtectedAccount: n.isProtectedAccount,
          depth: n.depth,
          displayOrder: n.displayOrder,
          cyDebit: round2(n.cyDebit),
          cyCredit: round2(n.cyCredit),
          cyNet: round2(netCY),
          pyDebit: round2(n.pyDebit),
          pyCredit: round2(n.pyCredit),
          pyNet: round2(netPY),
          ledgerCount: n.ledgerCount,
        });
      }
    }

    let cyTotal = round2(sch.schedule_type === 'LIABILITY' || sch.schedule_type === 'CAPITAL_RESERVE' || sch.schedule_type === 'INCOME'
      ? (schCrCY - schDrCY)
      : (schDrCY - schCrCY));
    let pyTotal = round2(sch.schedule_type === 'LIABILITY' || sch.schedule_type === 'CAPITAL_RESERVE' || sch.schedule_type === 'INCOME'
      ? (schCrPY - schDrPY)
      : (schDrPY - schCrPY));

    // For calculated schedules, override cyTotal with typed calculator result
    if (sch.schedule_code === 'SCH_04') {
      cyTotal = calculatedSchedules.corpus.closingBalance;
      pyTotal = calculatedSchedules.corpus.pyClosingBalance;
    } else if (sch.schedule_code === 'SCH_05') {
      cyTotal = calculatedSchedules.reserveAndSurplus.totalClosingBalance;
      pyTotal = calculatedSchedules.reserveAndSurplus.pyTotalClosingBalance;
    } else if (sch.schedule_code === 'SCH_11') {
      cyTotal = calculatedSchedules.tangibleAssets.totalNetAssetCY;
      pyTotal = calculatedSchedules.tangibleAssets.totalNetAssetPY;
    } else if (sch.schedule_code === 'SCH_18') {
      cyTotal = calculatedSchedules.loansAndAdvances.currentPortionOfLoansAndAdvances;
      pyTotal = calculatedSchedules.loansAndAdvances.pyCurrentPortion;
    } else if (sch.schedule_code === 'SCH_25') {
      cyTotal = calculatedSchedules.stockMovement.netIncreaseDecreaseTotal;
      pyTotal = calculatedSchedules.stockMovement.pyNetIncreaseDecreaseTotal;
    } else if (sch.schedule_code === 'SCH_28') {
      cyTotal = calculatedSchedules.materialConsumption.consumptions;
      pyTotal = calculatedSchedules.materialConsumption.pyConsumptions;
    } else if (sch.schedule_code === 'SCH_29') {
      cyTotal = calculatedSchedules.tradingCOGS.costOfTradingItemsSold;
      pyTotal = calculatedSchedules.tradingCOGS.pyCostOfTradingItemsSold;
    }

    scheduleRows.push({
      scheduleId: sch.id,
      statementCode: sch.statement_code,
      scheduleNumber: sch.schedule_number,
      scheduleCode: sch.schedule_code,
      scheduleName: sch.schedule_name,
      scheduleType: sch.schedule_type,
      isCalculated: sch.is_calculated === 1,
      displayOrder: sch.display_order,
      cyTotal,
      pyTotal,
      cyDebit: round2(schDrCY),
      cyCredit: round2(schCrCY),
      pyDebit: round2(schDrPY),
      pyCredit: round2(schCrPY),
      nodes: schNodes.sort((a, b) => a.displayOrder - b.displayOrder),
    });
  }

  // 12. Build Statement of Income and Expenditure
  const ieLines: StatementLineItem[] = [
    { lineId: 'ie-inc-20', section: 'INCOME', lineNumber: '1', lineTitle: 'Donations and Grant in Aid', scheduleNumber: 20, scheduleCode: 'SCH_20', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_20')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_20')?.pyTotal || 0 },
    { lineId: 'ie-inc-21', section: 'INCOME', lineNumber: '2', lineTitle: 'Donations for Scientific and Industrial, Social Research', scheduleNumber: 21, scheduleCode: 'SCH_21', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_21')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_21')?.pyTotal || 0 },
    { lineId: 'ie-inc-22', section: 'INCOME', lineNumber: '3', lineTitle: 'Revenue from operations', scheduleNumber: 22, scheduleCode: 'SCH_22', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_22')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_22')?.pyTotal || 0 },
    { lineId: 'ie-inc-23', section: 'INCOME', lineNumber: '4', lineTitle: 'Agriculture, Dairy Income', scheduleNumber: 23, scheduleCode: 'SCH_23', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_23')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_23')?.pyTotal || 0 },
    { lineId: 'ie-inc-24', section: 'INCOME', lineNumber: '5', lineTitle: 'Other income', scheduleNumber: 24, scheduleCode: 'SCH_24', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_24')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_24')?.pyTotal || 0 },
    { lineId: 'ie-inc-25', section: 'INCOME', lineNumber: '6', lineTitle: 'Increase (decrease) in Finished Goods, Trading items', scheduleNumber: 25, scheduleCode: 'SCH_25', cyAmount: calculatedSchedules.stockMovement.netIncreaseDecreaseTotal, pyAmount: calculatedSchedules.stockMovement.pyNetIncreaseDecreaseTotal },
    { lineId: 'ie-inc-tot', section: 'INCOME', lineNumber: '', lineTitle: 'Total revenue', cyAmount: preliminaryIncomeCY, pyAmount: preliminaryIncomePY, isTotal: true },

    { lineId: 'ie-exp-26', section: 'EXPENSES', lineNumber: '1', lineTitle: 'Community Welfare, Charitable Application', scheduleNumber: 26, scheduleCode: 'SCH_26', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_26')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_26')?.pyTotal || 0 },
    { lineId: 'ie-exp-27', section: 'EXPENSES', lineNumber: '2', lineTitle: 'Application for Social & Scientific Research', scheduleNumber: 27, scheduleCode: 'SCH_27', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_27')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_27')?.pyTotal || 0 },
    { lineId: 'ie-exp-28', section: 'EXPENSES', lineNumber: '3', lineTitle: 'Consumption of material, stores and others', scheduleNumber: 28, scheduleCode: 'SCH_28', cyAmount: calculatedSchedules.materialConsumption.consumptions, pyAmount: calculatedSchedules.materialConsumption.pyConsumptions },
    { lineId: 'ie-exp-29', section: 'EXPENSES', lineNumber: '4', lineTitle: 'Cost of Trading Items sold', scheduleNumber: 29, scheduleCode: 'SCH_29', cyAmount: calculatedSchedules.tradingCOGS.costOfTradingItemsSold, pyAmount: calculatedSchedules.tradingCOGS.pyCostOfTradingItemsSold },
    { lineId: 'ie-exp-30', section: 'EXPENSES', lineNumber: '5', lineTitle: 'Agriculture, Dairy Expense', scheduleNumber: 30, scheduleCode: 'SCH_30', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_30')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_30')?.pyTotal || 0 },
    { lineId: 'ie-exp-31', section: 'EXPENSES', lineNumber: '6', lineTitle: 'Employees Benefits Expenses', scheduleNumber: 31, scheduleCode: 'SCH_31', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_31')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_31')?.pyTotal || 0 },
    { lineId: 'ie-exp-32', section: 'EXPENSES', lineNumber: '7', lineTitle: 'Finance costs', scheduleNumber: 32, scheduleCode: 'SCH_32', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_32')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_32')?.pyTotal || 0 },
    { lineId: 'ie-exp-11', section: 'EXPENSES', lineNumber: '8', lineTitle: 'Depreciation and amortization expense', scheduleNumber: 11, scheduleCode: 'SCH_11', cyAmount: calculatedSchedules.tangibleAssets.totalDepreciationForYear, pyAmount: 0 },
    { lineId: 'ie-exp-33', section: 'EXPENSES', lineNumber: '9', lineTitle: 'Administrative and Other Expenses', scheduleNumber: 33, scheduleCode: 'SCH_33', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_33')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_33')?.pyTotal || 0 },
    { lineId: 'ie-exp-tot', section: 'EXPENSES', lineNumber: '', lineTitle: 'Total expenses', cyAmount: preliminaryExpenseCY, pyAmount: preliminaryExpensePY, isTotal: true },

    { lineId: 'ie-surplus', section: 'EXPENSES', lineNumber: '', lineTitle: 'Surplus/(Deficit) for the year', cyAmount: netSurplusCY, pyAmount: netSurplusPY, isTotal: true },
  ];

  const incomeAndExpenditure: StatementSummary = {
    statementCode: 'IE',
    statementName: 'Statement of Income and Expenditure',
    cyTotal: netSurplusCY,
    pyTotal: netSurplusPY,
    lines: ieLines,
    isBalanced: true,
  };

  // 13. Build Balance Sheet Statement
  const bsLines: StatementLineItem[] = [
    // Liabilities
    { lineId: 'bs-liab-cap-hdr', section: 'LIABILITIES', subSection: 'Capital and Reserve', lineNumber: '', lineTitle: 'Capital and Reserve', cyAmount: 0, pyAmount: 0, isSubtotal: true },
    { lineId: 'bs-liab-04', section: 'LIABILITIES', subSection: 'Capital and Reserve', lineNumber: '(a)', lineTitle: 'Corpus', scheduleNumber: 4, scheduleCode: 'SCH_04', cyAmount: calculatedSchedules.corpus.closingBalance, pyAmount: calculatedSchedules.corpus.pyClosingBalance },
    { lineId: 'bs-liab-05', section: 'LIABILITIES', subSection: 'Capital and Reserve', lineNumber: '(b)', lineTitle: 'Reserves and surplus', scheduleNumber: 5, scheduleCode: 'SCH_05', cyAmount: calculatedSchedules.reserveAndSurplus.totalClosingBalance, pyAmount: calculatedSchedules.reserveAndSurplus.pyTotalClosingBalance },

    { lineId: 'bs-liab-ncl-hdr', section: 'LIABILITIES', subSection: 'Non-Current Liabilities', lineNumber: '', lineTitle: 'Non-Current Liabilities', cyAmount: 0, pyAmount: 0, isSubtotal: true },
    { lineId: 'bs-liab-06-nc', section: 'LIABILITIES', subSection: 'Non-Current Liabilities', lineNumber: '(a)', lineTitle: 'Secured loans', scheduleNumber: 6, scheduleCode: 'SCH_06', cyAmount: (nodeMap.get('N_06_NC_TB')?.cyCredit || 0) + (nodeMap.get('N_06_NC_WC')?.cyCredit || 0), pyAmount: (nodeMap.get('N_06_NC_TB')?.pyCredit || 0) + (nodeMap.get('N_06_NC_WC')?.pyCredit || 0) },
    { lineId: 'bs-liab-07', section: 'LIABILITIES', subSection: 'Non-Current Liabilities', lineNumber: '(b)', lineTitle: 'Unsecured Loans', scheduleNumber: 7, scheduleCode: 'SCH_07', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_07')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_07')?.pyTotal || 0 },

    { lineId: 'bs-liab-cl-hdr', section: 'LIABILITIES', subSection: 'Current liabilities and Provisions', lineNumber: '', lineTitle: 'Current liabilities and Provisions', cyAmount: 0, pyAmount: 0, isSubtotal: true },
    { lineId: 'bs-liab-06-c', section: 'LIABILITIES', subSection: 'Current liabilities and Provisions', lineNumber: '(a)', lineTitle: 'Short Term Borrowings', scheduleNumber: 6, scheduleCode: 'SCH_06', cyAmount: (nodeMap.get('N_06_C_NBFC')?.cyCredit || 0) + (nodeMap.get('N_06_C_WC')?.cyCredit || 0), pyAmount: (nodeMap.get('N_06_C_NBFC')?.pyCredit || 0) + (nodeMap.get('N_06_C_WC')?.pyCredit || 0) },
    { lineId: 'bs-liab-08', section: 'LIABILITIES', subSection: 'Current liabilities and Provisions', lineNumber: '(b)', lineTitle: 'Sundry Creditors', scheduleNumber: 8, scheduleCode: 'SCH_08', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_08')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_08')?.pyTotal || 0 },
    { lineId: 'bs-liab-09', section: 'LIABILITIES', subSection: 'Current liabilities and Provisions', lineNumber: '(c)', lineTitle: 'Other current liabilities', scheduleNumber: 9, scheduleCode: 'SCH_09', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_09')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_09')?.pyTotal || 0 },
    { lineId: 'bs-liab-10', section: 'LIABILITIES', subSection: 'Current liabilities and Provisions', lineNumber: '(d)', lineTitle: 'Short-term liabilities and provisions', scheduleNumber: 10, scheduleCode: 'SCH_10', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_10')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_10')?.pyTotal || 0 },

    // Assets
    { lineId: 'bs-ast-nca-hdr', section: 'ASSETS', subSection: 'Non-Current Assets', lineNumber: '', lineTitle: 'Non-Current Assets', cyAmount: 0, pyAmount: 0, isSubtotal: true },
    { lineId: 'bs-ast-11', section: 'ASSETS', subSection: 'Non-Current Assets', lineNumber: '(a)(i)', lineTitle: 'Property, Plant & Equipment', scheduleNumber: 11, scheduleCode: 'SCH_11', cyAmount: calculatedSchedules.tangibleAssets.totalNetAssetCY, pyAmount: calculatedSchedules.tangibleAssets.totalNetAssetPY },
    { lineId: 'bs-ast-12', section: 'ASSETS', subSection: 'Non-Current Assets', lineNumber: '(a)(iii)', lineTitle: 'Capital Work in Progress', scheduleNumber: 12, scheduleCode: 'SCH_12', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_12')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_12')?.pyTotal || 0 },
    { lineId: 'bs-ast-13', section: 'ASSETS', subSection: 'Non-Current Assets', lineNumber: '(a)(iv)', lineTitle: 'Live Stock', scheduleNumber: 13, scheduleCode: 'SCH_13', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_13')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_13')?.pyTotal || 0 },
    { lineId: 'bs-ast-16', section: 'ASSETS', subSection: 'Non-Current Assets', lineNumber: '(b)', lineTitle: 'Investments', scheduleNumber: 16, scheduleCode: 'SCH_16', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_16')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_16')?.pyTotal || 0 },
    { lineId: 'bs-ast-18-nc', section: 'ASSETS', subSection: 'Non-Current Assets', lineNumber: '(d)', lineTitle: 'Other Non-currents assets', scheduleNumber: 18, scheduleCode: 'SCH_18', cyAmount: calculatedSchedules.loansAndAdvances.nonCurrentSecurityDepositsRerouted, pyAmount: calculatedSchedules.loansAndAdvances.pyNonCurrentPortion },

    { lineId: 'bs-ast-ca-hdr', section: 'ASSETS', subSection: 'Current assets', lineNumber: '', lineTitle: 'Current assets', cyAmount: 0, pyAmount: 0, isSubtotal: true },
    { lineId: 'bs-ast-14', section: 'ASSETS', subSection: 'Current assets', lineNumber: '(a)', lineTitle: 'Trade Receivables', scheduleNumber: 14, scheduleCode: 'SCH_14', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_14')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_14')?.pyTotal || 0 },
    { lineId: 'bs-ast-15', section: 'ASSETS', subSection: 'Current assets', lineNumber: '(b)', lineTitle: 'Cash and Bank Balances', scheduleNumber: 15, scheduleCode: 'SCH_15', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_15')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_15')?.pyTotal || 0 },
    { lineId: 'bs-ast-17', section: 'ASSETS', subSection: 'Current assets', lineNumber: '(c)', lineTitle: 'Inventories', scheduleNumber: 17, scheduleCode: 'SCH_17', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_17')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_17')?.pyTotal || 0 },
    { lineId: 'bs-ast-18-c', section: 'ASSETS', subSection: 'Current assets', lineNumber: '(d)', lineTitle: 'Short-term loans and advances', scheduleNumber: 18, scheduleCode: 'SCH_18', cyAmount: calculatedSchedules.loansAndAdvances.currentPortionOfLoansAndAdvances, pyAmount: calculatedSchedules.loansAndAdvances.pyCurrentPortion },
    { lineId: 'bs-ast-19', section: 'ASSETS', subSection: 'Current assets', lineNumber: '(e)', lineTitle: 'Other Current Assets', scheduleNumber: 19, scheduleCode: 'SCH_19', cyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_19')?.cyTotal || 0, pyAmount: scheduleRows.find(s => s.scheduleCode === 'SCH_19')?.pyTotal || 0 },
  ];

  let totalLiabilitiesCY = 0;
  let totalAssetsCY = 0;
  let totalLiabilitiesPY = 0;
  let totalAssetsPY = 0;

  for (const l of bsLines) {
    if (!l.isSubtotal && !l.isTotal) {
      if (l.section === 'LIABILITIES') {
        totalLiabilitiesCY += l.cyAmount;
        totalLiabilitiesPY += l.pyAmount;
      } else if (l.section === 'ASSETS') {
        totalAssetsCY += l.cyAmount;
        totalAssetsPY += l.pyAmount;
      }
    }
  }

  totalLiabilitiesCY = round2(totalLiabilitiesCY);
  totalAssetsCY = round2(totalAssetsCY);
  const bsDifferenceCY = round2(Math.abs(totalLiabilitiesCY - totalAssetsCY));

  bsLines.splice(bsLines.findIndex(l => l.lineId === 'bs-liab-10') + 1, 0, {
    lineId: 'bs-tot-liab',
    section: 'LIABILITIES',
    lineNumber: '',
    lineTitle: 'TOTAL LIABILITIES & FUNDS',
    cyAmount: totalLiabilitiesCY,
    pyAmount: totalLiabilitiesPY,
    isTotal: true,
  });

  bsLines.push({
    lineId: 'bs-tot-ast',
    section: 'ASSETS',
    lineNumber: '',
    lineTitle: 'TOTAL ASSETS',
    cyAmount: totalAssetsCY,
    pyAmount: totalAssetsPY,
    isTotal: true,
  });

  const balanceSheet: StatementSummary = {
    statementCode: 'BS',
    statementName: 'Balance Sheet',
    cyTotal: totalAssetsCY,
    pyTotal: totalAssetsPY,
    lines: bsLines,
    difference: bsDifferenceCY,
    isBalanced: bsDifferenceCY < 0.01,
  };

  // 14. Final FSLI Rows Construction
  const fsliRows: FSLISummaryRow[] = [];
  let aggFSLIDr = 0, aggFSLICr = 0;
  for (const f of fsliMap.values()) {
    aggFSLIDr += f.cyDebit;
    aggFSLICr += f.cyCredit;
    const netCY = f.cyDebit - f.cyCredit;
    const netPY = f.pyDebit - f.pyCredit;
    fsliRows.push({
      fsliId: f.fsliId,
      fsliCode: f.fsliCode,
      fsliName: f.fsliName,
      category: f.category,
      subCategory: f.subCategory,
      cyDebit: round2(f.cyDebit),
      cyCredit: round2(f.cyCredit),
      cyNet: round2(netCY),
      pyDebit: round2(f.pyDebit),
      pyCredit: round2(f.pyCredit),
      pyNet: round2(netPY),
      ledgerCount: f.ledgerCount,
      status: f.fsliId === 'unmapped-pending' ? 'Unmapped' : 'Mapped',
    });
  }

  // 15. Reconciliation Proof & Status Determination
  const unmappedBucket = fsliMap.get('unmapped-pending');
  const unmappedDr = unmappedBucket ? round2(unmappedBucket.cyDebit) : 0;
  const unmappedCr = unmappedBucket ? round2(unmappedBucket.cyCredit) : 0;
  const unmappedNet = round2(unmappedDr - unmappedCr);

  let totalNodesDr = 0, totalNodesCr = 0;
  for (const n of nodeMap.values()) {
    totalNodesDr += n.cyDebit;
    totalNodesCr += n.cyCredit;
  }

  const isSourceReconciled = Math.abs(sourceTotalDebit - aggFSLIDr) < 0.01 && Math.abs(sourceTotalCredit - aggFSLICr) < 0.01;
  const isFSLIReconciled = Math.abs(aggFSLIDr - (totalNodesDr + unmappedDr)) < 0.01 && Math.abs(aggFSLICr - (totalNodesCr + unmappedCr)) < 0.01;
  const isNodesReconciled = isSourceReconciled && isFSLIReconciled;

  const reconciliation: ReconciliationProof = {
    sourceDebit: round2(sourceTotalDebit),
    sourceCredit: round2(sourceTotalCredit),
    sourceDifference: round2(sourceTotalDebit - sourceTotalCredit),
    aggregatedFSLIDebit: round2(aggFSLIDr),
    aggregatedFSLICredit: round2(aggFSLICr),
    aggregatedFSLIDifference: round2(aggFSLIDr - aggFSLICr),
    reportingNodesDebit: round2(totalNodesDr),
    reportingNodesCredit: round2(totalNodesCr),
    unmappedDebit: unmappedDr,
    unmappedCredit: unmappedCr,
    unmappedNet,
    sourceLedgerCount,
    processedLedgerCount: sourceLedgerCount - unmappedCount,
    unresolvedLedgerCount: unmappedCount,
    fslisCount: fsliRows.length,
    schedulesCount: scheduleRows.length,
    isSourceReconciled,
    isFSLIReconciled,
    isNodesReconciled,
  };

  // Determine System Status
  let status: ReportingEngineStatus = 'READY';
  let statusMessage = 'Reporting dataset is fully reconciled, mapped, and balanced.';

  if (!isSourceReconciled || !isFSLIReconciled) {
    status = 'RECONCILIATION_ERROR';
    statusMessage = `Mathematical mismatch detected during aggregation: Source Dr/Cr (${reconciliation.sourceDebit}/${reconciliation.sourceCredit}) vs Aggregated (${reconciliation.aggregatedFSLIDebit}/${reconciliation.aggregatedFSLICredit}).`;
  } else if (unmappedCount > 0 || Math.abs(unmappedNet) > 0.001) {
    status = 'PENDING_MAPPING';
    statusMessage = `${unmappedCount} ledger(s) totalling Rs. ${unmappedNet} are pending FSLI assignment. Dataset mathematically reconciles.`;
  } else if (diagnostics.some(d => d.type === 'INCOMPLETE_INPUT' || d.type === 'MISSING_DEPENDENCY')) {
    status = 'INCOMPLETE_SCHEDULE_INPUT';
    statusMessage = 'Calculated schedules have incomplete input data (e.g. missing opening stock or movement components).';
  } else if (bsDifferenceCY > 0.01) {
    status = 'BALANCE_SHEET_UNBALANCED';
    statusMessage = `Balance Sheet is unbalanced by Rs. ${bsDifferenceCY} (Total Liabilities: ${totalLiabilitiesCY}, Total Assets: ${totalAssetsCY}).`;
  }

  // Flatten sub-schedule rows
  const subScheduleRows: ReportingNodeRow[] = [];
  for (const s of scheduleRows) {
    for (const n of s.nodes) {
      if (n.nodeType === 'SUB_SCHEDULE' || n.nodeType === 'LINE_ITEM' || n.nodeType === 'CALCULATED') {
        subScheduleRows.push(n);
      }
    }
  }

  return {
    financialYearId,
    financialYearLabel: fyLabel,
    scope,
    unitId,
    unitName,
    consolidationRunId,
    status,
    statusMessage,
    reconciliation,
    calculatedSchedules,
    diagnostics,
    fsliRows: fsliRows.sort((a, b) => a.fsliCode.localeCompare(b.fsliCode)),
    scheduleRows,
    subScheduleRows,
    incomeAndExpenditure,
    balanceSheet,
    unmappedLedgers,
    totalDebit: round2(sourceTotalDebit),
    totalCredit: round2(sourceTotalCredit),
    netSurplusCY,
    netSurplusPY,
    balanceSheetDifference: bsDifferenceCY,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Resolves full audit provenance lineage for a ledger or node.
 */
export function getLedgerProvenance(
  db: Database.Database,
  financialYearId: string,
  ledgerId: string,
): LedgerProvenanceTrace | null {
  const row = db.prepare(`
    SELECT
      l.id as ledger_id,
      l.ledger_name,
      l.unit_id,
      u.unit_name,
      lb.financial_year_id,
      lb.import_batch_id,
      ib.file_name as import_file_name,
      lb.debit as base_debit,
      lb.credit as base_credit,
      f5.fsli_name as phase5_fsli_name,
      f6.fsli_name as phase6_fsli_name,
      f7.fsli_name as phase7_fsli_name,
      COALESCE(
        CASE WHEN rr.status IN ('Applied', 'AutoApplied') THEN rr.approved_fsli_id END,
        lc.final_fsli_id,
        lm.mapped_fsli_id
      ) as resolved_fsli_id,
      lro.reporting_node_id as override_node_id
    FROM LedgerBalance lb
    JOIN Ledger l ON lb.ledger_id = l.id
    JOIN Unit u ON l.unit_id = u.id
    LEFT JOIN ImportBatch ib ON lb.import_batch_id = ib.id
    LEFT JOIN LedgerMapping lm ON l.id = lm.ledger_id AND lb.financial_year_id = lm.financial_year_id
    LEFT JOIN FSLI f5 ON lm.mapped_fsli_id = f5.id
    LEFT JOIN LedgerClassification lc ON l.id = lc.ledger_id AND lb.financial_year_id = lc.financial_year_id
    LEFT JOIN FSLI f6 ON lc.final_fsli_id = f6.id
    LEFT JOIN RegroupingResult rr ON l.id = rr.ledger_id AND lb.financial_year_id = rr.financial_year_id
    LEFT JOIN FSLI f7 ON rr.approved_fsli_id = f7.id
    LEFT JOIN LedgerReportingOverride lro ON l.id = lro.ledger_id AND lb.financial_year_id = lro.financial_year_id
    WHERE lb.financial_year_id = ? AND l.id = ?
    LIMIT 1
  `).get(financialYearId, ledgerId) as any;

  if (!row) return null;

  const resolvedFsli = row.resolved_fsli_id
    ? (db.prepare('SELECT fsli_code, fsli_name FROM FSLI WHERE id = ?').get(row.resolved_fsli_id) as any)
    : null;

  const fsliCode = resolvedFsli?.fsli_code || 'UNMAPPED';
  const fsliName = resolvedFsli?.fsli_name || 'Unmapped / Pending FSLI Assignment';

  // Find node
  let nodeRow: any = null;
  if (row.override_node_id) {
    nodeRow = db.prepare('SELECT * FROM ReportingNode WHERE id = ?').get(row.override_node_id);
  } else if (row.resolved_fsli_id) {
    const fnm = db.prepare('SELECT reporting_node_id FROM FSLIToReportingNode WHERE fsli_id = ? LIMIT 1').get(row.resolved_fsli_id) as any;
    if (fnm) {
      nodeRow = db.prepare('SELECT * FROM ReportingNode WHERE id = ?').get(fnm.reporting_node_id);
    }
  }

  const schRow = nodeRow
    ? (db.prepare('SELECT rs.schedule_code, rstmt.statement_code FROM ReportingSchedule rs JOIN ReportingStatement rstmt ON rs.statement_id = rstmt.id WHERE rs.id = ?').get(nodeRow.schedule_id) as any)
    : null;

  return {
    ledgerId: row.ledger_id,
    ledgerName: row.ledger_name,
    unitId: row.unit_id,
    unitName: row.unit_name,
    financialYearId: row.financial_year_id,
    importBatchId: row.import_batch_id || '',
    importFileName: row.import_file_name || '',
    baseDebit: Number(row.base_debit) || 0,
    baseCredit: Number(row.base_credit) || 0,
    phase5MappedFSLI: row.phase5_fsli_name || null,
    phase6ClassifiedFSLI: row.phase6_fsli_name || null,
    phase7RegroupedFSLI: row.phase7_fsli_name || null,
    phase8AdjustmentsApplied: 0,
    phase9ConsolidationElimination: 0,
    finalFSLICode: fsliCode,
    finalFSLIName: fsliName,
    reportingNodeCode: nodeRow?.node_code || 'N_19_OTH',
    reportingNodeName: nodeRow?.node_name || 'Other Current Assets',
    reportingScheduleCode: schRow?.schedule_code || 'SCH_19',
    reportingStatementCode: schRow?.statement_code || 'BS',
  };
}
