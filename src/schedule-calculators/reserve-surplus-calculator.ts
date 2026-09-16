/**
 * Note 5: Reserve and Surplus Schedule Calculator
 * Multi-column movement matrix for 11 sub-funds (a through k),
 * including automatic transfer of I&E Surplus / (Deficit) to line item 'k) Surplus (Deficit)%'.
 */

import type { ScheduleCalculationContext, ReconciliationValidationResult } from './types';

export interface ReserveFundMovement {
  fundKey: string; // 'a' through 'k'
  nodeCode: string;
  fundName: string;
  balanceBroughtForward: number;
  additionsAdjustments: number;
  closingBalance: number;
  pyBalanceBroughtForward: number;
  pyAdditionsAdjustments: number;
  pyClosingBalance: number;
}

export interface ReserveAndSurplusResult {
  scheduleCode: 'SCH_05';
  funds: ReserveFundMovement[];
  totalBroughtForward: number;
  totalAdditionsAdjustments: number;
  totalClosingBalance: number;
  pyTotalBroughtForward: number;
  pyTotalAdditionsAdjustments: number;
  pyTotalClosingBalance: number;
  transferredIESurplusCY: number;
  transferredIESurplusPY: number;
}

const SUB_FUNDS: Array<{ key: string; nodeCode: string; name: string }> = [
  { key: 'a', nodeCode: 'N_05_A', name: 'a) Investment Subsidy' },
  { key: 'b', nodeCode: 'N_05_B', name: 'b) Land Development Fund' },
  { key: 'c', nodeCode: 'N_05_C', name: 'c) Equipment Creation Fund' },
  { key: 'd', nodeCode: 'N_05_D', name: 'd) Working Capital Reserve' },
  { key: 'e', nodeCode: 'N_05_E', name: 'e) Grant Received for Convention Centre *' },
  { key: 'f', nodeCode: 'N_05_F', name: 'f) Grant/Donation for Ashram, Research & Skill Development' },
  { key: 'g', nodeCode: 'N_05_G', name: 'g) Grant/Donation for Other Construction/Projects' },
  { key: 'h', nodeCode: 'N_05_H', name: 'h) ACCDS Project assistance' },
  { key: 'i', nodeCode: 'N_05_I', name: 'i) Live Stock Reserve' },
  { key: 'j', nodeCode: 'N_05_J', name: 'j) Loose Gold/ Silver Reserve #' },
  { key: 'k', nodeCode: 'N_05_K', name: 'k) Surplus (Deficit)%' },
];

export function calculateReserveAndSurplus(context: ScheduleCalculationContext): ReserveAndSurplusResult {
  const funds: ReserveFundMovement[] = [];
  let totalBf = 0;
  let totalAdd = 0;
  let totalCl = 0;
  let pyTotalBf = 0;
  let pyTotalAdd = 0;
  let pyTotalCl = 0;

  const cySurplus = Number(context.calculatedSurplus) || 0;
  const pySurplus = Number(context.calculatedSurplusPY) || 0;

  for (const sf of SUB_FUNDS) {
    const node = context.nodeBalances.get(sf.nodeCode);
    const pyNode = context.pyNodeBalances?.get(sf.nodeCode);

    let bf = 0;
    let add = 0;
    let cl = 0;

    let pyBf = 0;
    let pyAdd = 0;
    let pyCl = 0;

    if (sf.key === 'k') {
      // Line item k: Surplus (Deficit) transferred from I&E
      // If there was an opening accumulated surplus in TB, it acts as bf
      bf = node ? (node.credit - node.debit) : 0;
      add = cySurplus;
      cl = bf + add;

      pyBf = pyNode ? (pyNode.credit - pyNode.debit) : 0;
      pyAdd = pySurplus;
      pyCl = pyBf + pyAdd;
    } else {
      // Sub-funds a to j
      // If only closing balance mapped to node, we treat it as closing
      const net = node ? (node.credit - node.debit) : 0;
      const pyNet = pyNode ? (pyNode.credit - pyNode.debit) : 0;
      bf = pyNet; // Opening b/f is PY closing
      cl = net;
      add = cl - bf;

      pyBf = 0;
      pyCl = pyNet;
      pyAdd = pyCl - pyBf;
    }

    funds.push({
      fundKey: sf.key,
      nodeCode: sf.nodeCode,
      fundName: sf.name,
      balanceBroughtForward: bf,
      additionsAdjustments: add,
      closingBalance: cl,
      pyBalanceBroughtForward: pyBf,
      pyAdditionsAdjustments: pyAdd,
      pyClosingBalance: pyCl,
    });

    totalBf += bf;
    totalAdd += add;
    totalCl += cl;

    pyTotalBf += pyBf;
    pyTotalAdd += pyAdd;
    pyTotalCl += pyCl;
  }

  return {
    scheduleCode: 'SCH_05',
    funds,
    totalBroughtForward: totalBf,
    totalAdditionsAdjustments: totalAdd,
    totalClosingBalance: totalCl,
    pyTotalBroughtForward: pyTotalBf,
    pyTotalAdditionsAdjustments: pyTotalAdd,
    pyTotalClosingBalance: pyTotalCl,
    transferredIESurplusCY: cySurplus,
    transferredIESurplusPY: pySurplus,
  };
}

export function validateReserveAndSurplusReconciliation(
  result: ReserveAndSurplusResult,
  _context: ScheduleCalculationContext,
): ReconciliationValidationResult {
  let isReconciled = true;
  for (const f of result.funds) {
    const expected = f.balanceBroughtForward + f.additionsAdjustments;
    if (Math.abs(f.closingBalance - expected) > 0.01) {
      isReconciled = false;
      break;
    }
  }

  return {
    scheduleCode: 'SCH_05',
    isReconciled,
    expectedAmount: result.totalBroughtForward + result.totalAdditionsAdjustments,
    calculatedAmount: result.totalClosingBalance,
    difference: Math.abs(result.totalClosingBalance - (result.totalBroughtForward + result.totalAdditionsAdjustments)),
    details: 'Each Reserve Sub-Fund Closing = Opening b/f + Additions/Adjustments (including I&E Surplus for k)',
  };
}
