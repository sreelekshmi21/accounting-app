import React from 'react';
import type { DashboardUnitOption, DashboardConsolidationRunOption } from '../../../electron-api';

interface EntityUnitSelectorProps {
  scope: 'CONSOLIDATED' | 'UNIT';
  units: DashboardUnitOption[];
  selectedUnitId: string;
  onSelectUnitId: (id: string) => void;
  consolidationRuns: DashboardConsolidationRunOption[];
  selectedRunId: string;
  onSelectRunId: (id: string) => void;
  disabled?: boolean;
}

export default function EntityUnitSelector({
  scope,
  units,
  selectedUnitId,
  onSelectUnitId,
  consolidationRuns,
  selectedRunId,
  onSelectRunId,
  disabled = false,
}: EntityUnitSelectorProps) {
  if (scope === 'UNIT') {
    if (units.length === 0) {
      return (
        <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-sm text-slate-500 text-xs">
          <span className="font-semibold">Unit:</span>
          <span className="italic">No Units Available</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-sm">
        <label htmlFor="unit-selector" className="text-xs font-semibold text-slate-400">
          Unit:
        </label>
        <select
          id="unit-selector"
          value={selectedUnitId}
          onChange={(e) => onSelectUnitId(e.target.value)}
          disabled={disabled}
          className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer max-w-[180px] truncate disabled:cursor-not-allowed disabled:text-slate-500"
        >
          {units.map((u) => (
            <option key={u.id} value={u.id} className="bg-slate-800 text-white">
              {u.name} {u.hasData ? '●' : '(No data)'}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Consolidated Scope: optionally choose consolidation run or show All Units
  if (consolidationRuns.length > 0) {
    return (
      <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-sm">
        <label htmlFor="consolidation-run-selector" className="text-xs font-semibold text-slate-400">
          Run:
        </label>
        <select
          id="consolidation-run-selector"
          value={selectedRunId}
          onChange={(e) => onSelectRunId(e.target.value)}
          disabled={disabled}
          className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer disabled:cursor-not-allowed disabled:text-slate-500"
        >
          {consolidationRuns.map((r) => (
            <option key={r.id} value={r.id} className="bg-slate-800 text-white">
              {r.runNumber} ({r.status})
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-sm text-slate-300 text-xs font-medium">
      <span className="text-slate-400 font-semibold">Scope Target:</span>
      <span className="text-teal-400 font-bold">All Units (Consolidated)</span>
    </div>
  );
}
