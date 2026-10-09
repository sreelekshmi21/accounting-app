import React from 'react';
import type { ComparativeStatementLine } from '../../../electron-api';
import VarianceBadge from './VarianceBadge';

interface ComparativeTableProps {
  lines: ComparativeStatementLine[];
  statementCode: 'BS' | 'IE';
  periodOrAsAtCY: string;
  periodOrAsAtPY: string;
  hasPY: boolean;
  onInspectLine?: (line: ComparativeStatementLine) => void;
}

const NOTE_TITLES: Record<number, string> = {
  4: 'Corpus',
  5: 'Reserve and Surplus',
  6: 'Secured Loans',
  7: 'Unsecured Loans',
  8: 'Trade Payables',
  9: 'Other Current Liabilities',
  10: 'Short Term Provisions',
  11: 'Tangible Assets (Depreciation)',
  12: 'Capital Work in Progress',
  13: 'Live Stock',
  14: 'Trade Receivables',
  15: 'Cash and Bank Balances',
  16: 'Investments',
  18: 'Loans, Advances & Other Assets',
  19: 'Other Current Assets',
  20: 'Donations and Grant in Aid',
  21: 'Donations for Scientific and Industrial, Social Research',
  22: 'Revenue from operations',
  23: 'Agriculture, Dairy Income',
  24: 'Other income',
  25: 'Increase (decrease) in Finished Goods, Trading items',
  26: 'Community Welfare, Charitable Application',
  27: 'Application for Social & Scientific Research',
  28: 'Consumption of material, stores and others',
  29: 'Cost of Trading Items sold',
  30: 'Agriculture, Dairy Expense',
  31: 'Employees Benefits Expenses',
  32: 'Finance costs',
  33: 'Administrative and Other Expenses',
};

export function formatTableINR(val: number | null | undefined, placeholder = '—', options?: { showSign?: boolean }): string {
  if (val === null || val === undefined) return placeholder;
  if (val === 0) return '₹ 0.00';
  const isNegative = val < 0;
  const abs = Math.abs(val);
  const formatted = abs.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (isNegative) return `(₹ ${formatted})`;
  if (options?.showSign && val > 0) return `+₹ ${formatted}`;
  return `₹ ${formatted}`;
}

export default function ComparativeTable({
  lines,
  statementCode,
  periodOrAsAtCY,
  periodOrAsAtPY,
  hasPY,
  onInspectLine,
}: ComparativeTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-800/90 text-slate-300 text-xs font-bold uppercase tracking-wider border-b border-slate-700">
            <th className="py-3.5 px-3 w-12 text-center">Ref</th>
            <th className="py-3.5 px-6">Particulars</th>
            <th className="py-3.5 px-3 w-28 text-center">Note / Sch</th>
            <th className="py-3.5 px-5 w-40 text-right">
              Current Year ({periodOrAsAtCY || 'CY'})
            </th>
            <th className="py-3.5 px-5 w-40 text-right">
              Previous Year ({periodOrAsAtPY || 'PY'})
            </th>
            <th className="py-3.5 px-5 w-36 text-right">
              Change (₹)
            </th>
            <th className="py-3.5 px-4 w-32 text-center">
              Change (%)
            </th>
            <th className="py-3.5 px-3 w-16 text-center">Inspect</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80 text-xs">
          {lines.map((line) => {
            const isHeader = line.lineType.includes('HEADER');
            const isTotal = line.lineType === 'TOTAL';
            const isSubtotal = line.lineType === 'SUBTOTAL';
            const noteNum = typeof line.noteReference === 'number'
              ? line.noteReference
              : line.sourceNoteNumber;

            return (
              <tr
                key={line.statementLineId}
                className={`transition-colors ${
                  isHeader
                    ? 'bg-slate-800/50 font-extrabold text-slate-100 tracking-wider uppercase'
                    : isTotal
                    ? statementCode === 'BS'
                      ? 'bg-indigo-950/40 font-black text-white border-t-2 border-b-2 border-indigo-800/80 shadow-inner'
                      : 'bg-emerald-950/40 font-black text-white border-t-2 border-b-2 border-emerald-800/80 shadow-inner'
                    : isSubtotal
                    ? 'bg-slate-800/40 font-bold text-slate-100 border-t border-b border-slate-700'
                    : 'hover:bg-slate-800/30 text-slate-300'
                }`}
              >
                {/* Ref Column */}
                <td className="py-3 px-3 text-center font-mono font-semibold text-slate-400">
                  {line.lineIndex || ''}
                </td>

                {/* Particulars Column */}
                <td
                  className="py-3 px-6"
                  style={{ paddingLeft: `${Math.max(24, ((line.depth || 0) + 1) * 20)}px` }}
                >
                  <span
                    className={
                      isTotal
                        ? statementCode === 'BS'
                          ? 'text-indigo-300 text-sm font-extrabold'
                          : 'text-emerald-300 text-sm font-extrabold'
                        : isHeader
                        ? 'text-white font-extrabold text-xs tracking-wider'
                        : isSubtotal
                        ? 'text-slate-100 font-bold'
                        : 'text-slate-200'
                    }
                  >
                    {line.lineLabel}
                  </span>
                </td>

                {/* Note / Schedule Column */}
                <td className="py-3 px-3 text-center">
                  {noteNum ? (
                    <button
                      type="button"
                      onClick={() => onInspectLine && onInspectLine(line)}
                      className="statement-note-btn"
                      title={`Inspect Note ${noteNum}: ${NOTE_TITLES[noteNum] || line.lineLabel}`}
                    >
                      Note {noteNum}
                    </button>
                  ) : isHeader || isTotal || isSubtotal ? (
                    ''
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>

                {/* Current Year (CY) Amount */}
                <td
                  className={`py-3 px-5 text-right font-mono ${
                    isTotal
                      ? statementCode === 'BS'
                        ? 'text-indigo-300 text-sm font-extrabold'
                        : 'text-emerald-300 text-sm font-extrabold'
                      : isSubtotal
                      ? 'text-white font-bold text-xs'
                      : isHeader
                      ? ''
                      : 'text-slate-100 font-medium'
                  }`}
                >
                  {isHeader ? '' : formatTableINR(line.cyAmount)}
                </td>

                {/* Previous Year (PY) Amount */}
                <td
                  className={`py-3 px-5 text-right font-mono ${
                    isTotal
                      ? 'text-slate-300 font-bold'
                      : isSubtotal
                      ? 'text-slate-300 font-medium'
                      : isHeader
                      ? ''
                      : 'text-slate-400'
                  }`}
                >
                  {isHeader ? '' : formatTableINR(line.pyAmount, hasPY ? '—' : 'Unavailable')}
                </td>

                {/* Change (₹) Amount */}
                <td
                  className={`py-3 px-5 text-right font-mono ${
                    isTotal
                      ? 'text-slate-200 font-bold text-xs'
                      : isSubtotal
                      ? 'text-slate-300 font-semibold text-xs'
                      : isHeader
                      ? ''
                      : 'text-slate-300'
                  }`}
                >
                  {isHeader
                    ? ''
                    : line.status === 'AVAILABLE' || line.status === 'ZERO_BASE'
                    ? formatTableINR(line.changeAmount, '—', { showSign: true })
                    : <span className="text-slate-500">—</span>}
                </td>

                {/* Change (%) Badge */}
                <td className="py-3 px-4 text-center">
                  {isHeader ? (
                    ''
                  ) : (
                    <VarianceBadge
                      changePercent={line.changePercent}
                      status={line.status}
                      size="sm"
                    />
                  )}
                </td>

                {/* Inspect Action */}
                <td className="py-3 px-3 text-center">
                  {!isHeader && (
                    <button
                      type="button"
                      onClick={() => onInspectLine && onInspectLine(line)}
                      className="statement-inspect-btn"
                      title="Inspect line particulars and Note link"
                    >
                      🔍
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
