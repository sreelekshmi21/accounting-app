import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useReportingContext } from '../../context/ReportingContext';
import DashboardCard from './DashboardCard';
import LoadingState from './LoadingState';
import ErrorState from './ErrorState';
import EmptyState from './EmptyState';
import type {
  BranchDivisionReconciliationDashboardData,
  BranchDivisionReconciliationItem,
} from '../../../electron-api';

interface BranchDivisionReconciliationDashboardProps {
  onNavigateToConsolidation?: () => void;
  onNavigateToFinancialStatementsWorkbench?: () => void;
  onNavigateToValidation?: () => void;
  onNavigateToExport?: () => void;
}

export default function BranchDivisionReconciliationDashboard({
  onNavigateToConsolidation,
  onNavigateToFinancialStatementsWorkbench,
  onNavigateToValidation,
  onNavigateToExport,
}: BranchDivisionReconciliationDashboardProps) {
  const {
    financialYearId,
    financialYearLabel,
    scope,
    unitId,
    unitName,
    consolidationRunId,
  } = useReportingContext();

  const [data, setData] = useState<BranchDivisionReconciliationDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>('ALL');

  // Inspection Drawer
  const [selectedItem, setSelectedItem] = useState<BranchDivisionReconciliationItem | null>(null);

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

  // Fetch reconciliation dashboard data via IPC
  const fetchData = useCallback(async () => {
    if (!financialYearId) {
      setData(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      if (window.electronAPI?.getBranchDivisionReconciliationDashboardData) {
        const res = await window.electronAPI.getBranchDivisionReconciliationDashboardData(financialYearId, {
          scope,
          unitId: scope === 'UNIT' ? unitId : undefined,
          consolidationRunId: scope === 'CONSOLIDATED' ? consolidationRunId : undefined,
          statusFilter: statusFilter !== 'ALL' ? statusFilter : undefined,
          searchQuery: searchQuery.trim() || undefined,
        });
        setData(res);
      }
    } catch (err: unknown) {
      console.error('Failed to load Branch/Division reconciliation data:', err);
      setError((err as { message?: string })?.message || 'Failed to load Branch/Division reconciliation dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [financialYearId, scope, unitId, consolidationRunId, statusFilter, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Run Automated Phase 15.7 Verification Tests
  const handleRunTests = async () => {
    try {
      setRunningTests(true);
      setShowTests(true);
      if (window.electronAPI?.runBranchDivisionReconciliationTests) {
        const res = await window.electronAPI.runBranchDivisionReconciliationTests();
        setTestResults(res);
      }
    } catch (err) {
      console.error('Test execution failed:', err);
    } finally {
      setRunningTests(false);
    }
  };

  // Filter items by client-side criteria (for instant account-type toggling)
  const displayItems = useMemo(() => {
    if (!data?.items) return [];
    let items = data.items;
    if (accountTypeFilter !== 'ALL') {
      items = items.filter((i) => i.internalAccountType === accountTypeFilter);
    }
    return items;
  }, [data?.items, accountTypeFilter]);

  if (loading && !data) {
    return (
      <div className="py-12">
        <LoadingState message="Retrieving Branch/Division reconciliation results from Phase 9 engine…" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="py-12 max-w-4xl mx-auto">
        <ErrorState
          title="Branch/Division Reconciliation Dashboard Error"
          message={error}
          onRetry={fetchData}
        />
      </div>
    );
  }

  const kpis = data?.kpiSummary;
  const isOverallReconciled = kpis?.overallReconciled ?? true;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ── Page Header & Context Summary ── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-950/80 border border-indigo-700/60 flex items-center justify-center text-2xl shadow-inner">
              ⚖️
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-extrabold text-white tracking-tight">
                  Branch / Division Reconciliation Dashboard
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full font-bold bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                  Phase 15.7
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                  Phase 9 Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Authoritative inter-unit reciprocal balance verification, discrepancy review, and batch reconciliation audit
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowTests(!showTests)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all flex items-center gap-1.5 shadow-sm"
              title="Toggle Automated Verification Tests"
            >
              <span>🧪</span>
              <span>{showTests ? 'Hide Tests' : 'Verify Phase 15.7'}</span>
            </button>

            {onNavigateToConsolidation && (
              <button
                onClick={onNavigateToConsolidation}
                className="px-3.5 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5"
                title="Open Phase 9 Consolidation Workbench"
              >
                <span>🌐</span>
                <span>Consolidation Workbench →</span>
              </button>
            )}

            {onNavigateToFinancialStatementsWorkbench && (
              <button
                onClick={onNavigateToFinancialStatementsWorkbench}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all flex items-center gap-1.5 shadow-sm"
                title="Open Financial Statements Workbench"
              >
                <span>📊</span>
                <span>Statements →</span>
              </button>
            )}

            {onNavigateToValidation && (
              <button
                onClick={onNavigateToValidation}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all flex items-center gap-1.5 shadow-sm"
                title="Open Final Validation"
              >
                <span>🛡️</span>
                <span>Validation →</span>
              </button>
            )}

            {onNavigateToExport && (
              <button
                onClick={onNavigateToExport}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all flex items-center gap-1.5 shadow-sm"
                title="Export Reconciliation Reports"
              >
                <span>📥</span>
                <span>Export →</span>
              </button>
            )}
          </div>
        </div>

        {/* Reporting Context Badges */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400">Context:</span>
            <span className="bg-slate-950/80 text-slate-200 px-2.5 py-1 rounded-md border border-slate-800 font-mono font-medium">
              FY {data?.financialYearLabel || financialYearLabel}
            </span>
            <span
              className={`px-2.5 py-1 rounded-md border font-semibold ${
                scope === 'UNIT'
                  ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                  : 'bg-teal-950/60 text-teal-300 border-teal-800/60'
              }`}
            >
              {scope === 'UNIT' ? `Unit: ${data?.unitName || unitName || 'Selected Unit'}` : 'Consolidated: All Units'}
            </span>
            {data?.activeConsolidationRun && (
              <span className="bg-slate-950/80 text-teal-300 px-2.5 py-1 rounded-md border border-slate-800 font-mono text-[11px]">
                Batch: {data.activeConsolidationRun.runNumber} ({data.activeConsolidationRun.status})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Status:</span>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${
                isOverallReconciled
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                  : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
              }`}
            >
              <span>{isOverallReconciled ? '✓' : '⚠'}</span>
              <span>{isOverallReconciled ? 'Reconciled (Net Zero)' : 'Discrepancy (Review Required)'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Phase 9 Accounting Semantics Banner ── */}
      <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-xl p-4 flex items-start gap-3 shadow-sm">
        <span className="text-lg mt-0.5">⚖️</span>
        <div className="text-xs space-y-1">
          <p className="font-bold text-indigo-200">
            Authoritative Phase 9 Reconciliation Principle:
          </p>
          <p className="text-indigo-300/90 leading-relaxed">
            <strong>Rule:</strong> Net-zero reconciliation difference (Dr = Cr) → <strong>Reconciled</strong>.
            Non-zero difference → <strong>Not Reconciled</strong>. Reconciliation verifies reciprocal equilibrium before consolidation.
            Reconciliation does not, by itself, mean that balances have been eliminated from consolidated statements.
            Elimination is an authoritative subsequent consolidation process.
          </p>
        </div>
      </div>

      {/* ── Automated Verification Test Suite Panel (Toggleable) ── */}
      {showTests && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-lg">🧪</span>
              <h3 className="text-sm font-bold text-white">
                Phase 15.7 Automated Verification Test Suite
              </h3>
            </div>
            <button
              onClick={handleRunTests}
              disabled={runningTests}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <span>{runningTests ? '⏳' : '▶'}</span>
              <span>{runningTests ? 'Executing Tests…' : 'Run All Phase 15.7 Tests'}</span>
            </button>
          </div>

          {testResults ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold pb-2 border-b border-slate-800/60">
                <span className={testResults.allPassed ? 'text-emerald-400' : 'text-rose-400'}>
                  {testResults.allPassed ? `✓ ALL ${testResults.totalTests} TESTS PASSED` : '⚠ SOME TESTS FAILED'}
                </span>
                <span className="text-slate-400">
                  {testResults.passedTests} / {testResults.totalTests} Passed
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {testResults.results.map((r, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg text-xs border ${
                      r.passed
                        ? 'bg-slate-950/40 text-slate-300 border-slate-800/80'
                        : 'bg-rose-950/30 text-rose-200 border-rose-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 font-bold">
                      <span className={r.passed ? 'text-emerald-400' : 'text-rose-400'}>
                        {r.passed ? '✓' : '✗'}
                      </span>
                      <span>{r.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal">{r.message}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-slate-400">
              Click <strong>"Run All Phase 15.7 Tests"</strong> to verify unit isolation, consolidated batch association, net-zero semantics, read-only safety, and error handling.
            </div>
          )}
        </div>
      )}

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Items */}
        <DashboardCard
          title="Total Reconciliation Items"
          value={kpis?.totalItems ?? 0}
          subtitle={`Distinct reconciliation pairs in ${scope === 'UNIT' ? 'unit' : 'consolidated'} scope`}
          icon="📦"
          badge={data?.hasReconciliationRecords ? 'Phase 9 Records' : 'No Records'}
          badgeColor={data?.hasReconciliationRecords ? 'slate' : 'amber'}
        />

        {/* Reconciled Items */}
        <DashboardCard
          title="Reconciled Items"
          value={kpis?.reconciledItems ?? 0}
          subtitle="Net-zero reciprocal equilibrium (Dr = Cr)"
          icon="✓"
          badge={kpis && kpis.totalItems > 0 && kpis.reconciledItems === kpis.totalItems ? '100% Balanced' : 'Equilibrium'}
          badgeColor="emerald"
        />

        {/* Not Reconciled Items */}
        <DashboardCard
          title="Not Reconciled Items"
          value={kpis?.notReconciledItems ?? 0}
          subtitle="Reciprocal difference requiring review"
          icon="⚠"
          badge={(kpis?.notReconciledItems ?? 0) > 0 ? 'Requires Review' : '0 Discrepancies'}
          badgeColor={(kpis?.notReconciledItems ?? 0) > 0 ? 'amber' : 'emerald'}
        />

        {/* Net Difference */}
        <DashboardCard
          title="Net Difference"
          value={formatCurrency(kpis?.netDifference)}
          subtitle={
            scope === 'CONSOLIDATED'
              ? 'Consolidated reciprocal variance'
              : 'Unit-level reciprocal variance'
          }
          icon="⚖️"
          badge={Math.abs(kpis?.netDifference || 0) < 0.01 ? 'Net Zero' : 'Variance'}
          badgeColor={Math.abs(kpis?.netDifference || 0) < 0.01 ? 'emerald' : 'rose'}
        />

        {/* Units / Branches Affected */}
        <DashboardCard
          title="Units Affected"
          value={kpis?.unitsAffected ?? 0}
          subtitle="Distinct branches with unreconciled balances"
          icon="🏢"
          badge={(kpis?.unitsAffected ?? 0) > 0 ? 'Units Affected' : 'All Clear'}
          badgeColor={(kpis?.unitsAffected ?? 0) > 0 ? 'rose' : 'slate'}
        />
      </div>

      {/* ── Individual Unit Trial Balance Internal Balances Banner (Unit Scope Only) ── */}
      {scope === 'UNIT' && data?.unitTrialBalanceInternal && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-base">🏢</span>
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Unit Trial Balance Internal Balances ({data.unitName})
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              *Unit balance sheets retain Branch/Division balances; Phase 9 never removes them from individual unit reports.
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-0.5 text-[11px]">Branch/Division (Dr)</span>
              <span className="text-slate-100 font-mono font-bold">
                {formatCurrency(data.unitTrialBalanceInternal.branchDivisionDebit)}
              </span>
            </div>
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-0.5 text-[11px]">Branch/Division (Cr)</span>
              <span className="text-slate-100 font-mono font-bold">
                {formatCurrency(data.unitTrialBalanceInternal.branchDivisionCredit)}
              </span>
            </div>
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-0.5 text-[11px]">Santhigiri HO Reciprocal</span>
              <span className="text-slate-100 font-mono font-bold">
                Dr {formatCurrency(data.unitTrialBalanceInternal.santhigiriHODebit)} / Cr {formatCurrency(data.unitTrialBalanceInternal.santhigiriHOCredit)}
              </span>
            </div>
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-0.5 text-[11px]">Unit Internal Difference</span>
              <span
                className={`font-mono font-bold ${
                  data.unitTrialBalanceInternal.isUnitReconciled ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {formatCurrency(data.unitTrialBalanceInternal.internalDifference)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters & Search Toolbar ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-400">Reconciliation Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-medium"
            >
              <option value="ALL">All Statuses ({data?.kpiSummary.totalItems ?? 0})</option>
              <option value="RECONCILED">✓ Reconciled (Net Zero)</option>
              <option value="NOT_RECONCILED">⚠ Not Reconciled (Difference)</option>
              {data?.availableStatuses
                .filter((s) => s !== 'ALL' && s !== 'RECONCILED' && s !== 'NOT_RECONCILED')
                .map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
            </select>
          </div>

          {/* Account Type Filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-400">Account Type:</label>
            <select
              value={accountTypeFilter}
              onChange={(e) => setAccountTypeFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-medium"
            >
              <option value="ALL">All Types</option>
              <option value="Branch/Division">Branch/Division</option>
              <option value="Santhigiri Ashram HO">Santhigiri Ashram HO</option>
              <option value="Other Internal">Other Internal</option>
            </select>
          </div>
        </div>

        {/* Search Input */}
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <div className="relative w-full">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
            <input
              type="text"
              placeholder="Search reference, unit, or ledger…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
            />
          </div>
          {(searchQuery || statusFilter !== 'ALL' || accountTypeFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
                setAccountTypeFilter('ALL');
              }}
              className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg border border-slate-700"
              title="Reset all filters"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Main Reconciliation Details Table ── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">📋</span>
            <h3 className="text-sm font-bold text-white">
              Phase 9 Reconciliation Records
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              ({displayItems.length} {displayItems.length === 1 ? 'item' : 'items'})
            </span>
          </div>

          {data?.pyComparison?.hasPY && (
            <div className="text-[11px] text-slate-400">
              PY Comparison ({data.pyComparison.previousFinancialYearLabel}):{' '}
              <strong className="text-slate-300">
                {data.pyComparison.totalItemsPY} items, Diff: {formatCurrency(data.pyComparison.netDifferencePY)}
              </strong>
            </div>
          )}
        </div>

        {displayItems.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <EmptyState
              title={
                data?.hasReconciliationRecords === false
                  ? 'No Phase 9 Reconciliation Records Found'
                  : 'No Records Match Filters'
              }
              message={
                data?.hasReconciliationRecords === false
                  ? 'No Branch/Division reconciliation or elimination records exist for this context yet. To generate reconciliation records, create a consolidation run in Phase 9 Consolidation Workbench.'
                  : 'Try resetting the status filter or clearing your search term to see all reconciliation items.'
              }
              actionLabel={
                data?.hasReconciliationRecords === false && onNavigateToConsolidation
                  ? 'Open Consolidation Workbench →'
                  : 'Reset Filters'
              }
              onAction={
                data?.hasReconciliationRecords === false && onNavigateToConsolidation
                  ? onNavigateToConsolidation
                  : () => {
                      setStatusFilter('ALL');
                      setAccountTypeFilter('ALL');
                      setSearchQuery('');
                    }
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/70 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3.5">Ref / Run</th>
                  <th className="py-3 px-3.5">Source Unit</th>
                  <th className="py-3 px-3.5">Counterpart Unit</th>
                  <th className="py-3 px-3.5">Type & Ledger</th>
                  <th className="py-3 px-3.5 text-right">Debit (Dr)</th>
                  <th className="py-3 px-3.5 text-right">Credit (Cr)</th>
                  <th className="py-3 px-3.5 text-right">Net Difference</th>
                  <th className="py-3 px-3.5 text-center">Status</th>
                  <th className="py-3 px-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {displayItems.map((item) => {
                  const hasDiscrepancy = !item.isReconciled;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      onClick={() => setSelectedItem(item)}
                    >
                      {/* Ref / Run */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="font-mono font-bold text-indigo-300 bg-indigo-950/60 border border-indigo-800/50 px-2 py-0.5 rounded text-[11px]">
                          {item.eliminationNumber}
                        </span>
                        {item.consolidationRunNumber && (
                          <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
                            {item.consolidationRunNumber}
                          </span>
                        )}
                      </td>

                      {/* Source Unit */}
                      <td className="py-3 px-3.5 font-medium text-slate-200">
                        {item.sourceUnitName}
                      </td>

                      {/* Counterpart Unit */}
                      <td className="py-3 px-3.5 text-slate-300">
                        {item.counterpartyUnitName ? (
                          <span className="text-slate-200 font-medium">
                            {item.counterpartyUnitName}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">None recorded</span>
                        )}
                      </td>

                      {/* Type & Ledger */}
                      <td className="py-3 px-3.5 max-w-xs">
                        <span
                          className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border mb-0.5 ${
                            item.internalAccountType === 'Branch/Division'
                              ? 'bg-blue-950 text-blue-300 border-blue-800/60'
                              : item.internalAccountType === 'Santhigiri Ashram HO'
                              ? 'bg-purple-950 text-purple-300 border-purple-800/60'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {item.internalAccountType}
                        </span>
                        <p className="font-bold text-slate-200 truncate" title={item.sourceLedgerName}>
                          {item.sourceLedgerName}
                        </p>
                        {item.counterpartyLedgerName && (
                          <p className="text-[10px] text-slate-400 truncate" title={`Counterpart: ${item.counterpartyLedgerName}`}>
                            ↔ {item.counterpartyLedgerName}
                          </p>
                        )}
                      </td>

                      {/* Debit (Dr) */}
                      <td className="py-3 px-3.5 text-right font-mono font-semibold text-slate-200 whitespace-nowrap">
                        {formatCurrency(item.debitAmount)}
                      </td>

                      {/* Credit (Cr) */}
                      <td className="py-3 px-3.5 text-right font-mono font-semibold text-slate-200 whitespace-nowrap">
                        {formatCurrency(item.creditAmount)}
                      </td>

                      {/* Net Difference */}
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <span
                          className={`font-mono font-bold ${
                            hasDiscrepancy ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {formatCurrency(item.unmatchedAmount || item.netDifference)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                              item.isReconciled
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                                : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                            }`}
                          >
                            <span>{item.isReconciled ? '✓' : '⚠'}</span>
                            <span>{item.isReconciled ? 'Reconciled' : 'Not Reconciled'}</span>
                          </span>
                          <span className="text-[9px] font-mono text-slate-400 uppercase">
                            {item.matchStatus}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItem(item);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-all text-[11px]"
                          title="Inspect details and underlying lines"
                        >
                          Inspect →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Inspection Details Drawer / Modal ── */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-950 border border-indigo-700/60 flex items-center justify-center text-xl">
                  ⚖️
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-white">
                      Reconciliation Item {selectedItem.eliminationNumber}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        selectedItem.isReconciled
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                          : 'bg-amber-950 text-amber-300 border-amber-700'
                      }`}
                    >
                      {selectedItem.isReconciled ? '✓ Reconciled' : '⚠ Not Reconciled'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Phase 9 authoritative elimination and reciprocal ledger matching record
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold border border-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Key Parameters Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Source Unit</span>
                <span className="font-bold text-slate-200">{selectedItem.sourceUnitName}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Counterpart Unit</span>
                <span className="font-bold text-slate-200">{selectedItem.counterpartyUnitName || '—'}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Internal Type</span>
                <span className="font-bold text-indigo-300">{selectedItem.internalAccountType}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Debit Amount (Dr)</span>
                <span className="font-mono font-bold text-slate-200">{formatCurrency(selectedItem.debitAmount)}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Credit Amount (Cr)</span>
                <span className="font-mono font-bold text-slate-200">{formatCurrency(selectedItem.creditAmount)}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Net Difference</span>
                <span
                  className={`font-mono font-bold ${
                    selectedItem.isReconciled ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {formatCurrency(selectedItem.unmatchedAmount || selectedItem.netDifference)}
                </span>
              </div>
            </div>

            {/* Matching Evidence & Basis */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-2">
              <h4 className="font-bold text-slate-300 text-[11px] uppercase tracking-wider">
                Matching Basis & Evidence
              </h4>
              <p className="text-slate-400">
                <strong>Basis:</strong> {selectedItem.matchingBasis || 'No specific matching basis recorded'}
              </p>
              {selectedItem.reason && (
                <p className="text-slate-400">
                  <strong>Evidence Layers:</strong> {selectedItem.reason}
                </p>
              )}
              <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
                <span>Confidence Score:</span>
                <div className="flex-1 max-w-xs bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, selectedItem.confidence * 100))}%` }}
                  />
                </div>
                <span className="font-mono text-slate-300">
                  {(selectedItem.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Underlying Lines Breakdown (if recorded in Phase 9) */}
            {selectedItem.lines && selectedItem.lines.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-bold text-slate-300 text-xs uppercase tracking-wider">
                  Underlying Reconciliation Lines (Phase 9)
                </h4>
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-[10px] uppercase text-slate-500 font-bold border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Unit</th>
                        <th className="py-2 px-3">Ledger Name</th>
                        <th className="py-2 px-3 text-right">Debit</th>
                        <th className="py-2 px-3 text-right">Credit</th>
                        <th className="py-2 px-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                      {selectedItem.lines.map((l) => (
                        <tr key={l.id} className="text-slate-300">
                          <td className="py-2 px-3 font-sans font-medium text-slate-200">{l.unitName}</td>
                          <td className="py-2 px-3 font-sans">{l.ledgerName}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(l.debit)}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(l.credit)}</td>
                          <td className="py-2 px-3 font-sans text-slate-400 text-[10px]">
                            {l.description || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">
                Updated: {new Date(selectedItem.updatedAt).toLocaleDateString()}
              </span>
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
