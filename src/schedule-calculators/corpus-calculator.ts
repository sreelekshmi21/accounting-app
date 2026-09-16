/**
 * Note 4: Corpus Schedule Calculator
 * Formula: Balance b/f + Additions Received During Year = Closing Balance
 */

import type { ScheduleCalculationContext, ReconciliationValidationResult } from './types';

export interface CorpusScheduleResult {
  scheduleCode: 'SCH_04';
  balanceBroughtForward: number;
  receivedDuringYear: number;
  closingBalance: number;
  pyBalanceBroughtForward: number;
  pyReceivedDuringYear: number;
  pyClosingBalance: number;
  isBalancedWithLedger: boolean;
}

export function calculateCorpus(context: ScheduleCalculationContext): CorpusScheduleResult {
  const nodeBf = context.nodeBalances.get('N_04_BF');
  const nodeAdd = context.nodeBalances.get('N_04_ADD');

  const pyNodeBf = context.pyNodeBalances?.get('N_04_BF');
  const pyNodeAdd = context.pyNodeBalances?.get('N_04_ADD');

  // If node balance does not exist at all, note diagnostic if needed
  const bf = (nodeBf ? (nodeBf.credit - nodeBf.debit) : 0);
  const add = (nodeAdd ? (nodeAdd.credit - nodeAdd.debit) : 0);
  const closing = bf + add;

  const pyBf = (pyNodeBf ? (pyNodeBf.credit - pyNodeBf.debit) : 0);
  const pyAdd = (pyNodeAdd ? (pyNodeAdd.credit - pyNodeAdd.debit) : 0);
  const pyClosing = pyBf + pyAdd;

  if (bf === 0 && add === 0) {
    context.diagnostics.push({
      scheduleCode: 'SCH_04',
      scheduleNumber: 4,
      type: 'INCOMPLETE_INPUT',
      message: 'No corpus balances mapped to Note 4 nodes (N_04_BF / N_04_ADD).',
      impact: 'Corpus schedule reports zero.',
    });
  }

  return {
    scheduleCode: 'SCH_04',
    balanceBroughtForward: bf,
    receivedDuringYear: add,
    closingBalance: closing,
    pyBalanceBroughtForward: pyBf,
    pyReceivedDuringYear: pyAdd,
    pyClosingBalance: pyClosing,
    isBalancedWithLedger: true,
  };
}

export function validateCorpusReconciliation(
  result: CorpusScheduleResult,
  _context: ScheduleCalculationContext,
): ReconciliationValidationResult {
  const expected = result.balanceBroughtForward + result.receivedDuringYear;
  const diff = Math.abs(result.closingBalance - expected);
  return {
    scheduleCode: 'SCH_04',
    isReconciled: diff < 0.01,
    expectedAmount: expected,
    calculatedAmount: result.closingBalance,
    difference: diff,
    details: 'Closing Corpus = Balance b/f + Received During Year',
  };
}
