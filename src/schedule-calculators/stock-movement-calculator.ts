/**
 * Note 25: Increase / (Decrease) in Finished Goods, Manufacturing Items & WIP Calculator
 * Formula: Closing Stock Subtotal - Opening Stock Subtotal = Net Increase / (Decrease)
 */

import type { ScheduleCalculationContext, ReconciliationValidationResult } from './types';

export interface StockCategoryMovement {
  category: string;
  closingStock: number;
  openingStock: number;
  netIncreaseDecrease: number;
}

export interface StockMovementResult {
  scheduleCode: 'SCH_25';
  categories: StockCategoryMovement[];
  totalClosingStock: number;
  totalOpeningStock: number;
  netIncreaseDecreaseTotal: number;
  pyTotalClosingStock: number;
  pyTotalOpeningStock: number;
  pyNetIncreaseDecreaseTotal: number;
}

export function calculateStockMovement(context: ScheduleCalculationContext): StockMovementResult {
  // Source nodes for Closing Stock: N_25_CL_MFG, N_25_CL_WIP, N_25_CL_OTH
  // Source nodes for Opening Stock: N_25_OP_MFG, N_25_OP_WIP, N_25_OP_OTH
  // Also cross-checks with Note 17 inventories (N_17_WIP, N_17_FG, N_17_OTH)
  const clMfg = context.nodeBalances.get('N_25_CL_MFG')?.debit || context.nodeBalances.get('N_25_CL_MFG')?.net || context.nodeBalances.get('N_17_FG')?.debit || context.nodeBalances.get('N_17_FG')?.net || 0;
  const clWip = context.nodeBalances.get('N_25_CL_WIP')?.debit || context.nodeBalances.get('N_25_CL_WIP')?.net || context.nodeBalances.get('N_17_WIP')?.debit || context.nodeBalances.get('N_17_WIP')?.net || 0;
  const clOth = context.nodeBalances.get('N_25_CL_OTH')?.debit || context.nodeBalances.get('N_25_CL_OTH')?.net || context.nodeBalances.get('N_17_OTH')?.debit || context.nodeBalances.get('N_17_OTH')?.net || 0;

  // Check CY opening stock nodes first (from classified opening stock ledgers), then fall back to PY closing stock
  const opMfg = (context.nodeBalances.get('N_25_OP_MFG')?.debit || context.nodeBalances.get('N_25_OP_MFG')?.net || 0) ||
                (context.pyNodeBalances?.get('N_25_CL_MFG')?.debit || context.pyNodeBalances?.get('N_17_FG')?.debit || 0);
  const opWip = (context.nodeBalances.get('N_25_OP_WIP')?.debit || context.nodeBalances.get('N_25_OP_WIP')?.net || 0) ||
                (context.pyNodeBalances?.get('N_25_CL_WIP')?.debit || context.pyNodeBalances?.get('N_17_WIP')?.debit || 0);
  const opOth = (context.nodeBalances.get('N_25_OP_OTH')?.debit || context.nodeBalances.get('N_25_OP_OTH')?.net || 0) ||
                (context.pyNodeBalances?.get('N_25_CL_OTH')?.debit || context.pyNodeBalances?.get('N_17_OTH')?.debit || 0);

  const categories: StockCategoryMovement[] = [
    { category: 'Manufacturing Units', closingStock: clMfg, openingStock: opMfg, netIncreaseDecrease: clMfg - opMfg },
    { category: 'WIP', closingStock: clWip, openingStock: opWip, netIncreaseDecrease: clWip - opWip },
    { category: 'Other than Manufacturing & Trading Units', closingStock: clOth, openingStock: opOth, netIncreaseDecrease: clOth - opOth },
  ];

  const totalCl = clMfg + clWip + clOth;
  const totalOp = opMfg + opWip + opOth;
  const netTotal = totalCl - totalOp;

  return {
    scheduleCode: 'SCH_25',
    categories,
    totalClosingStock: totalCl,
    totalOpeningStock: totalOp,
    netIncreaseDecreaseTotal: netTotal,
    pyTotalClosingStock: totalOp,
    pyTotalOpeningStock: 0,
    pyNetIncreaseDecreaseTotal: totalOp,
  };
}

export function validateStockMovementReconciliation(
  result: StockMovementResult,
  _context: ScheduleCalculationContext,
): ReconciliationValidationResult {
  const expected = result.totalClosingStock - result.totalOpeningStock;
  const diff = Math.abs(result.netIncreaseDecreaseTotal - expected);

  return {
    scheduleCode: 'SCH_25',
    isReconciled: diff < 0.01,
    expectedAmount: expected,
    calculatedAmount: result.netIncreaseDecreaseTotal,
    difference: diff,
    details: 'Net Increase/(Decrease) = Total Closing Stock - Total Opening Stock',
  };
}
