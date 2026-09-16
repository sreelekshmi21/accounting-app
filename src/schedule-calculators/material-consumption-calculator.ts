/**
 * Note 28: Consumption of material, stores and others Calculator
 * Formula: Opening Stock Raw Material + Purchases - Closing Stock Raw Material = Consumptions
 */

import type { ScheduleCalculationContext, ReconciliationValidationResult } from './types';

export interface MaterialConsumptionResult {
  scheduleCode: 'SCH_28';
  openingStockRawMaterial: number;
  addPurchases: number;
  lessClosingStockRawMaterial: number;
  consumptions: number;
  pyOpeningStock: number;
  pyPurchases: number;
  pyClosingStock: number;
  pyConsumptions: number;
  isReconciled: boolean;
}

export function calculateMaterialConsumption(context: ScheduleCalculationContext): MaterialConsumptionResult {
  // Source: Opening Stock from PY Note 17 RM or N_28_OP_RM
  // Source: Purchases from EXP_MAT_CONS / N_28_PUR
  // Source: Closing Stock from Note 17 RM (N_17_RM) or N_28_CL_RM
  const nodeOp = (context.nodeBalances.get('N_28_OP_RM')?.debit ? context.nodeBalances.get('N_28_OP_RM') : null);
  const nodePur = context.nodeBalances.get('N_28_PUR');
  const nodeCl = (context.nodeBalances.get('N_28_CL_RM')?.debit ? context.nodeBalances.get('N_28_CL_RM') : null) || context.nodeBalances.get('N_17_RM');

  const pyNodeOp = (context.pyNodeBalances?.get('N_28_OP_RM')?.debit ? context.pyNodeBalances?.get('N_28_OP_RM') : null);
  const pyNodePur = context.pyNodeBalances?.get('N_28_PUR');
  const pyNodeCl = (context.pyNodeBalances?.get('N_28_CL_RM')?.debit ? context.pyNodeBalances?.get('N_28_CL_RM') : null) || context.pyNodeBalances?.get('N_17_RM');

  const op = nodeOp ? nodeOp.debit : (pyNodeCl ? pyNodeCl.debit : 0);
  const pur = nodePur && (nodePur.debit - nodePur.credit) > 0 ? (nodePur.debit - nodePur.credit) : (context.fsliBalances.get('EXP_MAT_CONS')?.debit || 0);
  const cl = nodeCl ? nodeCl.debit : 0;

  const consumptions = op + pur - cl;

  const pyOp = pyNodeOp ? pyNodeOp.debit : 0;
  const pyPur = pyNodePur ? (pyNodePur.debit - pyNodePur.credit) : 0;
  const pyCl = pyNodeCl ? pyNodeCl.debit : 0;
  const pyConsumptions = pyOp + pyPur - pyCl;

  if (op === 0 && pur === 0 && cl === 0) {
    context.diagnostics.push({
      scheduleCode: 'SCH_28',
      scheduleNumber: 28,
      type: 'INCOMPLETE_INPUT',
      message: 'No Raw Material or Purchases mapped for Note 28 Material Consumption.',
      impact: 'Note 28 reports zero consumption.',
    });
  }

  return {
    scheduleCode: 'SCH_28',
    openingStockRawMaterial: op,
    addPurchases: pur,
    lessClosingStockRawMaterial: cl,
    consumptions,
    pyOpeningStock: pyOp,
    pyPurchases: pyPur,
    pyClosingStock: pyCl,
    pyConsumptions,
    isReconciled: true,
  };
}

export function validateMaterialConsumptionReconciliation(
  result: MaterialConsumptionResult,
  _context: ScheduleCalculationContext,
): ReconciliationValidationResult {
  const expected = result.openingStockRawMaterial + result.addPurchases - result.lessClosingStockRawMaterial;
  const diff = Math.abs(result.consumptions - expected);

  return {
    scheduleCode: 'SCH_28',
    isReconciled: diff < 0.01,
    expectedAmount: expected,
    calculatedAmount: result.consumptions,
    difference: diff,
    details: 'Consumptions = Opening Raw Material + Purchases - Closing Raw Material',
  };
}
