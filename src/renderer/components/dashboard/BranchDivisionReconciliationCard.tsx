import React from 'react';
import type { BranchDivisionReconciliationStatus } from '../../../electron-api';

interface BranchDivisionReconciliationCardProps {
  reconciliation: BranchDivisionReconciliationStatus;
  onNavigateToConsolidation?: () => void;
}

export default function BranchDivisionReconciliationCard({
  reconciliation,
  onNavigateToConsolidation,
}: BranchDivisionReconciliationCardProps) {
  const formatCurrency = (val: number | null | undefined, placeholder = '—') => {
    if (val === null || val === undefined) return placeholder;
    if (val === 0) return '₹ 0.00';
    const formatted = Math.abs(val).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return val < 0 ? `(₹ ${formatted})` : `₹ ${formatted}`;
  };

  const isReconciled = reconciliation.isReconciled;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-950/80 border border-indigo-700/60 flex items-center justify-center text-lg shadow-sm">
            ⚖️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-white tracking-tight">
                Branch / Division Reciprocal Reconciliation
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                Phase 9
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Inter-unit reciprocal balance verification and elimination status
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <div
            className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-sm ${
              isReconciled
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
            }`}
          >
            <span>{isReconciled ? '✓' : '⚠'}</span>
            <span>{isReconciled ? 'Reconciled' : 'Not Reconciled'}</span>
            <span className="font-mono font-normal opacity-80">
              (Diff: {formatCurrency(reconciliation.difference)})
            </span>
          </div>

          {onNavigateToConsolidation && (
            <button
              onClick={onNavigateToConsolidation}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition-all flex items-center gap-1"
              title="Open Phase 9 Consolidation Workbench"
            >
              <span>Consolidation →</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
          <span className="text-[11px] font-medium text-slate-400 block mb-0.5">
            Branch / Division (Dr)
          </span>
          <span className="text-sm font-bold font-mono text-slate-200">
            {formatCurrency(reconciliation.totalBranchDivisionDebit)}
          </span>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
          <span className="text-[11px] font-medium text-slate-400 block mb-0.5">
            Branch / Division (Cr)
          </span>
          <span className="text-sm font-bold font-mono text-slate-200">
            {formatCurrency(reconciliation.totalBranchDivisionCredit)}
          </span>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
          <span className="text-[11px] font-medium text-slate-400 block mb-0.5">
            Santhigiri HO Reciprocal
          </span>
          <span className="text-sm font-bold font-mono text-slate-300">
            Dr {formatCurrency(reconciliation.totalSanthigiriHODebit)} / Cr {formatCurrency(reconciliation.totalSanthigiriHOCredit)}
          </span>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
          <span className="text-[11px] font-medium text-slate-400 block mb-0.5">
            Consolidation Run
          </span>
          <span className="text-sm font-bold text-teal-400 font-mono">
            {reconciliation.activeConsolidationRun
              ? `${reconciliation.activeConsolidationRun.runNumber} (${reconciliation.activeConsolidationRun.status})`
              : 'Latest Active Batches'}
          </span>
        </div>
      </div>

      {/* Footnote rule notice */}
      <div className="mt-3 pt-2.5 border-t border-slate-800/50 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          ℹ️ <strong>Rule:</strong> Reconciliation verifies reciprocal equality before consolidation. Reconciliation ≠ automatic elimination.
        </span>
        <span className="font-mono text-slate-400">
          Net Diff: {formatCurrency(reconciliation.totalInternalDifference)}
        </span>
      </div>
    </div>
  );
}
