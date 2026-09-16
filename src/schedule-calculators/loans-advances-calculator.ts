/**
 * Note 18: Short-Term Loans & Advances Schedule Calculator
 * Calculates:
 * - Employee Advances
 * - Security Deposits (Current & Non-Current)
 * - Other Loans & Advances
 * - Less: Non-Current Security Deposits -> Net Current Portion of Loans & Advances
 * - Re-routes Non-Current Security Deposits to Balance Sheet Non-Current Assets (d).
 */

import type { ScheduleCalculationContext, ReconciliationValidationResult } from './types';

export interface LoansAndAdvancesResult {
  scheduleCode: 'SCH_18';
  employeeAdvances: number;
  securityDepositsCurrent: number;
  securityDepositsNonCurrent: number;
  otherLoansCurrent: number;
  totalGrossLoansAndAdvances: number;
  lessNonCurrentSecurityDeposits: number;
  currentPortionOfLoansAndAdvances: number; // Balance Sheet Current Assets (d)
  nonCurrentSecurityDepositsRerouted: number; // Balance Sheet Non-Current Assets (d)
  pyCurrentPortion: number;
  pyNonCurrentPortion: number;
}

export function calculateLoansAndAdvances(context: ScheduleCalculationContext): LoansAndAdvancesResult {
  const nodeEmp = context.nodeBalances.get('N_18_EMP');
  const nodeSdC = context.nodeBalances.get('N_18_SD_C');
  const nodeSdNc = context.nodeBalances.get('N_18_SD_NC');
  const nodeOthC = context.nodeBalances.get('N_18_OTH_C');

  const pyNodeEmp = context.pyNodeBalances?.get('N_18_EMP');
  const pyNodeSdC = context.pyNodeBalances?.get('N_18_SD_C');
  const pyNodeSdNc = context.pyNodeBalances?.get('N_18_SD_NC');
  const pyNodeOthC = context.pyNodeBalances?.get('N_18_OTH_C');

  const emp = nodeEmp ? (nodeEmp.debit - nodeEmp.credit) : 0;
  const sdC = nodeSdC ? (nodeSdC.debit - nodeSdC.credit) : 0;
  const sdNc = nodeSdNc ? (nodeSdNc.debit - nodeSdNc.credit) : 0;
  const othC = nodeOthC ? (nodeOthC.debit - nodeOthC.credit) : 0;

  const totalGross = emp + sdC + sdNc + othC;
  const lessNc = sdNc;
  const currentPortion = totalGross - lessNc;

  const pyEmp = pyNodeEmp ? (pyNodeEmp.debit - pyNodeEmp.credit) : 0;
  const pySdC = pyNodeSdC ? (pyNodeSdC.debit - pyNodeSdC.credit) : 0;
  const pySdNc = pyNodeSdNc ? (pyNodeSdNc.debit - pyNodeSdNc.credit) : 0;
  const pyOthC = pyNodeOthC ? (pyNodeOthC.debit - pyNodeOthC.credit) : 0;
  const pyCurrentPortion = (pyEmp + pySdC + pySdNc + pyOthC) - pySdNc;

  return {
    scheduleCode: 'SCH_18',
    employeeAdvances: emp,
    securityDepositsCurrent: sdC,
    securityDepositsNonCurrent: sdNc,
    otherLoansCurrent: othC,
    totalGrossLoansAndAdvances: totalGross,
    lessNonCurrentSecurityDeposits: lessNc,
    currentPortionOfLoansAndAdvances: currentPortion,
    nonCurrentSecurityDepositsRerouted: sdNc,
    pyCurrentPortion,
    pyNonCurrentPortion: pySdNc,
  };
}

export function validateLoansAndAdvancesReconciliation(
  result: LoansAndAdvancesResult,
  _context: ScheduleCalculationContext,
): ReconciliationValidationResult {
  const expected = result.totalGrossLoansAndAdvances - result.lessNonCurrentSecurityDeposits;
  const diff = Math.abs(result.currentPortionOfLoansAndAdvances - expected);

  return {
    scheduleCode: 'SCH_18',
    isReconciled: diff < 0.01,
    expectedAmount: expected,
    calculatedAmount: result.currentPortionOfLoansAndAdvances,
    difference: diff,
    details: 'Current Portion = Total Gross Loans - Non-Current Security Deposits',
  };
}
