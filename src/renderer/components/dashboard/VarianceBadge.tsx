import React from 'react';

interface VarianceBadgeProps {
  changePercent: number | null | undefined;
  status?: 'AVAILABLE' | 'PY_UNAVAILABLE' | 'NO_DATA' | 'ZERO_BASE';
  size?: 'sm' | 'md';
  showZeroAsNeutral?: boolean;
}

export default function VarianceBadge({
  changePercent,
  status = 'AVAILABLE',
  size = 'md',
  showZeroAsNeutral = true,
}: VarianceBadgeProps) {
  if (status === 'PY_UNAVAILABLE' || status === 'NO_DATA' || changePercent === null || changePercent === undefined) {
    return (
      <span
        className={`inline-flex items-center gap-1 font-mono font-semibold rounded-md border text-slate-400 bg-slate-800/80 border-slate-700/80 ${
          size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
        }`}
        title="Comparative variance percentage is unavailable"
      >
        <span>—</span>
        <span>N/A</span>
      </span>
    );
  }

  if (status === 'ZERO_BASE') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-mono font-semibold rounded-md border text-amber-300 bg-amber-950/60 border-amber-800/60 ${
          size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
        }`}
        title="Previous Year was ₹0.00 — percentage base cannot be calculated"
      >
        <span>⚡</span>
        <span>Base ₹0 (N/A)</span>
      </span>
    );
  }

  const isPositive = changePercent > 0;
  const isNegative = changePercent < 0;
  const isZero = changePercent === 0;

  const formatted = `${isPositive ? '+' : ''}${changePercent.toFixed(2)}%`;

  let badgeClass = 'text-slate-300 bg-slate-800/80 border-slate-700/80';
  let icon = '•';

  if (isPositive) {
    badgeClass = 'text-emerald-300 bg-emerald-950/70 border-emerald-800/70';
    icon = '▲';
  } else if (isNegative) {
    badgeClass = 'text-rose-300 bg-rose-950/70 border-rose-800/70';
    icon = '▼';
  } else if (isZero && showZeroAsNeutral) {
    badgeClass = 'text-slate-300 bg-slate-800/80 border-slate-700/80';
    icon = '■';
  }

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-bold rounded-md border shadow-sm ${badgeClass} ${
        size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
      }`}
      title={`Percentage Shift: ${formatted}`}
    >
      <span className="text-[9px]">{icon}</span>
      <span>{formatted}</span>
    </span>
  );
}
