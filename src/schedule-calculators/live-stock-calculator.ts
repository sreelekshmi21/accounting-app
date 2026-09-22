/**
 * Note 13: Live Stock Schedule Calculator
 * Movement schedule for Live Stock (Cows):
 * Opening (As at April 1, 2025) + Additions + Adjustments = Closing (As at March 31, 2026)
 */

import type { ScheduleCalculationContext, ReconciliationValidationResult } from './types';

export interface LiveStockMovement {
  nodeCode: string;
  name: string;
  openingBalance: number;
  additions: number;
  adjustments: number;
  closingBalance: number;
  pyOpeningBalance: number;
  pyAdditions: number;
  pyAdjustments: number;
  pyClosingBalance: number;
}

export interface LiveStockScheduleResult {
  scheduleCode: 'SCH_13';
  items: LiveStockMovement[];
  totalOpeningBalance: number;
  totalAdditions: number;
  totalAdjustments: number;
  totalClosingBalance: number;
  pyTotalOpeningBalance: number;
  pyTotalAdditions: number;
  pyTotalAdjustments: number;
  pyTotalClosingBalance: number;
}

const LIVE_STOCK_ITEMS: Array<{ nodeCode: string; name: string }> = [
  { nodeCode: 'N_13_COWS', name: 'Cows#' },
];

export function calculateLiveStock(context: ScheduleCalculationContext): LiveStockScheduleResult {
  const items: LiveStockMovement[] = [];
  let totalOp = 0;
  let totalAdd = 0;
  let totalAdj = 0;
  let totalCl = 0;

  let pyTotalOp = 0;
  let pyTotalAdd = 0;
  let pyTotalAdj = 0;
  let pyTotalCl = 0;

  for (const it of LIVE_STOCK_ITEMS) {
    const node = context.nodeBalances.get(it.nodeCode);
    const pyNode = context.pyNodeBalances?.get(it.nodeCode);

    const netCY = node ? (node.debit - node.credit) : 0;
    const netPY = pyNode ? (pyNode.debit - pyNode.credit) : 0;

    // CY Movement:
    const opening = netPY;
    const closing = netCY;
    const movement = closing - opening;
    const additions = movement > 0 ? movement : 0;
    const adjustments = movement < 0 ? movement : 0;

    // PY Movement:
    const pyOpening = 0;
    const pyClosing = netPY;
    const pyMovement = pyClosing - pyOpening;
    const pyAdd = pyMovement > 0 ? pyMovement : 0;
    const pyAdj = pyMovement < 0 ? pyMovement : 0;

    items.push({
      nodeCode: it.nodeCode,
      name: it.name,
      openingBalance: opening,
      additions,
      adjustments,
      closingBalance: closing,
      pyOpeningBalance: pyOpening,
      pyAdditions: pyAdd,
      pyAdjustments: pyAdj,
      pyClosingBalance: pyClosing,
    });

    totalOp += opening;
    totalAdd += additions;
    totalAdj += adjustments;
    totalCl += closing;

    pyTotalOp += pyOpening;
    pyTotalAdd += pyAdd;
    pyTotalAdj += pyAdj;
    pyTotalCl += pyClosing;
  }

  return {
    scheduleCode: 'SCH_13',
    items,
    totalOpeningBalance: totalOp,
    totalAdditions: totalAdd,
    totalAdjustments: totalAdj,
    totalClosingBalance: totalCl,
    pyTotalOpeningBalance: pyTotalOp,
    pyTotalAdditions: pyTotalAdd,
    pyTotalAdjustments: pyTotalAdj,
    pyTotalClosingBalance: pyTotalCl,
  };
}

export function validateLiveStockReconciliation(
  result: LiveStockScheduleResult,
  _context: ScheduleCalculationContext,
): ReconciliationValidationResult {
  let isReconciled = true;
  for (const it of result.items) {
    const expected = it.openingBalance + it.additions + it.adjustments;
    if (Math.abs(it.closingBalance - expected) > 0.01) {
      isReconciled = false;
      break;
    }
  }

  return {
    scheduleCode: 'SCH_13',
    isReconciled,
    expectedAmount: result.totalOpeningBalance + result.totalAdditions + result.totalAdjustments,
    calculatedAmount: result.totalClosingBalance,
    difference: Math.abs(result.totalClosingBalance - (result.totalOpeningBalance + result.totalAdditions + result.totalAdjustments)),
    details: 'Live Stock Movement: Closing = Opening + Additions + Adjustments',
  };
}
