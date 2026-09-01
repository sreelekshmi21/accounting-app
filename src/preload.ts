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

  /** Generates explainable mapping suggestions for a given financial year. */
  generateMappingSuggestions: (financialYearId: string) =>
    ipcRenderer.invoke('mapping:generateSuggestions', financialYearId),

  /** Saves suggested mappings into the database. */
  saveSuggestedMappings: (
    financialYearId: string,
    suggestions: Parameters<import('./electron-api').ElectronAPI['saveSuggestedMappings']>[1],
  ) => ipcRenderer.invoke('mapping:saveSuggestions', financialYearId, suggestions),

  // ── Phase 5 Step 3: Mapping Workbench UI ────────────────────────────

  /** Fetches all consolidated data needed for the Mapping Workbench UI. */
  getMappingWorkbenchData: (financialYearId?: string) =>
    ipcRenderer.invoke('mapping:getWorkbenchData', financialYearId),

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

  /** Fetches classification data for a given financial year (CY or PY). */
  getClassificationData: (financialYearId?: string) =>
    ipcRenderer.invoke('classification:getData', financialYearId),

  /** Runs auto-classification for all ledgers in the given financial year. */
  autoClassifyLedgers: (financialYearId: string) =>
    ipcRenderer.invoke('classification:autoClassify', financialYearId),

  /** Saves manual classification updates for one or more ledgers. */
  saveClassifications: (
    financialYearId: string,
    items: Parameters<import('./electron-api').ElectronAPI['saveClassifications']>[1],
  ) => ipcRenderer.invoke('classification:save', financialYearId, items),

  /** Resets all classification decisions for the given financial year. */
  resetClassifications: (financialYearId: string) =>
    ipcRenderer.invoke('classification:reset', financialYearId),
});
