// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';
import type { TrialBalanceImportResult } from './electron-api';

/**
 * Exposes a safe, typed API to the renderer process via contextBridge.
 * This maintains context isolation while providing controlled access
 * to main-process functionality.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Opens the native file dialog to select a Tally-exported
   * Trial Balance Excel file (.xlsx or .xls).
   */
  openTrialBalanceFile: () => ipcRenderer.invoke('dialog:openTrialBalanceFile'),

  /**
   * Imports a Tally Trial Balance Excel file by invoking the Python
   * import engine. Returns the canonical data model with validation.
   */
  importTrialBalance: (filePath: string) =>
    ipcRenderer.invoke('trialBalance:import', filePath),

  /**
   * Saves an imported Trial Balance into SQLite (Phase 4).
   * @param unitId — ID of the unit this Trial Balance belongs to.
   */
  saveTrialBalance: (importResult: TrialBalanceImportResult, unitId?: string) =>
    ipcRenderer.invoke('trialBalance:save', importResult, unitId),

  /**
   * Lists all saved import batches from SQLite.
   */
  listImportBatches: () => ipcRenderer.invoke('trialBalance:listBatches'),

  /**
   * Loads a saved Trial Balance from SQLite by batch ID.
   */
  loadSavedTrialBalance: (batchId: string) =>
    ipcRenderer.invoke('trialBalance:loadSaved', batchId),

  /**
   * Deletes a saved Trial Balance import batch and its batch-scoped processing data.
   */
  deleteImportBatch: (batchId: string) =>
    ipcRenderer.invoke('trialBalance:deleteBatch', batchId),

  /**
   * Checks if a file has already been saved in SQLite.
   */
  checkDuplicate: (filePath: string, financialYear: string) =>
    ipcRenderer.invoke('trialBalance:checkDuplicate', filePath, financialYear),

  /**
   * Runs a smoke test to verify better-sqlite3 in main process.
   */
  dbSmokeTest: () => ipcRenderer.invoke('db:smokeTest'),

  // ── Unit Management (Minimal) ─────────────────────────────────────

  /** Lists all units for the default entity. */
  listUnits: () => ipcRenderer.invoke('unit:list'),

  /** Creates a new unit under the default entity. */
  createUnit: (unitName: string) => ipcRenderer.invoke('unit:create', unitName),

  // ── Phase 5 Step 1: Mapping Data Model ──────────────────────────────

  /** Creates a new FSLI entry. */
  createFSLI: (data: Parameters<import('./electron-api').ElectronAPI['createFSLI']>[0]) =>
    ipcRenderer.invoke('mapping:createFSLI', data),

  /** Updates an existing user-created FSLI entry. */
  updateFSLI: (
    id: string,
    data: Parameters<import('./electron-api').ElectronAPI['updateFSLI']>[1],
  ) => ipcRenderer.invoke('mapping:updateFSLI', id, data),

  /** Toggles active status of an FSLI entry. */
  toggleFSLIActive: (id: string, active: boolean) =>
    ipcRenderer.invoke('mapping:toggleFSLIActive', id, active),

  /** Lists all active FSLI entries. */
  listFSLIs: () => ipcRenderer.invoke('mapping:listFSLIs'),

  /** Lists all FSLI entries (including inactive). */
  listAllFSLIs: (includeInactive?: boolean) =>
    ipcRenderer.invoke('mapping:listAllFSLIs', includeInactive),

  /** Lists child FSLIs of a given parent. */
  getChildFSLIs: (parentFSLIId: string) =>
    ipcRenderer.invoke('mapping:getChildFSLIs', parentFSLIId),

  /** Creates a new mapping rule. */
  createMappingRule: (data: Parameters<import('./electron-api').ElectronAPI['createMappingRule']>[0]) =>
    ipcRenderer.invoke('mapping:createRule', data),

  /** Lists all active mapping rules. */
  listMappingRules: () => ipcRenderer.invoke('mapping:listRules'),

  /** Creates a new ledger mapping. */
  createLedgerMapping: (data: Parameters<import('./electron-api').ElectronAPI['createLedgerMapping']>[0]) =>
    ipcRenderer.invoke('mapping:createMapping', data),

  /** Lists all mappings for a given financial year. */
  listLedgerMappings: (financialYearId: string) =>
    ipcRenderer.invoke('mapping:listMappings', financialYearId),

  /** Gets a mapping for a specific ledger + financial year. */
  getLedgerMappingByLedger: (ledgerId: string, financialYearId: string) =>
    ipcRenderer.invoke('mapping:getMappingByLedger', ledgerId, financialYearId),

  /** Runs the Phase 5 mapping data model verification tests. */
  runMappingModelTests: () => ipcRenderer.invoke('mapping:runTests'),

  /** Runs the Consolidation-Readiness verification tests. */
  runConsolidationReadinessTests: () => ipcRenderer.invoke('consolidation:runReadinessTests'),

  // ── Phase 5 Step 2: Auto-Suggestion Engine ──────────────────────────

  /** Seeds standard FSLIs. */
  seedStandardFSLIs: () => ipcRenderer.invoke('mapping:seedFSLIs'),

  /** Generates explainable mapping suggestions for a given financial year and optional unit/batch. */
  generateMappingSuggestions: (
    financialYearId: string,
    unitId?: string,
    importBatchId?: string,
  ) => ipcRenderer.invoke('mapping:generateSuggestions', financialYearId, unitId, importBatchId),

  /** Saves suggested mappings into the database. */
  saveSuggestedMappings: (
    financialYearId: string,
    suggestions: Parameters<import('./electron-api').ElectronAPI['saveSuggestedMappings']>[1],
  ) => ipcRenderer.invoke('mapping:saveSuggestions', financialYearId, suggestions),

  // ── Phase 5 Step 3: Mapping Workbench UI ────────────────────────────

  /** Fetches all consolidated data needed for the Mapping Workbench UI. */
  getMappingWorkbenchData: (financialYearId?: string, unitId?: string, importBatchId?: string) =>
    ipcRenderer.invoke('mapping:getWorkbenchData', financialYearId, unitId, importBatchId),

  /** Bulk updates multiple ledger mappings in a single transaction. */
  bulkUpdateLedgerMappings: (
    financialYearId: string,
    updates: Parameters<import('./electron-api').ElectronAPI['bulkUpdateLedgerMappings']>[1],
  ) => ipcRenderer.invoke('mapping:bulkUpdate', financialYearId, updates),

  /** Applies an FSLI mapping to all similar ledgers sharing group/keyword. Optionally scoped to a unit. */
  applyMappingToSimilar: (
    financialYearId: string,
    targetFSLIId: string,
    criteriaType: 'group' | 'keyword',
    criteriaValue: string,
    unitId?: string,
  ) =>
    ipcRenderer.invoke(
      'mapping:applyToSimilar',
      financialYearId,
      targetFSLIId,
      criteriaType,
      criteriaValue,
      unitId,
    ),

  // ── Phase 5 Step 4: User Mapping Rules & Unmapped Tracker ───────────

  /** Updates an existing mapping rule. */
  updateMappingRule: (
    ruleId: string,
    data: Parameters<import('./electron-api').ElectronAPI['updateMappingRule']>[1],
  ) => ipcRenderer.invoke('mapping:updateRule', ruleId, data),

  /** Toggles active status of a mapping rule. */
  toggleMappingRuleActive: (ruleId: string, active: boolean) =>
    ipcRenderer.invoke('mapping:toggleRuleActive', ruleId, active),

  /** Deletes a mapping rule. */
  deleteMappingRule: (ruleId: string) =>
    ipcRenderer.invoke('mapping:deleteRule', ruleId),

  /** Lists all mapping rules (active and inactive). */
  listAllMappingRules: (scope?: Parameters<import('./electron-api').ElectronAPI['listAllMappingRules']>[0]) =>
    ipcRenderer.invoke('mapping:listAllRules', scope),

  /** Fetches tracker data with materiality analysis and pre-reporting validation. */
  getUnmappedTrackerData: (financialYearId?: string, materialityThreshold?: number) =>
    ipcRenderer.invoke('mapping:getUnmappedTrackerData', financialYearId, materialityThreshold),

  // ── Phase 6: Classification Engine ──────────────────────────────────

  /** Fetches classification data scoped by financial year, unit, and import batch. */
  getClassificationData: (financialYearId?: string, unitId?: string, importBatchId?: string) =>
    ipcRenderer.invoke('classification:getData', financialYearId, unitId, importBatchId),

  /** Runs auto-classification for ledgers in the given scope. */
  autoClassifyLedgers: (financialYearId: string, unitId?: string, importBatchId?: string) =>
    ipcRenderer.invoke('classification:autoClassify', financialYearId, unitId, importBatchId),

  /** Saves manual classification updates for one or more ledgers. */
  saveClassifications: (
    financialYearId: string,
    items: Parameters<import('./electron-api').ElectronAPI['saveClassifications']>[1],
  ) => ipcRenderer.invoke('classification:save', financialYearId, items),

  /** Resets classification decisions for ledgers in the given scope. */
  resetClassifications: (financialYearId: string, unitId?: string, importBatchId?: string) =>
    ipcRenderer.invoke('classification:reset', financialYearId, unitId, importBatchId),

  // ── Phase 7: Regrouping Engine ──────────────────────────────────────

  /** Fetches regrouping workbench data for a given financial year, optionally scoped by unit and import batch. */
  getRegroupingWorkbenchData: (financialYearId?: string, unitId?: string, importBatchId?: string) =>
    ipcRenderer.invoke('regrouping:getWorkbenchData', financialYearId, unitId, importBatchId),

  /** Runs detection engine and generates regrouping suggestions for the specified scope. */
  generateRegroupingSuggestions: (financialYearId: string, unitId?: string, importBatchId?: string) =>
    ipcRenderer.invoke('regrouping:generateSuggestions', financialYearId, unitId, importBatchId),

  /** Approves a regrouping proposal. */
  approveRegrouping: (id: string, approvedBy?: string) =>
    ipcRenderer.invoke('regrouping:approve', id, approvedBy),

  /** Rejects a regrouping proposal. */
  rejectRegrouping: (id: string, rejectedBy?: string, reason?: string) =>
    ipcRenderer.invoke('regrouping:reject', id, rejectedBy, reason),

  /** Changes the proposed FSLI/classification on a regrouping. */
  changeRegrouping: (
    id: string,
    newFSLIId: string,
    newClassification: string,
    reason: string,
    changedBy?: string,
  ) => ipcRenderer.invoke('regrouping:change', id, newFSLIId, newClassification, reason, changedBy),

  /** Applies an approved regrouping. */
  applyRegrouping: (id: string, appliedBy?: string) =>
    ipcRenderer.invoke('regrouping:apply', id, appliedBy),

  /** Undoes a previously applied regrouping. */
  undoRegrouping: (id: string, undoneBy?: string, reason?: string) =>
    ipcRenderer.invoke('regrouping:undo', id, undoneBy, reason),

  /** Creates a new regrouping rule. */
  createRegroupingRule: (input: Parameters<import('./electron-api').ElectronAPI['createRegroupingRule']>[0]) =>
    ipcRenderer.invoke('regrouping:createRule', input),

  /** Lists all regrouping rules. */
  getRegroupingRules: () =>
    ipcRenderer.invoke('regrouping:getRules'),

  /** Toggles auto-apply on a regrouping rule. */
  toggleRegroupingRuleAutoApply: (ruleId: string, autoApply: boolean) =>
    ipcRenderer.invoke('regrouping:toggleRuleAutoApply', ruleId, autoApply),

  /** Fetches audit history for a specific regrouping result. */
  getRegroupingAuditHistory: (regroupingId: string) =>
    ipcRenderer.invoke('regrouping:getAuditHistory', regroupingId),

  // ── Phase 8: Adjustments Engine ─────────────────────────────────────

  /** Fetches adjustments workbench data for a financial year. */
  getAdjustmentsWorkbenchData: (
    financialYearId?: string,
    unitId?: string,
    typeFilter?: string,
    statusFilter?: string,
  ) =>
    ipcRenderer.invoke(
      'adjustments:getWorkbenchData',
      financialYearId,
      unitId,
      typeFilter,
      statusFilter,
    ),

  /** Creates a new Adjustment in Draft status. */
  createAdjustment: (input: Parameters<import('./electron-api').ElectronAPI['createAdjustment']>[0]) =>
    ipcRenderer.invoke('adjustments:create', input),

  /** Updates an existing Draft adjustment. */
  updateAdjustment: (
    id: string,
    input: Parameters<import('./electron-api').ElectronAPI['updateAdjustment']>[1],
  ) => ipcRenderer.invoke('adjustments:update', id, input),

  /** Deletes a Draft adjustment. */
  deleteAdjustment: (id: string) =>
    ipcRenderer.invoke('adjustments:delete', id),

  /** Submits a Draft adjustment for review. */
  submitAdjustmentForReview: (id: string, submittedBy?: string) =>
    ipcRenderer.invoke('adjustments:submit', id, submittedBy),

  /** Approves a PendingReview adjustment. */
  approveAdjustment: (id: string, approvedBy?: string) =>
    ipcRenderer.invoke('adjustments:approve', id, approvedBy),

  /** Rejects a PendingReview adjustment with reason. */
  rejectAdjustment: (id: string, reason: string, rejectedBy?: string) =>
    ipcRenderer.invoke('adjustments:reject', id, reason, rejectedBy),

  /** Returns an Approved adjustment back to Draft. */
  returnAdjustmentToDraft: (id: string, reason: string, returnedBy?: string) =>
    ipcRenderer.invoke('adjustments:returnToDraft', id, reason, returnedBy),

  /** Applies an Approved adjustment. */
  applyAdjustment: (id: string, appliedBy?: string) =>
    ipcRenderer.invoke('adjustments:apply', id, appliedBy),

  /** Reverses an Applied adjustment. */
  reverseAdjustment: (id: string, reason: string, reversedBy?: string) =>
    ipcRenderer.invoke('adjustments:reverse', id, reason, reversedBy),

  /** Fetches audit history for an adjustment. */
  getAdjustmentAuditHistory: (adjustmentId: string) =>
    ipcRenderer.invoke('adjustments:getAuditHistory', adjustmentId),

  /** Computes adjusted trial balance with Before, Adjustment, and After numbers. */
  getAdjustedTrialBalance: (financialYearId?: string, unitId?: string) =>
    ipcRenderer.invoke('adjustments:getAdjustedTrialBalance', financialYearId, unitId),

  /** Runs Phase 8 automated test suite. */
  runAdjustmentsTests: () =>
    ipcRenderer.invoke('adjustments:runTests'),

  // ── Phase 9: Consolidation & Interbranch Elimination ───────────────

  /** Fetches consolidation workbench data (FYs, units, runs, summaries). */
  getConsolidationWorkbenchData: (financialYearId?: string) =>
    ipcRenderer.invoke('consolidation:getWorkbenchData', financialYearId),

  /** Creates a new consolidation run with selected units. */
  createConsolidationRun: (input: Parameters<import('./electron-api').ElectronAPI['createConsolidationRun']>[0]) =>
    ipcRenderer.invoke('consolidation:createRun', input),

  /** Runs internal balance detection for a consolidation run. */
  detectInternalBalances: (runId: string) =>
    ipcRenderer.invoke('consolidation:detectInternalBalances', runId),

  /** Gets unit-level adjusted trial balance (read-only, Phase 7+8 data). */
  getUnitAdjustedTrialBalance: (financialYearId: string, unitId: string) =>
    ipcRenderer.invoke('consolidation:getUnitAdjustedTrialBalance', financialYearId, unitId),

  /** Gets consolidated trial balance across selected units with eliminations. */
  getConsolidatedTrialBalance: (runId: string) =>
    ipcRenderer.invoke('consolidation:getConsolidatedTrialBalance', runId),

  /** Gets consolidated balance sheet preview with unmapped detection & reconciliation. */
  getConsolidatedBalanceSheetPreview: (runId: string) =>
    ipcRenderer.invoke('consolidation:getConsolidatedBalanceSheetPreview', runId),

  /** Creates a manual consolidation elimination entry. */
  createConsolidationElimination: (input: Parameters<import('./electron-api').ElectronAPI['createConsolidationElimination']>[0]) =>
    ipcRenderer.invoke('consolidation:createElimination', input),

  /** Updates a Draft elimination. */
  updateConsolidationElimination: (
    id: string,
    input: Parameters<import('./electron-api').ElectronAPI['updateConsolidationElimination']>[1],
  ) => ipcRenderer.invoke('consolidation:updateElimination', id, input),

  /** Deletes a Draft elimination. */
  deleteConsolidationElimination: (id: string) =>
    ipcRenderer.invoke('consolidation:deleteElimination', id),

  /** Submits a Draft elimination for review. */
  submitEliminationForReview: (id: string, submittedBy?: string) =>
    ipcRenderer.invoke('consolidation:submitElimination', id, submittedBy),

  /** Approves a PendingReview elimination. */
  approveElimination: (id: string, approvedBy?: string) =>
    ipcRenderer.invoke('consolidation:approveElimination', id, approvedBy),

  /** Rejects a PendingReview elimination with reason. */
  rejectElimination: (id: string, reason: string, rejectedBy?: string) =>
    ipcRenderer.invoke('consolidation:rejectElimination', id, reason, rejectedBy),

  /** Applies an Approved elimination. */
  applyElimination: (id: string, appliedBy?: string) =>
    ipcRenderer.invoke('consolidation:applyElimination', id, appliedBy),

  /** Reverses an Applied elimination. */
  reverseElimination: (id: string, reason: string, reversedBy?: string) =>
    ipcRenderer.invoke('consolidation:reverseElimination', id, reason, reversedBy),

  /** Completes a consolidation run. */
  completeConsolidationRun: (runId: string, completedBy?: string) =>
    ipcRenderer.invoke('consolidation:completeRun', runId, completedBy),

  /** Cancels a consolidation run. */
  cancelConsolidationRun: (runId: string, cancelledBy?: string) =>
    ipcRenderer.invoke('consolidation:cancelRun', runId, cancelledBy),

  /** Fetches audit history for a consolidation run or elimination. */
  getConsolidationAuditHistory: (runId?: string, eliminationId?: string) =>
    ipcRenderer.invoke('consolidation:getAuditHistory', runId, eliminationId),

  /** Fetches elimination review data for interbranch review screen. */
  getEliminationReviewData: (runId: string) =>
    ipcRenderer.invoke('consolidation:getEliminationReviewData', runId),

  /** Runs Phase 9 automated verification tests. */
  runConsolidationTests: () =>
    ipcRenderer.invoke('consolidation:runTests'),

  // ── Phase 10: FSLI & Reporting Hierarchy Engine IPC ──────────

  /** Fetches complete Phase 10 reporting hierarchy engine dataset. */
  getReportingHierarchyData: (
    financialYearId: string,
    options?: {
      scope?: 'UNIT' | 'CONSOLIDATED';
      unitId?: string;
      consolidationRunId?: string;
      importBatchId?: string;
      previousFinancialYearId?: string;
    },
  ) => ipcRenderer.invoke('reporting:getReportingHierarchyData', financialYearId, options),

  /** Fetches end-to-end provenance trace for a ledger. */
  getLedgerProvenance: (financialYearId: string, ledgerId: string) =>
    ipcRenderer.invoke('reporting:getLedgerProvenance', financialYearId, ledgerId),

  /** Saves a controlled ledger-to-reporting-node override. */
  saveLedgerReportingOverride: (
    ledgerId: string,
    financialYearId: string,
    reportingNodeId: string,
    reason?: string,
  ) => ipcRenderer.invoke('reporting:saveLedgerReportingOverride', ledgerId, financialYearId, reportingNodeId, reason),

  /** Runs Phase 10 automated verification tests. */
  runReportingHierarchyTests: () =>
    ipcRenderer.invoke('reporting:runTests'),

  // ── Phase 11: Notes & Schedules Engine ────────────────────────
  /** Fetches complete Phase 11 Notes & Schedules dataset (Notes 4-33). */
  getNotesData: (
    financialYearId: string,
    options?: {
      scope?: 'UNIT' | 'CONSOLIDATED';
      unitId?: string;
      consolidationRunId?: string;
    },
  ) => ipcRenderer.invoke('notes:getNotesData', financialYearId, options),

  /** Fetches ledger drill-down for a specific note line. */
  getNoteDrillDown: (
    financialYearId: string,
    noteNumber: number,
    lineId: string,
  ) => ipcRenderer.invoke('notes:getNoteDrillDown', financialYearId, noteNumber, lineId),

  // ── Phase 12: Financial Statement Engine ───────────────────────
  /** Fetches complete Phase 12 Financial Statements dataset (BS & IE). */
  getFinancialStatementsData: (
    financialYearId: string,
    options?: {
      scope?: 'ENTITY' | 'UNIT' | 'CONSOLIDATED';
      unitId?: string;
      consolidationRunId?: string;
      previousFinancialYearId?: string;
    },
  ) => ipcRenderer.invoke('financialStatements:getData', financialYearId, options),

  /** Fetches statement-to-ledger drill-down for a specific statement line. */
  getStatementDrillDown: (
    financialYearId: string,
    statementLineId: string,
    options?: {
      scope?: 'ENTITY' | 'UNIT' | 'CONSOLIDATED';
      unitId?: string;
      consolidationRunId?: string;
    },
  ) => ipcRenderer.invoke('financialStatements:getDrillDown', financialYearId, statementLineId, options),

  /** Runs Phase 12 automated verification tests. */
  runFinancialStatementTests: () =>
    ipcRenderer.invoke('financialStatements:runTests'),
});
