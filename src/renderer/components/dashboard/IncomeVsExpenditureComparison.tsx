import React from 'react';
import type { ExecutiveFinancialSummary } from '../../../electron-api';
import { formatINR } from './ExecutiveKPIGrid';

interface IncomeVsExpenditureComparisonProps {
  summary: ExecutiveFinancialSummary;
}

export default function IncomeVsExpenditureComparison({
  summary,
}: IncomeVsExpenditureComparisonProps) {
  const { totalIncome, totalExpenditure, surplusDeficit } = summary;

  const income = totalIncome.cyAmount ?? 0;
  const expense = totalExpenditure.cyAmount ?? 0;
  const surplus = surplusDeficit.cyAmount ?? 0;
  const isSurplus = surplus >= 0;

  const maxVal = Math.max(income, expense, 1);
  const incomePct = Math.min(100, Math.round((income / maxVal) * 100));
  const expensePct = Math.min(100, Math.round((expense / maxVal) * 100));

  const expenseRatio = income > 0 ? Math.round((expense / income) * 100) : null;
  const surplusMargin = income > 0 ? Math.round((surplus / income) * 100) : null;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
        <div>
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span>⚖️</span>
            <span>Income vs Expenditure Comparison</span>
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Authoritative revenue and expense relationship from Phase 12 Financial Statements
          </p>
        </div>

        <div className="flex items-center gap-2">
          {expenseRatio !== null && (
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300">
              Expense Ratio: <strong className="text-white">{expenseRatio}%</strong>
            </span>
          )}
          <span className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-md border ${
            isSurplus
              ? 'bg-emerald-950/70 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/70 border-rose-800/60 text-rose-300'
          }`}>
            {isSurplus ? `Surplus: +${formatINR(surplus)}` : `Deficit: ${formatINR(surplus)}`}
            {surplusMargin !== null && ` (${surplusMargin}%)`}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Income Bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span>
              <span className="font-bold text-slate-300">Total Income (Revenue)</span>
            </div>
            <span className="font-extrabold text-white text-sm">
              {formatINR(income)}
            </span>
          </div>
          <div className="w-full bg-slate-950/80 rounded-full h-3 p-0.5 border border-slate-800">
            <div
              className="bg-gradient-to-r from-emerald-600 to-teal-400 h-full rounded-full transition-all duration-500 shadow-sm"
              style={{ width: `${incomePct}%` }}
            />
          </div>
        </div>

        {/* Expenditure Bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block"></span>
              <span className="font-bold text-slate-300">Total Expenditure (Expenses)</span>
            </div>
            <span className="font-extrabold text-white text-sm">
              {formatINR(expense)}
            </span>
          </div>
          <div className="w-full bg-slate-950/80 rounded-full h-3 p-0.5 border border-slate-800">
            <div
              className="bg-gradient-to-r from-indigo-600 to-violet-400 h-full rounded-full transition-all duration-500 shadow-sm"
              style={{ width: `${expensePct}%` }}
            />
          </div>
        </div>

        {/* Net Comparison Summary Ribbon */}
        <div className="mt-4 pt-3 border-t border-slate-800/60 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-center">
          <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60">
            <span className="text-slate-400 text-[11px] block">Total Operational Inflow</span>
            <span className="font-bold text-emerald-400 font-mono text-xs">{formatINR(income)}</span>
          </div>
          <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60">
            <span className="text-slate-400 text-[11px] block">Total Operational Outflow</span>
            <span className="font-bold text-indigo-400 font-mono text-xs">{formatINR(expense)}</span>
          </div>
          <div className={`p-2.5 rounded-lg border ${
            isSurplus
              ? 'bg-emerald-950/20 border-emerald-800/40'
              : 'bg-rose-950/20 border-rose-800/40'
          }`}>
            <span className="text-slate-400 text-[11px] block">{isSurplus ? 'Retained Net Surplus' : 'Net Deficit (Shortfall)'}</span>
            <span className={`font-extrabold font-mono text-xs ${isSurplus ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatINR(surplus)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
