/**
 * Phase 12: Financial Statement Engine
 *
 * Authoritative financial statement generation engine compiling final:
 * 1. Balance Sheet
 * 2. Statement of Income and Expenditure
 *
 * Architecture:
 * Trial Balance -> Mapping -> Classification -> Regrouping -> Adjustments ->
 * Consolidation (Phase 9) -> Reporting/FSLI (Phase 10) -> Notes/Schedules (Phase 11) ->
 * Financial Statements (Phase 12) -> Final Validation (Phase 13)
 *
 * Consumes authoritative outputs from Phase 10 and Phase 11.
 * Strict non-duplication of accounting logic.
 */

import Database from 'better-sqlite3';
import {
  BALANCE_SHEET_LINE_DEFINITIONS,
  INCOME_EXPENDITURE_LINE_DEFINITIONS,
  type StatementCode,
  type StatementLineDefinition,
  type StatementSectionType,
  type StatementLineType,
  type StatementSourceType,
} from './financial-statements-master-data';
import {
  generateNotesData,
  getNoteDrillDown,
  type NotesDatasetResult,
  type GeneratedNote,
  type GeneratedNoteLineItem,
  type DataStatus,
  type NoteDrillDownResult,
} from './notes-engine';
import { NOTE_DEFINITIONS } from './notes-master-data';
import {
  generateReportingHierarchyData,
  type ReportingHierarchyEngineResult,
} from './reporting-hierarchy-engine';

// ── Types ─────────────────────────────────────────────────────────────────────

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
  statementCode: StatementCode;
  section: StatementSectionType;
  subSection?: string;
  lineIndex?: string;
  lineLabel: string;
  lineType: StatementLineType;
  sourceType: StatementSourceType;
  sourceNoteNumber?: number;
  sourceScheduleCode?: string;
  noteReference?: string | number;
  depth: number;
  displayOrder: number;

  cyAmount: number | null;
  pyAmount: number | null;
  cyStatus: DataStatus;
  pyStatus: DataStatus;

  // Diagnostic and Drilldown metadata
  isSubtotal?: boolean;
  isTotal?: boolean;
  componentLineIds?: string[];
  ledgerCount?: number;
  footnote?: string;
}

export interface StatementSectionSummary {
  section: StatementSectionType;
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
  statementCode: StatementCode;
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
  statementCode?: StatementCode;
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
  statementCode: StatementCode;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Core Engine Functions ─────────────────────────────────────────────────────

/**
 * Extracts specific portions of notes (e.g. Note 6 Non-Current vs Current, Note 18 Non-Current vs Current, Note 11 Net Asset vs Depreciation)
 */
function extractNotePortionAmount(
  note: GeneratedNote,
  portionKey: string,
  year: 'CY' | 'PY',
): number {
  if (note.noteNumber === 6) {
    // Note 6 Secured Loans:
    // Non-Current lines: n6-nc-tb, n6-nc-wc
    // Current lines: n6-c-nbfc, n6-c-wc
    if (portionKey === 'NON_CURRENT') {
      let sum = 0;
      for (const line of note.lines) {
        if (line.lineId === 'n6-nc-tb' || line.lineId === 'n6-nc-wc') {
          const amt = year === 'CY' ? line.cyAmount : line.pyAmount;
          sum += amt || 0;
        }
      }
      return round2(sum);
    } else if (portionKey === 'CURRENT') {
      let sum = 0;
      for (const line of note.lines) {
        if (line.lineId === 'n6-c-nbfc' || line.lineId === 'n6-c-wc') {
          const amt = year === 'CY' ? line.cyAmount : line.pyAmount;
          sum += amt || 0;
        }
      }
      return round2(sum);
    }
  } else if (note.noteNumber === 11) {
    // Note 11 Property, Plant & Equipment:
    // NET_ASSET -> Closing Total Net Asset (line 'n11-tot' or closing net asset)
    // DEPRECIATION -> Total Depreciation for the year (line 'n11-tot-dep' or depreciation field)
    if (portionKey === 'NET_ASSET') {
      const totLine = note.lines.find(l => l.lineId === 'n11-tot');
      if (totLine) {
        const amt = year === 'CY' ? (totLine.closingBalance ?? totLine.cyAmount) : (totLine.pyClosingBalance ?? totLine.pyAmount);
        return round2(amt || 0);
      }
      return round2((year === 'CY' ? note.cyTotal : note.pyTotal) || 0);
    } else if (portionKey === 'DEPRECIATION') {
      const totLine = note.lines.find(l => l.lineId === 'n11-tot');
      if (totLine) {
        const amt = year === 'CY' ? (totLine.depreciation ?? totLine.cyAmount) : (totLine.pyAdjustments ?? totLine.pyAmount);
        return round2(amt || 0);
      }
      return 0;
    }
  } else if (note.noteNumber === 18) {
    // Note 18 Loans and Advances:
    // NON_CURRENT -> n18-sd-nc or n18-nc-sec (Security Deposits rerouted to Non-Current Assets)
    // CURRENT -> sum of current loans/advances or n18-net-c
    if (portionKey === 'NON_CURRENT') {
      const secLine = note.lines.find(l => l.lineId === 'n18-sd-nc' || l.lineId === 'n18-nc-sec');
      const amt = year === 'CY' ? secLine?.cyAmount : secLine?.pyAmount;
      return round2(amt || 0);
    } else if (portionKey === 'CURRENT') {
      const netCLine = note.lines.find(l => l.lineId === 'n18-net-c');
      if (netCLine && netCLine.cyAmount !== null) {
        const amt = year === 'CY' ? netCLine.cyAmount : netCLine.pyAmount;
        return round2(amt || 0);
      }
      let sum = 0;
      for (const line of note.lines) {
        if (['n18-emp', 'n18-sd-c', 'n18-oth-c'].includes(line.lineId)) {
          const amt = year === 'CY' ? line.cyAmount : line.pyAmount;
          sum += amt || 0;
        } else if (line.lineId === 'n18-ded' || line.lineId === 'n18-less-nc') {
          const amt = year === 'CY' ? line.cyAmount : line.pyAmount;
          sum -= Math.abs(amt || 0);
        }
      }
      return round2(sum);
    }
  }

  return round2((year === 'CY' ? note.cyTotal : note.pyTotal) || 0);
}

/**
 * Generates the complete Balance Sheet Statement Data
 */
export function generateBalanceSheetData(
  dbOrNotes: Database.Database | NotesDatasetResult,
  fyOrReporting: string | ReportingHierarchyEngineResult,
  options?: any,
): BalanceSheetData {
  let notesDataset: NotesDatasetResult;
  let reportingDataset: ReportingHierarchyEngineResult;

  if (typeof (dbOrNotes as any).prepare === 'function') {
    const db = dbOrNotes as Database.Database;
    const financialYearId = fyOrReporting as string;
    notesDataset = generateNotesData(db, financialYearId, options);
    reportingDataset = generateReportingHierarchyData(db, financialYearId, {
      scope: options?.scope === 'CONSOLIDATED' ? 'CONSOLIDATED' : options?.unitId ? 'UNIT' : 'CONSOLIDATED',
      unitId: options?.unitId,
      consolidationRunId: options?.consolidationRunId,
      previousFinancialYearId: options?.previousFinancialYearId,
    });
  } else {
    notesDataset = dbOrNotes as NotesDatasetResult;
    reportingDataset = fyOrReporting as ReportingHierarchyEngineResult;
  }

  const hasPY = reportingDataset.subScheduleRows.some(r => (r.pyDebit || 0) > 0 || (r.pyCredit || 0) > 0);
  const notesMap = new Map<number, GeneratedNote>();
  for (const n of notesDataset.notes) {
    notesMap.set(n.noteNumber, n);
  }

  const nodeMap = new Map<string, any>();
  for (const n of reportingDataset.subScheduleRows) {
    nodeMap.set(n.nodeCode, n);
  }

  const generatedLines: GeneratedStatementLine[] = [];
  let totalLiabilitiesCY = 0;
  let totalLiabilitiesPY = 0;
  let totalAssetsCY = 0;
  let totalAssetsPY = 0;

  for (const def of BALANCE_SHEET_LINE_DEFINITIONS) {
    if (def.lineType === 'SECTION_HEADER' || def.lineType === 'SUBSECTION_HEADER' || def.lineType === 'GROUP_HEADER') {
      generatedLines.push({
        statementLineId: def.statementLineId,
        statementCode: 'BS',
        section: def.section,
        subSection: def.subSection,
        lineIndex: def.lineIndex,
        lineLabel: def.lineLabel,
        lineType: def.lineType,
        sourceType: def.sourceType,
        depth: def.depth,
        displayOrder: def.displayOrder,
        cyAmount: null,
        pyAmount: null,
        cyStatus: 'NOT_APPLICABLE',
        pyStatus: 'NOT_APPLICABLE',
      });
      continue;
    }

    if (def.lineType === 'TOTAL') {
      if (def.calculationMethod === 'SUM_LIABILITIES') {
        generatedLines.push({
          statementLineId: def.statementLineId,
          statementCode: 'BS',
          section: def.section,
          subSection: def.subSection,
          lineLabel: def.lineLabel,
          lineType: 'TOTAL',
          sourceType: 'TOTAL',
          depth: def.depth,
          displayOrder: def.displayOrder,
          cyAmount: round2(totalLiabilitiesCY),
          pyAmount: hasPY ? round2(totalLiabilitiesPY) : null,
          cyStatus: 'AVAILABLE',
          pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
          isTotal: true,
        });
      } else if (def.calculationMethod === 'SUM_ASSETS') {
        generatedLines.push({
          statementLineId: def.statementLineId,
          statementCode: 'BS',
          section: def.section,
          subSection: def.subSection,
          lineLabel: def.lineLabel,
          lineType: 'TOTAL',
          sourceType: 'TOTAL',
          depth: def.depth,
          displayOrder: def.displayOrder,
          cyAmount: round2(totalAssetsCY),
          pyAmount: hasPY ? round2(totalAssetsPY) : null,
          cyStatus: 'AVAILABLE',
          pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
          isTotal: true,
        });
      }
      continue;
    }

    // Line Item Calculation
    let cyVal = 0;
    let pyVal: number | null = null;
    let cyStatus: DataStatus = 'AVAILABLE';
    let pyStatus: DataStatus = hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE';
    let ledgerCount = 0;

    if (def.sourceType === 'NOTE' && def.sourceNoteNumber) {
      const note = notesMap.get(def.sourceNoteNumber);
      if (note) {
        cyVal = note.cyTotal !== null ? note.cyTotal : 0;
        pyVal = hasPY ? (note.pyTotal !== null ? note.pyTotal : 0) : null;
        cyStatus = note.cyTotalStatus;
        pyStatus = hasPY ? note.pyTotalStatus : 'PY_UNAVAILABLE';
        ledgerCount = note.lines.reduce((sum, l) => sum + (l.ledgerCount || 0), 0);
      } else {
        cyStatus = 'SOURCE_MISSING';
      }
    } else if (def.sourceType === 'NOTE_PORTION' && def.sourceNoteNumber && def.notePortionKey) {
      const note = notesMap.get(def.sourceNoteNumber);
      if (note) {
        cyVal = extractNotePortionAmount(note, def.notePortionKey, 'CY');
        pyVal = hasPY ? extractNotePortionAmount(note, def.notePortionKey, 'PY') : null;
        cyStatus = note.cyTotalStatus;
        pyStatus = hasPY ? note.pyTotalStatus : 'PY_UNAVAILABLE';
        ledgerCount = note.lines.reduce((sum, l) => sum + (l.ledgerCount || 0), 0);
      } else {
        cyStatus = 'SOURCE_MISSING';
      }
    } else if (def.sourceType === 'REPORTING_NODE' && def.sourceNodeCodes && def.sourceNodeCodes.length > 0) {
      let sumCY = 0;
      let sumPY = 0;
      for (const code of def.sourceNodeCodes) {
        const n = nodeMap.get(code);
        if (n) {
          sumCY += n.cyNet;
          sumPY += n.pyNet;
          ledgerCount += n.ledgerCount;
        }
      }
      cyVal = round2(sumCY);
      pyVal = hasPY ? round2(sumPY) : null;
    }

    if (def.section === 'LIABILITIES') {
      totalLiabilitiesCY += cyVal;
      if (hasPY && pyVal !== null) totalLiabilitiesPY += pyVal;
    } else if (def.section === 'ASSETS') {
      totalAssetsCY += cyVal;
      if (hasPY && pyVal !== null) totalAssetsPY += pyVal;
    }

    generatedLines.push({
      statementLineId: def.statementLineId,
      statementCode: 'BS',
      section: def.section,
      subSection: def.subSection,
      lineIndex: def.lineIndex,
      lineLabel: def.lineLabel,
      lineType: def.lineType,
      sourceType: def.sourceType,
      sourceNoteNumber: def.sourceNoteNumber,
      sourceScheduleCode: def.sourceScheduleCode,
      noteReference: def.noteReference,
      depth: def.depth,
      displayOrder: def.displayOrder,
      cyAmount: cyVal,
      pyAmount: pyVal,
      cyStatus,
      pyStatus,
      ledgerCount,
    });
  }

  totalLiabilitiesCY = round2(totalLiabilitiesCY);
  totalLiabilitiesPY = round2(totalLiabilitiesPY);
  totalAssetsCY = round2(totalAssetsCY);
  totalAssetsPY = round2(totalAssetsPY);

  const diffCY = round2(Math.abs(totalLiabilitiesCY - totalAssetsCY));
  const diffPY = hasPY ? round2(Math.abs(totalLiabilitiesPY - totalAssetsPY)) : null;

  // Group into sections
  const sections: StatementSectionSummary[] = [
    {
      section: 'LIABILITIES',
      sectionTitle: 'LIABILITIES',
      cyTotal: totalLiabilitiesCY,
      pyTotal: hasPY ? totalLiabilitiesPY : null,
      lines: generatedLines.filter(l => l.section === 'LIABILITIES'),
    },
    {
      section: 'ASSETS',
      sectionTitle: 'ASSETS',
      cyTotal: totalAssetsCY,
      pyTotal: hasPY ? totalAssetsPY : null,
      lines: generatedLines.filter(l => l.section === 'ASSETS'),
    },
  ];

  return {
    statementCode: 'BS',
    title: 'Balance Sheet',
    asAtDateCY: reportingDataset.financialYearLabel ? `March 31, 20${reportingDataset.financialYearLabel.split('-')[1] || '26'}` : 'March 31, 2026',
    asAtDatePY: 'March 31, 2025',
    lines: generatedLines,
    sections,
    totalLiabilitiesCY,
    totalLiabilitiesPY: hasPY ? totalLiabilitiesPY : null,
    totalAssetsCY,
    totalAssetsPY: hasPY ? totalAssetsPY : null,
    differenceCY: diffCY,
    differencePY: diffPY,
    isBalancedCY: diffCY < 0.01,
    isBalancedPY: diffPY !== null ? diffPY < 0.01 : false,
    hasPY,
  };
}

/**
 * Generates the complete Statement of Income and Expenditure Data
 */
export function generateIncomeExpenditureData(
  dbOrNotes: Database.Database | NotesDatasetResult,
  fyOrReporting: string | ReportingHierarchyEngineResult,
  options?: any,
): IncomeExpenditureData {
  let notesDataset: NotesDatasetResult;
  let reportingDataset: ReportingHierarchyEngineResult;

  if (typeof (dbOrNotes as any).prepare === 'function') {
    const db = dbOrNotes as Database.Database;
    const financialYearId = fyOrReporting as string;
    notesDataset = generateNotesData(db, financialYearId, options);
    reportingDataset = generateReportingHierarchyData(db, financialYearId, {
      scope: options?.scope === 'CONSOLIDATED' ? 'CONSOLIDATED' : options?.unitId ? 'UNIT' : 'CONSOLIDATED',
      unitId: options?.unitId,
      consolidationRunId: options?.consolidationRunId,
      previousFinancialYearId: options?.previousFinancialYearId,
    });
  } else {
    notesDataset = dbOrNotes as NotesDatasetResult;
    reportingDataset = fyOrReporting as ReportingHierarchyEngineResult;
  }

  const hasPY = reportingDataset.subScheduleRows.some(r => (r.pyDebit || 0) > 0 || (r.pyCredit || 0) > 0);
  const notesMap = new Map<number, GeneratedNote>();
  for (const n of notesDataset.notes) {
    notesMap.set(n.noteNumber, n);
  }

  const generatedLines: GeneratedStatementLine[] = [];
  let totalRevenueCY = 0;
  let totalRevenuePY = 0;
  let totalExpensesCY = 0;
  let totalExpensesPY = 0;

  for (const def of INCOME_EXPENDITURE_LINE_DEFINITIONS) {
    if (def.lineType === 'SECTION_HEADER') {
      generatedLines.push({
        statementLineId: def.statementLineId,
        statementCode: 'IE',
        section: def.section,
        lineLabel: def.lineLabel,
        lineType: def.lineType,
        sourceType: def.sourceType,
        depth: def.depth,
        displayOrder: def.displayOrder,
        cyAmount: null,
        pyAmount: null,
        cyStatus: 'NOT_APPLICABLE',
        pyStatus: 'NOT_APPLICABLE',
      });
      continue;
    }

    if (def.lineType === 'SUBTOTAL') {
      if (def.calculationMethod === 'SUM_REVENUE') {
        generatedLines.push({
          statementLineId: def.statementLineId,
          statementCode: 'IE',
          section: 'INCOME',
          lineLabel: def.lineLabel,
          lineType: 'SUBTOTAL',
          sourceType: 'SUBTOTAL',
          depth: def.depth,
          displayOrder: def.displayOrder,
          cyAmount: round2(totalRevenueCY),
          pyAmount: hasPY ? round2(totalRevenuePY) : null,
          cyStatus: 'AVAILABLE',
          pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
          isSubtotal: true,
        });
      } else if (def.calculationMethod === 'SUM_EXPENSES') {
        generatedLines.push({
          statementLineId: def.statementLineId,
          statementCode: 'IE',
          section: 'EXPENSES',
          lineLabel: def.lineLabel,
          lineType: 'SUBTOTAL',
          sourceType: 'SUBTOTAL',
          depth: def.depth,
          displayOrder: def.displayOrder,
          cyAmount: round2(totalExpensesCY),
          pyAmount: hasPY ? round2(totalExpensesPY) : null,
          cyStatus: 'AVAILABLE',
          pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
          isSubtotal: true,
        });
      }
      continue;
    }

    if (def.lineType === 'TOTAL' && def.calculationMethod === 'NET_SURPLUS_DEFICIT') {
      const surplusCY = round2(totalRevenueCY - totalExpensesCY);
      const surplusPY = hasPY ? round2(totalRevenuePY - totalExpensesPY) : null;
      generatedLines.push({
        statementLineId: def.statementLineId,
        statementCode: 'IE',
        section: 'RESULT',
        lineLabel: def.lineLabel,
        lineType: 'TOTAL',
        sourceType: 'TOTAL',
        depth: def.depth,
        displayOrder: def.displayOrder,
        cyAmount: surplusCY,
        pyAmount: surplusPY,
        cyStatus: 'AVAILABLE',
        pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
        isTotal: true,
      });
      continue;
    }

    // Line item calculation
    let cyVal = 0;
    let pyVal: number | null = null;
    let cyStatus: DataStatus = 'AVAILABLE';
    let pyStatus: DataStatus = hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE';
    let ledgerCount = 0;

    if (def.sourceType === 'NOTE' && def.sourceNoteNumber) {
      const note = notesMap.get(def.sourceNoteNumber);
      if (note) {
        cyVal = note.cyTotal !== null ? note.cyTotal : 0;
        pyVal = hasPY ? (note.pyTotal !== null ? note.pyTotal : 0) : null;
        cyStatus = note.cyTotalStatus;
        pyStatus = hasPY ? note.pyTotalStatus : 'PY_UNAVAILABLE';
        ledgerCount = note.lines.reduce((sum, l) => sum + (l.ledgerCount || 0), 0);
      } else {
        cyStatus = 'SOURCE_MISSING';
      }
    } else if (def.sourceType === 'NOTE_PORTION' && def.sourceNoteNumber && def.notePortionKey) {
      const note = notesMap.get(def.sourceNoteNumber);
      if (note) {
        cyVal = extractNotePortionAmount(note, def.notePortionKey, 'CY');
        pyVal = hasPY ? extractNotePortionAmount(note, def.notePortionKey, 'PY') : null;
        cyStatus = note.cyTotalStatus;
        pyStatus = hasPY ? note.pyTotalStatus : 'PY_UNAVAILABLE';
        ledgerCount = note.lines.reduce((sum, l) => sum + (l.ledgerCount || 0), 0);
      } else {
        cyStatus = 'SOURCE_MISSING';
      }
    }

    // Stock Movement (Note 25) maintains signed movement: Closing - Opening.
    // If negative, it correctly reduces Total Revenue.
    if (def.section === 'INCOME') {
      totalRevenueCY += cyVal;
      if (hasPY && pyVal !== null) totalRevenuePY += pyVal;
    } else if (def.section === 'EXPENSES') {
      totalExpensesCY += cyVal;
      if (hasPY && pyVal !== null) totalExpensesPY += pyVal;
    }

    generatedLines.push({
      statementLineId: def.statementLineId,
      statementCode: 'IE',
      section: def.section,
      lineLabel: def.lineLabel,
      lineType: def.lineType,
      sourceType: def.sourceType,
      sourceNoteNumber: def.sourceNoteNumber,
      sourceScheduleCode: def.sourceScheduleCode,
      noteReference: def.noteReference,
      depth: def.depth,
      displayOrder: def.displayOrder,
      cyAmount: cyVal,
      pyAmount: pyVal,
      cyStatus,
      pyStatus,
      ledgerCount,
    });
  }

  totalRevenueCY = round2(totalRevenueCY);
  totalRevenuePY = round2(totalRevenuePY);
  totalExpensesCY = round2(totalExpensesCY);
  totalExpensesPY = round2(totalExpensesPY);
  const netSurplusCY = round2(totalRevenueCY - totalExpensesCY);
  const netSurplusPY = hasPY ? round2(totalRevenuePY - totalExpensesPY) : null;

  const sections: StatementSectionSummary[] = [
    {
      section: 'INCOME',
      sectionTitle: 'INCOME',
      cyTotal: totalRevenueCY,
      pyTotal: hasPY ? totalRevenuePY : null,
      lines: generatedLines.filter(l => l.section === 'INCOME'),
    },
    {
      section: 'EXPENSES',
      sectionTitle: 'EXPENSES',
      cyTotal: totalExpensesCY,
      pyTotal: hasPY ? totalExpensesPY : null,
      lines: generatedLines.filter(l => l.section === 'EXPENSES'),
    },
    {
      section: 'RESULT',
      sectionTitle: 'SURPLUS / (DEFICIT)',
      cyTotal: netSurplusCY,
      pyTotal: netSurplusPY,
      lines: generatedLines.filter(l => l.section === 'RESULT'),
    },
  ];

  return {
    statementCode: 'IE',
    title: 'Statement of Income and Expenditure',
    periodEndingCY: reportingDataset.financialYearLabel ? `Year Ended March 31, 20${reportingDataset.financialYearLabel.split('-')[1] || '26'}` : 'Year Ended March 31, 2026',
    periodEndingPY: 'Year Ended March 31, 2025',
    lines: generatedLines,
    sections,
    totalRevenueCY,
    totalRevenuePY: hasPY ? totalRevenuePY : null,
    totalExpensesCY,
    totalExpensesPY: hasPY ? totalExpensesPY : null,
    netSurplusCY,
    netSurplusPY,
    hasPY,
  };
}

/**
 * Reconciles every Statement Line with its corresponding Note
 */
export function reconcileStatementsWithNotes(
  balanceSheet: BalanceSheetData,
  incomeExpenditure: IncomeExpenditureData,
  notesDataset: NotesDatasetResult,
): StatementNoteReconciliation[] {
  const reconciliations: StatementNoteReconciliation[] = [];
  const notesMap = new Map<number, GeneratedNote>();
  for (const n of notesDataset.notes) {
    notesMap.set(n.noteNumber, n);
  }

  const allStatementLines = [...balanceSheet.lines, ...incomeExpenditure.lines];

  for (const line of allStatementLines) {
    if (!line.sourceNoteNumber) continue;

    const note = notesMap.get(line.sourceNoteNumber);
    if (!note) {
      reconciliations.push({
        statementLineId: line.statementLineId,
        statementCode: line.statementCode,
        lineLabel: line.lineLabel,
        noteNumber: line.sourceNoteNumber,
        scheduleCode: line.sourceScheduleCode || `SCH_${String(line.sourceNoteNumber).padStart(2, '0')}`,
        noteTitle: 'Missing Note',
        statementAmountCY: line.cyAmount || 0,
        statementAmountPY: line.pyAmount,
        noteAmountCY: 0,
        noteAmountPY: null,
        differenceCY: Math.abs(line.cyAmount || 0),
        differencePY: line.pyAmount !== null ? Math.abs(line.pyAmount) : null,
        isReconciledCY: false,
        isReconciledPY: false,
        status: 'SOURCE_MISSING',
      });
      continue;
    }

    let noteAmtCY: number;
    let noteAmtPY: number | null;

    if (line.sourceType === 'NOTE_PORTION') {
      // Find matching portion
      if (line.sourceNoteNumber === 6) {
        if (line.statementLineId === 'bs-liab-06-nc') {
          noteAmtCY = extractNotePortionAmount(note, 'NON_CURRENT', 'CY');
          noteAmtPY = balanceSheet.hasPY ? extractNotePortionAmount(note, 'NON_CURRENT', 'PY') : null;
        } else {
          noteAmtCY = extractNotePortionAmount(note, 'CURRENT', 'CY');
          noteAmtPY = balanceSheet.hasPY ? extractNotePortionAmount(note, 'CURRENT', 'PY') : null;
        }
      } else if (line.sourceNoteNumber === 11) {
        if (line.statementLineId === 'bs-ast-11') {
          noteAmtCY = extractNotePortionAmount(note, 'NET_ASSET', 'CY');
          noteAmtPY = balanceSheet.hasPY ? extractNotePortionAmount(note, 'NET_ASSET', 'PY') : null;
        } else {
          noteAmtCY = extractNotePortionAmount(note, 'DEPRECIATION', 'CY');
          noteAmtPY = incomeExpenditure.hasPY ? extractNotePortionAmount(note, 'DEPRECIATION', 'PY') : null;
        }
      } else if (line.sourceNoteNumber === 18) {
        if (line.statementLineId === 'bs-ast-18-nc') {
          noteAmtCY = extractNotePortionAmount(note, 'NON_CURRENT', 'CY');
          noteAmtPY = balanceSheet.hasPY ? extractNotePortionAmount(note, 'NON_CURRENT', 'PY') : null;
        } else {
          noteAmtCY = extractNotePortionAmount(note, 'CURRENT', 'CY');
          noteAmtPY = balanceSheet.hasPY ? extractNotePortionAmount(note, 'CURRENT', 'PY') : null;
        }
      } else {
        noteAmtCY = note.cyTotal !== null ? note.cyTotal : 0;
        noteAmtPY = note.pyTotal;
      }
    } else {
      noteAmtCY = note.cyTotal !== null ? note.cyTotal : 0;
      noteAmtPY = note.pyTotal;
    }

    const stmtCY = line.cyAmount || 0;
    const stmtPY = line.pyAmount;
    const diffCY = round2(Math.abs(stmtCY - noteAmtCY));
    const diffPY = stmtPY !== null && noteAmtPY !== null ? round2(Math.abs(stmtPY - noteAmtPY)) : null;

    const isReconciledCY = diffCY <= 0.01;
    const isReconciledPY = diffPY !== null ? diffPY <= 0.01 : true;

    reconciliations.push({
      statementLineId: line.statementLineId,
      statementCode: line.statementCode,
      lineLabel: line.lineLabel,
      noteNumber: note.noteNumber,
      scheduleCode: note.scheduleCode,
      noteTitle: note.title,
      statementAmountCY: stmtCY,
      statementAmountPY: stmtPY,
      noteAmountCY: noteAmtCY,
      noteAmountPY: noteAmtPY,
      differenceCY: diffCY,
      differencePY: diffPY,
      isReconciledCY,
      isReconciledPY,
      status: isReconciledCY && isReconciledPY ? 'RECONCILED' : 'UNRECONCILED',
    });
  }

  return reconciliations;
}

/**
 * Compiles and generates complete Financial Statements Dataset (Phase 12 Entrypoint)
 */
export function generateFinancialStatements(
  database: Database.Database,
  financialYearId: string,
  options?: {
    scope?: 'ENTITY' | 'UNIT' | 'CONSOLIDATED';
    unitId?: string;
    consolidationRunId?: string;
    previousFinancialYearId?: string;
  },
): FinancialStatementsData {
  // 1. Fetch Phase 11 Notes & Schedules dataset (which consumes Phase 10 & Phase 9)
  const notesDataset = generateNotesData(database, financialYearId, options);

  // 2. Fetch Phase 10 Reporting dataset
  const reportingDataset = generateReportingHierarchyData(database, financialYearId, {
    scope: options?.scope === 'CONSOLIDATED' ? 'CONSOLIDATED' : options?.unitId ? 'UNIT' : 'CONSOLIDATED',
    unitId: options?.unitId,
    consolidationRunId: options?.consolidationRunId,
    previousFinancialYearId: options?.previousFinancialYearId,
  });

  // 3. Generate Balance Sheet
  const balanceSheet = generateBalanceSheetData(notesDataset, reportingDataset);

  // 4. Generate Income & Expenditure Statement
  const incomeExpenditure = generateIncomeExpenditureData(notesDataset, reportingDataset);

  // 5. Reconcile Statements with Notes
  const reconciliations = reconcileStatementsWithNotes(balanceSheet, incomeExpenditure, notesDataset);

  // 6. Diagnostics & Status Computation
  const diagnostics: FinancialStatementDiagnostic[] = [];

  if (!balanceSheet.isBalancedCY) {
    diagnostics.push({
      code: 'BALANCE_SHEET_IMBALANCE',
      severity: 'ERROR',
      statementCode: 'BS',
      message: `Balance Sheet does not balance for Current Year. Difference: ₹${balanceSheet.differenceCY.toLocaleString('en-IN')}`,
      details: `Total Liabilities & Funds: ₹${balanceSheet.totalLiabilitiesCY.toLocaleString('en-IN')}, Total Assets: ₹${balanceSheet.totalAssetsCY.toLocaleString('en-IN')}`,
    });
  }

  const unreconciledItems = reconciliations.filter(r => !r.isReconciledCY);
  if (unreconciledItems.length > 0) {
    for (const u of unreconciledItems) {
      diagnostics.push({
        code: 'STATEMENT_NOTE_MISMATCH',
        severity: 'ERROR',
        statementCode: u.statementCode,
        statementLineId: u.statementLineId,
        noteNumber: u.noteNumber,
        message: `Statement line "${u.lineLabel}" does not match Note ${u.noteNumber} (${u.noteTitle}). Difference: ₹${u.differenceCY.toLocaleString('en-IN')}`,
      });
    }
  }

  const hasPY = reportingDataset.subScheduleRows.some(r => (r.pyDebit || 0) > 0 || (r.pyCredit || 0) > 0);
  const unmappedCount = reportingDataset.unmappedLedgers?.length || 0;

  if (!hasPY) {
    diagnostics.push({
      code: 'PY_UNAVAILABLE',
      severity: 'INFO',
      message: 'Previous Year (PY) comparative data is unavailable for the selected period.',
    });
  }

  if (unmappedCount > 0) {
    diagnostics.push({
      code: 'MAPPING_UNRESOLVED',
      severity: 'WARNING',
      message: `${unmappedCount} unmapped ledgers were placed into the control bucket.`,
    });
  }

  // Determine overall status
  let status: FinancialStatementStatus = 'COMPLETE';
  if (!balanceSheet.isBalancedCY) {
    status = 'BALANCE_SHEET_IMBALANCE';
  } else if (unreconciledItems.length > 0) {
    status = 'RECONCILIATION_FAILED';
  } else if (unmappedCount > 0) {
    status = 'MAPPING_UNRESOLVED';
  } else if (!hasPY) {
    status = 'COMPLETE'; // Complete CY statement even without PY
  }

  return {
    financialYearId,
    financialYearLabel: reportingDataset.financialYearLabel,
    previousFinancialYearId: options?.previousFinancialYearId,
    previousFinancialYearLabel: undefined,
    scope: options?.scope || 'CONSOLIDATED',
    unitId: options?.unitId,
    unitName: reportingDataset.unitName,
    consolidationRunId: options?.consolidationRunId,
    consolidationRunNumber: undefined,
    balanceSheet,
    incomeExpenditure,
    reconciliations,
    diagnostics,
    status,
    allReconciled: unreconciledItems.length === 0,
    unreconciledCount: unreconciledItems.length,
    hasPY,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * End-to-end drill-down from Financial Statement Line to underlying Ledgers
 */
export function getStatementDrillDown(
  database: Database.Database,
  financialYearId: string,
  statementLineId: string,
  options?: {
    scope?: 'ENTITY' | 'UNIT' | 'CONSOLIDATED';
    unitId?: string;
    consolidationRunId?: string;
  },
): StatementDrillDownResult {
  const allDefs = [...BALANCE_SHEET_LINE_DEFINITIONS, ...INCOME_EXPENDITURE_LINE_DEFINITIONS];
  const lineDef = allDefs.find(l => l.statementLineId === statementLineId);

  if (!lineDef) {
    throw new Error(`Statement Line "${statementLineId}" not found in master definitions.`);
  }

  const reportingDataset = generateReportingHierarchyData(database, financialYearId, {
    scope: options?.scope === 'CONSOLIDATED' ? 'CONSOLIDATED' : options?.unitId ? 'UNIT' : 'CONSOLIDATED',
    unitId: options?.unitId,
    consolidationRunId: options?.consolidationRunId,
  });

  const ledgers: StatementDrillDownResult['ledgers'] = [];
  const reportingNodeCodes: string[] = [];
  let noteTitle: string | undefined;

  // 1. If linked to Note, resolve note's source nodes
  if (lineDef.sourceNoteNumber) {
    const noteDef = NOTE_DEFINITIONS.find(n => n.noteNumber === lineDef.sourceNoteNumber);
    if (noteDef) {
      noteTitle = noteDef.title;
      for (const item of noteDef.lineItems) {
        for (const code of item.sourceNodeCodes) {
          if (!reportingNodeCodes.includes(code)) {
            reportingNodeCodes.push(code);
          }
        }
      }
    }
  }

  // 2. If node codes directly defined
  if (lineDef.sourceNodeCodes && lineDef.sourceNodeCodes.length > 0) {
    for (const code of lineDef.sourceNodeCodes) {
      if (!reportingNodeCodes.includes(code)) {
        reportingNodeCodes.push(code);
      }
    }
  }

  // 3. Collect all ledger contributions from subScheduleRows
  for (const nodeRow of reportingDataset.subScheduleRows) {
    if (reportingNodeCodes.includes(nodeRow.nodeCode) && nodeRow.ledgerDetails) {
      for (const ld of nodeRow.ledgerDetails) {
        ledgers.push({
          ledgerId: ld.ledgerId,
          ledgerName: ld.ledgerName,
          unitId: ld.unitId,
          unitName: ld.unitName,
          nodeCode: nodeRow.nodeCode,
          nodeName: nodeRow.nodeName,
          fsliCode: ld.fsliCode || undefined,
          cyDebit: ld.debit,
          cyCredit: ld.credit,
          cyNet: ld.net,
        });
      }
    }
  }

  return {
    statementLineId: lineDef.statementLineId,
    lineLabel: lineDef.lineLabel,
    statementCode: lineDef.statementCode,
    noteNumber: lineDef.sourceNoteNumber,
    noteTitle,
    cyAmount: null,
    pyAmount: null,
    noteDrillDown: null,
    reportingNodeCodes,
    ledgers,
  };
}
