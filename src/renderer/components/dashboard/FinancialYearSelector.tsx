import React from 'react';
import type { DashboardFinancialYearOption } from '../../../electron-api';

interface FinancialYearSelectorProps {
  financialYears: DashboardFinancialYearOption[];
  selectedFyId: string;
  onSelectFyId: (id: string) => void;
  disabled?: boolean;
}

export default function FinancialYearSelector({
  financialYears,
  selectedFyId,
  onSelectFyId,
  disabled = false,
}: FinancialYearSelectorProps) {
  if (financialYears.length === 0) {
    return (
      <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-sm text-slate-500 text-xs">
        <span className="font-semibold">FY:</span>
        <span className="italic">No Financial Years Available</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-sm">
      <label htmlFor="fy-selector" className="text-xs font-semibold text-slate-300">
        FY:
      </label>
      <select
        id="fy-selector"
        value={selectedFyId}
        onChange={(e) => onSelectFyId(e.target.value)}
        disabled={disabled}
        className="reporting-context-select"
      >
        {!selectedFyId && (
          <option value="" disabled>
            Select Financial Year...
          </option>
        )}
        {financialYears.map((fy) => (
          <option key={fy.id} value={fy.id}>
            {fy.label} {fy.hasData ? '●' : '(No data)'}
          </option>
        ))}
      </select>
    </div>
  );
}
