import React from 'react';
import type { ComparativeMetric } from '../../../electron-api';
import VarianceBadge from './VarianceBadge';

interface ComparativeMetricCardProps {
  metric: ComparativeMetric;
  hasPY: boolean;
  onInspectNote?: (noteNumber: number) => void;
}

export function formatINR(val: number | null | undefined, options?: { showSign?: boolean }): string {
  if (val === null || val === undefined) return '—';
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

export default function ComparativeMetricCard({
  metric,
  hasPY,
  onInspectNote,
}: ComparativeMetricCardProps) {
  const isAvailable = hasPY && metric.status === 'AVAILABLE' && metric.pyAmount !== null;
  const isZeroBase = metric.status === 'ZERO_BASE';

  let borderTheme = 'border-slate-800 bg-slate-900/90';
  let badgeColor = 'text-slate-400 bg-slate-800 border-slate-700';

  if (metric.category === 'INCOME') {
    borderTheme = 'border-emerald-900/50 bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950/20';
    badgeColor = 'text-emerald-400 bg-emerald-950/80 border-emerald-800/60';
  } else if (metric.category === 'EXPENDITURE') {
    borderTheme = 'border-indigo-900/50 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950/20';
    badgeColor = 'text-indigo-400 bg-indigo-950/80 border-indigo-800/60';
  } else if (metric.category === 'ASSET') {
    borderTheme = 'border-teal-900/50 bg-gradient-to-b from-slate-900 via-slate-900 to-teal-950/20';
    badgeColor = 'text-teal-400 bg-teal-950/80 border-teal-800/60';
  } else if (metric.category === 'LIABILITY') {
    borderTheme = 'border-indigo-900/50 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950/20';
    badgeColor = 'text-indigo-400 bg-indigo-950/80 border-indigo-800/60';
  } else if (metric.category === 'RESULT') {
    const isPositive = (metric.cyAmount ?? 0) >= 0;
    borderTheme = isPositive
      ? 'border-teal-800/60 bg-gradient-to-b from-slate-900 via-slate-900 to-teal-950/30'
      : 'border-rose-900/60 bg-gradient-to-b from-slate-900 via-slate-900 to-rose-950/30';
    badgeColor = isPositive
      ? 'text-teal-300 bg-teal-950/80 border-teal-700'
      : 'text-rose-300 bg-rose-950/80 border-rose-700';
  }

  return (
    <div className={`rounded-xl border p-5 shadow-lg flex flex-col justify-between transition-all hover:border-slate-700 ${borderTheme}`}>
      <div>
        {/* Top Header Row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {metric.label}
            </h4>
            {metric.noteNumber && (
              <button
                type="button"
                onClick={() => onInspectNote && onInspectNote(metric.noteNumber!)}
                className="statement-note-btn !text-[10px] !py-0.5 !px-1.5"
                title={`Inspect Note ${metric.noteNumber}`}
              >
                Note {metric.noteNumber}
              </button>
            )}
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
            {metric.category || 'Metric'}
          </span>
        </div>

        {/* Current Year Value */}
        <div className="mb-4">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Current Year (CY)
          </span>
          <div className="text-2xl font-black text-white font-mono tracking-tight mt-0.5">
            {formatINR(metric.cyAmount)}
          </div>
        </div>
      </div>

      {/* Comparative Footer Box */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Previous Year (PY):</span>
          <span className="font-mono font-bold text-slate-200">
            {isAvailable || isZeroBase ? formatINR(metric.pyAmount) : <span className="text-slate-500 italic">PY Unavailable</span>}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs border-t border-slate-800/60 pt-2">
          <span className="text-slate-400">Variance (Shift):</span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-slate-300 text-xs">
              {isAvailable || isZeroBase
                ? formatINR(metric.changeAmount, { showSign: true })
                : '—'}
            </span>
            <VarianceBadge
              changePercent={metric.changePercent}
              status={isAvailable ? 'AVAILABLE' : isZeroBase ? 'ZERO_BASE' : 'PY_UNAVAILABLE'}
              size="sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
