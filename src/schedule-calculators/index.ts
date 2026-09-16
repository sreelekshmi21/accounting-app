/**
 * Schedule Calculators Registry & Dispatch
 */

export * from './types';
export * from './corpus-calculator';
export * from './reserve-surplus-calculator';
export * from './tangible-assets-calculator';
export * from './loans-advances-calculator';
export * from './stock-movement-calculator';
export * from './material-consumption-calculator';
export * from './trading-cogs-calculator';

import type { ScheduleCalculationContext } from './types';
import { calculateCorpus, validateCorpusReconciliation, type CorpusScheduleResult } from './corpus-calculator';
import { calculateReserveAndSurplus, validateReserveAndSurplusReconciliation, type ReserveAndSurplusResult } from './reserve-surplus-calculator';
import { calculateTangibleAssets, validateTangibleAssetsReconciliation, type TangibleAssetsScheduleResult } from './tangible-assets-calculator';
import { calculateLoansAndAdvances, validateLoansAndAdvancesReconciliation, type LoansAndAdvancesResult } from './loans-advances-calculator';
import { calculateStockMovement, validateStockMovementReconciliation, type StockMovementResult } from './stock-movement-calculator';
import { calculateMaterialConsumption, validateMaterialConsumptionReconciliation, type MaterialConsumptionResult } from './material-consumption-calculator';
import { calculateTradingCOGS, validateTradingCOGSReconciliation, type TradingCOGSResult } from './trading-cogs-calculator';

export interface AllCalculatedSchedulesResult {
  corpus: CorpusScheduleResult;
  reserveAndSurplus: ReserveAndSurplusResult;
  tangibleAssets: TangibleAssetsScheduleResult;
  loansAndAdvances: LoansAndAdvancesResult;
  stockMovement: StockMovementResult;
  materialConsumption: MaterialConsumptionResult;
  tradingCOGS: TradingCOGSResult;
}

export function executeAllCalculatedSchedules(context: ScheduleCalculationContext): AllCalculatedSchedulesResult {
  const corpus = calculateCorpus(context);
  const reserveAndSurplus = calculateReserveAndSurplus(context);
  const tangibleAssets = calculateTangibleAssets(context);
  const loansAndAdvances = calculateLoansAndAdvances(context);
  const stockMovement = calculateStockMovement(context);
  const materialConsumption = calculateMaterialConsumption(context);
  const tradingCOGS = calculateTradingCOGS(context);

  // Run reconciliations and attach diagnostics if any fails
  const corpusRec = validateCorpusReconciliation(corpus, context);
  if (!corpusRec.isReconciled) {
    context.diagnostics.push({
      scheduleCode: 'SCH_04',
      scheduleNumber: 4,
      type: 'RECONCILIATION_WARNING',
      message: `Corpus calculation mismatch: diff=${corpusRec.difference}`,
      impact: 'Corpus schedule unverified.',
    });
  }

  const resRec = validateReserveAndSurplusReconciliation(reserveAndSurplus, context);
  if (!resRec.isReconciled) {
    context.diagnostics.push({
      scheduleCode: 'SCH_05',
      scheduleNumber: 5,
      type: 'RECONCILIATION_WARNING',
      message: `Reserve & Surplus calculation mismatch: diff=${resRec.difference}`,
      impact: 'Reserve & Surplus schedule unverified.',
    });
  }

  const ppeRec = validateTangibleAssetsReconciliation(tangibleAssets, context);
  if (!ppeRec.isReconciled) {
    context.diagnostics.push({
      scheduleCode: 'SCH_11',
      scheduleNumber: 11,
      type: 'RECONCILIATION_WARNING',
      message: `Tangible Assets calculation mismatch: diff=${ppeRec.difference}`,
      impact: 'PPE schedule unverified.',
    });
  }

  const loanRec = validateLoansAndAdvancesReconciliation(loansAndAdvances, context);
  if (!loanRec.isReconciled) {
    context.diagnostics.push({
      scheduleCode: 'SCH_18',
      scheduleNumber: 18,
      type: 'RECONCILIATION_WARNING',
      message: `Loans & Advances calculation mismatch: diff=${loanRec.difference}`,
      impact: 'Loans & Advances schedule unverified.',
    });
  }

  const stkRec = validateStockMovementReconciliation(stockMovement, context);
  if (!stkRec.isReconciled) {
    context.diagnostics.push({
      scheduleCode: 'SCH_25',
      scheduleNumber: 25,
      type: 'RECONCILIATION_WARNING',
      message: `Stock Movement calculation mismatch: diff=${stkRec.difference}`,
      impact: 'Note 25 unverified.',
    });
  }

  const matRec = validateMaterialConsumptionReconciliation(materialConsumption, context);
  if (!matRec.isReconciled) {
    context.diagnostics.push({
      scheduleCode: 'SCH_28',
      scheduleNumber: 28,
      type: 'RECONCILIATION_WARNING',
      message: `Material Consumption calculation mismatch: diff=${matRec.difference}`,
      impact: 'Note 28 unverified.',
    });
  }

  const cogsRec = validateTradingCOGSReconciliation(tradingCOGS, context);
  if (!cogsRec.isReconciled) {
    context.diagnostics.push({
      scheduleCode: 'SCH_29',
      scheduleNumber: 29,
      type: 'RECONCILIATION_WARNING',
      message: `Trading COGS calculation mismatch: diff=${cogsRec.difference}`,
      impact: 'Note 29 unverified.',
    });
  }

  return {
    corpus,
    reserveAndSurplus,
    tangibleAssets,
    loansAndAdvances,
    stockMovement,
    materialConsumption,
    tradingCOGS,
  };
}
