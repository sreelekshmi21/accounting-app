/**
 * Note 12: Capital Work in Progress Schedule Calculator
 * Movement schedule across CWIP asset categories:
 * Opening (As at April 1, 2025) + Additions + Adjustments = Closing (As at March 31, 2026)
 */

import type { ScheduleCalculationContext, ReconciliationValidationResult } from './types';

export interface CWIPCategoryMovement {
  nodeCode: string;
  categoryName: string;
  openingBalance: number;
  additions: number;
  adjustments: number;
  closingBalance: number;
  pyOpeningBalance: number;
  pyAdditions: number;
  pyAdjustments: number;
  pyClosingBalance: number;
}

export interface CWIPScheduleResult {
  scheduleCode: 'SCH_12';
  categories: CWIPCategoryMovement[];
  totalOpeningBalance: number;
  totalAdditions: number;
  totalAdjustments: number;
  totalClosingBalance: number;
  pyTotalOpeningBalance: number;
  pyTotalAdditions: number;
  pyTotalAdjustments: number;
  pyTotalClosingBalance: number;
}

const CWIP_CATEGORIES: Array<{ nodeCode: string; name: string }> = [
  { nodeCode: 'N_12_BLD_CH', name: 'Community and other Charitable Building' },
  { nodeCode: 'N_12_SCI_BLD', name: 'Scientific R & D Building' },
  { nodeCode: 'N_12_CONV', name: 'Convention Centre' },
  { nodeCode: 'N_12_COIR', name: 'Koottukudumba Coir (ACCDS Project)' },
  { nodeCode: 'N_12_STP', name: 'STP and Sub-Station Unit' },
  { nodeCode: 'N_12_SCHL', name: 'School and College Building' },
  { nodeCode: 'N_12_OTH', name: 'Other Building and Facilities' },
];

export function calculateCWIP(context: ScheduleCalculationContext): CWIPScheduleResult {
  const categories: CWIPCategoryMovement[] = [];
  let totalOp = 0;
  let totalAdd = 0;
  let totalAdj = 0;
  let totalCl = 0;

  let pyTotalOp = 0;
  let pyTotalAdd = 0;
  let pyTotalAdj = 0;
  let pyTotalCl = 0;

  for (const cat of CWIP_CATEGORIES) {
    const node = context.nodeBalances.get(cat.nodeCode);
    const pyNode = context.pyNodeBalances?.get(cat.nodeCode);

    const netCY = node ? (node.debit - node.credit) : 0;
    const netPY = pyNode ? (pyNode.debit - pyNode.credit) : 0;

    // CY Movement:
    // Opening balance b/f is PY closing balance
    const opening = netPY;
    const closing = netCY;
    // Additions/Adjustments movement during the year
    const movement = closing - opening;
    const additions = movement > 0 ? movement : 0;
    const adjustments = movement < 0 ? movement : 0;

    // PY Movement:
    const pyOpening = 0;
    const pyClosing = netPY;
    const pyMovement = pyClosing - pyOpening;
    const pyAdd = pyMovement > 0 ? pyMovement : 0;
    const pyAdj = pyMovement < 0 ? pyMovement : 0;

    categories.push({
      nodeCode: cat.nodeCode,
      categoryName: cat.name,
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
    scheduleCode: 'SCH_12',
    categories,
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

export function validateCWIPReconciliation(
  result: CWIPScheduleResult,
  _context: ScheduleCalculationContext,
): ReconciliationValidationResult {
  let isReconciled = true;
  for (const c of result.categories) {
    const expected = c.openingBalance + c.additions + c.adjustments;
    if (Math.abs(c.closingBalance - expected) > 0.01) {
      isReconciled = false;
      break;
    }
  }

  return {
    scheduleCode: 'SCH_12',
    isReconciled,
    expectedAmount: result.totalOpeningBalance + result.totalAdditions + result.totalAdjustments,
    calculatedAmount: result.totalClosingBalance,
    difference: Math.abs(result.totalClosingBalance - (result.totalOpeningBalance + result.totalAdditions + result.totalAdjustments)),
    details: 'CWIP Movement: Closing = Opening + Additions + Adjustments',
  };
}
