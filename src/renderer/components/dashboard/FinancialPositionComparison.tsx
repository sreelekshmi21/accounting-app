import React from 'react';
import type { ExecutiveFinancialSummary } from '../../../electron-api';
import { formatINR } from './ExecutiveKPIGrid';

interface FinancialPositionComparisonProps {
  summary: ExecutiveFinancialSummary;
}

export default function FinancialPositionComparison({
  summary,
}: FinancialPositionComparisonProps) {
  const {
    totalAssets,
    totalLiabilities,
    fundsReserves,
    indicators,
    isBalanced,
    balanceDifferenceCY,
  } = summary;

  const assets = totalAssets.cyAmount ?? 0;
  const liabilities = totalLiabilities.cyAmount ?? 0;
  const funds = fundsReserves.cyAmount ?? 0;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
        <div>
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span>🏛️</span>
            <span>Balance Sheet Financial Position</span>
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Authoritative Balance Sheet structure and source/application alignment
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-md border flex items-center gap-1.5 ${
            isBalanced
              ? 'bg-emerald-950/70 border-emerald-800/60 text-emerald-300'
              : 'bg-amber-950/70 border-amber-800/60 text-amber-300'
          }`}>
            <span>{isBalanced ? '✓' : '⚠'}</span>
            <span>{isBalanced ? 'Statement in Balance (₹0.00 difference)' : `Imbalance: ${formatINR(balanceDifferenceCY)}`}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Side: Sources of Funds (Liabilities, Capital & Reserves) */}
        <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
            <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>🛡️</span>
              <span>Sources of Funds (Equities & Liabilities)</span>
            </span>
            <span className="font-extrabold text-cyan-400 font-mono text-sm">
              {formatINR(liabilities)}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {/* Funds & Reserves */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <div>
                <span className="font-medium text-slate-200">Capital, Corpus & Reserves</span>
                <span className="text-[10px] text-slate-400 block">Notes 4 & 5 (Schedule III)</span>
              </div>
              <span className="font-mono font-bold text-amber-300">
                {formatINR(funds)}
              </span>
            </div>

            {/* Loans & Borrowings */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <div>
                <span className="font-medium text-slate-200">Secured & Unsecured Loans</span>
                <span className="text-[10px] text-slate-400 block">Notes 6 & 7</span>
              </div>
              <span className="font-mono font-bold text-slate-200">
                {formatINR(indicators.loansBorrowings.cyAmount)}
              </span>
            </div>

            {/* Creditors & Current Liabilities */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <div>
                <span className="font-medium text-slate-200">Current Liabilities & Provisions</span>
                <span className="text-[10px] text-slate-400 block">Notes 8, 9 & 10</span>
              </div>
              <span className="font-mono font-bold text-slate-200">
                {formatINR(indicators.creditorsPayables.cyAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Applications of Funds (Assets & Properties) */}
        <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
            <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>🏛️</span>
              <span>Applications of Funds (Total Assets)</span>
            </span>
            <span className="font-extrabold text-teal-400 font-mono text-sm">
              {formatINR(assets)}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {/* Cash & Bank Balances */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <div>
                <span className="font-medium text-slate-200">Cash & Bank Balances</span>
                <span className="text-[10px] text-slate-400 block">Note 15 (Cash & Bank)</span>
              </div>
              <span className="font-mono font-bold text-emerald-400">
                {formatINR(indicators.cashBank.cyAmount)}
              </span>
            </div>

            {/* Inventories */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <div>
                <span className="font-medium text-slate-200">Inventories & Stock</span>
                <span className="text-[10px] text-slate-400 block">Note 17 (Inventories)</span>
              </div>
              <span className="font-mono font-bold text-slate-200">
                {formatINR(indicators.inventory.cyAmount)}
              </span>
            </div>

            {/* Receivables & Advances */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <div>
                <span className="font-medium text-slate-200">Trade Receivables & Advances</span>
                <span className="text-[10px] text-slate-400 block">Notes 14, 18 & 19</span>
              </div>
              <span className="font-mono font-bold text-slate-200">
                {formatINR(indicators.receivables.cyAmount)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
