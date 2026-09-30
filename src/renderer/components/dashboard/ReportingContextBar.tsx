import React from 'react';
import { useReportingContext } from '../../context/ReportingContext';
import FinancialYearSelector from './FinancialYearSelector';
import ReportingScopeSelector from './ReportingScopeSelector';
import EntityUnitSelector from './EntityUnitSelector';

export default function ReportingContextBar() {
  const {
    financialYears,
    financialYearId,
    setFinancialYearId,
    scope,
    setScope,
    units,
    unitId,
    setUnitId,
    consolidationRuns,
    consolidationRunId,
    setConsolidationRunId,
    isLoading,
    refresh,
    entityName,
  } = useReportingContext();

  return (
    <div className="bg-slate-900/80 border-b border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
      {/* Dimension Selectors */}
      <div className="flex flex-wrap items-center gap-3">
        <FinancialYearSelector
          financialYears={financialYears}
          selectedFyId={financialYearId}
          onSelectFyId={setFinancialYearId}
          disabled={isLoading}
        />

        <ReportingScopeSelector
          scope={scope}
          onSelectScope={setScope}
          disabled={isLoading}
        />

        <EntityUnitSelector
          scope={scope}
          units={units}
          selectedUnitId={unitId}
          onSelectUnitId={setUnitId}
          consolidationRuns={consolidationRuns}
          selectedRunId={consolidationRunId}
          onSelectRunId={setConsolidationRunId}
          disabled={isLoading}
        />
      </div>

      {/* Quick Status and Refresh Action */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Entity: <strong className="text-slate-200">{entityName}</strong></span>
        </div>

        <button
          onClick={() => refresh()}
          disabled={isLoading}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all flex items-center gap-1.5 shadow-sm disabled:cursor-not-allowed disabled:text-slate-500"
          title="Reload reporting context and dependent data"
        >
          <span className={isLoading ? 'animate-spin' : ''}>🔄</span>
          <span>{isLoading ? 'Updating…' : 'Refresh'}</span>
        </button>
      </div>
    </div>
  );
}
