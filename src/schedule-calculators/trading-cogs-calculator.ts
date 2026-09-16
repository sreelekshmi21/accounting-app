/**
 * Note 29: Cost of Trading Items sold Calculator
 * Formula: Opening Stock Trading + Purchases - Closing Stock Trading = Cost of Trading Items Sold
 */

import type { ScheduleCalculationContext, ReconciliationValidationResult } from './types';

export interface TradingCOGSResult {
  scheduleCode: 'SCH_29';
  openingStockTrading: number;
  addPurchases: number;
  lessClosingStockTrading: number;
  costOfTradingItemsSold: number;
  pyOpeningStock: number;
  pyPurchases: number;
  pyClosingStock: number;
  pyCostOfTradingItemsSold: number;
  isReconciled: boolean;
}

export function calculateTradingCOGS(context: ScheduleCalculationContext): TradingCOGSResult {
  const nodeOp = context.nodeBalances.get('N_29_OP_TRD');
  const nodePur = context.nodeBalances.get('N_29_PUR');
  const nodeCl = context.nodeBalances.get('N_29_CL_TRD') || context.nodeBalances.get('N_17_TRADE');

  const pyNodeOp = context.pyNodeBalances?.get('N_29_OP_TRD');
  const pyNodePur = context.pyNodeBalances?.get('N_29_PUR');
  const pyNodeCl = context.pyNodeBalances?.get('N_29_CL_TRD') || context.pyNodeBalances?.get('N_17_TRADE');

  const op = nodeOp ? nodeOp.debit : (pyNodeCl ? pyNodeCl.debit : 0);
  const pur = nodePur ? (nodePur.debit - nodePur.credit) : (context.fsliBalances.get('EXP_PUR_STOCK')?.debit || 0);
  const cl = nodeCl ? nodeCl.debit : 0;

  const cogs = op + pur - cl;

  const pyOp = pyNodeOp ? pyNodeOp.debit : 0;
  const pyPur = pyNodePur ? (pyNodePur.debit - pyNodePur.credit) : 0;
  const pyCl = pyNodeCl ? pyNodeCl.debit : 0;
  const pyCogs = pyOp + pyPur - pyCl;

  return {
    scheduleCode: 'SCH_29',
    openingStockTrading: op,
    addPurchases: pur,
    lessClosingStockTrading: cl,
    costOfTradingItemsSold: cogs,
    pyOpeningStock: pyOp,
    pyPurchases: pyPur,
    pyClosingStock: pyCl,
    pyCostOfTradingItemsSold: pyCogs,
    isReconciled: true,
  };
}

export function validateTradingCOGSReconciliation(
  result: TradingCOGSResult,
  _context: ScheduleCalculationContext,
): ReconciliationValidationResult {
  const expected = result.openingStockTrading + result.addPurchases - result.lessClosingStockTrading;
  const diff = Math.abs(result.costOfTradingItemsSold - expected);

  return {
    scheduleCode: 'SCH_29',
    isReconciled: diff < 0.01,
    expectedAmount: expected,
    calculatedAmount: result.costOfTradingItemsSold,
    difference: diff,
    details: 'COGS = Opening Trading Stock + Purchases - Closing Trading Stock',
  };
}
