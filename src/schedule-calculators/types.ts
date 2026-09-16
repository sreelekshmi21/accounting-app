/**
 * Phase 10: Schedule Calculation Types & Contracts
 */

export interface ScheduleDiagnosticNotice {
  scheduleCode: string;
  scheduleNumber: number;
  type: 'INCOMPLETE_INPUT' | 'MISSING_DEPENDENCY' | 'UNBALANCED_MOVEMENT' | 'RECONCILIATION_WARNING';
  message: string;
  missingField?: string;
  nodeCode?: string;
  impact: string;
}

export interface LedgerResolvedBalance {
  ledgerId: string;
  ledgerName: string;
  unitId: string;
  financialYearId: string;
  baseDebit: number;
  baseCredit: number;
  resolvedFsliId: string | null;
  resolvedNodeId: string | null;
}

export interface FSLIAggregatedBalance {
  fsliId: string;
  fsliCode: string | null;
  fsliName: string;
  category: string;
  debit: number;
  credit: number;
  net: number;
}

export interface NodeAggregatedBalance {
  nodeId: string;
  nodeCode: string;
  nodeName: string;
  scheduleCode: string;
  debit: number;
  credit: number;
  net: number;
}

export interface ScheduleCalculationContext {
  financialYearId: string;
  previousFinancialYearId?: string;
  unitId?: string;
  consolidationRunId?: string;
  sourceBalances: Map<string, LedgerResolvedBalance>;
  fsliBalances: Map<string, FSLIAggregatedBalance>;
  nodeBalances: Map<string, NodeAggregatedBalance>;
  pyNodeBalances?: Map<string, NodeAggregatedBalance>;
  calculatedIncomeTotal?: number;
  calculatedExpenseTotal?: number;
  calculatedSurplus?: number; // I&E Surplus for CY
  calculatedSurplusPY?: number; // I&E Surplus for PY
  diagnostics: ScheduleDiagnosticNotice[];
}

export interface ReconciliationValidationResult {
  scheduleCode: string;
  isReconciled: boolean;
  expectedAmount: number;
  calculatedAmount: number;
  difference: number;
  details?: string;
}
