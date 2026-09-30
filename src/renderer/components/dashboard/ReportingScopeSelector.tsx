import React from 'react';

interface ReportingScopeSelectorProps {
  scope: 'CONSOLIDATED' | 'UNIT';
  onSelectScope: (scope: 'CONSOLIDATED' | 'UNIT') => void;
  disabled?: boolean;
}

export default function ReportingScopeSelector({
  scope,
  onSelectScope,
  disabled = false,
}: ReportingScopeSelectorProps) {
  return (
    <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-sm">
      <label htmlFor="reporting-scope-selector" className="text-xs font-semibold text-slate-400">
        Scope:
      </label>
      <select
        id="reporting-scope-selector"
        value={scope}
        onChange={(e) => onSelectScope(e.target.value as 'CONSOLIDATED' | 'UNIT')}
        disabled={disabled}
        className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer disabled:cursor-not-allowed disabled:text-slate-500"
      >
        <option value="CONSOLIDATED" className="bg-slate-800 text-white">
          Consolidated (All Units)
        </option>
        <option value="UNIT" className="bg-slate-800 text-white">
          Individual Unit
        </option>
      </select>
    </div>
  );
}
