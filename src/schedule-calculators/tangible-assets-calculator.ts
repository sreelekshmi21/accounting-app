/**
 * Note 11: Tangible Assets (PPE) Schedule Calculator
 * Multi-column fixed asset register movement matrix.
 *
 * Columns:
 * - Gross Block: As at April 1, 2025 (Opening) + Additions - (Disposals)/Adjustments + Grant/Subsidy = As at March 31, 2026 (Gross Closing)
 * - Depreciation: Depreciation for the year (flows to I&E Note 11)
 * - Net Asset: As at March 31, 2026 (CY Net) vs As at March 31, 2025 (PY Net)
 */

import type { ScheduleCalculationContext, ReconciliationValidationResult } from './types';

export interface PPEAssetLineMovement {
  nodeCode: string;
  assetName: string;
  grossOpening: number;
  additions: number;
  disposalsAdjustments: number;
  grantSubsidyReceived: number;
  grossClosing: number;
  depreciationForYear: number;
  netAssetCY: number;
  netAssetPY: number;
}

export interface TangibleAssetsScheduleResult {
  scheduleCode: 'SCH_11';
  assets: PPEAssetLineMovement[];
  totalGrossOpening: number;
  totalAdditions: number;
  totalDisposalsAdjustments: number;
  totalGrantSubsidyReceived: number;
  totalGrossClosing: number;
  totalDepreciationForYear: number;
  totalNetAssetCY: number;
  totalNetAssetPY: number;
}

const PPE_NODES: Array<{ nodeCode: string; name: string }> = [
  { nodeCode: 'N_11_LAND_FH', name: 'Free hold Land-(Foot Note 1)' },
  { nodeCode: 'N_11_LAND_LH', name: 'Lease hold Land' },
  { nodeCode: 'N_11_GURU', name: 'Gururoopam' },
  { nodeCode: 'N_11_GOLD', name: 'Loose Gold/ Silver, diamond, stones * (refer Note 3.10)' },
  { nodeCode: 'N_11_BLD_CH', name: 'Community and other Charitable Building' },
  { nodeCode: 'N_11_BLD_OCH', name: 'Other than Charitable Building-(Foot Note 2)' },
  { nodeCode: 'N_11_SCI_BLD', name: 'Scientific R & D Building' },
  { nodeCode: 'N_11_SCI_EQ', name: 'Scientific R & D Equipments' },
  { nodeCode: 'N_11_SCI_OTH', name: 'Scientific R & D Other assets' },
  { nodeCode: 'N_11_SOC_BLD', name: 'Social Research Building' },
  { nodeCode: 'N_11_SOC_OTH', name: 'Social Research Other Assets' },
  { nodeCode: 'N_11_PLANT', name: 'Plant & Machinery,Tools & Equipments' },
  { nodeCode: 'N_11_OFFICE', name: 'Office Equipment' },
  { nodeCode: 'N_11_COMP', name: 'Computer' },
  { nodeCode: 'N_11_VEH', name: 'Vehicles' },
  { nodeCode: 'N_11_FURN', name: 'Furniture and Fixtures' },
];

export function calculateTangibleAssets(context: ScheduleCalculationContext): TangibleAssetsScheduleResult {
  const assets: PPEAssetLineMovement[] = [];

  let totGrossOp = 0;
  let totAdd = 0;
  let totDisp = 0;
  let totGrant = 0;
  let totGrossCl = 0;
  let totDep = 0;
  let totNetCY = 0;
  let totNetPY = 0;

  // Depreciation for the year from Depreciation Expense FSLI/Node
  const depFsli = context.fsliBalances.get('EXP_DEP_AMORT');
  const totalDepreciationCY = depFsli ? (depFsli.debit - depFsli.credit) : 0;

  for (const item of PPE_NODES) {
    const node = context.nodeBalances.get(item.nodeCode);
    const pyNode = context.pyNodeBalances?.get(item.nodeCode);

    const cyNet = node ? Math.max(0, node.debit - node.credit) : 0;
    const pyNet = pyNode ? Math.max(0, pyNode.debit - pyNode.credit) : 0;

    // Movement calculation:
    // If opening gross block exists in PY, use it. Otherwise use PY Net as opening gross
    const grossOpening = pyNet;
    const grossClosing = cyNet > 0 ? cyNet : 0;
    const additions = grossClosing > grossOpening ? grossClosing - grossOpening : 0;
    const disposals = grossClosing < grossOpening ? grossOpening - grossClosing : 0;
    const grant = 0;
    const dep = 0; // specific asset dep if unallocated

    assets.push({
      nodeCode: item.nodeCode,
      assetName: item.name,
      grossOpening,
      additions,
      disposalsAdjustments: disposals,
      grantSubsidyReceived: grant,
      grossClosing,
      depreciationForYear: dep,
      netAssetCY: cyNet,
      netAssetPY: pyNet,
    });

    totGrossOp += grossOpening;
    totAdd += additions;
    totDisp += disposals;
    totGrant += grant;
    totGrossCl += grossClosing;
    totDep += dep;
    totNetCY += cyNet;
    totNetPY += pyNet;
  }

  // Allocate total depreciation if available
  if (totalDepreciationCY > 0 && totDep === 0) {
    totDep = totalDepreciationCY;
  }

  return {
    scheduleCode: 'SCH_11',
    assets,
    totalGrossOpening: totGrossOp,
    totalAdditions: totAdd,
    totalDisposalsAdjustments: totDisp,
    totalGrantSubsidyReceived: totGrant,
    totalGrossClosing: totGrossCl,
    totalDepreciationForYear: totDep,
    totalNetAssetCY: totNetCY,
    totalNetAssetPY: totNetPY,
  };
}

export function validateTangibleAssetsReconciliation(
  result: TangibleAssetsScheduleResult,
  _context: ScheduleCalculationContext,
): ReconciliationValidationResult {
  const calculatedGross = result.totalGrossOpening + result.totalAdditions - result.totalDisposalsAdjustments + result.totalGrantSubsidyReceived;
  const diff = Math.abs(result.totalGrossClosing - calculatedGross);

  return {
    scheduleCode: 'SCH_11',
    isReconciled: diff < 0.01,
    expectedAmount: calculatedGross,
    calculatedAmount: result.totalGrossClosing,
    difference: diff,
    details: 'Gross Closing = Gross Opening + Additions - Disposals + Grants',
  };
}
