import React, { useState, useEffect, useCallback } from 'react';
import { useReportingContext } from '../../context/ReportingContext';
import DashboardCard from './DashboardCard';
import LoadingState from './LoadingState';
import ErrorState from './ErrorState';
import EmptyState from './EmptyState';
import VarianceBadge from './VarianceBadge';
import BranchDivisionReconciliationCard from './BranchDivisionReconciliationCard';
import UnitIncomeExpenditureTable from './UnitIncomeExpenditureTable';
import UnitBalanceSheetTable from './UnitBalanceSheetTable';
import type {
  UnitConsolidatedReportingData,
} from '../../../electron-api';

interface UnitConsolidatedReportingViewProps {
  onNavigateToFinancialStatementsWorkbench?: () => void;
  onNavigateToNotes?: () => void;
  onNavigateToExport?: () => void;
  onNavigateToValidation?: () => void;
  onNavigateToConsolidation?: () => void;
}

type TableTab = 'INCOME_EXPENDITURE' | 'BALANCE_SHEET' | 'COMBINED_SUMMARY';

export default function UnitConsolidatedReportingView({
  onNavigateToFinancialStatementsWorkbench,
  onNavigateToNotes,
  onNavigateToExport,
  onNavigateToValidation,
  onNavigateToConsolidation,
}: UnitConsolidatedReportingViewProps) {
  const {
    financialYearId,
    financialYearLabel,
    scope,
    setScope,
    unitId,
    setUnitId,
    unitName,
    entityName,
    units,
    consolidationRunId,
    refresh: refreshContext,
  } = useReportingContext();

  const [reportData, setReportData] = useState<UnitConsolidatedReportingData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Table Sub-tabs
  const [activeTableTab, setActiveTableTab] = useState<TableTab>('INCOME_EXPENDITURE');

  // Filters
  const [filterActiveOnly, setFilterActiveOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Automated Test Suite State
  const [runningTests, setRunningTests] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<{
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    results: Array<{ name: string; passed: boolean; message: string }>;
  } | null>(null);
  const [showTests, setShowTests] = useState<boolean>(false);

  // Currency Formatter helper
  const formatCurrency = (val: number | null | undefined, placeholder = '—') => {
    if (val === null || val === undefined) return placeholder;
    if (val === 0) return '₹ 0.00';
    const formatted = Math.abs(val).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return val < 0 ? `(₹ ${formatted})` : `₹ ${formatted}`;
  };

  // Fetch Report Data from Main Process
  const fetchReportData = useCallback(async () => {
    if (!financialYearId) {
      setReportData(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      if (window.electronAPI?.getUnitConsolidatedReportingData) {
        const res = await window.electronAPI.getUnitConsolidatedReportingData(financialYearId, {
          scope,
          unitId: scope === 'UNIT' ? unitId : undefined,
          consolidationRunId: scope === 'CONSOLIDATED' ? consolidationRunId : undefined,
        });
        setReportData(res);
      }
    } catch (err: any) {
      console.error('Failed to load Unit & Consolidated Reporting data:', err);
      setError(err?.message || 'Failed to compile Unit & Consolidated reports.');
    } finally {
      setLoading(false);
    }
  }, [financialYearId, scope, unitId, consolidationRunId]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Run Automated Phase 15.6 Tests
  const handleRunTests = async () => {
    try {
      setRunningTests(true);
      setShowTests(true);
      if (window.electronAPI?.runUnitConsolidatedReportingTests) {
        const res = await window.electronAPI.runUnitConsolidatedReportingTests();
        setTestResults(res);
      }
    } catch (err) {
      console.error('Test execution failed:', err);
    } finally {
      setRunningTests(false);
    }
  };

  if (loading && !reportData) {
    return (
      <div className="py-12">
        <LoadingState message="Compiling Unit-wise & Consolidated Reporting dataset (Phases 9 & 12)..." />
      </div>
    );
  }

  if (error && !reportData) {
    return (
      <div className="py-12 max-w-4xl mx-auto">
        <ErrorState
          title="Unit & Consolidated Reporting Error"
          message={error}
          onRetry={fetchReportData}
        />
      </div>
    );
  }

  if (!reportData || !reportData.hasData) {
    return (
      <div className="py-12 max-w-4xl mx-auto">
        <EmptyState
          title="No Financial Data Available for Reporting"
          message={`No Trial Balance batches or mappings exist for Financial Year ${financialYearLabel || financialYearId}. Import a trial balance to generate unit and consolidated reports.`}
          actionLabel={onNavigateToFinancialStatementsWorkbench ? 'Open Financial Statements Workbench →' : undefined}
          onAction={onNavigateToFinancialStatementsWorkbench}
        />
      </div>
    );
  }

  const activeSummary = reportData.activeContextSummary;
  const isUnitScope = scope === 'UNIT';

  // Filter unit rows based on user controls
  const filteredUnitRows = reportData.unitRows.filter((r) => {
    if (filterActiveOnly && !r.hasData) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return r.unitName.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* ── Top Header Banner & Mode Selector ── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              Unit-wise & Consolidated Reporting
            </h1>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-800/60">
              Phase 15.6
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Authoritative financial results per unit and organization-wide consolidation (Phase 9 Consolidation & Phase 12 Engine)
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleRunTests}
            disabled={runningTests}
            className="px-3 py-1.5 bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 text-xs font-bold rounded-lg border border-indigo-700/60 transition-all flex items-center gap-1.5 shadow-sm"
            title="Run Phase 15.6 Automated Verification Tests"
          >
            <span>{runningTests ? '⏳' : '🧪'}</span>
            <span>{runningTests ? 'Testing…' : 'Run Phase 15.6 Tests'}</span>
          </button>

          {onNavigateToConsolidation && (
            <button
              onClick={onNavigateToConsolidation}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span>🌐</span>
              <span>Consolidation Workbench →</span>
            </button>
          )}

          {onNavigateToExport && (
            <button
              onClick={onNavigateToExport}
              className="px-3 py-1.5 bg-teal-800/80 hover:bg-teal-700 text-teal-100 text-xs font-bold rounded-lg border border-teal-600/70 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span>📊</span>
              <span>Export Reports →</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Active Reporting Context Chips & Mode Switcher ── */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-md flex flex-wrap items-center justify-between gap-4">
        {/* Reporting Mode Radio / Pill Selector */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Reporting Scope:
          </span>
          <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-lg p-1">
            <button
              onClick={() => setScope('CONSOLIDATED')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                scope === 'CONSOLIDATED'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🌐</span>
              <span>Consolidated (All Units)</span>
            </button>

            <button
              onClick={() => setScope('UNIT')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                scope === 'UNIT'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🏢</span>
              <span>Individual Unit</span>
            </button>
          </div>

          {/* Unit Selector when Individual Unit mode is active */}
          {scope === 'UNIT' && (
            <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1">
              <label htmlFor="unit-mode-selector" className="text-xs font-semibold text-slate-400">
                Unit:
              </label>
              <select
                id="unit-mode-selector"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="reporting-context-select max-w-[220px]"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.hasData ? '●' : '(No data)'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Active Context Indicators */}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div>
            <span className="text-slate-500">FY: </span>
            <strong className="text-slate-200">{financialYearLabel}</strong>
          </div>
          <div>•</div>
          <div>
            <span className="text-slate-500">Context: </span>
            <strong className={isUnitScope ? 'text-teal-300' : 'text-indigo-300'}>
              {isUnitScope ? (unitName || 'Unit') : 'Consolidated — All Units'}
            </strong>
          </div>
          <div>•</div>
          <div>
            <span className="text-slate-500">Entity: </span>
            <strong className="text-slate-200">{entityName}</strong>
          </div>
        </div>
      </div>

      {/* ── Active Context Financial Performance Summary Cards ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-200 tracking-tight flex items-center gap-2">
            <span>{isUnitScope ? '🏢' : '🌐'}</span>
            <span>{activeSummary.title}</span>
            <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              FY {financialYearLabel}
            </span>
          </h2>

          <span className="text-xs font-mono text-slate-400">
            {activeSummary.isBalancedCY ? '✓ Balance Sheet in Equilibrium' : `⚠ BS Diff: ${formatCurrency(activeSummary.differenceCY)}`}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <DashboardCard
            title="Total Income"
            value={formatCurrency(activeSummary.incomeCY)}
            subtitle={reportData.hasPY ? `PY: ${formatCurrency(activeSummary.incomePY)}` : 'PY Unavailable'}
            icon="💵"
            badge="Income"
            badgeColor="emerald"
          />

          <DashboardCard
            title="Total Expenditure"
            value={formatCurrency(activeSummary.expenditureCY)}
            subtitle={reportData.hasPY ? `PY: ${formatCurrency(activeSummary.expenditurePY)}` : 'PY Unavailable'}
            icon="💸"
            badge="Expense"
            badgeColor="rose"
          />

          <DashboardCard
            title={activeSummary.isSurplusCY ? 'Net Surplus' : 'Net Deficit'}
            value={formatCurrency(activeSummary.netSurplusCY)}
            subtitle={reportData.hasPY ? `PY: ${formatCurrency(activeSummary.netSurplusPY)}` : 'PY Unavailable'}
            icon={activeSummary.isSurplusCY ? '📈' : '📉'}
            badge={activeSummary.isSurplusCY ? 'Surplus' : 'Deficit'}
            badgeColor={activeSummary.isSurplusCY ? 'teal' : 'rose'}
          />

          <DashboardCard
            title="Total Assets"
            value={formatCurrency(activeSummary.totalAssetsCY)}
            subtitle={reportData.hasPY ? `PY: ${formatCurrency(activeSummary.totalAssetsPY)}` : 'PY Unavailable'}
            icon="🏛️"
            badge="Assets"
            badgeColor="indigo"
          />

          <DashboardCard
            title="Total Liabilities"
            value={formatCurrency(activeSummary.totalLiabilitiesCY)}
            subtitle={reportData.hasPY ? `PY: ${formatCurrency(activeSummary.totalLiabilitiesPY)}` : 'PY Unavailable'}
            icon="📜"
            badge="Liabilities"
            badgeColor="slate"
          />

          <DashboardCard
            title="Net Assets"
            value={formatCurrency(activeSummary.netAssetsCY)}
            subtitle={`Corpus: ${formatCurrency(activeSummary.corpusCapitalCY)}`}
            icon="💎"
            badge="Position"
            badgeColor="teal"
          />
        </div>
      </div>

      {/* ── Branch / Division Reciprocal Reconciliation Card (Phase 9) ── */}
      <BranchDivisionReconciliationCard
        reconciliation={reportData.branchDivisionReconciliation}
        onNavigateToConsolidation={onNavigateToConsolidation}
      />

      {/* ── Unit-wise Matrices Section ── */}
      <div className="space-y-4">
        {/* Table Sub-tab Switcher and Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl p-1 shadow-sm">
            <button
              onClick={() => setActiveTableTab('INCOME_EXPENDITURE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTableTab === 'INCOME_EXPENDITURE'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📑</span>
              <span>Unit-wise Income & Expenditure</span>
            </button>

            <button
              onClick={() => setActiveTableTab('BALANCE_SHEET')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTableTab === 'BALANCE_SHEET'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🏛️</span>
              <span>Unit-wise Balance Sheet</span>
            </button>
          </div>

          {/* Filters Bar */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Search units…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 max-w-[180px]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterActiveOnly}
                onChange={(e) => setFilterActiveOnly(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-0"
              />
              <span>Active Units Only</span>
            </label>
          </div>
        </div>

        {/* Selected Table View */}
        {activeTableTab === 'INCOME_EXPENDITURE' ? (
          <UnitIncomeExpenditureTable
            unitRows={filteredUnitRows}
            consolidatedTotals={reportData.consolidatedTotals}
            hasPY={reportData.hasPY}
            selectedUnitId={unitId}
            onSelectUnit={(uid) => {
              setUnitId(uid);
              setScope('UNIT');
            }}
          />
        ) : (
          <UnitBalanceSheetTable
            unitRows={filteredUnitRows}
            consolidatedTotals={reportData.consolidatedTotals}
            hasPY={reportData.hasPY}
            selectedUnitId={unitId}
            onSelectUnit={(uid) => {
              setUnitId(uid);
              setScope('UNIT');
            }}
          />
        )}
      </div>

      {/* ── Test Suite Modal / Panel ── */}
      {showTests && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-lg">🧪</span>
              <h3 className="text-sm font-extrabold text-white">
                Phase 15.6 Automated Verification Test Suite
              </h3>
              {testResults && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full font-mono ${
                  testResults.allPassed ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-rose-950 text-rose-300 border border-rose-700'
                }`}>
                  {testResults.allPassed ? 'ALL TESTS PASSED' : 'TEST FAILURES DETECTED'}
                </span>
              )}
            </div>

            <button
              onClick={() => setShowTests(false)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              ✕ Close
            </button>
          </div>

          {runningTests ? (
            <div className="py-6">
              <LoadingState message="Executing Phase 15.6 verification tests..." />
            </div>
          ) : testResults ? (
            <div className="space-y-2">
              <div className="text-xs text-slate-400 mb-2">
                Passed {testResults.passedTests} of {testResults.totalTests} tests
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
                {testResults.results.map((res, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg text-xs flex items-start gap-2.5 ${
                      res.passed
                        ? 'bg-slate-950/60 text-slate-300 border border-slate-800'
                        : 'bg-rose-950/40 text-rose-200 border border-rose-900/60'
                    }`}
                  >
                    <span className={res.passed ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {res.passed ? '✓' : '✗'}
                    </span>
                    <div className="flex-1">
                      <span className="font-bold text-slate-200">{res.name}: </span>
                      <span className="text-slate-400">{res.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
