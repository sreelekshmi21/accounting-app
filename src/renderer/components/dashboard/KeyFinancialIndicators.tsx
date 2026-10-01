import React from 'react';
import type { ExecutiveFinancialSummary } from '../../../electron-api';
import { formatINR } from './ExecutiveKPIGrid';

interface KeyFinancialIndicatorsProps {
  summary: ExecutiveFinancialSummary;
  onNavigateToFinancialStatements?: () => void;
}

export default function KeyFinancialIndicators({
  summary,
  onNavigateToFinancialStatements,
}: KeyFinancialIndicatorsProps) {
  const { indicators } = summary;

  const indicatorList = [
    {
      ...indicators.cashBank,
      icon: '💵',
      accent: 'emerald',
      badgeColor: 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300',
    },
    {
      ...indicators.investments,
      icon: '💎',
      accent: 'amber',
      badgeColor: 'bg-amber-950/60 border-amber-800/60 text-amber-300',
    },
    {
      ...indicators.inventory,
      icon: '📦',
      accent: 'teal',
      badgeColor: 'bg-teal-950/60 border-teal-800/60 text-teal-300',
    },
    {
      ...indicators.receivables,
      icon: '📝',
      accent: 'blue',
      badgeColor: 'bg-blue-950/60 border-blue-800/60 text-blue-300',
    },
    {
      ...indicators.loansBorrowings,
      icon: '🏦',
      accent: 'indigo',
      badgeColor: 'bg-indigo-950/60 border-indigo-800/60 text-indigo-300',
    },
    {
      ...indicators.creditorsPayables,
      icon: '🧾',
      accent: 'cyan',
      badgeColor: 'bg-cyan-950/60 border-cyan-800/60 text-cyan-300',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Key Financial Indicators & Schedule Totals (Phase 11 & 12)
        </span>
        {onNavigateToFinancialStatements && (
          <button
            onClick={onNavigateToFinancialStatements}
            className="text-xs text-teal-400 hover:text-teal-300 transition-colors font-medium flex items-center gap-1"
          >
            <span>View Notes & Schedules</span>
            <span>→</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {indicatorList.map((item) => (
          <div
            key={item.id}
            className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700/80 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">{item.icon}</span>
                  <h4 className="text-xs font-bold text-slate-300">{item.label}</h4>
                </div>
                {item.noteReference && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.badgeColor} font-mono`}>
                    {item.noteReference}
                  </span>
                )}
              </div>

              <div className="text-xl font-extrabold text-white font-mono my-1 tracking-tight">
                {item.isAvailable && item.cyAmount !== null ? (
                  formatINR(item.cyAmount)
                ) : (
                  <span className="text-slate-500 font-sans text-sm italic">Not available</span>
                )}
              </div>
            </div>

            <div className="mt-2.5 pt-2.5 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400">
              <span>Previous Year:</span>
              <span className="font-mono text-slate-300">
                {item.hasPY && item.pyAmount !== null ? (
                  formatINR(item.pyAmount)
                ) : (
                  <span className="text-slate-500 italic">PY unavailable</span>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
