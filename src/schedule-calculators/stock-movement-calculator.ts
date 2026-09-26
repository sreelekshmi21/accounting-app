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
  // Helper to get net balance according to node nature
  const getClBalance = (clNodeCode: string, invNodeCode: string): number => {
    const clNode = context.nodeBalances.get(clNodeCode);
    const netCl = clNode ? (clNode.credit - clNode.debit) : 0;
    if (netCl !== 0) return netCl;
    const invNode = context.nodeBalances.get(invNodeCode);
    return invNode ? (invNode.debit - invNode.credit) : 0;
  };

  const getOpBalance = (opNodeCode: string, clNodeCode: string, invNodeCode: string): number => {
    const opNode = context.nodeBalances.get(opNodeCode);
    const netOp = opNode ? (opNode.debit - opNode.credit) : 0;
    if (netOp !== 0) return netOp;
    const pyClNode = context.pyNodeBalances?.get(clNodeCode);
    const pyNetCl = pyClNode ? (pyClNode.credit - pyClNode.debit) : 0;
    if (pyNetCl !== 0) return pyNetCl;
    const pyInvNode = context.pyNodeBalances?.get(invNodeCode);
    return pyInvNode ? (pyInvNode.debit - pyInvNode.credit) : 0;
  };

  const clMfg = getClBalance('N_25_CL_MFG', 'N_17_FG');
  const clWip = getClBalance('N_25_CL_WIP', 'N_17_WIP');
  const clOth = getClBalance('N_25_CL_OTH', 'N_17_OTH');

  const opMfg = getOpBalance('N_25_OP_MFG', 'N_25_CL_MFG', 'N_17_FG');
  const opWip = getOpBalance('N_25_OP_WIP', 'N_25_CL_WIP', 'N_17_WIP');
  const opOth = getOpBalance('N_25_OP_OTH', 'N_25_CL_OTH', 'N_17_OTH');

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
