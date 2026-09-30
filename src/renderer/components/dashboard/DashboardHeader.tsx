import React from 'react';
import { useReportingContext } from '../../context/ReportingContext';

interface DashboardHeaderProps {
  activeTabTitle?: string;
  subtitle?: string;
}

export default function DashboardHeader({
  activeTabTitle = 'Financial Dashboard',
  subtitle = 'Centralized financial reporting, statements & multi-unit intelligence',
}: DashboardHeaderProps) {
  const { financialYearLabel, scope, unitName } = useReportingContext();

  return (
    <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-widest text-teal-400 uppercase bg-teal-950/70 border border-teal-800/60 px-2.5 py-0.5 rounded-full">
            Phase 15
          </span>
          <h1 className="text-xl font-extrabold text-white tracking-tight">
            {activeTabTitle}
          </h1>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          {subtitle}
        </p>
      </div>

      {/* Context Badge Group */}
      <div className="flex items-center gap-2">
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-1 text-xs flex items-center gap-2">
          <span className="text-slate-400 font-medium">FY:</span>
          <span className="text-white font-bold">{financialYearLabel || '—'}</span>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-1 text-xs flex items-center gap-2">
          <span className="text-slate-400 font-medium">Scope:</span>
          <span className="text-teal-300 font-bold">
            {scope === 'UNIT' ? (unitName || 'Unit') : 'Consolidated'}
          </span>
        </div>
      </div>
    </div>
  );
}
