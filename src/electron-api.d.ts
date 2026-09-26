/**
 * Type declarations for the Electron preload bridge exposed via contextBridge.
 * This allows the renderer process to call main-process IPC methods
 * with full TypeScript type safety.
 */

/** File information returned by the Trial Balance file selection dialog. */
export interface TrialBalanceFileInfo {
  /** Base filename, e.g. "Trial_Balance_2025.xlsx" */
  fileName: string;
  /** Full absolute path to the selected file */
  filePath: string;
  /** File size in bytes */
  fileSize: number;
  /** ISO 8601 timestamp of last modification */
  lastModified: string;
}

// ── Canonical Data Model (Phase 3B) ─────────────────────────────────────────

/** A validation error or warning from the import engine. */
export interface ValidationItem {
  type: string;
  message: string;
  row?: number;
  ledger?: string;
}

/** Validation results from the import engine. */
export interface ValidationResult {
  is_valid: boolean;
  errors: ValidationItem[];
  warnings: ValidationItem[];
}

/** Metadata about the import operation. */
export interface ImportMetadata {
  file_name: string;
  file_path: string;
  sheet_name: string;
  financial_year: string | null;
  fy_start?: string | null;
  fy_end?: string | null;
  import_timestamp?: string;
  detected_columns?: Record<string, string>;
  header_row?: number;
  total_rows?: number;
}

/** Summary statistics from the imported Trial Balance. */
export interface ImportSummary {
  ledger_count: number;
  total_debit: number;
  total_credit: number;
  difference: number;
  opening_debit_total?: number | null;
  opening_credit_total?: number | null;
  closing_debit_total?: number | null;
  closing_credit_total?: number | null;
  has_opening_balances?: boolean;
  has_closing_balances?: boolean;
  has_previous_year?: boolean;
  grand_total_debit?: number | null;
  grand_total_credit?: number | null;
}

/** A Tally group in the hierarchy. */
export interface TallyGroup {
  id: string;
  group_name: string;
  parent_group_id?: string | null;
  depth?: number;
}

/** A ledger entry with all balance figures. */
export interface LedgerEntry {
  id: string;
  ledger_name: string;
  tally_group_id?: string | null;
  source_row?: number;
  opening_debit?: number;
  opening_credit?: number;
  debit: number;
  credit: number;
  closing_debit?: number;
  closing_credit?: number;
  net_balance: number;
}

/** Full result from the Trial Balance import engine. */
export interface TrialBalanceImportResult {
  success: boolean;
  error?: string;
  import_metadata: ImportMetadata | null;
  summary: ImportSummary | null;
  validation: ValidationResult;
  groups: TallyGroup[];
  ledgers: LedgerEntry[];
}

/** Result from saving trial balance to SQLite (Phase 4). */
export interface SaveResult {
  success: boolean;
  importBatchId?: string;
  duplicate?: boolean;
  error?: string;
}

/** A record representing a business unit within an entity. */
export interface UnitRecord {
  id: string;
  entityId: string;
  unitName: string;
  createdAt: string;
}

/** A record representing a saved import batch in SQLite. */
export interface ImportBatchRecord {
  id: string;
  fileName: string;
  filePath: string;
  financialYear: string;
  unitId: string;
  unitName: string;
  totalRows: number;
  ledgerCount: number;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  importTimestamp: string;
  status: string;
}

/** Result of checking if a file was previously saved. */
export interface DuplicateCheckResult {
  duplicate: boolean;
  batchId?: string;
}

/** Result of deleting an import batch and its batch-scoped processing data. */
export interface DeleteImportBatchResult {
  success: boolean;
  error?: string;
  deletedCounts?: {
    importBatch: number;
    ledgerBalances: number;
    tallyGroups: number;
    ledgers: number;
    ledgerMappings: number;
    ledgerClassifications: number;
    regroupingResults: number;
  };
}

/** Result from the database smoke test. */
export interface SmokeTestResult {
  success: boolean;
  dbPath: string;
  schemaVersion: string;
  testInsert: boolean;
  testSelect: boolean;
  testTransaction: boolean;
  error?: string;
}

// ── Phase 5 Step 1: Mapping Data Model Types ─────────────────────────────────

/** Controlled values for MappingSource. */
export type MappingSource =
  | 'SystemSuggestion'
  | 'UserMapping'
  | 'UserRule'
  | 'HistoricalMapping'
  | 'BulkMapping';

/** Controlled values for mapping status. */
export type MappingStatus =
  | 'Suggested'
  | 'Mapped'
  | 'NeedsReview'
  | 'Unmapped'
  | 'Rejected';

/** A Financial Statement Line Item (FSLI). */
export interface FSLIRecord {
  id: string;
  fsliName: string;
  fsliCode: string | null;
  category: string;
  subCategory: string | null;
  displayOrder: number;
  source?: 'SYSTEM' | 'USER';
  active: boolean;
  createdAt: string;
  /** ID of the parent FSLI, if this is a child (sub-line-item). Null for top-level FSLIs. */
  parentFSLIId?: string | null;
}

/** Input for creating an FSLI. */
export interface CreateFSLIInput {
  fsliName: string;
  fsliCode: string;
  category: string;
  subCategory?: string;
  displayOrder?: number;
  active?: boolean;
  /** If set, creates this FSLI as a child of the specified parent FSLI. */
  parentFSLIId?: string;
}

/** Input for updating a user-created FSLI. */
export interface UpdateFSLIInput {
  fsliName?: string;
  category?: string;
  subCategory?: string;
  displayOrder?: number;
  active?: boolean;
}

/** A reusable mapping rule. */
export interface MappingRuleRecord {
  id: string;
  ruleName: string;
  priority: number;
  conditions: Record<string, unknown>;
  action: string;
  targetFSLIId: string | null;
  confidence: number;
  scope: 'Global' | 'Client' | 'Entity';
  scopeClientId: string | null;
  scopeEntityId: string | null;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Input for creating or updating a mapping rule. */
export interface MappingRuleInput {
  ruleName: string;
  priority?: number;
  conditions: {
    type?: string;
    rules: Array<{ field: string; operator: string; value: string }>;
  };
  action?: string;
  targetFSLIId?: string | null;
  confidence?: number;
  scope?: 'Global' | 'Client' | 'Entity';
  scopeClientId?: string | null;
  scopeEntityId?: string | null;
  createdBy?: string | null;
}


/** A mapping connecting a Ledger → FSLI for a given financial year. */
export interface LedgerMappingRecord {
  id: string;
  ledgerId: string;
  financialYearId: string;
  mappedFSLIId: string | null;
  mappingRuleId: string | null;
  mappingSource: MappingSource;
  confidenceScore: number | null;
  isManualOverride: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  status: MappingStatus;
  createdAt: string;
  updatedAt: string;
}

/** Result from a single verification test. */
export interface MappingTestResult {
  name: string;
  passed: boolean;
  message: string;
}

/** Result from the full mapping model verification suite. */
export interface MappingModelTestResult {
  success: boolean;
  tests: MappingTestResult[];
  summary: string;
}

// ── Phase 5 Step 2: Auto-Suggestion Engine Types ─────────────────────────────

/** A single auto-suggestion item with explainable reasoning. */
export interface SuggestionResultItem {
  ledgerId: string;
  ledgerName: string;
  tallyGroupName: string | null;
  parentGroupName: string | null;
  netBalance: number;
  balanceNature: 'Debit' | 'Credit' | 'Zero';
  suggestedFSLIId: string;
  suggestedFSLIName: string;
  suggestedFSLICode: string | null;
  category: string;
  confidenceScore: number;
  reason: string;
  mappingSource: MappingSource;
  ruleId?: string;
  ruleName?: string;
}

/** Summary metrics for auto-suggestions. */
export interface SuggestionSummary {
  totalLedgers: number;
  suggestedCount: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  bySource: Record<string, number>;
}

/** Complete response for generated mapping suggestions. */
export interface GenerateSuggestionsResponse {
  financialYearId: string;
  financialYearLabel: string;
  summary: SuggestionSummary;
  suggestions: SuggestionResultItem[];
}

// ── Phase 5 Step 3: Mapping Workbench UI Types ──────────────────────────────

/** Consolidated row representing a ledger in the Mapping Workbench. */
export interface WorkbenchLedgerRow {
  ledgerId: string;
  ledgerName: string;
  unitId?: string | null;
  unitName?: string | null;
  importBatchId?: string | null;
  importBatchFileName?: string | null;
  tallyGroupId: string | null;
  tallyGroupName: string | null;
  parentGroupId: string | null;
  parentGroupName: string | null;
  debit: number;
  credit: number;
  netBalance: number;
  balanceNature: 'Debit' | 'Credit' | 'Zero';
  mappingId: string | null;
  status: MappingStatus;
  cyFSLIId: string | null;
  cyFSLIName: string | null;
  cyFSLICode: string | null;
  pyFSLIId: string | null;
  pyFSLIName: string | null;
  pyFSLICode: string | null;
  suggestedFSLIId: string | null;
  suggestedFSLIName: string | null;
  suggestedFSLICode: string | null;
  category: string | null;
  confidenceScore: number;
  reason: string;
  mappingSource: MappingSource;
  isManualOverride: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
}

/** Summary KPI metrics for the Mapping Workbench. */
export interface WorkbenchSummary {
  totalLedgers: number;
  mappedCount: number;
  alreadyMappedCount: number;
  autoMappedCount: number;
  suggestedCount: number;
  needsReviewCount: number;
  unmappedCount: number;
  rejectedCount: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
}

/** Complete state data returned for the Mapping Workbench view. */
export interface MappingWorkbenchData {
  financialYears: Array<{ id: string; yearLabel: string }>;
  activeFinancialYearId: string;
  activeFinancialYearLabel: string;
  units: Array<{ id: string; unitName: string }>;
  activeUnitId?: string | null;
  importBatches: Array<{
    id: string;
    unitId: string;
    financialYearId: string;
    fileName: string;
    importTimestamp: string;
    ledgerCount: number;
  }>;
  activeImportBatchId?: string | null;
  fslis: FSLIRecord[];
  rules: MappingRuleRecord[];
  summary: WorkbenchSummary;
  rows: WorkbenchLedgerRow[];
}

/** Item for bulk mapping updates. */
export interface BulkUpdateMappingItem {
  ledgerId: string;
  mappedFSLIId: string | null;
  status: MappingStatus;
  mappingSource: MappingSource;
  isManualOverride?: boolean;
  confidenceScore?: number | null;
  mappingRuleId?: string | null;
  approvedBy?: string | null;
}

export interface ElectronAPI {
  /**
   * Opens the native file dialog to select a Tally-exported
   * Trial Balance Excel file (.xlsx or .xls).
   */
  openTrialBalanceFile: () => Promise<TrialBalanceFileInfo | null>;

  /**
   * Imports a Tally Trial Balance Excel file by invoking the Python
   * import engine. Returns the canonical data model with validation.
   */
  importTrialBalance: (filePath: string) => Promise<TrialBalanceImportResult>;

  /**
   * Saves an imported Trial Balance result into SQLite (Phase 4).
   * @param unitId — ID of the unit this Trial Balance belongs to.
   */
  saveTrialBalance: (importResult: TrialBalanceImportResult, unitId?: string) => Promise<SaveResult>;

  /**
   * Lists all saved import batches from SQLite.
   */
  listImportBatches: () => Promise<ImportBatchRecord[]>;

  /**
   * Loads a saved Trial Balance from SQLite by batch ID.
   */
  loadSavedTrialBalance: (batchId: string) => Promise<TrialBalanceImportResult | null>;

  /**
   * Deletes a saved Trial Balance import batch and all batch-scoped processing data.
   */
  deleteImportBatch: (batchId: string) => Promise<DeleteImportBatchResult>;

  /**
   * Checks if a trial balance file was already saved for the financial year.
   */
  checkDuplicate: (filePath: string, financialYear: string) => Promise<DuplicateCheckResult>;

  /**
   * Runs a database smoke test.
   */
  dbSmokeTest: () => Promise<SmokeTestResult>;

  // ── Unit Management (Minimal) ─────────────────────────────────────

  /** Lists all units for the default entity. */
  listUnits: () => Promise<UnitRecord[]>;

  /** Creates a new unit under the default entity. Returns the created unit. */
  createUnit: (unitName: string) => Promise<UnitRecord>;

  // ── Phase 5 Step 1: Mapping Data Model IPC ────────────────────────────

  /** Creates a new FSLI entry. */
  createFSLI: (data: CreateFSLIInput) => Promise<FSLIRecord>;

  /** Updates an existing user-created FSLI entry. */
  updateFSLI: (id: string, data: UpdateFSLIInput) => Promise<FSLIRecord>;

  /** Toggles active status of an FSLI entry. */
  toggleFSLIActive: (id: string, active: boolean) => Promise<boolean>;

  /** Lists all active FSLI entries. */
  listFSLIs: () => Promise<FSLIRecord[]>;

  /** Lists all FSLI entries (optionally including inactive ones). */
  listAllFSLIs: (includeInactive?: boolean) => Promise<FSLIRecord[]>;

  /** Lists child FSLIs of a given parent FSLI. */
  getChildFSLIs: (parentFSLIId: string) => Promise<FSLIRecord[]>;

  /** Creates a new mapping rule. */
  createMappingRule: (data: {
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
  }) => Promise<MappingRuleRecord>;

  /** Lists all active mapping rules. */
  listMappingRules: () => Promise<MappingRuleRecord[]>;

  /** Creates a new ledger mapping. */
  createLedgerMapping: (data: {
    ledgerId: string;
    financialYearId: string;
    mappedFSLIId?: string;
    mappingRuleId?: string;
    mappingSource?: MappingSource;
    confidenceScore?: number;
    isManualOverride?: boolean;
    approvedBy?: string;
    status?: MappingStatus;
  }) => Promise<LedgerMappingRecord>;

  /** Lists all mappings for a given financial year. */
  listLedgerMappings: (financialYearId: string) => Promise<LedgerMappingRecord[]>;

  /** Gets a mapping for a specific ledger + financial year. */
  getLedgerMappingByLedger: (
    ledgerId: string,
    financialYearId: string,
  ) => Promise<LedgerMappingRecord | null>;

  /** Runs the Phase 5 mapping data model verification tests. */
  runMappingModelTests: () => Promise<MappingModelTestResult>;

  /** Runs the Consolidation-Readiness verification tests. */
  runConsolidationReadinessTests: () => Promise<{
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    results: Array<{ name: string; passed: boolean; message: string }>;
  }>;

  // ── Phase 5 Step 2: Auto-Suggestion Engine IPC ────────────────────────

  /** Seeds standard Schedule III / Accounting Standard FSLIs if not present. */
  seedStandardFSLIs: () => Promise<number>;

  /** Generates explainable mapping suggestions for a given financial year and optional unit/batch. */
  generateMappingSuggestions: (
    financialYearId: string,
    unitId?: string,
    importBatchId?: string,
  ) => Promise<GenerateSuggestionsResponse>;

  /** Saves suggested mappings into the database. */
  saveSuggestedMappings: (
    financialYearId: string,
    suggestions: SuggestionResultItem[],
  ) => Promise<{ savedCount: number; updatedCount: number }>;

  // ── Phase 5 Step 3: Mapping Workbench UI IPC ──────────────────────────

  /** Fetches all consolidated data needed for the Mapping Workbench UI. */
  getMappingWorkbenchData: (
    financialYearId?: string,
    unitId?: string,
    importBatchId?: string,
  ) => Promise<MappingWorkbenchData>;

  /** Bulk updates multiple ledger mappings in a single transaction. */
  bulkUpdateLedgerMappings: (
    financialYearId: string,
    updates: BulkUpdateMappingItem[],
  ) => Promise<{ updatedCount: number }>;

  /** Applies an FSLI mapping to all similar ledgers sharing group/keyword. Optionally scoped to a unit. */
  applyMappingToSimilar: (
    financialYearId: string,
    targetFSLIId: string,
    criteriaType: 'group' | 'keyword',
    criteriaValue: string,
    unitId?: string,
  ) => Promise<{ updatedCount: number }>;

  // ── Phase 5 Step 4: User Mapping Rules & Unmapped Tracker IPC ─────────

  /** Updates an existing mapping rule. */
  updateMappingRule: (
    ruleId: string,
    data: Partial<MappingRuleInput>,
  ) => Promise<MappingRuleRecord>;

  /** Toggles active status of a mapping rule. */
  toggleMappingRuleActive: (
    ruleId: string,
    active: boolean,
  ) => Promise<boolean>;

  /** Deletes a mapping rule. */
  deleteMappingRule: (ruleId: string) => Promise<boolean>;

  /** Lists all mapping rules (active and inactive). */
  listAllMappingRules: (scope?: {
    clientId?: string;
    entityId?: string;
  }) => Promise<MappingRuleRecord[]>;

  /** Fetches tracker data with materiality analysis and pre-reporting validation. */
  getUnmappedTrackerData: (
    financialYearId?: string,
    materialityThreshold?: number,
  ) => Promise<UnmappedTrackerData>;

  // ── Phase 6: Classification Engine IPC ──────────────────────────────

  /** Fetches classification data scoped by financial year, unit, and import batch. */
  getClassificationData: (
    financialYearId?: string,
    unitId?: string,
    importBatchId?: string,
  ) => Promise<ClassificationData>;

  /** Runs auto-classification for ledgers in the given scope. */
  autoClassifyLedgers: (
    financialYearId: string,
    unitId?: string,
    importBatchId?: string,
  ) => Promise<{ classifiedCount: number; skippedCount: number }>;

  /** Saves manual classification updates for one or more ledgers. */
  saveClassifications: (
    financialYearId: string,
    items: ClassificationUpdateItem[],
  ) => Promise<{ savedCount: number }>;

  /** Resets classification decisions for ledgers in the given scope. */
  resetClassifications: (
    financialYearId: string,
    unitId?: string,
    importBatchId?: string,
  ) => Promise<{ deletedCount: number }>;

  // ── Phase 7: Regrouping Engine IPC ──────────────────────────────────

  /** Fetches regrouping workbench data for a given financial year, optionally scoped by unit and import batch. */
  getRegroupingWorkbenchData: (
    financialYearId?: string,
    unitId?: string,
    importBatchId?: string,
  ) => Promise<RegroupingWorkbenchData>;

  /** Runs detection engine and generates regrouping suggestions for the specified scope. */
  generateRegroupingSuggestions: (
    financialYearId: string,
    unitId?: string,
    importBatchId?: string,
  ) => Promise<{ detectedCount: number; autoAppliedCount: number; needsReviewCount: number }>;

  /** Approves a regrouping proposal. */
  approveRegrouping: (id: string, approvedBy?: string) => Promise<RegroupingResultRecord>;

  /** Rejects a regrouping proposal. */
  rejectRegrouping: (id: string, rejectedBy?: string, reason?: string) => Promise<RegroupingResultRecord>;

  /** Changes the proposed FSLI/classification on a regrouping. */
  changeRegrouping: (
    id: string,
    newFSLIId: string,
    newClassification: string,
    reason: string,
    changedBy?: string,
  ) => Promise<RegroupingResultRecord>;

  /** Applies an approved regrouping (marks it Applied). */
  applyRegrouping: (id: string, appliedBy?: string) => Promise<RegroupingResultRecord>;

  /** Undoes a previously applied regrouping. */
  undoRegrouping: (id: string, undoneBy?: string, reason?: string) => Promise<RegroupingResultRecord>;

  /** Creates a new regrouping rule. */
  createRegroupingRule: (input: CreateRegroupingRuleInput) => Promise<RegroupingRuleRecord>;

  /** Lists all regrouping rules. */
  getRegroupingRules: () => Promise<RegroupingRuleRecord[]>;

  /** Toggles auto-apply on a regrouping rule. */
  toggleRegroupingRuleAutoApply: (ruleId: string, autoApply: boolean) => Promise<RegroupingRuleRecord>;

  /** Fetches audit history for a specific regrouping result. */
  getRegroupingAuditHistory: (regroupingId: string) => Promise<RegroupingAuditRecord[]>;

  // ── Phase 8: Adjustments Engine IPC ─────────────────────────────────

  /** Fetches workbench data for Phase 8 Adjustments (KPIs, adjustments list, FYs, units, FSLIs, Ledgers). */
  getAdjustmentsWorkbenchData: (
    financialYearId?: string,
    unitId?: string,
    typeFilter?: string,
    statusFilter?: string,
  ) => Promise<AdjustmentsWorkbenchData>;

  /** Creates a new Adjustment in Draft status with balanced lines. */
  createAdjustment: (input: CreateAdjustmentInput) => Promise<AdjustmentRecord>;

  /** Updates an existing Draft adjustment. */
  updateAdjustment: (id: string, input: UpdateAdjustmentInput) => Promise<AdjustmentRecord>;

  /** Deletes an adjustment (permitted ONLY for Draft adjustments). */
  deleteAdjustment: (id: string) => Promise<boolean>;

  /** Submits a Draft adjustment for review. */
  submitAdjustmentForReview: (id: string, submittedBy?: string) => Promise<AdjustmentRecord>;

  /** Approves a PendingReview adjustment. */
  approveAdjustment: (id: string, approvedBy?: string) => Promise<AdjustmentRecord>;

  /** Rejects a PendingReview adjustment with mandatory reason. */
  rejectAdjustment: (id: string, reason: string, rejectedBy?: string) => Promise<AdjustmentRecord>;

  /** Returns an Approved adjustment back to Draft with mandatory reason. */
  returnAdjustmentToDraft: (id: string, reason: string, returnedBy?: string) => Promise<AdjustmentRecord>;

  /** Applies an Approved adjustment into active adjusted numbers. */
  applyAdjustment: (id: string, appliedBy?: string) => Promise<AdjustmentRecord>;

  /** Reverses an Applied adjustment, creating a linked inverse entry. */
  reverseAdjustment: (
    id: string,
    reason: string,
    reversedBy?: string,
  ) => Promise<{ original: AdjustmentRecord; reversal: AdjustmentRecord }>;

  /** Fetches full audit history for an adjustment. */
  getAdjustmentAuditHistory: (adjustmentId: string) => Promise<AdjustmentAuditRecord[]>;

  /** Computes adjusted trial balance (Before Phase 7, Adjustment Phase 8, After Phase 8). */
  getAdjustedTrialBalance: (
    financialYearId?: string,
    unitId?: string,
  ) => Promise<AdjustedTrialBalanceData>;

  /** Runs Phase 8 automated verification tests. */
  runAdjustmentsTests: () => Promise<{
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    results: Array<{ name: string; passed: boolean; message: string }>;
  }>;

  // ── Phase 9: Consolidation & Interbranch Elimination IPC ─────────

  /** Fetches consolidation workbench data (FYs, units, runs, summaries). */
  getConsolidationWorkbenchData: (
    financialYearId?: string,
  ) => Promise<ConsolidationWorkbenchData>;

  /** Creates a new consolidation run with selected units. */
  createConsolidationRun: (input: CreateConsolidationRunInput) => Promise<ConsolidationRunRecord>;

  /** Runs internal balance detection for a consolidation run. */
  detectInternalBalances: (runId: string) => Promise<{
    detectedCount: number;
    matchedCount: number;
    needsReviewCount: number;
    unmatchedCount: number;
  }>;

  /** Gets unit-level adjusted trial balance (read-only, Phase 7+8 data). */
  getUnitAdjustedTrialBalance: (
    financialYearId: string,
    unitId: string,
  ) => Promise<AdjustedTrialBalanceData>;

  /** Gets consolidated trial balance across selected units with eliminations. */
  getConsolidatedTrialBalance: (
    runId: string,
  ) => Promise<ConsolidatedTrialBalanceData>;

  /** Gets consolidated balance sheet preview with unmapped detection & reconciliation. */
  getConsolidatedBalanceSheetPreview: (
    runId: string,
  ) => Promise<ConsolidatedBalanceSheetPreviewData>;

  /** Creates a manual consolidation elimination entry. */
  createConsolidationElimination: (input: CreateEliminationInput) => Promise<ConsolidationEliminationRecord>;

  /** Updates a Draft elimination. */
  updateConsolidationElimination: (id: string, input: UpdateEliminationInput) => Promise<ConsolidationEliminationRecord>;

  /** Deletes a Draft elimination. */
  deleteConsolidationElimination: (id: string) => Promise<boolean>;

  /** Submits a Draft elimination for review. */
  submitEliminationForReview: (id: string, submittedBy?: string) => Promise<ConsolidationEliminationRecord>;

  /** Approves a PendingReview elimination. */
  approveElimination: (id: string, approvedBy?: string) => Promise<ConsolidationEliminationRecord>;

  /** Rejects a PendingReview elimination with reason. */
  rejectElimination: (id: string, reason: string, rejectedBy?: string) => Promise<ConsolidationEliminationRecord>;

  /** Applies an Approved elimination (immutable after this). */
  applyElimination: (id: string, appliedBy?: string) => Promise<ConsolidationEliminationRecord>;

  /** Reverses an Applied elimination (creates linked inverse). */
  reverseElimination: (
    id: string,
    reason: string,
    reversedBy?: string,
  ) => Promise<{ original: ConsolidationEliminationRecord; reversal: ConsolidationEliminationRecord }>;

  /** Completes a consolidation run. */
  completeConsolidationRun: (runId: string, completedBy?: string) => Promise<ConsolidationRunRecord>;

  /** Cancels a consolidation run. */
  cancelConsolidationRun: (runId: string, cancelledBy?: string) => Promise<ConsolidationRunRecord>;

  /** Fetches elimination review data for interbranch review screen. */
  getEliminationReviewData: (runId: string) => Promise<EliminationReviewData>;

  /** Fetches consolidation audit log history. */
  getConsolidationAuditHistory: (runId?: string, eliminationId?: string) => Promise<ConsolidationAuditRecord[]>;

  /** Runs Phase 9 automated verification tests. */
  runConsolidationTests: () => Promise<{
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    results: Array<{ name: string; passed: boolean; message: string }>;
  }>;

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
  ) => Promise<ReportingHierarchyEngineResult>;

  /** Fetches end-to-end provenance trace for a ledger. */
  getLedgerProvenance: (
    financialYearId: string,
    ledgerId: string,
  ) => Promise<LedgerProvenanceTrace | null>;

  /** Saves a controlled ledger-to-reporting-node override. */
  saveLedgerReportingOverride: (
    ledgerId: string,
    financialYearId: string,
    reportingNodeId: string,
    reason?: string,
  ) => Promise<boolean>;

  /** Runs Phase 10 automated verification tests. */
  runReportingHierarchyTests: () => Promise<{
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    results: Array<{ name: string; passed: boolean; message: string }>;
  }>;

  // ── Phase 11: Notes & Schedules Engine IPC ─────────────────

  /** Fetches complete Phase 11 Notes & Schedules dataset (Notes 4-33). */
  getNotesData: (
    financialYearId: string,
    options?: {
      scope?: 'UNIT' | 'CONSOLIDATED';
      unitId?: string;
      consolidationRunId?: string;
    },
  ) => Promise<NotesDatasetResult>;

  /** Fetches ledger drill-down for a specific note line. */
  getNoteDrillDown: (
    financialYearId: string,
    noteNumber: number,
    lineId: string,
  ) => Promise<NoteDrillDownResult>;

  // ── Phase 12: Financial Statement Engine IPC ───────────────

  /** Fetches complete Phase 12 Financial Statements dataset (BS & IE). */
  getFinancialStatementsData: (
    financialYearId: string,
    options?: {
      scope?: 'ENTITY' | 'UNIT' | 'CONSOLIDATED';
      unitId?: string;
      consolidationRunId?: string;
      previousFinancialYearId?: string;
    },
  ) => Promise<FinancialStatementsData>;

  /** Fetches statement-to-ledger drill-down for a specific statement line. */
  getStatementDrillDown: (
    financialYearId: string,
    statementLineId: string,
    options?: {
      scope?: 'ENTITY' | 'UNIT' | 'CONSOLIDATED';
      unitId?: string;
      consolidationRunId?: string;
    },
  ) => Promise<StatementDrillDownResult>;

  /** Runs Phase 12 automated verification tests. */
  runFinancialStatementTests: () => Promise<{
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    results: Array<{ name: string; passed: boolean; message: string }>;
  }>;

  // ── Phase 13: Final Validation Engine IPC ──────────────────

  /** Runs comprehensive Phase 13 Final Validation across all pipeline phases. */
  runFinalValidation: (
    financialYearId: string,
    options?: {
      scope?: 'ENTITY' | 'UNIT' | 'CONSOLIDATED';
      unitId?: string;
      consolidationRunId?: string;
      importBatchId?: string;
      previousFinancialYearId?: string;
    },
  ) => Promise<FinalValidationDataset>;

  /** Runs Phase 13 automated verification tests. */
  runFinalValidationTests: () => Promise<{
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    results: Array<{ name: string; passed: boolean; message: string }>;
  }>;

  /** Exports Phase 13 Validation Report as CSV/text dataset. */
  exportFinalValidationReport: (
    financialYearId: string,
    options?: {
      scope?: 'ENTITY' | 'UNIT' | 'CONSOLIDATED';
      unitId?: string;
      consolidationRunId?: string;
    },
  ) => Promise<{ success: boolean; filePath?: string; error?: string; content?: string }>;
}

// ── Phase 7: Regrouping Engine Types ──────────────────────────────────────────

/** Controlled values for regrouping status. */
export type RegroupingStatus =
  | 'Detected'
  | 'NeedsReview'
  | 'Approved'
  | 'Rejected'
  | 'Applied'
  | 'AutoApplied'
  | 'Undone'
  | 'Obsolete';

/** A single regrouping result record. */
export interface RegroupingResultRecord {
  id: string;
  ledgerId: string;
  unitId: string;
  entityId: string;
  financialYearId: string;
  beforeClassification: string | null;
  beforeFSLIId: string | null;
  beforeFSLIName: string | null;
  proposedClassification: string | null;
  proposedFSLIId: string | null;
  proposedFSLIName: string | null;
  approvedClassification: string | null;
  approvedFSLIId: string | null;
  approvedFSLIName: string | null;
  balanceDebit: number;
  balanceCredit: number;
  balanceNet: number;
  balanceNature: 'Debit' | 'Credit' | 'Zero';
  tallyGroupName: string | null;
  ledgerName: string;
  reason: string | null;
  ruleId: string | null;
  ruleName: string | null;
  confidence: number;
  detectionConfidence: number;
  recommendationConfidence: number;
  status: RegroupingStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  appliedBy: string | null;
  appliedAt: string | null;
  undoneBy: string | null;
  undoneAt: string | null;
  undoReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A regrouping rule record. */
export interface RegroupingRuleRecord {
  id: string;
  ruleName: string;
  description: string | null;
  conditions: string;
  targetFSLIId: string | null;
  targetClassification: string | null;
  confidence: number;
  autoApply: boolean;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Input for creating a regrouping rule. */
export interface CreateRegroupingRuleInput {
  ruleName: string;
  description?: string;
  conditions: {
    type?: string;
    rules: Array<{ field: string; operator: string; value: string }>;
  };
  targetFSLIId?: string;
  targetClassification?: string;
  confidence?: number;
  autoApply?: boolean;
  createdBy?: string;
}

/** A regrouping audit trail record. */
export interface RegroupingAuditRecord {
  id: string;
  regroupingResultId: string;
  action: string;
  beforeStatus: string | null;
  afterStatus: string | null;
  beforeFSLIId: string | null;
  afterFSLIId: string | null;
  beforeClassification: string | null;
  afterClassification: string | null;
  reason: string | null;
  performedBy: string | null;
  performedAt: string;
}

/** Row for the Regrouping Workbench display. */
export interface RegroupingWorkbenchRow {
  id: string;
  ledgerId: string;
  ledgerName: string;
  unitId: string;
  unitName: string | null;
  tallyGroupName: string | null;
  balanceDebit: number;
  balanceCredit: number;
  balanceNet: number;
  balanceNature: 'Debit' | 'Credit' | 'Zero';
  originalTallyClassification: string | null;
  applicationClassification: string | null;
  beforeClassification?: string | null;
  beforeFSLIId: string | null;
  beforeFSLIName: string | null;
  proposedClassification: string | null;
  proposedFSLIId: string | null;
  proposedFSLIName: string | null;
  approvedClassification: string | null;
  approvedFSLIId: string | null;
  approvedFSLIName: string | null;
  reason: string | null;
  ruleName: string | null;
  confidence: number;
  detectionConfidence: number;
  recommendationConfidence: number;
  status: RegroupingStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  appliedBy: string | null;
  appliedAt: string | null;
  createdAt: string;
}

/** Summary KPIs for the Regrouping Workbench. */
export interface RegroupingWorkbenchSummary {
  totalCandidates: number;
  detectedCount: number;
  needsReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
  appliedCount: number;
  autoAppliedCount: number;
  undoneCount: number;
  obsoleteCount: number;
}

/** Complete state data returned for the Regrouping Workbench view. */
export interface RegroupingWorkbenchData {
  financialYears: { id: string; yearLabel: string; hasData: boolean }[];
  activeFinancialYearId: string;
  activeFinancialYearLabel: string;
  units: Array<{ id: string; unitName: string }>;
  activeUnitId?: string | null;
  importBatches: Array<{
    id: string;
    unitId: string;
    financialYearId: string;
    fileName: string;
    importTimestamp: string;
    ledgerCount: number;
  }>;
  activeImportBatchId?: string | null;
  fslis: FSLIRecord[];
  rules: RegroupingRuleRecord[];
  summary: RegroupingWorkbenchSummary;
  rows: RegroupingWorkbenchRow[];
}
// ── Phase 5 Step 4: Unmapped Tracker Types ────────────────────────────────────

export interface UnmappedTrackerRow {
  ledgerId: string;
  ledgerName: string;
  unitId: string | null;
  unitName: string | null;
  tallyGroupId: string | null;
  tallyGroupName: string | null;
  parentGroupName: string | null;
  debit: number;
  credit: number;
  netBalance: number;
  balanceNature: 'Debit' | 'Credit' | 'Zero';
  isMaterial: boolean;
  status: MappingStatus;
  mappedFSLIId: string | null;
  mappedFSLIName: string | null;
  mappedFSLICode: string | null;
  suggestedFSLIId: string | null;
  suggestedFSLIName: string | null;
  confidenceScore: number;
  mappingSource: MappingSource;
  isManualOverride: boolean;
  reason: string;
}

export interface UnmappedTrackerSummary {
  totalLedgers: number;
  mappedCount: number;
  suggestedCount: number;
  needsReviewCount: number;
  unmappedCount: number;
  rejectedCount: number;
  totalGrossBalance: number;
  materialityThreshold: number;
  materialLedgersCount: number;
  unmappedMaterialCount: number;
  unmappedMaterialAmount: number;
  isReadyForReporting: boolean;
  blockingReason: string | null;
}

export interface UnmappedTrackerData {
  financialYears: { id: string; yearLabel: string }[];
  activeFinancialYearId: string;
  activeFinancialYearLabel: string;
  units: { id: string; unitName: string }[];
  tallyGroups: string[];
  fslis: FSLIRecord[];
  summary: UnmappedTrackerSummary;
  rows: UnmappedTrackerRow[];
}

// ── Phase 6: Classification Engine Types ──────────────────────────────────────

/** Controlled values for classification source. */
export type ClassificationSource = 'AUTO' | 'MANUAL' | 'RULE' | 'MAPPING' | 'PENDING';

/** Controlled values for classification status. */
export type ClassificationStatus = 'Classified' | 'Unclassified' | 'NeedsReview' | 'ManualOverride';

/** A single row in the Classification Engine view. */
export interface ClassificationRow {
  ledgerId: string;
  ledgerName: string;
  unitId: string;
  unitName: string;
  tallyGroupName: string | null;
  parentGroupName: string | null;
  netBalance: number;
  balanceNature: 'Debit' | 'Credit' | 'Zero';
  originalTallyClassification: string | null;
  applicationClassification: string | null;
  childFSLIId: string | null;
  childFSLIName: string | null;
  parentFSLIId: string | null;
  parentFSLIName: string | null;
  finalFSLIId: string | null;
  finalFSLIName: string | null;
  classificationSource: ClassificationSource;
  confidenceScore: number;
  reason: string | null;
  status: ClassificationStatus;
  isManualOverride: boolean;
  classificationId: string | null;
  // From Phase 5 mapping
  mappedFSLIId: string | null;
  mappedFSLIName: string | null;
  mappingStatus: MappingStatus | null;
}

/** Summary KPIs for the Classification Engine. */
export interface ClassificationSummary {
  totalLedgers: number;
  classifiedCount: number;
  unclassifiedCount: number;
  needsReviewCount: number;
  manualOverrideCount: number;
  autoClassifiedCount: number;
}

/** Complete state data returned for the Classification Engine view. */
export interface ClassificationData {
  financialYears: { id: string; yearLabel: string; hasData: boolean }[];
  activeFinancialYearId: string;
  activeFinancialYearLabel: string;
  units: Array<{ id: string; unitName: string }>;
  activeUnitId?: string | null;
  importBatches: Array<{
    id: string;
    unitId: string;
    financialYearId: string;
    fileName: string;
    importTimestamp: string;
    ledgerCount: number;
  }>;
  activeImportBatchId?: string | null;
  fslis: FSLIRecord[];
  summary: ClassificationSummary;
  rows: ClassificationRow[];
}

/** Item for updating a single classification. */
export interface ClassificationUpdateItem {
  ledgerId: string;
  applicationClassification?: string;
  childFSLIId?: string | null;
  parentFSLIId?: string | null;
  finalFSLIId?: string | null;
  classificationSource?: ClassificationSource;
  confidenceScore?: number;
  reason?: string;
  isManualOverride?: boolean;
  status?: ClassificationStatus;
}

// ── Phase 8: Adjustments Engine Types ─────────────────────────────────────────

export type AdjustmentType =
  | 'Accrued Expense'
  | 'Outstanding Expense'
  | 'Prepaid Expense'
  | 'Provision'
  | 'Depreciation'
  | 'Income Accrual'
  | 'Closing Stock'
  | 'Other Adjustment'
  | (string & {});

export type AdjustmentStatus =
  | 'Draft'
  | 'PendingReview'
  | 'Approved'
  | 'Applied'
  | 'Rejected'
  | 'Reversed';

export interface AdjustmentLineRecord {
  id: string;
  adjustmentId: string;
  lineNumber: number;
  ledgerId: string | null;
  ledgerName: string;
  fsliId: string;
  fsliName: string;
  fsliCode?: string | null;
  fsliCategory?: string | null;
  debit: number;
  credit: number;
  description?: string | null;
}

export interface AdjustmentRecord {
  id: string;
  adjustmentNumber: string;
  entityId: string;
  unitId: string;
  unitName?: string | null;
  financialYearId: string;
  financialYearLabel?: string | null;
  isCY: boolean;
  adjustmentDate: string;
  adjustmentType: AdjustmentType;
  narration: string;
  status: AdjustmentStatus;
  totalDebit: number;
  totalCredit: number;
  isClosingStock: boolean;
  closingStockValue?: number | null;
  reversalOfId?: string | null;
  reversalOfNumber?: string | null;
  reversedById?: string | null;
  reversedByNumber?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  submittedBy?: string | null;
  submittedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  appliedBy?: string | null;
  appliedAt?: string | null;
  reversedBy?: string | null;
  reversedAt?: string | null;
  reversalReason?: string | null;
  lines: AdjustmentLineRecord[];
}

export interface CreateAdjustmentLineInput {
  ledgerId?: string | null;
  ledgerName: string;
  fsliId: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface CreateAdjustmentInput {
  unitId: string;
  financialYearId: string;
  adjustmentDate: string;
  adjustmentType: AdjustmentType;
  narration: string;
  isClosingStock?: boolean;
  closingStockValue?: number;
  lines: CreateAdjustmentLineInput[];
  createdBy?: string;
}

export interface UpdateAdjustmentInput {
  unitId?: string;
  financialYearId?: string;
  adjustmentDate?: string;
  adjustmentType?: AdjustmentType;
  narration?: string;
  isClosingStock?: boolean;
  closingStockValue?: number;
  lines?: CreateAdjustmentLineInput[];
  updatedBy?: string;
}

export interface AdjustmentAuditRecord {
  id: string;
  adjustmentId: string;
  adjustmentNumber?: string;
  action: 'Created' | 'Edited' | 'Submitted' | 'Approved' | 'Rejected' | 'ReturnedToDraft' | 'Applied' | 'Reversed' | 'Deleted';
  beforeStatus?: string | null;
  afterStatus?: string | null;
  details?: string | null;
  reason?: string | null;
  performedBy?: string | null;
  performedAt: string;
}

export interface AdjustmentsWorkbenchSummary {
  totalAdjustments: number;
  draftCount: number;
  pendingReviewCount: number;
  approvedCount: number;
  appliedCount: number;
  rejectedCount: number;
  reversedCount: number;
  totalDebitApplied: number;
  totalCreditApplied: number;
}

export interface AdjustmentsWorkbenchData {
  financialYears: { id: string; yearLabel: string; hasData: boolean }[];
  activeFinancialYearId: string;
  activeFinancialYearLabel: string;
  units: Array<{ id: string; unitName: string }>;
  fslis: FSLIRecord[];
  availableLedgers: Array<{ id: string; ledgerName: string; unitId: string; tallyGroupName?: string | null }>;
  summary: AdjustmentsWorkbenchSummary;
  adjustments: AdjustmentRecord[];
}

export interface AdjustedTrialBalanceRow {
  fsliId: string;
  fsliCode: string | null;
  fsliName: string;
  category: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  subCategory: string | null;
  displayOrder: number;
  // Phase 7 Base Balances
  baseDebit: number;
  baseCredit: number;
  baseNet: number;
  // Phase 8 Applied Adjustments
  adjustmentDebit: number;
  adjustmentCredit: number;
  adjustmentNet: number;
  // Phase 8 Final Adjusted Balances
  adjustedDebit: number;
  adjustedCredit: number;
  adjustedNet: number;
}

export interface AdjustedTrialBalanceData {
  financialYearId: string;
  financialYearLabel: string;
  unitId: string | null;
  unitName: string | null;
  totalBaseDebit: number;
  totalBaseCredit: number;
  totalAdjDebit: number;
  totalAdjCredit: number;
  totalAdjustedDebit: number;
  totalAdjustedCredit: number;
  rows: AdjustedTrialBalanceRow[];
  categoryTotals: Array<{
    category: string;
    baseDebit: number;
    baseCredit: number;
    baseNet: number;
    adjustmentDebit: number;
    adjustmentCredit: number;
    adjustmentNet: number;
    adjustedDebit: number;
    adjustedCredit: number;
    adjustedNet: number;
  }>;
}

// ── Phase 9: Consolidation & Interbranch Elimination Types ────────────────────

export type ConsolidationRunStatus = 'Draft' | 'InProgress' | 'Completed' | 'Cancelled';

export type EliminationMatchStatus =
  | 'Matched'
  | 'PartiallyMatched'
  | 'Unmatched'
  | 'NeedsReview'
  | 'Approved'
  | 'Applied'
  | 'Rejected'
  | 'Reversed';

export type EliminationStatus =
  | 'Draft'
  | 'PendingReview'
  | 'Approved'
  | 'Applied'
  | 'Rejected'
  | 'Reversed';

export type InternalAccountType =
  | 'Branch/Division'
  | 'Santhigiri Ashram HO'
  | 'Other Internal';

export interface ConsolidationRunRecord {
  id: string;
  entityId: string;
  financialYearId: string;
  financialYearLabel?: string;
  runNumber: string;
  status: ConsolidationRunStatus;
  selectedUnitIds: string[];
  selectedUnitNames?: string[];
  totalUnits: number;
  consolidatedDebit: number;
  consolidatedCredit: number;
  internalDebit: number;
  internalCredit: number;
  internalDifference: number;
  finalDebit: number;
  finalCredit: number;
  finalDifference: number;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface ConsolidationEliminationLineRecord {
  id: string;
  eliminationId: string;
  lineNumber: number;
  unitId: string;
  unitName?: string;
  ledgerId?: string | null;
  ledgerName: string;
  fsliId?: string | null;
  fsliName?: string | null;
  debit: number;
  credit: number;
  description?: string | null;
}

export interface ConsolidationEliminationRecord {
  id: string;
  consolidationRunId: string;
  eliminationNumber: string;
  entityId: string;
  financialYearId: string;
  sourceUnitId: string;
  sourceUnitName?: string;
  counterpartyUnitId?: string | null;
  counterpartyUnitName?: string | null;
  sourceLedgerId?: string | null;
  sourceLedgerName: string;
  counterpartyLedgerId?: string | null;
  counterpartyLedgerName?: string | null;
  internalAccountType: InternalAccountType;
  fsliId?: string | null;
  fsliName?: string | null;
  debitAmount: number;
  creditAmount: number;
  eliminatedAmount: number;
  unmatchedAmount: number;
  matchingBasis?: string | null;
  confidence: number;
  matchStatus: EliminationMatchStatus;
  reason?: string | null;
  status: EliminationStatus;
  reversalOfId?: string | null;
  reversedById?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  submittedBy?: string | null;
  submittedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  appliedBy?: string | null;
  appliedAt?: string | null;
  reversedBy?: string | null;
  reversedAt?: string | null;
  reversalReason?: string | null;
  lines: ConsolidationEliminationLineRecord[];
}

export interface ConsolidationAuditRecord {
  id: string;
  consolidationRunId?: string | null;
  eliminationId?: string | null;
  action: string;
  beforeStatus?: string | null;
  afterStatus?: string | null;
  details?: string | null;
  reason?: string | null;
  performedBy?: string | null;
  performedAt: string;
}

export interface UnitPreConsolidationSummary {
  unitId: string;
  unitName: string;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  ledgerCount: number;
  appliedAdjustmentsCount: number;
  branchDivisionDebit: number;
  branchDivisionCredit: number;
  santhigiriHODebit: number;
  santhigiriHOCredit: number;
  internalDifference: number;
}

export interface ConsolidationWorkbenchSummary {
  totalRuns: number;
  draftCount: number;
  inProgressCount: number;
  completedCount: number;
  cancelledCount: number;
}

export interface ConsolidationWorkbenchData {
  financialYears: { id: string; yearLabel: string; hasData: boolean }[];
  activeFinancialYearId: string;
  activeFinancialYearLabel: string;
  units: Array<{ id: string; unitName: string; hasData: boolean }>;
  unitSummaries: UnitPreConsolidationSummary[];
  summary: ConsolidationWorkbenchSummary;
  runs: ConsolidationRunRecord[];
}

export interface CreateConsolidationRunInput {
  financialYearId: string;
  selectedUnitIds: string[];
  createdBy?: string;
}

export interface CreateEliminationInput {
  consolidationRunId: string;
  sourceUnitId: string;
  counterpartyUnitId?: string;
  sourceLedgerId?: string;
  sourceLedgerName: string;
  counterpartyLedgerId?: string;
  counterpartyLedgerName?: string;
  internalAccountType: InternalAccountType;
  fsliId?: string;
  debitAmount: number;
  creditAmount: number;
  eliminatedAmount: number;
  unmatchedAmount: number;
  matchingBasis?: string;
  confidence?: number;
  matchStatus?: EliminationMatchStatus;
  reason?: string;
  lines?: Array<{
    unitId: string;
    ledgerId?: string;
    ledgerName: string;
    fsliId?: string;
    debit: number;
    credit: number;
    description?: string;
  }>;
  createdBy?: string;
}

export interface UpdateEliminationInput {
  sourceUnitId?: string;
  counterpartyUnitId?: string;
  sourceLedgerName?: string;
  counterpartyLedgerName?: string;
  internalAccountType?: InternalAccountType;
  fsliId?: string;
  debitAmount?: number;
  creditAmount?: number;
  eliminatedAmount?: number;
  unmatchedAmount?: number;
  matchingBasis?: string;
  confidence?: number;
  matchStatus?: EliminationMatchStatus;
  reason?: string;
  lines?: Array<{
    unitId: string;
    ledgerId?: string;
    ledgerName: string;
    fsliId?: string;
    debit: number;
    credit: number;
    description?: string;
  }>;
}

export interface ConsolidatedTrialBalanceRow {
  fsliId: string;
  fsliCode: string | null;
  fsliName: string;
  category: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense' | 'Unmapped';
  subCategory: string | null;
  displayOrder: number;
  beforeEliminationDebit: number;
  beforeEliminationCredit: number;
  beforeEliminationNet: number;
  eliminationDebit: number;
  eliminationCredit: number;
  eliminationNet: number;
  afterEliminationDebit: number;
  afterEliminationCredit: number;
  afterEliminationNet: number;
}

export interface InternalControlSummary {
  branchDivisionDebit: number;
  branchDivisionCredit: number;
  branchDivisionEliminatedAmount: number;
  branchDivisionRemainingDebit: number;
  branchDivisionRemainingCredit: number;
  branchDivisionReconciled: boolean;
  branchDivisionConsolidatedDebit?: number;
  branchDivisionConsolidatedCredit?: number;
  branchDivisionConsolidatedNet?: number;
  santhigiriHODebit: number;
  santhigiriHOCredit: number;
  otherInternalDebit: number;
  otherInternalCredit: number;
  totalInternalDebit: number;
  totalInternalCredit: number;
  eliminationAmount: number;
  unmatchedDifference: number;
}

export interface UnmatchedItem {
  unitId: string;
  unitName: string;
  ledgerId?: string | null;
  ledgerName: string;
  internalAccountType: InternalAccountType;
  debitAmount: number;
  creditAmount: number;
  matchedAmount: number;
  unmatchedAmount: number;
  matchStatus: EliminationMatchStatus;
}

export interface ConsolidatedTrialBalanceData {
  consolidationRunId: string;
  financialYearId: string;
  financialYearLabel: string;
  selectedUnitCount: number;
  selectedUnitNames: string[];
  totalBeforeDebit: number;
  totalBeforeCredit: number;
  totalEliminationDebit: number;
  totalEliminationCredit: number;
  totalAfterDebit: number;
  totalAfterCredit: number;
  finalDifference: number;
  internalControl: InternalControlSummary;
  unmatchedItems: UnmatchedItem[];
  rows: ConsolidatedTrialBalanceRow[];
  categoryTotals: Array<{
    category: string;
    beforeDebit: number;
    beforeCredit: number;
    beforeNet: number;
    eliminationDebit: number;
    eliminationCredit: number;
    eliminationNet: number;
    afterDebit: number;
    afterCredit: number;
    afterNet: number;
  }>;
}

export interface ConsolidatedBalanceSheetRow {
  fsliId: string;
  fsliCode: string | null;
  fsliName: string;
  category: 'Asset' | 'Liability' | 'Equity';
  subCategory: string | null;
  displayOrder: number;
  beforeEliminationDebit: number;
  beforeEliminationCredit: number;
  beforeEliminationNet: number;
  eliminationDebit: number;
  eliminationCredit: number;
  eliminationNet: number;
  afterEliminationDebit: number;
  afterEliminationCredit: number;
  afterEliminationNet: number;
  amount: number;
}

export interface ConsolidatedBalanceSheetReconciliation {
  totalTrialBalanceDebit: number;
  totalTrialBalanceCredit: number;
  totalEliminations: number;
  mappedAssetsTotal: number;
  mappedEquityLiabilitiesTotal: number;
  unmappedDebit: number;
  unmappedCredit: number;
  unmappedNet: number;
  plDebit: number;
  plCredit: number;
  plNet: number;
  reconciliationDifference: number;
  isReconciled: boolean;
}

export interface ConsolidatedBalanceSheetPreviewData {
  consolidationRunId: string;
  financialYearId: string;
  financialYearLabel: string;
  isComplete: boolean;
  hasUnmappedBalances: boolean;
  unmappedDebit: number;
  unmappedCredit: number;
  unmappedNet: number;
  warningMessage: string | null;
  assetRows: ConsolidatedBalanceSheetRow[];
  equityLiabilityRows: ConsolidatedBalanceSheetRow[];
  totalAssetsBeforeElimination: number;
  totalAssetsElimination: number;
  totalAssetsConsolidated: number;
  totalEquityLiabilitiesBeforeElimination: number;
  totalEquityLiabilitiesElimination: number;
  totalEquityLiabilitiesConsolidated: number;
  reconciliation: ConsolidatedBalanceSheetReconciliation;
}

export interface EliminationReviewRow {
  eliminationId: string;
  eliminationNumber: string;
  sourceUnitId: string;
  sourceUnitName: string;
  counterpartyUnitId?: string | null;
  counterpartyUnitName?: string | null;
  sourceLedgerName: string;
  counterpartyLedgerName?: string | null;
  internalAccountType: InternalAccountType;
  debitAmount: number;
  creditAmount: number;
  proposedElimination: number;
  unmatchedDifference: number;
  matchStatus: EliminationMatchStatus;
  confidence: number;
  reason?: string | null;
  status: EliminationStatus;
}

export interface EliminationReviewSummary {
  totalDetected: number;
  matchedCount: number;
  partiallyMatchedCount: number;
  unmatchedCount: number;
  needsReviewCount: number;
  approvedCount: number;
  appliedCount: number;
  rejectedCount: number;
  reversedCount: number;
  totalInternalDebit: number;
  totalInternalCredit: number;
  internalDifference: number;
  totalProposedElimination: number;
  totalUnmatchedAmount: number;
}

export interface EliminationReviewData {
  consolidationRunId: string;
  financialYearLabel: string;
  summary: EliminationReviewSummary;
  rows: EliminationReviewRow[];
}

// ── Phase 10: FSLI & Reporting Hierarchy Engine Types ─────────────────────────

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

export interface NodeLedgerContribution {
  ledgerId: string;
  ledgerName: string;
  unitId: string;
  unitName: string;
  fsliId: string | null;
  fsliCode?: string;
  debit: number;
  credit: number;
  net: number;
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
  ledgerDetails?: NodeLedgerContribution[];
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

export interface ScheduleDiagnosticNotice {
  scheduleCode: string;
  scheduleNumber: number;
  type: 'INCOMPLETE_INPUT' | 'MISSING_DEPENDENCY' | 'UNBALANCED_MOVEMENT' | 'RECONCILIATION_WARNING';
  message: string;
  missingField?: string;
  nodeCode?: string;
  impact: string;
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
  calculatedSchedules: any;
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

// ── Phase 11: Notes & Schedules Types ────────────────────────────────────────

export type NoteCalculationMethod =
  | 'NODE_BALANCE'
  | 'CORPUS'
  | 'RESERVE_SURPLUS'
  | 'TANGIBLE_ASSETS'
  | 'CWIP'
  | 'LIVE_STOCK'
  | 'LOANS_ADVANCES'
  | 'STOCK_MOVEMENT'
  | 'MATERIAL_CONSUMPTION'
  | 'TRADING_COGS';

export type NoteLineType = 'HEADER' | 'LINE_ITEM' | 'SUBTOTAL' | 'TOTAL' | 'DEDUCTION';
export type NoteItemStatus = 'AVAILABLE' | 'SOURCE_MISSING' | 'CALCULATED' | 'PY_UNAVAILABLE' | 'NOT_APPLICABLE';

export interface GeneratedNoteLineItem {
  lineId: string;
  lineLabel: string;
  lineType: NoteLineType;
  depth: number;
  displayOrder: number;
  cyAmount: number | null;
  pyAmount: number | null;
  cyStatus: NoteItemStatus;
  pyStatus: NoteItemStatus;
  sourceNodeCodes: string[];
  footnote?: string;
  ledgerCount?: number;
  openingBalance?: number;
  additions?: number;
  deductions?: number;
  adjustments?: number;
  disposals?: number;
  grantSubsidy?: number;
  closingBalance?: number;
  depreciation?: number;
  pyOpeningBalance?: number | null;
  pyAdditions?: number | null;
  pyDeductions?: number | null;
  pyAdjustments?: number | null;
  pyClosingBalance?: number | null;
  pyNetAsset?: number | null;
}

export interface NoteLineReconciliation {
  noteNumber: number;
  scheduleCode: string;
  statementCode: 'BS' | 'IE';
  statementLineTitle: string;
  statementAmountCY: number;
  statementAmountPY: number;
  noteAmountCY: number;
  noteAmountPY: number;
  differenceCY: number;
  differencePY: number;
  isReconciledCY: boolean;
  isReconciledPY: boolean;
}

export interface GeneratedNote {
  noteNumber: number;
  title: string;
  scheduleCode: string;
  statementCode: 'BS' | 'IE';
  calculationMethod: NoteCalculationMethod;
  calculatorKey?: string;
  displayOrder: number;
  lines: GeneratedNoteLineItem[];
  cyTotal: number | null;
  pyTotal: number | null;
  cyTotalStatus: NoteItemStatus;
  pyTotalStatus: NoteItemStatus;
  footnotes: string[];
  hasData: boolean;
  reconciliation: NoteLineReconciliation | null;
}

export interface NotesDatasetResult {
  financialYearId: string;
  financialYearLabel: string;
  scope: 'ENTITY' | 'UNIT' | 'CONSOLIDATED';
  unitId?: string;
  unitName?: string;
  consolidationRunId?: string;
  totalNotes: number;
  balanceSheetNotesCount: number;
  incomeExpenditureNotesCount: number;
  allReconciled: boolean;
  unreconciledCount: number;
  notes: GeneratedNote[];
  generatedAt: string;
}

export interface NoteDrillDownLedger {
  ledgerId: string;
  ledgerName: string;
  unitId: string;
  unitName: string;
  nodeCode: string;
  nodeName: string;
  fsliCode?: string;
  cyDebit: number;
  cyCredit: number;
  cyNet: number;
}

export interface NoteDrillDownResult {
  noteNumber: number;
  noteTitle: string;
  lineId: string;
  lineLabel: string;
  sourceNodeCodes: string[];
  totalCYNet: number;
  ledgerCount: number;
  ledgers: NoteDrillDownLedger[];
}

// ── Phase 12: Financial Statement Engine Types ───────────────────────────────

export type FinancialStatementStatus =
  | 'COMPLETE'
  | 'INCOMPLETE_INPUT'
  | 'SOURCE_MISSING'
  | 'MAPPING_UNRESOLVED'
  | 'PY_UNAVAILABLE'
  | 'RECONCILIATION_FAILED'
  | 'BALANCE_SHEET_IMBALANCE';

export interface GeneratedStatementLine {
  statementLineId: string;
  statementCode: 'BS' | 'IE';
  section: 'LIABILITIES' | 'ASSETS' | 'INCOME' | 'EXPENSES' | 'RESULT';
  subSection?: string;
  lineIndex?: string;
  lineLabel: string;
  lineType: 'SECTION_HEADER' | 'SUBSECTION_HEADER' | 'GROUP_HEADER' | 'LINE_ITEM' | 'SUBTOTAL' | 'TOTAL';
  sourceType: 'NOTE' | 'NOTE_PORTION' | 'REPORTING_NODE' | 'FSLI' | 'CALCULATED' | 'SUBTOTAL' | 'TOTAL' | 'HEADER';
  sourceNoteNumber?: number;
  sourceScheduleCode?: string;
  noteReference?: string | number;
  depth: number;
  displayOrder: number;

  cyAmount: number | null;
  pyAmount: number | null;
  cyStatus: NoteItemStatus;
  pyStatus: NoteItemStatus;

  isSubtotal?: boolean;
  isTotal?: boolean;
  componentLineIds?: string[];
  ledgerCount?: number;
  footnote?: string;
}

export interface StatementSectionSummary {
  section: 'LIABILITIES' | 'ASSETS' | 'INCOME' | 'EXPENSES' | 'RESULT';
  sectionTitle: string;
  cyTotal: number;
  pyTotal: number | null;
  lines: GeneratedStatementLine[];
}

export interface BalanceSheetData {
  statementCode: 'BS';
  title: string;
  asAtDateCY: string;
  asAtDatePY: string;
  lines: GeneratedStatementLine[];
  sections: StatementSectionSummary[];

  totalLiabilitiesCY: number;
  totalLiabilitiesPY: number | null;
  totalAssetsCY: number;
  totalAssetsPY: number | null;

  differenceCY: number;
  differencePY: number | null;
  isBalancedCY: boolean;
  isBalancedPY: boolean;
  hasPY: boolean;
}

export interface IncomeExpenditureData {
  statementCode: 'IE';
  title: string;
  periodEndingCY: string;
  periodEndingPY: string;
  lines: GeneratedStatementLine[];
  sections: StatementSectionSummary[];

  totalRevenueCY: number;
  totalRevenuePY: number | null;
  totalExpensesCY: number;
  totalExpensesPY: number | null;

  netSurplusCY: number;
  netSurplusPY: number | null;
  hasPY: boolean;
}

export interface StatementNoteReconciliation {
  statementLineId: string;
  statementCode: 'BS' | 'IE';
  lineLabel: string;
  noteNumber: number;
  scheduleCode: string;
  noteTitle: string;

  statementAmountCY: number;
  statementAmountPY: number | null;
  noteAmountCY: number;
  noteAmountPY: number | null;

  differenceCY: number;
  differencePY: number | null;
  isReconciledCY: boolean;
  isReconciledPY: boolean;
  status: 'RECONCILED' | 'UNRECONCILED' | 'SOURCE_MISSING';
}

export interface FinancialStatementDiagnostic {
  code: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  statementCode?: 'BS' | 'IE';
  statementLineId?: string;
  noteNumber?: number;
  message: string;
  details?: string;
}

export interface FinancialStatementsData {
  financialYearId: string;
  financialYearLabel: string;
  previousFinancialYearId?: string;
  previousFinancialYearLabel?: string;
  scope: 'ENTITY' | 'UNIT' | 'CONSOLIDATED';
  unitId?: string;
  unitName?: string;
  consolidationRunId?: string;
  consolidationRunNumber?: string;

  balanceSheet: BalanceSheetData;
  incomeExpenditure: IncomeExpenditureData;
  reconciliations: StatementNoteReconciliation[];
  diagnostics: FinancialStatementDiagnostic[];
  status: FinancialStatementStatus;

  allReconciled: boolean;
  unreconciledCount: number;
  hasPY: boolean;
  generatedAt: string;
}

export interface StatementDrillDownResult {
  statementLineId: string;
  lineLabel: string;
  statementCode: 'BS' | 'IE';
  noteNumber?: number;
  noteTitle?: string;
  cyAmount: number | null;
  pyAmount: number | null;
  noteDrillDown?: NoteDrillDownResult | null;
  reportingNodeCodes: string[];
  ledgers: Array<{
    ledgerId: string;
    ledgerName: string;
    unitId: string;
    unitName: string;
    nodeCode: string;
    nodeName: string;
    fsliCode?: string;
    cyDebit: number;
    cyCredit: number;
    cyNet: number;
  }>;
}

// ── Phase 13: Final Validation Engine Types ─────────────────────────────────

export type ValidationSeverity = 'PASS' | 'WARNING' | 'ERROR';
export type OverallValidationStatus = 'PASS' | 'WARNING' | 'ERROR' | 'BLOCKED';

export type FinalValidationCategory =
  | 'Trial Balance'
  | 'Consolidation'
  | 'Branch / Division'
  | 'Mapping / FSLI'
  | 'Classification'
  | 'Capital / Profit'
  | 'PPE'
  | 'Notes / Schedules'
  | 'Balance Sheet'
  | 'Income & Expenditure'
  | 'CY / PY'
  | 'Double-Count Detection'
  | 'Data Completeness';

export interface FinalValidationLineage {
  statementLineId?: string;
  noteNumber?: number;
  nodeCode?: string;
  fsliCode?: string;
  ledgerId?: string;
  ledgerName?: string;
  unitId?: string;
}

export interface FinalValidationResult {
  validation_id: string;
  severity: ValidationSeverity;
  description: string;
  affected_module: string;
  affected_ledger?: string | null;
  amount?: number | null;
  resolution: string;

  status?: OverallValidationStatus;
  category: FinalValidationCategory;
  expected?: number | string | null;
  actual?: number | string | null;
  difference?: number | null;

  unitId?: string | null;
  unitName?: string | null;
  importBatchId?: string | null;
  financialYear?: string | null;
  source?: string | null;
  lineage?: FinalValidationLineage | null;
}

export interface FinalValidationSummary {
  totalChecks: number;
  passed: number;
  warnings: number;
  errors: number;
  blocked: number;
}

export interface FinalValidationCategoryGroup {
  category: FinalValidationCategory;
  title: string;
  summary: FinalValidationSummary;
  results: FinalValidationResult[];
}

export interface FinalValidationDataset {
  financialYearId: string;
  financialYearLabel: string;
  previousFinancialYearId?: string;
  previousFinancialYearLabel?: string;
  scope: 'ENTITY' | 'UNIT' | 'CONSOLIDATED';
  unitId?: string;
  unitName?: string;
  consolidationRunId?: string;
  consolidationRunNumber?: string;
  importBatchId?: string;

  overallStatus: OverallValidationStatus;
  summary: FinalValidationSummary;
  results: FinalValidationResult[];
  categoryGroups: FinalValidationCategoryGroup[];

  generatedAt: string;
}

declare global {

  interface Window {
    electronAPI: ElectronAPI;
  }
}



