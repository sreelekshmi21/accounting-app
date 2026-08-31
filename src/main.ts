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
} from './database';
import { runMappingModelTests } from './test-mapping-model';

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

/** Saves imported trial balance into SQLite (Phase 4). */
ipcMain.handle('trialBalance:save', async (_event, importResult) => {
  return saveTrialBalance(importResult);
});

/** Retrieves list of saved import batches (Phase 4). */
ipcMain.handle('trialBalance:listBatches', async () => {
  return getImportBatches();
});

/** Loads a saved trial balance by batch ID (Phase 4). */
ipcMain.handle('trialBalance:loadSaved', async (_event, batchId: string) => {
  return getSavedTrialBalance(batchId);
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

// ── Phase 5 Step 2: Auto-Suggestion Engine IPC Handlers ──────────────────────

/** Seeds standard FSLIs. */
ipcMain.handle('mapping:seedFSLIs', async () => {
  return seedStandardFSLIs();
});

/** Generates explainable mapping suggestions for a given financial year. */
ipcMain.handle('mapping:generateSuggestions', async (_event, financialYearId: string) => {
  return generateMappingSuggestions(financialYearId);
});

/** Saves suggested mappings into the database. */
ipcMain.handle('mapping:saveSuggestions', async (_event, financialYearId: string, suggestions) => {
  return saveSuggestedMappings(financialYearId, suggestions);
});

// ── Phase 5 Step 3: Mapping Workbench UI IPC Handlers ────────────────────────

/** Fetches all consolidated data needed for the Mapping Workbench UI. */
ipcMain.handle('mapping:getWorkbenchData', async (_event, financialYearId?: string) => {
  return getMappingWorkbenchData(financialYearId);
});

/** Bulk updates multiple ledger mappings in a single transaction. */
ipcMain.handle('mapping:bulkUpdate', async (_event, financialYearId: string, updates) => {
  return bulkUpdateLedgerMappings(financialYearId, updates);
});

/** Applies an FSLI mapping to all similar ledgers sharing group/keyword. */
ipcMain.handle('mapping:applyToSimilar', async (_event, financialYearId: string, targetFSLIId: string, criteriaType: 'group' | 'keyword', criteriaValue: string) => {
  return applyMappingToSimilar(financialYearId, targetFSLIId, criteriaType, criteriaValue);
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

/** Fetches classification data for a given financial year. */
ipcMain.handle('classification:getData', async (_event, financialYearId?: string) => {
  return getClassificationDataForYear(financialYearId);
});

/** Runs auto-classification for all ledgers in the given financial year. */
ipcMain.handle('classification:autoClassify', async (_event, financialYearId: string) => {
  return autoClassifyForYear(financialYearId);
});

/** Saves manual classification updates. */
ipcMain.handle('classification:save', async (_event, financialYearId: string, items: import('./electron-api').ClassificationUpdateItem[]) => {
  return saveClassificationsForYear(financialYearId, items);
});

/** Resets all classification decisions for the given financial year. */
ipcMain.handle('classification:reset', async (_event, financialYearId: string) => {
  return resetClassificationsForYear(financialYearId);
});
