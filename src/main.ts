import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import {
  initDatabase,
  closeDatabase,
  runSmokeTest,
  saveTrialBalance,
  getImportBatches,
  getSavedTrialBalance,
  deleteImportBatch,
  checkDuplicate,
  createFSLI,
  updateFSLI,
  toggleFSLIActive,
  getFSLIs,
  getAllFSLIs,
  getChildFSLIs,
  createMappingRule,
  getMappingRules,
  createLedgerMapping,
  getLedgerMappings,
  getLedgerMappingByLedger,
  // Phase 5 Step 2
  seedStandardFSLIs,
  generateMappingSuggestions,
  saveSuggestedMappings,
  // Phase 5 Step 3
  getMappingWorkbenchData,
  bulkUpdateLedgerMappings,
  applyMappingToSimilar,
  // Phase 5 Step 4
  updateMappingRule,
  toggleMappingRuleActive,
  deleteMappingRule,
  getAllMappingRules,
  getUnmappedTrackerData,
  // Phase 6
  getClassificationDataForYear,
  autoClassifyForYear,
  saveClassificationsForYear,
  resetClassificationsForYear,
  // Phase 7
  getRegroupingWorkbenchDataForYear,
  generateRegroupingSuggestionsForYear,
  approveRegroupingById,
  rejectRegroupingById,
  changeRegroupingById,
  applyRegroupingById,
  undoRegroupingById,
  createRegroupingRuleInDb,
  getRegroupingRulesFromDb,
  toggleRegroupingRuleAutoApplyInDb,
  getRegroupingAuditHistoryFromDb,
  // Phase 8
  getAdjustmentsWorkbenchDataForYear,
  createAdjustmentInDb,
  updateAdjustmentInDb,
  deleteAdjustmentInDb,
  submitAdjustmentForReviewInDb,
  approveAdjustmentInDb,
  rejectAdjustmentInDb,
  returnAdjustmentToDraftInDb,
  applyAdjustmentInDb,
  reverseAdjustmentInDb,
  getAdjustmentAuditHistoryFromDb,
  getAdjustedTrialBalanceFromDb,
  // Phase 9
  getConsolidationWorkbenchDataFromDb,
  createConsolidationRunInDb,
  detectInternalBalancesInDb,
  createEliminationInDb,
  updateEliminationInDb,
  deleteEliminationInDb,
  submitEliminationForReviewInDb,
  approveEliminationInDb,
  rejectEliminationInDb,
  applyEliminationInDb,
  reverseEliminationInDb,
  completeConsolidationRunInDb,
  cancelConsolidationRunInDb,
  getConsolidatedTrialBalanceFromDb,
  getConsolidatedBalanceSheetPreviewFromDb,
  getEliminationReviewDataFromDb,
  getConsolidationAuditHistoryFromDb,
  // Phase 10
  getReportingHierarchyDataFromDb,
  getLedgerProvenanceFromDb,
  saveLedgerReportingOverrideInDb,
  // Phase 11
  getNotesDataFromDb,
  getNoteDrillDownFromDb,
  // Phase 12
  getFinancialStatementsDataFromDb,
  getStatementDrillDownFromDb,
  // Unit Management (Minimal)
  getUnits,
  createUnit,
} from './database';
import { runMappingModelTests } from './test-mapping-model';
import { runConsolidationReadinessTests } from './test-consolidation-readiness';
import { runAdjustmentsEngineTests } from './test-adjustments-engine';
import { runConsolidationEngineTests } from './test-consolidation-engine';
import { runReportingHierarchyEngineTests } from './test-fsli-reporting-engine';
import { runFinancialStatementEngineTests } from './test-financial-statement-engine';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  // Initialize SQLite database before creating any windows
  initDatabase();
  createWindow();
});

// Close database gracefully before the app quits
app.on('will-quit', () => {
  closeDatabase();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// ── Helper: Resolve Python executable ─────────────────────────────────────────

/**
 * Resolves the path to the Python executable.
 * Tries 'python', 'python3', and 'py' in order.
 */
function findPythonExecutable(): Promise<string> {
  const candidates =
    process.platform === 'win32'
      ? ['python', 'python3', 'py']
      : ['python3', 'python'];

  return new Promise((resolve, reject) => {
    let idx = 0;

    function tryNext() {
      if (idx >= candidates.length) {
        reject(
          new Error(
            'Python not found. Please install Python 3.8+ and ensure it is on your PATH.',
          ),
        );
        return;
      }

      const candidate = candidates[idx++];
      execFile(candidate, ['--version'], (err) => {
        if (err) {
          tryNext();
        } else {
          resolve(candidate);
        }
      });
    }

    tryNext();
  });
}

/**
 * Resolve the path to the Python import script.
 * In development, it's relative to the project root.
 * In production (packaged), it's bundled alongside the app.
 */
function getPythonScriptPath(): string {
  // In development: project_root/python/tally_import.py
  // app.getAppPath() returns the project root in dev, or the asar path in prod
  const appPath = app.getAppPath();
  const scriptPath = path.join(appPath, 'python', 'tally_import.py');

  if (fs.existsSync(scriptPath)) {
    return scriptPath;
  }

  // Fallback: try relative to __dirname (for packaged apps)
  const altPath = path.join(__dirname, '..', '..', 'python', 'tally_import.py');
  if (fs.existsSync(altPath)) {
    return altPath;
  }

  return scriptPath; // Return the expected path; will error at runtime if missing
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

/**
 * Opens a native file dialog for selecting a Tally-exported Trial Balance
 * Excel file (.xlsx or .xls). Returns structured file information on
 * successful selection, or null if the user cancels.
 */
ipcMain.handle('dialog:openTrialBalanceFile', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Tally Trial Balance Excel File',
    properties: ['openFile'],
    filters: [
      {
        name: 'Excel Files',
        extensions: ['xlsx', 'xls'],
      },
    ],
  });

  // User cancelled the dialog
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  const stats = fs.statSync(filePath);

  return {
    fileName,
    filePath,
    fileSize: stats.size,
    lastModified: stats.mtime.toISOString(),
  };
});

/**
 * Imports a Tally Trial Balance Excel file by spawning the Python
 * import engine as a child process. Reads canonical JSON from stdout.
 *
 * @param filePath - Absolute path to the Excel file.
 * @returns Canonical import result with ledgers, groups, and validation.
 */
ipcMain.handle(
  'trialBalance:import',
  async (_event: Electron.IpcMainInvokeEvent, filePath: string) => {
    try {
      // Find Python
      const pythonExe = await findPythonExecutable();
      const scriptPath = getPythonScriptPath();

      // Spawn Python process
      const result = await new Promise<string>((resolve, reject) => {
        const child = execFile(
          pythonExe,
          [scriptPath, filePath],
          {
            maxBuffer: 50 * 1024 * 1024, // 50 MB for large trial balances
            timeout: 120_000, // 2 minute timeout
          },
          (error, stdout, stderr) => {
            if (error) {
              const message =
                stderr?.trim() || error.message || 'Python process failed';
              reject(new Error(message));
              return;
            }
            resolve(stdout);
          },
        );
      });

      // Parse JSON output
      const parsed = JSON.parse(result);
      return parsed;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';

      return {
        success: false,
        error: message,
        import_metadata: null,
        summary: null,
        validation: {
          is_valid: false,
          errors: [
            {
              type: 'PROCESS_ERROR',
              message: `Import engine error: ${message}`,
            },
          ],
          warnings: [],
        },
        groups: [],
        ledgers: [],
      };
    }
  },
);

/** Saves imported trial balance into SQLite (Phase 4). Accepts optional unitId. */
ipcMain.handle('trialBalance:save', async (_event, importResult, unitId?: string) => {
  return saveTrialBalance(importResult, unitId);
});

/** Retrieves list of saved import batches (Phase 4). */
ipcMain.handle('trialBalance:listBatches', async () => {
  return getImportBatches();
});

/** Loads a saved trial balance by batch ID (Phase 4). */
ipcMain.handle('trialBalance:loadSaved', async (_event, batchId: string) => {
  return getSavedTrialBalance(batchId);
});

/** Deletes a saved import batch and associated processing data. */
ipcMain.handle('trialBalance:deleteBatch', async (_event, batchId: string) => {
  return deleteImportBatch(batchId);
});

/** Checks if trial balance file is already saved (Phase 4). */
ipcMain.handle('trialBalance:checkDuplicate', async (_event, filePath: string, financialYear: string) => {
  return checkDuplicate(filePath, financialYear);
});

/**
 * Smoke test: verifies that better-sqlite3 is working correctly
 * in the Electron main process (INSERT, SELECT, transactions).
 */
ipcMain.handle('db:smokeTest', async () => {
  return runSmokeTest();
});

// ── Unit Management (Minimal) IPC Handlers ──────────────────────────────────

/** Lists all units for the default entity. */
ipcMain.handle('unit:list', async () => {
  return getUnits();
});

/** Creates a new unit under the default entity. */
ipcMain.handle('unit:create', async (_event, unitName: string) => {
  return createUnit(unitName);
});

// ── Phase 5 Step 1: Mapping Data Model IPC Handlers ─────────────────────────

/** Creates a new FSLI entry. */
ipcMain.handle('mapping:createFSLI', async (_event, data) => {
  return createFSLI(data);
});

/** Updates a user-created FSLI entry. */
ipcMain.handle('mapping:updateFSLI', async (_event, id: string, data) => {
  return updateFSLI(id, data);
});

/** Toggles active status of an FSLI entry. */
ipcMain.handle('mapping:toggleFSLIActive', async (_event, id: string, active: boolean) => {
  return toggleFSLIActive(id, active);
});

/** Lists all active FSLIs. */
ipcMain.handle('mapping:listFSLIs', async () => {
  return getFSLIs();
});

/** Lists all FSLIs (including inactive). */
ipcMain.handle('mapping:listAllFSLIs', async (_event, includeInactive?: boolean) => {
  return getAllFSLIs(includeInactive !== false);
});

/** Lists child FSLIs of a given parent. */
ipcMain.handle('mapping:getChildFSLIs', async (_event, parentFSLIId: string) => {
  return getChildFSLIs(parentFSLIId);
});

/** Creates a new mapping rule. */
ipcMain.handle('mapping:createRule', async (_event, data) => {
  return createMappingRule(data);
});

/** Lists all active mapping rules. */
ipcMain.handle('mapping:listRules', async () => {
  return getMappingRules();
});

/** Creates a new ledger mapping. */
ipcMain.handle('mapping:createMapping', async (_event, data) => {
  return createLedgerMapping(data);
});

/** Lists all mappings for a given financial year. */
ipcMain.handle('mapping:listMappings', async (_event, financialYearId: string) => {
  return getLedgerMappings(financialYearId);
});

/** Gets a mapping for a specific ledger + financial year. */
ipcMain.handle('mapping:getMappingByLedger', async (_event, ledgerId: string, financialYearId: string) => {
  return getLedgerMappingByLedger(ledgerId, financialYearId);
});

/** Runs the Phase 5 mapping data model verification tests. */
ipcMain.handle('mapping:runTests', async () => {
  return runMappingModelTests();
});

/** Runs the Consolidation-Readiness verification tests. */
ipcMain.handle('consolidation:runReadinessTests', async () => {
  return runConsolidationReadinessTests();
});

// ── Phase 5 Step 2: Auto-Suggestion Engine IPC Handlers ──────────────────────

/** Seeds standard FSLIs. */
ipcMain.handle('mapping:seedFSLIs', async () => {
  return seedStandardFSLIs();
});

/** Generates explainable mapping suggestions for a given financial year and optional unit/batch. */
ipcMain.handle('mapping:generateSuggestions', async (_event, financialYearId: string, unitId?: string, importBatchId?: string) => {
  return generateMappingSuggestions(financialYearId, unitId, importBatchId);
});

/** Saves suggested mappings into the database. */
ipcMain.handle('mapping:saveSuggestions', async (_event, financialYearId: string, suggestions) => {
  return saveSuggestedMappings(financialYearId, suggestions);
});

// ── Phase 5 Step 3: Mapping Workbench UI IPC Handlers ────────────────────────

/** Fetches all consolidated data needed for the Mapping Workbench UI. */
ipcMain.handle('mapping:getWorkbenchData', async (_event, financialYearId?: string, unitId?: string, importBatchId?: string) => {
  return getMappingWorkbenchData(financialYearId, unitId, importBatchId);
});

/** Bulk updates multiple ledger mappings in a single transaction. */
ipcMain.handle('mapping:bulkUpdate', async (_event, financialYearId: string, updates) => {
  return bulkUpdateLedgerMappings(financialYearId, updates);
});

/** Applies an FSLI mapping to all similar ledgers sharing group/keyword. Optionally scoped to a unit. */
ipcMain.handle('mapping:applyToSimilar', async (_event, financialYearId: string, targetFSLIId: string, criteriaType: 'group' | 'keyword', criteriaValue: string, unitId?: string) => {
  return applyMappingToSimilar(financialYearId, targetFSLIId, criteriaType, criteriaValue, unitId);
});

// ── Phase 5 Step 4: User Mapping Rules & Unmapped Tracker IPC Handlers ───────

/** Updates an existing mapping rule. */
ipcMain.handle('mapping:updateRule', async (_event, ruleId: string, data) => {
  return updateMappingRule(ruleId, data);
});

/** Toggles active status of a mapping rule. */
ipcMain.handle('mapping:toggleRuleActive', async (_event, ruleId: string, active: boolean) => {
  return toggleMappingRuleActive(ruleId, active);
});

/** Deletes a mapping rule. */
ipcMain.handle('mapping:deleteRule', async (_event, ruleId: string) => {
  return deleteMappingRule(ruleId);
});

/** Lists all mapping rules (active and inactive). */
ipcMain.handle('mapping:listAllRules', async (_event, scopeFilter) => {
  return getAllMappingRules(scopeFilter);
});

/** Fetches consolidated unmapped tracker data with materiality calculations. */
ipcMain.handle('mapping:getUnmappedTrackerData', async (_event, financialYearId?: string, materialityThreshold?: number) => {
  return getUnmappedTrackerData(financialYearId, materialityThreshold);
});

// ── Phase 6: Classification Engine IPC Handlers ────────────────────────────

/** Fetches classification data scoped by financial year, unit, and import batch. */
ipcMain.handle('classification:getData', async (_event, financialYearId?: string, unitId?: string, importBatchId?: string) => {
  return getClassificationDataForYear(financialYearId, unitId, importBatchId);
});

/** Runs auto-classification for ledgers in the given scope. */
ipcMain.handle('classification:autoClassify', async (_event, financialYearId: string, unitId?: string, importBatchId?: string) => {
  return autoClassifyForYear(financialYearId, unitId, importBatchId);
});

/** Saves manual classification updates. */
ipcMain.handle('classification:save', async (_event, financialYearId: string, items: import('./electron-api').ClassificationUpdateItem[]) => {
  return saveClassificationsForYear(financialYearId, items);
});

/** Resets classification decisions for ledgers in the given scope. */
ipcMain.handle('classification:reset', async (_event, financialYearId: string, unitId?: string, importBatchId?: string) => {
  return resetClassificationsForYear(financialYearId, unitId, importBatchId);
});

// ── Phase 7: Regrouping Engine IPC Handlers ────────────────────────────────

/** Fetches regrouping workbench data for a financial year, optionally scoped by unit and import batch. */
ipcMain.handle('regrouping:getWorkbenchData', async (_event, financialYearId?: string, unitId?: string, importBatchId?: string) => {
  return getRegroupingWorkbenchDataForYear(financialYearId, unitId, importBatchId);
});

/** Runs detection engine to generate regrouping suggestions for the specified scope. */
ipcMain.handle('regrouping:generateSuggestions', async (_event, financialYearId: string, unitId?: string, importBatchId?: string) => {
  return generateRegroupingSuggestionsForYear(financialYearId, unitId, importBatchId);
});

/** Approves a regrouping result. */
ipcMain.handle('regrouping:approve', async (_event, id: string, approvedBy?: string) => {
  return approveRegroupingById(id, approvedBy);
});

/** Rejects a regrouping result. */
ipcMain.handle('regrouping:reject', async (_event, id: string, rejectedBy?: string, reason?: string) => {
  return rejectRegroupingById(id, rejectedBy, reason);
});

/** Changes a proposed regrouping FSLI. */
ipcMain.handle('regrouping:change', async (_event, id: string, newFSLIId: string, newClassification: string, reason: string, changedBy?: string) => {
  return changeRegroupingById(id, newFSLIId, newClassification, reason, changedBy);
});

/** Applies an approved regrouping. */
ipcMain.handle('regrouping:apply', async (_event, id: string, appliedBy?: string) => {
  return applyRegroupingById(id, appliedBy);
});

/** Undoes an applied regrouping. */
ipcMain.handle('regrouping:undo', async (_event, id: string, undoneBy?: string, reason?: string) => {
  return undoRegroupingById(id, undoneBy, reason);
});

/** Creates a new regrouping rule. */
ipcMain.handle('regrouping:createRule', async (_event, input: import('./electron-api').CreateRegroupingRuleInput) => {
  return createRegroupingRuleInDb(input);
});

/** Gets all regrouping rules. */
ipcMain.handle('regrouping:getRules', async (_event) => {
  return getRegroupingRulesFromDb();
});

/** Toggles auto-apply on a regrouping rule. */
ipcMain.handle('regrouping:toggleRuleAutoApply', async (_event, ruleId: string, autoApply: boolean) => {
  return toggleRegroupingRuleAutoApplyInDb(ruleId, autoApply);
});

/** Fetches audit history for a regrouping result. */
ipcMain.handle('regrouping:getAuditHistory', async (_event, regroupingId: string) => {
  return getRegroupingAuditHistoryFromDb(regroupingId);
});

// ── Phase 8: Adjustments Engine IPC Handlers ───────────────────────────────

/** Fetches adjustments workbench data for a financial year. */
ipcMain.handle('adjustments:getWorkbenchData', async (_event, financialYearId?: string, unitId?: string, typeFilter?: string, statusFilter?: string) => {
  return getAdjustmentsWorkbenchDataForYear(financialYearId, unitId, typeFilter, statusFilter);
});

/** Creates a new Adjustment in Draft status. */
ipcMain.handle('adjustments:create', async (_event, input: import('./electron-api').CreateAdjustmentInput) => {
  return createAdjustmentInDb(input);
});

/** Updates an existing Draft adjustment. */
ipcMain.handle('adjustments:update', async (_event, id: string, input: import('./electron-api').UpdateAdjustmentInput) => {
  return updateAdjustmentInDb(id, input);
});

/** Deletes a Draft adjustment. */
ipcMain.handle('adjustments:delete', async (_event, id: string) => {
  return deleteAdjustmentInDb(id);
});

/** Submits a Draft adjustment for review. */
ipcMain.handle('adjustments:submit', async (_event, id: string, submittedBy?: string) => {
  return submitAdjustmentForReviewInDb(id, submittedBy);
});

/** Approves a PendingReview adjustment. */
ipcMain.handle('adjustments:approve', async (_event, id: string, approvedBy?: string) => {
  return approveAdjustmentInDb(id, approvedBy);
});

/** Rejects a PendingReview adjustment. */
ipcMain.handle('adjustments:reject', async (_event, id: string, reason: string, rejectedBy?: string) => {
  return rejectAdjustmentInDb(id, reason, rejectedBy);
});

/** Returns an Approved adjustment back to Draft. */
ipcMain.handle('adjustments:returnToDraft', async (_event, id: string, reason: string, returnedBy?: string) => {
  return returnAdjustmentToDraftInDb(id, reason, returnedBy);
});

/** Applies an Approved adjustment. */
ipcMain.handle('adjustments:apply', async (_event, id: string, appliedBy?: string) => {
  return applyAdjustmentInDb(id, appliedBy);
});

/** Reverses an Applied adjustment. */
ipcMain.handle('adjustments:reverse', async (_event, id: string, reason: string, reversedBy?: string) => {
  return reverseAdjustmentInDb(id, reason, reversedBy);
});

/** Fetches audit history for an adjustment. */
ipcMain.handle('adjustments:getAuditHistory', async (_event, adjustmentId: string) => {
  return getAdjustmentAuditHistoryFromDb(adjustmentId);
});

/** Computes adjusted trial balance with Before, Adjustment, and After comparisons. */
ipcMain.handle('adjustments:getAdjustedTrialBalance', async (_event, financialYearId?: string, unitId?: string) => {
  return getAdjustedTrialBalanceFromDb(financialYearId, unitId);
});

/** Runs Phase 8 automated test suite. */
ipcMain.handle('adjustments:runTests', async () => {
  return runAdjustmentsEngineTests();
});

// ── Phase 9: Consolidation & Interbranch Elimination IPC Handlers ─────────

/** Fetches consolidation workbench data (FYs, units, runs, summaries). */
ipcMain.handle('consolidation:getWorkbenchData', async (_event, financialYearId?: string) => {
  return getConsolidationWorkbenchDataFromDb(financialYearId);
});

/** Creates a new consolidation run with selected units. */
ipcMain.handle('consolidation:createRun', async (_event, input: import('./electron-api').CreateConsolidationRunInput) => {
  return createConsolidationRunInDb(input);
});

/** Runs internal balance detection for a consolidation run. */
ipcMain.handle('consolidation:detectInternalBalances', async (_event, runId: string) => {
  return detectInternalBalancesInDb(runId);
});

/** Gets unit-level adjusted trial balance (read-only, Phase 7+8 data). */
ipcMain.handle('consolidation:getUnitAdjustedTrialBalance', async (_event, financialYearId: string, unitId: string) => {
  return getAdjustedTrialBalanceFromDb(financialYearId, unitId);
});

/** Gets consolidated trial balance across selected units with eliminations. */
ipcMain.handle('consolidation:getConsolidatedTrialBalance', async (_event, runId: string) => {
  return getConsolidatedTrialBalanceFromDb(runId);
});

/** Gets consolidated balance sheet preview with unmapped detection & reconciliation. */
ipcMain.handle('consolidation:getConsolidatedBalanceSheetPreview', async (_event, runId: string) => {
  return getConsolidatedBalanceSheetPreviewFromDb(runId);
});

/** Creates a manual consolidation elimination entry. */
ipcMain.handle('consolidation:createElimination', async (_event, input: import('./electron-api').CreateEliminationInput) => {
  return createEliminationInDb(input);
});

/** Updates a Draft elimination. */
ipcMain.handle('consolidation:updateElimination', async (_event, id: string, input: import('./electron-api').UpdateEliminationInput) => {
  return updateEliminationInDb(id, input);
});

/** Deletes a Draft elimination. */
ipcMain.handle('consolidation:deleteElimination', async (_event, id: string) => {
  return deleteEliminationInDb(id);
});

/** Submits a Draft elimination for review. */
ipcMain.handle('consolidation:submitElimination', async (_event, id: string, submittedBy?: string) => {
  return submitEliminationForReviewInDb(id, submittedBy);
});

/** Approves a PendingReview elimination. */
ipcMain.handle('consolidation:approveElimination', async (_event, id: string, approvedBy?: string) => {
  return approveEliminationInDb(id, approvedBy);
});

/** Rejects a PendingReview elimination with reason. */
ipcMain.handle('consolidation:rejectElimination', async (_event, id: string, reason: string, rejectedBy?: string) => {
  return rejectEliminationInDb(id, reason, rejectedBy);
});

/** Applies an Approved elimination. */
ipcMain.handle('consolidation:applyElimination', async (_event, id: string, appliedBy?: string) => {
  return applyEliminationInDb(id, appliedBy);
});

/** Reverses an Applied elimination. */
ipcMain.handle('consolidation:reverseElimination', async (_event, id: string, reason: string, reversedBy?: string) => {
  return reverseEliminationInDb(id, reason, reversedBy);
});

/** Completes a consolidation run. */
ipcMain.handle('consolidation:completeRun', async (_event, runId: string, completedBy?: string) => {
  return completeConsolidationRunInDb(runId, completedBy);
});

/** Cancels a consolidation run. */
ipcMain.handle('consolidation:cancelRun', async (_event, runId: string, cancelledBy?: string) => {
  return cancelConsolidationRunInDb(runId, cancelledBy);
});

/** Fetches audit history for a consolidation run or elimination. */
ipcMain.handle('consolidation:getAuditHistory', async (_event, runId?: string, eliminationId?: string) => {
  return getConsolidationAuditHistoryFromDb(runId, eliminationId);
});

/** Fetches elimination review data for interbranch review screen. */
ipcMain.handle('consolidation:getEliminationReviewData', async (_event, runId: string) => {
  return getEliminationReviewDataFromDb(runId);
});

/** Runs Phase 9 automated verification tests. */
ipcMain.handle('consolidation:runTests', async () => {
  return runConsolidationEngineTests();
});

// ── Phase 10: FSLI & Reporting Hierarchy Engine ─────────────────────────────

/** Fetches reporting hierarchy data. */
ipcMain.handle('reporting:getReportingHierarchyData', async (_event, financialYearId: string, options?: any) => {
  return getReportingHierarchyDataFromDb(financialYearId, options);
});

/** Fetches ledger provenance trace. */
ipcMain.handle('reporting:getLedgerProvenance', async (_event, financialYearId: string, ledgerId: string) => {
  return getLedgerProvenanceFromDb(financialYearId, ledgerId);
});

/** Saves ledger reporting override. */
ipcMain.handle('reporting:saveLedgerReportingOverride', async (_event, ledgerId: string, financialYearId: string, reportingNodeId: string, reason?: string) => {
  return saveLedgerReportingOverrideInDb(ledgerId, financialYearId, reportingNodeId, reason);
});

/** Runs Phase 10 automated verification tests. */
ipcMain.handle('reporting:runTests', async () => {
  return runReportingHierarchyEngineTests();
});

// ── Phase 11: Notes & Schedules Engine IPC Handlers ─────────────────────────

/** Fetches complete Phase 11 Notes & Schedules dataset (Notes 4-33). */
ipcMain.handle('notes:getNotesData', async (_event, financialYearId: string, options?: any) => {
  return getNotesDataFromDb(financialYearId, options);
});

/** Fetches ledger drill-down for a specific note line. */
ipcMain.handle('notes:getNoteDrillDown', async (_event, financialYearId: string, noteNumber: number, lineId: string) => {
  return getNoteDrillDownFromDb(financialYearId, noteNumber, lineId);
});

// ── Phase 12: Financial Statement Engine IPC Handlers ───────────────────────

/** Fetches complete Phase 12 Financial Statements dataset (BS & IE). */
ipcMain.handle('financialStatements:getData', async (_event, financialYearId: string, options?: any) => {
  return getFinancialStatementsDataFromDb(financialYearId, options);
});

/** Fetches statement-to-ledger drill-down for a specific statement line. */
ipcMain.handle('financialStatements:getDrillDown', async (_event, financialYearId: string, statementLineId: string, options?: any) => {
  return getStatementDrillDownFromDb(financialYearId, statementLineId, options);
});

/** Runs Phase 12 automated verification tests. */
ipcMain.handle('financialStatements:runTests', async () => {
  return runFinancialStatementEngineTests();
});



