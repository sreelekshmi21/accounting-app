import React from 'react';
import type { UnitReportingRow, UnitConsolidatedTotals } from '../../../electron-api';
import VarianceBadge from './VarianceBadge';

interface UnitIncomeExpenditureTableProps {
  unitRows: UnitReportingRow[];
  consolidatedTotals: UnitConsolidatedTotals;
  hasPY: boolean;
  selectedUnitId?: string;
  onSelectUnit: (unitId: string) => void;
}

export default function UnitIncomeExpenditureTable({
  unitRows,
  consolidatedTotals,
  hasPY,
  selectedUnitId,
  onSelectUnit,
}: UnitIncomeExpenditureTableProps) {
  const formatCurrency = (val: number | null | undefined, placeholder = '—') => {
    if (val === null || val === undefined) return placeholder;
    if (val === 0) return '₹ 0.00';
    const formatted = Math.abs(val).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return val < 0 ? `(₹ ${formatted})` : `₹ ${formatted}`;
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Table Header Controls */}
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">📑</span>
          <div>
            <h3 className="text-sm font-extrabold text-white tracking-tight">
              Unit-wise Income & Expenditure Breakdown
            </h3>
            <p className="text-xs text-slate-400">
              Operational revenue, expenditures, and net surplus per unit with authoritative consolidated summary
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="inline-block w-2 h-2 rounded-full bg-teal-400"></span>
          <span>{unitRows.filter((u) => u.hasData).length} of {unitRows.length} units with financial data</span>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-950/80 text-slate-400 font-bold border-b border-slate-800 uppercase tracking-wider text-[11px]">
              <th className="py-3.5 px-4 font-semibold">Unit / Entity</th>
              <th className="py-3.5 px-3 text-right font-semibold">CY Income</th>
              {hasPY && <th className="py-3.5 px-3 text-right font-semibold">PY Income</th>}
              <th className="py-3.5 px-3 text-right font-semibold">CY Expenditure</th>
              {hasPY && <th className="py-3.5 px-3 text-right font-semibold">PY Expenditure</th>}
              <th className="py-3.5 px-3 text-right font-semibold">CY Net Surplus</th>
              {hasPY && <th className="py-3.5 px-3 text-right font-semibold">PY Surplus</th>}
              {hasPY && <th className="py-3.5 px-3 text-center font-semibold">Surplus Shift</th>}
              <th className="py-3.5 px-4 text-center font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {unitRows.length === 0 ? (
              <tr>
                <td colSpan={hasPY ? 9 : 6} className="py-8 text-center text-slate-500 italic">
                  No units available for the selected reporting period.
                </td>
              </tr>
            ) : (
              unitRows.map((row) => {
                const isSelected = selectedUnitId === row.unitId;
                const isPositiveSurplus = (row.netSurplusCY || 0) >= 0;

                return (
                  <tr
                    key={row.unitId}
                    className={`transition-colors hover:bg-slate-800/40 ${
                      isSelected ? 'bg-teal-950/30 font-semibold' : ''
                    }`}
                  >
                    {/* Unit Name & Status */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${row.hasData ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                        <span className="text-slate-200 font-bold">{row.unitName}</span>
                        {isSelected && (
                          <span className="text-[10px] font-mono bg-teal-900/60 text-teal-300 border border-teal-700/60 px-1.5 py-0.2 rounded">
                            Active
                          </span>
                        )}
                        {!row.hasData && (
                          <span className="text-[10px] text-slate-500 italic">
                            (No data)
                          </span>
                        )}
                      </div>
                    </td>

                    {/* CY Income */}
                    <td className="py-3 px-3 text-right font-mono text-slate-200">
                      {formatCurrency(row.incomeCY)}
                    </td>

                    {/* PY Income */}
                    {hasPY && (
                      <td className="py-3 px-3 text-right font-mono text-slate-400">
                        {formatCurrency(row.incomePY)}
                      </td>
                    )}

                    {/* CY Expenditure */}
                    <td className="py-3 px-3 text-right font-mono text-slate-200">
                      {formatCurrency(row.expenditureCY)}
                    </td>

                    {/* PY Expenditure */}
                    {hasPY && (
                      <td className="py-3 px-3 text-right font-mono text-slate-400">
                        {formatCurrency(row.expenditurePY)}
                      </td>
                    )}

                    {/* CY Net Surplus */}
                    <td className="py-3 px-3 text-right font-mono">
                      <span className={row.netSurplusCY === null ? 'text-slate-500' : isPositiveSurplus ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {formatCurrency(row.netSurplusCY)}
                      </span>
                    </td>

                    {/* PY Net Surplus */}
                    {hasPY && (
                      <td className="py-3 px-3 text-right font-mono text-slate-400">
                        {formatCurrency(row.netSurplusPY)}
                      </td>
                    )}

                    {/* Surplus Shift */}
                    {hasPY && (
                      <td className="py-3 px-3 text-center">
                        <VarianceBadge
                          changePercent={row.surplusChangePercent}
                          status={row.surplusStatus}
                          size="sm"
                        />
                      </td>
                    )}

                    {/* Action */}
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => onSelectUnit(row.unitId)}
                        className={`px-2.5 py-1 rounded text-xs transition-all border ${
                          isSelected
                            ? 'bg-teal-700 text-white border-teal-500 font-bold'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                        }`}
                        title={`View ${row.unitName} isolated financial report`}
                      >
                        {isSelected ? 'Selected' : 'View Unit'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}

            {/* ── Authoritative Consolidated Row (Phase 9 & 12) ── */}
            <tr className="bg-indigo-950/70 text-white font-extrabold border-t-2 border-indigo-700/80 shadow-md">
              <td className="py-4 px-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse"></span>
                  <span className="text-white tracking-wide uppercase text-[12px]">
                    Consolidated — All Units (Phase 9)
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-900 border border-indigo-700 text-indigo-200">
                    Authoritative
                  </span>
                </div>
              </td>

              <td className="py-4 px-3 text-right font-mono text-indigo-100 text-sm">
                {formatCurrency(consolidatedTotals.incomeCY)}
              </td>

              {hasPY && (
                <td className="py-4 px-3 text-right font-mono text-indigo-300">
                  {formatCurrency(consolidatedTotals.incomePY)}
                </td>
              )}

              <td className="py-4 px-3 text-right font-mono text-indigo-100 text-sm">
                {formatCurrency(consolidatedTotals.expenditureCY)}
              </td>

              {hasPY && (
                <td className="py-4 px-3 text-right font-mono text-indigo-300">
                  {formatCurrency(consolidatedTotals.expenditurePY)}
                </td>
              )}

              <td className="py-4 px-3 text-right font-mono text-sm">
                <span className={consolidatedTotals.isSurplusCY ? 'text-emerald-300' : 'text-rose-300'}>
                  {formatCurrency(consolidatedTotals.netSurplusCY)}
                </span>
              </td>

              {hasPY && (
                <td className="py-4 px-3 text-right font-mono text-indigo-300">
                  {formatCurrency(consolidatedTotals.netSurplusPY)}
                </td>
              )}

              {hasPY && (
                <td className="py-4 px-3 text-center">
                  <VarianceBadge
                    changePercent={consolidatedTotals.surplusChangePercent}
                    status={consolidatedTotals.surplusStatus}
                    size="sm"
                  />
                </td>
              )}

              <td className="py-4 px-4 text-center">
                <span className="text-[11px] font-mono text-indigo-300 font-normal">
                  All Units Scope
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footnote rule notice */}
      <div className="px-6 py-2.5 bg-slate-950/60 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
        <span>
          ⚖️ <strong>Accounting Rule:</strong> Consolidated figures consume Phase 9 interbranch eliminations. Never summed client-side.
        </span>
        <span className="font-mono text-slate-400">
          CY Period Status: {hasPY ? 'Comparative Active' : 'PY Unavailable'}
        </span>
      </div>
    </div>
  );
}
