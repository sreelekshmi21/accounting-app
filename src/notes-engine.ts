/**
 * Phase 11: Notes to Financial Statements Engine
 *
 * Authoritative presentation & disclosure engine matching workbook:
 * reference/Format of Balance sheet , IE and schedules1.xlsx
 *
 * Consumes Phase 10 Reporting Hierarchy results (Nodes, FSLIs, Schedule Calculators)
 * and produces structured, reconcilable, drill-down capable Notes 4 through 33.
 */

import Database from 'better-sqlite3';
import {
  NOTE_DEFINITIONS,
  type NoteDefinition,
  type NoteLineItemDef,
  type NoteCalculationMethod,
  type DisclosureRule,
} from './notes-master-data';
import {
  generateReportingHierarchyData,
  type ReportingHierarchyEngineResult,
  type ReportingNodeRow,
  type StatementLineItem,
} from './reporting-hierarchy-engine';

export type DataStatus =
  | 'AVAILABLE'
  | 'SOURCE_MISSING'
  | 'PY_UNAVAILABLE'
  | 'MAPPING_UNRESOLVED'
  | 'NOT_APPLICABLE';

export interface GeneratedNoteLineItem {
  lineId: string;
  lineLabel: string;
  lineType: 'HEADER' | 'LINE_ITEM' | 'SUBTOTAL' | 'TOTAL' | 'CALCULATED' | 'DEDUCTION' | 'DISCLOSURE_TEXT' | 'SUB_SCHEDULE';
  depth: number;
  displayOrder: number;
  cyAmount: number | null;
  pyAmount: number | null;
  cyStatus: DataStatus;
  pyStatus: DataStatus;
  sourceNodeCodes: string[];
  footnote?: string;

  // Movement & Multi-Column Fields (Notes 5, 11, 12, 13, 18, 25, 28, 29)
  openingBalance?: number | null;
  additions?: number | null;
  adjustments?: number | null;
  disposals?: number | null;
  grantSubsidy?: number | null;
  closingBalance?: number | null;
  depreciation?: number | null;
  pyNetAsset?: number | null;
  pyOpeningBalance?: number | null;
  pyAdditions?: number | null;
  pyAdjustments?: number | null;
  pyClosingBalance?: number | null;

  // Drilldown metadata
  ledgerCount?: number;
}

export interface NoteReconciliation {
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
  lines: GeneratedNoteLineItem[];
  cyTotal: number | null;
  pyTotal: number | null;
  cyTotalStatus: DataStatus;
  pyTotalStatus: DataStatus;
  footnotes: string[];
  hasData: boolean;
  reconciliation: NoteReconciliation | null;
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

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Generates all 30 Notes to the Financial Statements
 */
export function generateNotesData(
  db: Database.Database,
  financialYearId: string,
  options: {
    unitId?: string;
    consolidationRunId?: string;
    scope?: 'ENTITY' | 'UNIT' | 'CONSOLIDATED';
  } = {}
): NotesDatasetResult {
  // 1. Generate Phase 10 authoritative reporting dataset
  const p10Result = generateReportingHierarchyData(db, financialYearId, {
    unitId: options.unitId,
    consolidationRunId: options.consolidationRunId,
    scope: options.scope === 'CONSOLIDATED' ? 'CONSOLIDATED' : 'UNIT',
  });

  const hasPY = p10Result.subScheduleRows.some(r => (r.pyDebit || 0) > 0 || (r.pyCredit || 0) > 0);

  // Build lookup maps from Phase 10
  const nodeMap = new Map<string, ReportingNodeRow>();
  for (const n of p10Result.subScheduleRows) {
    nodeMap.set(n.nodeCode, n);
  }

  const schMap = new Map<string, any>();
  for (const s of p10Result.scheduleRows) {
    schMap.set(s.scheduleCode, s);
  }

  const calc = p10Result.calculatedSchedules;

  // Statement lines for reconciliation
  const bsLines = p10Result.balanceSheet.lines;
  const ieLines = p10Result.incomeAndExpenditure.lines;

  const generatedNotes: GeneratedNote[] = [];

  for (const def of NOTE_DEFINITIONS) {
    const lines: GeneratedNoteLineItem[] = [];
    let noteCYTotal: number | null = null;
    let notePYTotal: number | null = null;

    if (def.calculationMethod === 'CORPUS') {
      // Note 4: Corpus
      lines.push({
        lineId: 'n4-bf',
        lineLabel: 'Balance b/f',
        lineType: 'LINE_ITEM',
        depth: 0,
        displayOrder: 1,
        cyAmount: calc.corpus.balanceBroughtForward,
        pyAmount: hasPY ? calc.corpus.pyBalanceBroughtForward : null,
        cyStatus: 'AVAILABLE',
        pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
        sourceNodeCodes: ['N_04_BF'],
      });
      lines.push({
        lineId: 'n4-add',
        lineLabel: 'Add : Received During the year',
        lineType: 'LINE_ITEM',
        depth: 0,
        displayOrder: 2,
        cyAmount: calc.corpus.receivedDuringYear,
        pyAmount: hasPY ? calc.corpus.pyReceivedDuringYear : null,
        cyStatus: 'AVAILABLE',
        pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
        sourceNodeCodes: ['N_04_ADD'],
      });
      lines.push({
        lineId: 'n4-tot',
        lineLabel: 'Total Corpus',
        lineType: 'TOTAL',
        depth: 0,
        displayOrder: 3,
        cyAmount: calc.corpus.closingBalance,
        pyAmount: hasPY ? calc.corpus.pyClosingBalance : null,
        cyStatus: 'AVAILABLE',
        pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
        sourceNodeCodes: ['N_04_TOT'],
      });
      noteCYTotal = calc.corpus.closingBalance;
      notePYTotal = hasPY ? calc.corpus.pyClosingBalance : null;
    } else if (def.calculationMethod === 'RESERVE_SURPLUS') {
      // Note 5: Reserve and Surplus (3-column multi-fund movement)
      for (let i = 0; i < def.lineItems.length; i++) {
        const itemDef = def.lineItems[i];
        if (itemDef.lineType === 'TOTAL') {
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'TOTAL',
            depth: 0,
            displayOrder: itemDef.displayOrder,
            cyAmount: calc.reserveAndSurplus.totalClosingBalance,
            pyAmount: hasPY ? calc.reserveAndSurplus.pyTotalClosingBalance : null,
            cyStatus: 'AVAILABLE',
            pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
            sourceNodeCodes: [],
            openingBalance: calc.reserveAndSurplus.totalBroughtForward,
            additions: calc.reserveAndSurplus.totalAdditionsAdjustments,
            closingBalance: calc.reserveAndSurplus.totalClosingBalance,
            pyOpeningBalance: hasPY ? calc.reserveAndSurplus.pyTotalBroughtForward : null,
            pyAdditions: hasPY ? calc.reserveAndSurplus.pyTotalAdditionsAdjustments : null,
            pyClosingBalance: hasPY ? calc.reserveAndSurplus.pyTotalClosingBalance : null,
          });
        } else {
          const fundCode = itemDef.sourceNodeCodes[0];
          const fund = calc.reserveAndSurplus.funds.find(f => f.nodeCode === fundCode);
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: itemDef.lineType,
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: fund ? fund.closingBalance : 0,
            pyAmount: hasPY ? (fund ? fund.pyClosingBalance : 0) : null,
            cyStatus: fund ? 'AVAILABLE' : 'SOURCE_MISSING',
            pyStatus: hasPY ? (fund ? 'AVAILABLE' : 'SOURCE_MISSING') : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
            footnote: itemDef.footnote,
            openingBalance: fund ? fund.balanceBroughtForward : 0,
            additions: fund ? fund.additionsAdjustments : 0,
            closingBalance: fund ? fund.closingBalance : 0,
            pyOpeningBalance: hasPY ? (fund ? fund.pyBalanceBroughtForward : 0) : null,
            pyAdditions: hasPY ? (fund ? fund.pyAdditionsAdjustments : 0) : null,
            pyClosingBalance: hasPY ? (fund ? fund.pyClosingBalance : 0) : null,
          });
        }
      }
      noteCYTotal = calc.reserveAndSurplus.totalClosingBalance;
      notePYTotal = hasPY ? calc.reserveAndSurplus.pyTotalClosingBalance : null;
    } else if (def.calculationMethod === 'TANGIBLE_ASSETS') {
      // Note 11: Tangible Assets (PPE Gross Block + Depreciation)
      for (const itemDef of def.lineItems) {
        if (itemDef.lineType === 'TOTAL') {
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'TOTAL',
            depth: 0,
            displayOrder: itemDef.displayOrder,
            cyAmount: calc.tangibleAssets.totalNetAssetCY,
            pyAmount: hasPY ? calc.tangibleAssets.totalNetAssetPY : null,
            cyStatus: 'AVAILABLE',
            pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
            sourceNodeCodes: ['N_11_TOT'],
            openingBalance: calc.tangibleAssets.totalGrossOpening,
            additions: calc.tangibleAssets.totalAdditions,
            disposals: calc.tangibleAssets.totalDisposalsAdjustments,
            grantSubsidy: calc.tangibleAssets.totalGrantSubsidyReceived,
            closingBalance: calc.tangibleAssets.totalGrossClosing,
            depreciation: calc.tangibleAssets.totalDepreciationForYear,
            pyNetAsset: hasPY ? calc.tangibleAssets.totalNetAssetPY : null,
          });
        } else {
          const nodeCode = itemDef.sourceNodeCodes[0];
          const cat = calc.tangibleAssets.assets.find(c => c.nodeCode === nodeCode);
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: itemDef.lineType,
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: cat ? cat.netAssetCY : 0,
            pyAmount: hasPY ? (cat ? cat.netAssetPY : 0) : null,
            cyStatus: cat ? 'AVAILABLE' : 'SOURCE_MISSING',
            pyStatus: hasPY ? (cat ? 'AVAILABLE' : 'SOURCE_MISSING') : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
            footnote: itemDef.footnote,
            openingBalance: cat ? cat.grossOpening : 0,
            additions: cat ? cat.additions : 0,
            disposals: cat ? cat.disposalsAdjustments : 0,
            grantSubsidy: cat ? cat.grantSubsidyReceived : 0,
            closingBalance: cat ? cat.grossClosing : 0,
            depreciation: cat ? cat.depreciationForYear : 0,
            pyNetAsset: hasPY ? (cat ? cat.netAssetPY : 0) : null,
          });
        }
      }
      noteCYTotal = calc.tangibleAssets.totalNetAssetCY;
      notePYTotal = hasPY ? calc.tangibleAssets.totalNetAssetPY : null;
    } else if (def.calculationMethod === 'CWIP') {
      // Note 12: Capital Work in Progress
      for (const itemDef of def.lineItems) {
        if (itemDef.lineType === 'TOTAL') {
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'TOTAL',
            depth: 0,
            displayOrder: itemDef.displayOrder,
            cyAmount: calc.cwip.totalClosingBalance,
            pyAmount: hasPY ? calc.cwip.pyTotalClosingBalance : null,
            cyStatus: 'AVAILABLE',
            pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
            sourceNodeCodes: [],
            openingBalance: calc.cwip.totalOpeningBalance,
            additions: calc.cwip.totalAdditions,
            adjustments: calc.cwip.totalAdjustments,
            closingBalance: calc.cwip.totalClosingBalance,
            pyOpeningBalance: hasPY ? calc.cwip.pyTotalOpeningBalance : null,
            pyAdditions: hasPY ? calc.cwip.pyTotalAdditions : null,
            pyAdjustments: hasPY ? calc.cwip.pyTotalAdjustments : null,
            pyClosingBalance: hasPY ? calc.cwip.pyTotalClosingBalance : null,
          });
        } else {
          const nodeCode = itemDef.sourceNodeCodes[0];
          const cat = calc.cwip.categories.find(c => c.nodeCode === nodeCode);
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: itemDef.lineType,
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: cat ? cat.closingBalance : 0,
            pyAmount: hasPY ? (cat ? cat.pyClosingBalance : 0) : null,
            cyStatus: cat ? 'AVAILABLE' : 'SOURCE_MISSING',
            pyStatus: hasPY ? (cat ? 'AVAILABLE' : 'SOURCE_MISSING') : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
            openingBalance: cat ? cat.openingBalance : 0,
            additions: cat ? cat.additions : 0,
            adjustments: cat ? cat.adjustments : 0,
            closingBalance: cat ? cat.closingBalance : 0,
            pyOpeningBalance: hasPY ? (cat ? cat.pyOpeningBalance : 0) : null,
            pyAdditions: hasPY ? (cat ? cat.pyAdditions : 0) : null,
            pyAdjustments: hasPY ? (cat ? cat.pyAdjustments : 0) : null,
            pyClosingBalance: hasPY ? (cat ? cat.pyClosingBalance : 0) : null,
          });
        }
      }
      noteCYTotal = calc.cwip.totalClosingBalance;
      notePYTotal = hasPY ? calc.cwip.pyTotalClosingBalance : null;
    } else if (def.calculationMethod === 'LIVE_STOCK') {
      // Note 13: Live Stock
      for (const itemDef of def.lineItems) {
        if (itemDef.lineType === 'TOTAL') {
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'TOTAL',
            depth: 0,
            displayOrder: itemDef.displayOrder,
            cyAmount: calc.liveStock.totalClosingBalance,
            pyAmount: hasPY ? calc.liveStock.pyTotalClosingBalance : null,
            cyStatus: 'AVAILABLE',
            pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
            sourceNodeCodes: ['N_13_COWS'],
            openingBalance: calc.liveStock.totalOpeningBalance,
            additions: calc.liveStock.totalAdditions,
            adjustments: calc.liveStock.totalAdjustments,
            closingBalance: calc.liveStock.totalClosingBalance,
            pyOpeningBalance: hasPY ? calc.liveStock.pyTotalOpeningBalance : null,
            pyAdditions: hasPY ? calc.liveStock.pyTotalAdditions : null,
            pyAdjustments: hasPY ? calc.liveStock.pyTotalAdjustments : null,
            pyClosingBalance: hasPY ? calc.liveStock.pyTotalClosingBalance : null,
          });
        } else {
          const nodeCode = itemDef.sourceNodeCodes[0];
          const it = calc.liveStock.items.find(i => i.nodeCode === nodeCode);
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: itemDef.lineType,
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: it ? it.closingBalance : 0,
            pyAmount: hasPY ? (it ? it.pyClosingBalance : 0) : null,
            cyStatus: it ? 'AVAILABLE' : 'SOURCE_MISSING',
            pyStatus: hasPY ? (it ? 'AVAILABLE' : 'SOURCE_MISSING') : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
            footnote: itemDef.footnote,
            openingBalance: it ? it.openingBalance : 0,
            additions: it ? it.additions : 0,
            adjustments: it ? it.adjustments : 0,
            closingBalance: it ? it.closingBalance : 0,
            pyOpeningBalance: hasPY ? (it ? it.pyOpeningBalance : 0) : null,
            pyAdditions: hasPY ? (it ? it.pyAdditions : 0) : null,
            pyAdjustments: hasPY ? (it ? it.pyAdjustments : 0) : null,
            pyClosingBalance: hasPY ? (it ? it.pyClosingBalance : 0) : null,
          });
        }
      }
      noteCYTotal = calc.liveStock.totalClosingBalance;
      notePYTotal = hasPY ? calc.liveStock.pyTotalClosingBalance : null;
    } else if (def.calculationMethod === 'LOANS_ADVANCES') {
      // Note 18: Short term loans and advances
      for (const itemDef of def.lineItems) {
        if (itemDef.lineType === 'HEADER') {
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'HEADER',
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: null,
            pyAmount: null,
            cyStatus: 'NOT_APPLICABLE',
            pyStatus: 'NOT_APPLICABLE',
            sourceNodeCodes: [],
          });
        } else if (itemDef.lineType === 'TOTAL') {
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'TOTAL',
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: calc.loansAndAdvances.currentPortionOfLoansAndAdvances,
            pyAmount: hasPY ? calc.loansAndAdvances.pyCurrentPortion : null,
            cyStatus: 'AVAILABLE',
            pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
          });
        } else if (itemDef.lineType === 'DEDUCTION') {
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'DEDUCTION',
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: calc.loansAndAdvances.nonCurrentSecurityDepositsRerouted,
            pyAmount: hasPY ? calc.loansAndAdvances.pyNonCurrentPortion : null,
            cyStatus: 'AVAILABLE',
            pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
          });
        } else {
          const n = nodeMap.get(itemDef.sourceNodeCodes[0]);
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: itemDef.lineType,
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: n ? n.cyNet : 0,
            pyAmount: hasPY ? (n ? n.pyNet : 0) : null,
            cyStatus: n ? 'AVAILABLE' : 'SOURCE_MISSING',
            pyStatus: hasPY ? (n ? 'AVAILABLE' : 'SOURCE_MISSING') : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
            ledgerCount: n?.ledgerCount,
          });
        }
      }
      noteCYTotal = calc.loansAndAdvances.currentPortionOfLoansAndAdvances;
      notePYTotal = hasPY ? calc.loansAndAdvances.pyCurrentPortion : null;
    } else if (def.calculationMethod === 'STOCK_MOVEMENT') {
      // Note 25: Increase/(Decrease) in FG, Mfg & WIP
      for (const itemDef of def.lineItems) {
        if (itemDef.lineType === 'HEADER') {
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'HEADER',
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: null,
            pyAmount: null,
            cyStatus: 'NOT_APPLICABLE',
            pyStatus: 'NOT_APPLICABLE',
            sourceNodeCodes: [],
          });
        } else if (itemDef.lineId === 'n25-cl-tot') {
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'SUBTOTAL',
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: calc.stockMovement.totalClosingStock,
            pyAmount: hasPY ? calc.stockMovement.pyTotalClosingStock : null,
            cyStatus: 'AVAILABLE',
            pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
          });
        } else if (itemDef.lineId === 'n25-op-tot') {
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'SUBTOTAL',
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: calc.stockMovement.totalOpeningStock,
            pyAmount: hasPY ? calc.stockMovement.pyTotalOpeningStock : null,
            cyStatus: 'AVAILABLE',
            pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
          });
        } else if (itemDef.lineId === 'n25-net-tot') {
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'TOTAL',
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: calc.stockMovement.netIncreaseDecreaseTotal,
            pyAmount: hasPY ? calc.stockMovement.pyNetIncreaseDecreaseTotal : null,
            cyStatus: 'AVAILABLE',
            pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
          });
        } else {
          const n = nodeMap.get(itemDef.sourceNodeCodes[0]);
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: itemDef.lineType,
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: n ? n.cyNet : 0,
            pyAmount: hasPY ? (n ? n.pyNet : 0) : null,
            cyStatus: n ? 'AVAILABLE' : 'SOURCE_MISSING',
            pyStatus: hasPY ? (n ? 'AVAILABLE' : 'SOURCE_MISSING') : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
            ledgerCount: n?.ledgerCount,
          });
        }
      }
      noteCYTotal = calc.stockMovement.netIncreaseDecreaseTotal;
      notePYTotal = hasPY ? calc.stockMovement.pyNetIncreaseDecreaseTotal : null;
    } else if (def.calculationMethod === 'MATERIAL_CONSUMPTION') {
      // Note 28: Consumption of material, stores & others
      for (const itemDef of def.lineItems) {
        if (itemDef.lineType === 'HEADER') {
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'HEADER',
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: null,
            pyAmount: null,
            cyStatus: 'NOT_APPLICABLE',
            pyStatus: 'NOT_APPLICABLE',
            sourceNodeCodes: [],
          });
        } else if (itemDef.lineId === 'n28-cons') {
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'TOTAL',
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: calc.materialConsumption.consumptions,
            pyAmount: hasPY ? calc.materialConsumption.pyConsumptions : null,
            cyStatus: 'AVAILABLE',
            pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
          });
        } else {
          const n = nodeMap.get(itemDef.sourceNodeCodes[0]);
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: itemDef.lineType,
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: n ? n.cyNet : 0,
            pyAmount: hasPY ? (n ? n.pyNet : 0) : null,
            cyStatus: n ? 'AVAILABLE' : 'SOURCE_MISSING',
            pyStatus: hasPY ? (n ? 'AVAILABLE' : 'SOURCE_MISSING') : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
            ledgerCount: n?.ledgerCount,
          });
        }
      }
      noteCYTotal = calc.materialConsumption.consumptions;
      notePYTotal = hasPY ? calc.materialConsumption.pyConsumptions : null;
    } else if (def.calculationMethod === 'TRADING_COGS') {
      // Note 29: Cost of Trading Items sold
      for (const itemDef of def.lineItems) {
        if (itemDef.lineId === 'n29-cogs') {
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'TOTAL',
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: calc.tradingCOGS.costOfTradingItemsSold,
            pyAmount: hasPY ? calc.tradingCOGS.pyCostOfTradingItemsSold : null,
            cyStatus: 'AVAILABLE',
            pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
          });
        } else {
          const n = nodeMap.get(itemDef.sourceNodeCodes[0]);
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: itemDef.lineType,
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: n ? n.cyNet : 0,
            pyAmount: hasPY ? (n ? n.pyNet : 0) : null,
            cyStatus: n ? 'AVAILABLE' : 'SOURCE_MISSING',
            pyStatus: hasPY ? (n ? 'AVAILABLE' : 'SOURCE_MISSING') : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
            ledgerCount: n?.ledgerCount,
          });
        }
      }
      noteCYTotal = calc.tradingCOGS.costOfTradingItemsSold;
      notePYTotal = hasPY ? calc.tradingCOGS.pyCostOfTradingItemsSold : null;
    } else {
      // Standard NODE_BALANCE aggregation (Notes 6, 7, 8, 9, 10, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 26, 27, 30, 31, 32, 33)
      let runningCYTotal = 0;
      let runningPYTotal = 0;

      for (const itemDef of def.lineItems) {
        if (itemDef.lineType === 'HEADER') {
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'HEADER',
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: null,
            pyAmount: null,
            cyStatus: 'NOT_APPLICABLE',
            pyStatus: 'NOT_APPLICABLE',
            sourceNodeCodes: [],
          });
        } else if (itemDef.lineType === 'TOTAL') {
          // Total row: use Phase 10 schedule total or sum of line items
          const schRow = schMap.get(def.scheduleCode);
          const totalCY = schRow ? schRow.cyTotal : runningCYTotal;
          const totalPY = hasPY ? (schRow ? schRow.pyTotal : runningPYTotal) : null;
          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: 'TOTAL',
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: totalCY,
            pyAmount: totalPY,
            cyStatus: 'AVAILABLE',
            pyStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
            sourceNodeCodes: itemDef.sourceNodeCodes,
          });
          noteCYTotal = totalCY;
          notePYTotal = totalPY;
        } else {
          // Line item or deduction
          let cy = 0;
          let py = 0;
          let statusCY: DataStatus = 'AVAILABLE';
          let statusPY: DataStatus = hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE';
          let ledgerCount = 0;

          for (const code of itemDef.sourceNodeCodes) {
            const n = nodeMap.get(code);
            if (n) {
              const nodeCY = itemDef.lineType === 'DEDUCTION' ? -Math.abs(n.cyNet) : n.cyNet;
              const nodePY = itemDef.lineType === 'DEDUCTION' ? -Math.abs(n.pyNet) : n.pyNet;
              cy += nodeCY;
              py += nodePY;
              ledgerCount += n.ledgerCount;
            } else {
              statusCY = 'SOURCE_MISSING';
            }
          }

          cy = round2(cy);
          py = round2(py);
          runningCYTotal = round2(runningCYTotal + cy);
          runningPYTotal = round2(runningPYTotal + py);

          lines.push({
            lineId: itemDef.lineId,
            lineLabel: itemDef.lineLabel,
            lineType: itemDef.lineType,
            depth: itemDef.depth,
            displayOrder: itemDef.displayOrder,
            cyAmount: cy,
            pyAmount: hasPY ? py : null,
            cyStatus: statusCY,
            pyStatus: statusPY,
            sourceNodeCodes: itemDef.sourceNodeCodes,
            footnote: itemDef.footnote,
            ledgerCount,
          });
        }
      }

      if (noteCYTotal === null) {
        const schRow = schMap.get(def.scheduleCode);
        noteCYTotal = schRow ? schRow.cyTotal : runningCYTotal;
        notePYTotal = hasPY ? (schRow ? schRow.pyTotal : runningPYTotal) : null;
      }
    }

    // Check if Note has any non-zero data
    const hasData = lines.some(l => (l.cyAmount !== null && l.cyAmount !== 0) || (l.pyAmount !== null && l.pyAmount !== 0));

    // Reconcile Note against Statement Lines
    let reconciliation: NoteReconciliation | null = null;
    let matchingStmtLine: StatementLineItem | undefined;

    if (def.statementCode === 'BS') {
      matchingStmtLine = bsLines.find(l => l.scheduleCode === def.scheduleCode);
    } else {
      matchingStmtLine = ieLines.find(l => l.scheduleCode === def.scheduleCode);
    }

    if (matchingStmtLine && noteCYTotal !== null) {
      const stmtCY = matchingStmtLine.cyAmount;
      const stmtPY = matchingStmtLine.pyAmount;
      const noteCY = noteCYTotal;
      const notePY = notePYTotal !== null ? notePYTotal : 0;
      const diffCY = round2(Math.abs(noteCY - stmtCY));
      const diffPY = round2(Math.abs(notePY - stmtPY));

      reconciliation = {
        noteNumber: def.noteNumber,
        scheduleCode: def.scheduleCode,
        statementCode: def.statementCode,
        statementLineTitle: matchingStmtLine.lineTitle,
        statementAmountCY: stmtCY,
        statementAmountPY: stmtPY,
        noteAmountCY: noteCY,
        noteAmountPY: notePY,
        differenceCY: diffCY,
        differencePY: diffPY,
        isReconciledCY: diffCY <= 0.01,
        isReconciledPY: !hasPY || diffPY <= 0.01,
      };
    }

    generatedNotes.push({
      noteNumber: def.noteNumber,
      title: def.title,
      scheduleCode: def.scheduleCode,
      statementCode: def.statementCode,
      calculationMethod: def.calculationMethod,
      calculatorKey: def.calculatorKey,
      lines,
      cyTotal: noteCYTotal,
      pyTotal: notePYTotal,
      cyTotalStatus: 'AVAILABLE',
      pyTotalStatus: hasPY ? 'AVAILABLE' : 'PY_UNAVAILABLE',
      footnotes: def.footnotes,
      hasData,
      reconciliation,
    });
  }

  // Summary of reconciliations
  const reconciledNotes = generatedNotes.filter(n => n.reconciliation ? n.reconciliation.isReconciledCY : true);
  const checkedNotes = generatedNotes.filter(n => n.reconciliation !== null);
  const unreconciledCount = checkedNotes.filter(n => !n.reconciliation!.isReconciledCY).length;
  const allReconciled = unreconciledCount === 0;

  return {
    financialYearId,
    financialYearLabel: p10Result.financialYearLabel || financialYearId,
    scope: options.scope || 'ENTITY',
    unitId: options.unitId,
    unitName: p10Result.unitName,
    consolidationRunId: options.consolidationRunId,
    totalNotes: generatedNotes.length,
    balanceSheetNotesCount: generatedNotes.filter(n => n.statementCode === 'BS').length,
    incomeExpenditureNotesCount: generatedNotes.filter(n => n.statementCode === 'IE').length,
    allReconciled,
    unreconciledCount,
    notes: generatedNotes,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Returns full drill-down audit trail for a specific Note line item:
 * Note -> Node -> FSLI -> Ledgers -> Import Batch
 */
export function getNoteDrillDown(
  db: Database.Database,
  financialYearId: string,
  noteNumber: number,
  lineId: string,
  options: {
    unitId?: string;
    consolidationRunId?: string;
    scope?: 'ENTITY' | 'UNIT' | 'CONSOLIDATED';
  } = {}
): NoteDrillDownResult {
  const noteDef = NOTE_DEFINITIONS.find(n => n.noteNumber === noteNumber);
  if (!noteDef) {
    throw new Error(`Note ${noteNumber} not found in master data.`);
  }

  const lineDef = noteDef.lineItems.find(l => l.lineId === lineId);
  if (!lineDef) {
    throw new Error(`Line ${lineId} not found in Note ${noteNumber}.`);
  }

  const p10Result = generateReportingHierarchyData(db, financialYearId, {
    unitId: options.unitId,
    consolidationRunId: options.consolidationRunId,
    scope: options.scope === 'CONSOLIDATED' ? 'CONSOLIDATED' : 'UNIT',
  });

  const nodeCodes = lineDef.sourceNodeCodes;
  const drillDownItems: NoteDrillDownLedger[] = [];
  let totalCY = 0;

  for (const nodeRow of p10Result.subScheduleRows) {
    if (nodeCodes.includes(nodeRow.nodeCode) && nodeRow.ledgerDetails) {
      for (const ld of nodeRow.ledgerDetails) {
        drillDownItems.push({
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
        totalCY += ld.net;
      }
    }
  }

  return {
    noteNumber,
    noteTitle: noteDef.title,
    lineId,
    lineLabel: lineDef.lineLabel,
    sourceNodeCodes: nodeCodes,
    totalCYNet: round2(totalCY),
    ledgerCount: drillDownItems.length,
    ledgers: drillDownItems,
  };
}
