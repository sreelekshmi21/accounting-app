import React from 'react';

export type ReportingModuleTab =
  | 'dashboard'
  | 'financial-statements'
  | 'comparative-reports'
  | 'unit-reports'
  | 'consolidated-reports'
  | 'reconciliation'
  | 'validation';

interface ReportingNavProps {
  activeTab: ReportingModuleTab;
  onSelectTab: (tab: ReportingModuleTab) => void;
}

const REPORTING_TABS: Array<{ id: ReportingModuleTab; label: string; icon: string; badge?: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', badge: '15.1' },
  { id: 'financial-statements', label: 'Financial Statements', icon: '📑', badge: '15.3-4' },
  { id: 'comparative-reports', label: 'Comparative Reports', icon: '📈', badge: '15.5' },
  { id: 'unit-reports', label: 'Unit Reports', icon: '🏢', badge: '15.6' },
  { id: 'consolidated-reports', label: 'Consolidated Reports', icon: '🌐', badge: '15.6' },
  { id: 'reconciliation', label: 'Reconciliation', icon: '⚖️', badge: '15.7' },
  { id: 'validation', label: 'Validation', icon: '✅', badge: '15.8' },
];

export default function ReportingNav({ activeTab, onSelectTab }: ReportingNavProps) {
  return (
    <div className="bg-slate-900 border-b border-slate-800 px-6 flex items-center gap-1 overflow-x-auto scrollbar-thin">
      {REPORTING_TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`px-4 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${
              isActive
                ? 'border-teal-400 text-teal-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.badge && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                  isActive
                    ? 'bg-teal-900/60 text-teal-300 border border-teal-700/60'
                    : 'bg-slate-800 text-slate-500 border border-slate-700/50'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
