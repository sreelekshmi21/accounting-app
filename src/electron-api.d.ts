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

/** A record representing a saved import batch in SQLite. */
export interface ImportBatchRecord {
  id: string;
  fileName: string;
  filePath: string;
  financialYear: string;
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
   */
  saveTrialBalance: (importResult: TrialBalanceImportResult) => Promise<SaveResult>;

  /**
   * Lists all saved import batches from SQLite.
   */
  listImportBatches: () => Promise<ImportBatchRecord[]>;

  /**
   * Loads a saved Trial Balance from SQLite by batch ID.
   */
  loadSavedTrialBalance: (batchId: string) => Promise<TrialBalanceImportResult | null>;

  /**
   * Checks if a trial balance file was already saved for the financial year.
   */
  checkDuplicate: (filePath: string, financialYear: string) => Promise<DuplicateCheckResult>;

  /**
   * Runs a database smoke test.
   */
  dbSmokeTest: () => Promise<SmokeTestResult>;

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

  // ── Phase 5 Step 2: Auto-Suggestion Engine IPC ────────────────────────

  /** Seeds standard Schedule III / Accounting Standard FSLIs if not present. */
  seedStandardFSLIs: () => Promise<number>;

  /** Generates explainable mapping suggestions for a given financial year. */
  generateMappingSuggestions: (
    financialYearId: string,
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
  ) => Promise<MappingWorkbenchData>;

  /** Bulk updates multiple ledger mappings in a single transaction. */
  bulkUpdateLedgerMappings: (
    financialYearId: string,
    updates: BulkUpdateMappingItem[],
  ) => Promise<{ updatedCount: number }>;

  /** Applies an FSLI mapping to all similar ledgers sharing group/keyword. */
  applyMappingToSimilar: (
    financialYearId: string,
    targetFSLIId: string,
    criteriaType: 'group' | 'keyword',
    criteriaValue: string,
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

  /** Fetches classification data for a given financial year (CY or PY). */
  getClassificationData: (
    financialYearId?: string,
  ) => Promise<ClassificationData>;

  /** Runs auto-classification for all ledgers in the given financial year. */
  autoClassifyLedgers: (
    financialYearId: string,
  ) => Promise<{ classifiedCount: number; skippedCount: number }>;

  /** Saves manual classification updates for one or more ledgers. */
  saveClassifications: (
    financialYearId: string,
    items: ClassificationUpdateItem[],
  ) => Promise<{ savedCount: number }>;

  /** Resets all classification decisions for the given financial year. */
  resetClassifications: (
    financialYearId: string,
  ) => Promise<{ deletedCount: number }>;
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

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
