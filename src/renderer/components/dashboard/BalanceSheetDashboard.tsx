import React, { useState, useEffect, useCallback } from 'react';
import { useReportingContext } from '../../context/ReportingContext';
import DashboardCard from './DashboardCard';
import LoadingState from './LoadingState';
import ErrorState from './ErrorState';
import EmptyState from './EmptyState';
import VarianceBadge from './VarianceBadge';
import { calculateVariance } from '../../../dashboard-reporting-engine';
import type {
  BalanceSheetDashboardData,
  GeneratedStatementLine,
  StatementDrillDownResult,
} from '../../../electron-api';

interface BalanceSheetDashboardProps {
  onNavigateToFinancialStatementsWorkbench?: () => void;
  onNavigateToNotes?: () => void;
  onNavigateToExport?: () => void;
  onNavigateToValidation?: () => void;
}

const NOTE_TITLES: Record<number, string> = {
  4: 'Corpus',
  5: 'Reserve and Surplus',
  6: 'Secured Loans',
  7: 'Unsecured Loans',
  8: 'Trade Payables',
  9: 'Other Current Liabilities',
  10: 'Short Term Provisions',
  11: 'Tangible Assets (Depreciation)',
  12: 'Capital Work in Progress',
  13: 'Live Stock',
  14: 'Trade Receivables',
  15: 'Cash and Bank Balances',
  16: 'Investments',
  18: 'Loans, Advances & Other Assets',
  19: 'Other Current Assets',
};

export default function BalanceSheetDashboard({
  onNavigateToFinancialStatementsWorkbench,
  onNavigateToNotes,
  onNavigateToExport,
  onNavigateToValidation,
}: BalanceSheetDashboardProps) {
  const {
    financialYearId,
    financialYearLabel,
    scope,
    unitId,
    unitName,
    entityName,
    consolidationRunId,
    pipelineSummary,
    isLoading: contextLoading,
    refresh,
  } = useReportingContext();

  const [statementData, setStatementData] = useState<BalanceSheetDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Drilldown / Note Modal state
  const [drillModalOpen, setDrillModalOpen] = useState<boolean>(false);
  const [drillLoading, setDrillLoading] = useState<boolean>(false);
  const [drillData, setDrillData] = useState<StatementDrillDownResult | null>(null);
  const [activeNoteInfo, setActiveNoteInfo] = useState<{ noteNumber?: number; title: string; lineLabel: string } | null>(null);

  // Test Suite state
  const [runningTests, setRunningTests] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<{
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    results: Array<{ name: string; passed: boolean; message: string }>;
  } | null>(null);
  const [showTests, setShowTests] = useState<boolean>(false);

  // Currency Formatter helper (Indian Numbering Format: ₹ 2,05,742.85)
  const formatCurrency = (val: number | null | undefined, placeholder = '—') => {
    if (val === null || val === undefined) return placeholder;
    if (val === 0) return '₹ 0.00';
    const formatted = Math.abs(val).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return val < 0 ? `(₹ ${formatted})` : `₹ ${formatted}`;
  };

  // Fetch statement data via IPC
  const fetchStatement = useCallback(async () => {
    if (!financialYearId) {
      setStatementData(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      if (window.electronAPI?.getBalanceSheetDashboardData) {
        const res = await window.electronAPI.getBalanceSheetDashboardData(financialYearId, {
          scope,
          unitId: scope === 'UNIT' ? unitId : undefined,
          consolidationRunId: scope === 'CONSOLIDATED' ? consolidationRunId : undefined,
        });
        setStatementData(res);
      } else if (window.electronAPI?.getFinancialStatementsData) {
        // Fallback adapter to full financial statements API
        const fs = await window.electronAPI.getFinancialStatementsData(financialYearId, {
          scope,
          unitId: scope === 'UNIT' ? unitId : undefined,
          consolidationRunId: scope === 'CONSOLIDATED' ? consolidationRunId : undefined,
        });
        const bs = fs.balanceSheet;
        setStatementData({
          hasData: true,
          isReadyForReporting: true,
          unmappedLedgersCount: 0,
          statementStatus: fs.status,
          isBalanced: bs.isBalancedCY,
          balanceDifferenceCY: bs.differenceCY,
          balanceDifferencePY: bs.differencePY,
          allReconciled: fs.allReconciled,
          unreconciledCount: fs.unreconciledCount,
          totalAssetsCY: bs.totalAssetsCY,
          totalAssetsPY: bs.totalAssetsPY,
          totalLiabilitiesCY: bs.totalLiabilitiesCY,
          totalLiabilitiesPY: bs.totalLiabilitiesPY,
          corpusCapitalCY: null,
          corpusCapitalPY: null,
          reservesSurplusCY: null,
          reservesSurplusPY: null,
          netAssetsCY: bs.totalAssetsCY - bs.totalLiabilitiesCY,
          netAssetsPY: bs.totalAssetsPY !== null && bs.totalLiabilitiesPY !== null ? bs.totalAssetsPY - bs.totalLiabilitiesPY : null,
          assetBreakdown: [],
          liabilityBreakdown: [],
          hasPY: bs.hasPY,
          asAtDateCY: bs.asAtDateCY || '',
          asAtDatePY: bs.asAtDatePY || '',
          financialYearLabel: fs.financialYearLabel,
          scope,
          unitName: fs.unitName || unitName,
          entityName,
          lines: bs.lines,
          reconciliations: fs.reconciliations.filter((r) => r.statementCode === 'BS'),
          diagnostics: fs.diagnostics.filter((d) => !d.statementCode || d.statementCode === 'BS'),
        });
      }
    } catch (err: unknown) {
      console.error('Failed to load Balance Sheet statement:', err);
      setError((err as { message?: string })?.message || 'Failed to load authoritative Balance Sheet statement.');
    } finally {
      setLoading(false);
    }
  }, [financialYearId, scope, unitId, consolidationRunId, unitName, entityName]);

  useEffect(() => {
    fetchStatement();
  }, [fetchStatement]);

  // Handle Note / Line drilldown
  const handleOpenNoteDrilldown = async (line: GeneratedStatementLine) => {
    const noteNum = typeof line.noteReference === 'number'
      ? line.noteReference
      : line.sourceNoteNumber;

    const noteTitle = (noteNum && NOTE_TITLES[noteNum]) || line.lineLabel;

    setActiveNoteInfo({
      noteNumber: noteNum,
      title: noteTitle,
      lineLabel: line.lineLabel,
    });

    setDrillModalOpen(true);
    setDrillLoading(true);

    try {
      if (window.electronAPI?.getStatementDrillDown) {
        const res = await window.electronAPI.getStatementDrillDown(financialYearId, line.statementLineId, {
          scope,
          unitId: scope === 'UNIT' ? unitId : undefined,
          consolidationRunId: scope === 'CONSOLIDATED' ? consolidationRunId : undefined,
        });
        setDrillData(res);
      }
    } catch (err: unknown) {
      console.error('Failed to load note drilldown:', err);
    } finally {
      setDrillLoading(false);
    }
  };

  // Run automated Phase 15.4 tests
  const handleRunTests = async () => {
    try {
      setRunningTests(true);
      setShowTests(true);
      if (window.electronAPI?.runBalanceSheetDashboardTests) {
        const res = await window.electronAPI.runBalanceSheetDashboardTests();
        setTestResults(res);
      }
    } catch (err: unknown) {
      console.error('Failed to run Phase 15.4 tests:', err);
    } finally {
      setRunningTests(false);
    }
  };

  // Check readiness gates
  const hasNoData = Boolean(pipelineSummary && pipelineSummary.activeBatchesCount === 0);
  const hasUnmapped = Boolean(pipelineSummary && pipelineSummary.unmappedLedgersCount > 0);

  if (contextLoading && !statementData) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8">
        <LoadingState message="Fetching authoritative Phase 12 Balance Sheet statement…" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ── Header Title & Context Chips ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase bg-indigo-950/70 border border-indigo-800/60 px-2.5 py-0.5 rounded-full font-mono">
                Phase 15.4
              </span>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                Balance Sheet Dashboard
              </h1>
            </div>
            <p className="text-xs text-slate-400">
              Authoritative Schedule III Balance Sheet presentation (Sources & Application of Funds)
            </p>
          </div>

          {/* Active Reporting Context Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 shadow-sm">
              <span className="text-slate-400 font-medium">FY:</span>
              <span className="text-white font-bold">{financialYearLabel || '2025-26'}</span>
            </div>

            <div className="bg-slate-800/90 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 shadow-sm">
              <span className="text-slate-400 font-medium">Scope:</span>
              <span className="text-indigo-300 font-bold">
                {scope === 'UNIT' ? 'Individual Unit' : 'Consolidated'}
              </span>
            </div>

            {scope === 'UNIT' && (
              <div className="bg-slate-800/90 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 shadow-sm">
                <span className="text-slate-400 font-medium">Unit:</span>
                <span className="text-emerald-300 font-bold">{unitName || 'Ma Bakery'}</span>
              </div>
            )}

            <div className="bg-slate-800/90 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 shadow-sm">
              <span className="text-slate-400 font-medium">Entity:</span>
              <span className="text-slate-200 font-bold">{entityName || 'Default Entity'}</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <ErrorState
          title="Statement Notice"
          message={error}
          onRetry={() => {
            refresh();
            fetchStatement();
          }}
        />
      )}

      {/* ── Empty & Unmapped Gates ── */}
      {hasNoData ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6">
          <EmptyState
            title="No Financial Data Available"
            message="Import a Trial Balance for the selected Financial Year to generate authoritative Balance Sheet statements."
            actionLabel={onNavigateToFinancialStatementsWorkbench ? 'Open Financial Statements Workbench →' : undefined}
            onAction={onNavigateToFinancialStatementsWorkbench}
          />
        </div>
      ) : hasUnmapped ? (
        <div className="bg-slate-900/80 border border-amber-900/60 rounded-xl p-6">
          <EmptyState
            title="Statement Unavailable"
            message={`Unmapped accounts require attention before financial statements can be published (${pipelineSummary?.unmappedLedgersCount} pending mappings). Complete mapping in Classification or Mapping Workbench.`}
            actionLabel={onNavigateToValidation ? 'Open Validation Gate →' : undefined}
            onAction={onNavigateToValidation}
          />
        </div>
      ) : loading ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8">
          <LoadingState message="Compiling Schedule III Balance Sheet statement from Phase 12 engine…" />
        </div>
      ) : statementData && statementData.hasData ? (
        <div className="space-y-6">
          {/* ── Top Executive Summary Bar (4 Cards) ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <DashboardCard
              title="Total Assets"
              value={formatCurrency(statementData.totalAssetsCY)}
              subtitle={
                statementData.hasPY && statementData.totalAssetsPY !== null
                  ? `Previous Year: ${formatCurrency(statementData.totalAssetsPY)}`
                  : 'Previous Year: Unavailable'
              }
              icon="🏛️"
              badge="Application of Funds"
              badgeColor="emerald"
            />

            <DashboardCard
              title="Total Liabilities"
              value={formatCurrency(statementData.totalLiabilitiesCY)}
              subtitle={
                statementData.hasPY && statementData.totalLiabilitiesPY !== null
                  ? `Previous Year: ${formatCurrency(statementData.totalLiabilitiesPY)}`
                  : 'Previous Year: Unavailable'
              }
              icon="⚖️"
              badge="Source of Funds"
              badgeColor="indigo"
            />

            <DashboardCard
              title="Corpus & Reserves"
              value={formatCurrency((statementData.corpusCapitalCY ?? 0) + (statementData.reservesSurplusCY ?? 0))}
              subtitle={
                statementData.hasPY && (statementData.corpusCapitalPY !== null || statementData.reservesSurplusPY !== null)
                  ? `Previous Year: ${formatCurrency((statementData.corpusCapitalPY ?? 0) + (statementData.reservesSurplusPY ?? 0))}`
                  : 'Previous Year: Unavailable'
              }
              icon="💎"
              badge="Equity Base"
              badgeColor="teal"
            />

            <DashboardCard
              title="Balance Position"
              value={statementData.isBalanced ? 'Balanced (₹0.00)' : formatCurrency(statementData.balanceDifferenceCY)}
              subtitle={
                statementData.isBalanced
                  ? 'Assets = Liabilities ✓'
                  : `Imbalance: ${formatCurrency(statementData.balanceDifferenceCY)}`
              }
              icon={statementData.isBalanced ? '✓' : '⚠️'}
              badge={statementData.isBalanced ? 'In Equilibrium' : 'Imbalance'}
              badgeColor={statementData.isBalanced ? 'emerald' : 'rose'}
            />
          </div>

          {/* ── Statement Action & Integrity Bar ── */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <span
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full font-mono border ${
                  statementData.isBalanced
                    ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60'
                    : 'text-rose-400 bg-rose-950/60 border-rose-800/60'
                }`}
              >
                <span>{statementData.isBalanced ? '✓' : '⚠️'}</span>
                <span>
                  {statementData.isBalanced
                    ? 'Balance Sheet Balanced: Difference ₹0.00'
                    : `Balance Sheet Imbalance: Difference ${formatCurrency(statementData.balanceDifferenceCY)}`}
                </span>
              </span>

              <span className="text-xs text-slate-400">
                Phase 12 Engine:{' '}
                <strong className="text-slate-200">Single Source of Truth</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleRunTests}
                disabled={runningTests}
                className="statement-action-btn statement-action-test"
              >
                <span>🧪</span>
                <span>{runningTests ? 'Testing…' : 'Run 15.4 Tests'}</span>
              </button>

              {onNavigateToNotes && (
                <button
                  onClick={onNavigateToNotes}
                  className="statement-action-btn statement-action-secondary"
                >
                  <span>📚</span>
                  <span>Notes & Schedules →</span>
                </button>
              )}

              {onNavigateToExport && (
                <button
                  onClick={onNavigateToExport}
                  className="statement-action-btn statement-action-primary"
                >
                  <span>📊</span>
                  <span>Export Reports →</span>
                </button>
              )}
            </div>
          </div>

          {/* ── Test Results Panel (Collapsible) ── */}
          {showTests && testResults && (
            <div className="bg-slate-900 border border-indigo-800/80 rounded-xl p-5 shadow-lg space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">🧪</span>
                  <h3 className="text-sm font-extrabold text-white">
                    Phase 15.4 Automated Verification Test Results
                  </h3>
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                      testResults.allPassed
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {testResults.passedTests} / {testResults.totalTests} Passed
                  </span>
                </div>
                <button
                  onClick={() => setShowTests(false)}
                  className="text-slate-400 hover:text-slate-200 text-xs font-bold"
                >
                  ✕ Close
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {testResults.results.map((t, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded-lg border ${
                      t.passed
                        ? 'bg-slate-950/60 border-slate-800 text-slate-300'
                        : 'bg-rose-950/40 border-rose-800 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      <span>{t.passed ? '✓' : '✗'}</span>
                      <span>{t.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{t.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Category Breakdown Cards (Assets & Liabilities Side-by-Side) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Asset-Side Summary */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 text-base">🏛️</span>
                    <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                      Application of Funds (Assets)
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    {formatCurrency(statementData.totalAssetsCY)}
                  </span>
                </div>

                <div className="space-y-2">
                  {statementData.assetBreakdown.map((cat, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/80 text-xs hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {cat.noteNumber && (
                          <span className="statement-note-btn !text-[10px] !py-0.5 !px-1.5">
                            Note {cat.noteNumber}
                          </span>
                        )}
                        <span className="text-slate-200 font-medium">{cat.category}</span>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <div className="font-mono font-bold text-slate-100">
                            {formatCurrency(cat.cyAmount)}
                          </div>
                          {statementData.hasPY && cat.pyAmount !== null && (
                            <div className="text-[10px] font-mono text-slate-400">
                              PY: {formatCurrency(cat.pyAmount)}
                            </div>
                          )}
                        </div>
                        {statementData.hasPY && (
                          <VarianceBadge
                            changePercent={cat.changePercentage}
                            status={cat.pyAmount !== null ? (cat.pyAmount === 0 ? 'ZERO_BASE' : 'AVAILABLE') : 'PY_UNAVAILABLE'}
                            size="sm"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Liability-Side Summary */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-400 text-base">⚖️</span>
                    <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                      Source of Funds (Liabilities & Corpus)
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-bold text-indigo-400">
                    {formatCurrency(statementData.totalLiabilitiesCY)}
                  </span>
                </div>

                <div className="space-y-2">
                  {statementData.liabilityBreakdown.map((cat, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/80 text-xs hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {cat.noteNumber && (
                          <span className="statement-note-btn !text-[10px] !py-0.5 !px-1.5">
                            Note {cat.noteNumber}
                          </span>
                        )}
                        <span className="text-slate-200 font-medium">{cat.category}</span>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <div className="font-mono font-bold text-slate-100">
                            {formatCurrency(cat.cyAmount)}
                          </div>
                          {statementData.hasPY && cat.pyAmount !== null && (
                            <div className="text-[10px] font-mono text-slate-400">
                              PY: {formatCurrency(cat.pyAmount)}
                            </div>
                          )}
                        </div>
                        {statementData.hasPY && (
                          <VarianceBadge
                            changePercent={cat.changePercentage}
                            status={cat.pyAmount !== null ? (cat.pyAmount === 0 ? 'ZERO_BASE' : 'AVAILABLE') : 'PY_UNAVAILABLE'}
                            size="sm"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Main Schedule III Balance Sheet Statement Table ── */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            {/* Statement Top Title Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 p-6 border-b border-slate-800">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-black text-white tracking-wide uppercase">
                  {entityName || 'Santhigiri Ashram'}
                </h2>
                <h3 className="text-sm font-extrabold text-indigo-400 tracking-wider uppercase">
                  Balance Sheet
                </h3>
                <p className="text-xs text-slate-400">
                  As at {statementData.asAtDateCY || '31st March 2026'} | Context:{' '}
                  <strong className="text-slate-200">
                    {scope === 'UNIT' ? (unitName || 'Ma Bakery') : 'Consolidated'} ({financialYearLabel || '2025-26'})
                  </strong>
                </p>
              </div>
            </div>

            {/* Statement Grid Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800/90 text-slate-300 text-xs font-bold uppercase tracking-wider border-b border-slate-700">
                    <th className="py-3.5 px-3 w-12 text-center">Ref</th>
                    <th className="py-3.5 px-6">Particulars</th>
                    <th className="py-3.5 px-3 w-28 text-center">Note / Sch</th>
                    <th className="py-3.5 px-5 w-40 text-right">
                      Current Year ({statementData.asAtDateCY || financialYearLabel})
                    </th>
                    <th className="py-3.5 px-5 w-40 text-right">
                      Previous Year ({statementData.asAtDatePY || 'PY'})
                    </th>
                    <th className="py-3.5 px-5 w-36 text-right">
                      Change (₹)
                    </th>
                    <th className="py-3.5 px-4 w-32 text-center">
                      Change (%)
                    </th>
                    <th className="py-3.5 px-3 w-16 text-center">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-xs">
                  {statementData.lines.map((line) => {
                    const isHeader = line.lineType.includes('HEADER');
                    const isTotal = line.lineType === 'TOTAL';
                    const isSubtotal = line.lineType === 'SUBTOTAL';
                    const noteNum = typeof line.noteReference === 'number'
                      ? line.noteReference
                      : line.sourceNoteNumber;

                    const v = isHeader
                      ? { changeAmount: null, changePercent: null, status: 'NO_DATA' as const }
                      : calculateVariance(line.cyAmount, line.pyAmount, statementData.hasPY);

                    return (
                      <tr
                        key={line.statementLineId}
                        className={`transition-colors ${
                          isHeader
                            ? 'bg-slate-800/50 font-extrabold text-slate-100 tracking-wider uppercase'
                            : isTotal
                            ? 'bg-indigo-950/40 font-black text-white border-t-2 border-b-2 border-indigo-800/80 shadow-inner'
                            : isSubtotal
                            ? 'bg-slate-800/40 font-bold text-slate-100 border-t border-b border-slate-700'
                            : 'hover:bg-slate-800/30 text-slate-300'
                        }`}
                      >
                        {/* Ref column */}
                        <td className="py-3 px-3 text-center font-mono font-semibold text-slate-400">
                          {line.lineIndex || ''}
                        </td>

                        {/* Particulars column */}
                        <td
                          className="py-3 px-6"
                          style={{ paddingLeft: `${Math.max(24, ((line.depth || 0) + 1) * 20)}px` }}
                        >
                          <span
                            className={
                              isTotal
                                ? 'text-indigo-300 text-sm font-extrabold'
                                : isHeader
                                ? 'text-white font-extrabold text-xs tracking-wider'
                                : isSubtotal
                                ? 'text-slate-100 font-bold'
                                : 'text-slate-200'
                            }
                          >
                            {line.lineLabel}
                          </span>
                        </td>

                        {/* Note / Schedule column */}
                        <td className="py-3 px-3 text-center">
                          {noteNum ? (
                            <button
                              type="button"
                              onClick={() => handleOpenNoteDrilldown(line)}
                              className="statement-note-btn"
                              title={`Inspect Note ${noteNum}: ${NOTE_TITLES[noteNum] || line.lineLabel}`}
                            >
                              Note {noteNum}
                            </button>
                          ) : isHeader || isTotal || isSubtotal ? (
                            ''
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>

                        {/* Current Year (CY) Amount */}
                        <td
                          className={`py-3 px-5 text-right font-mono ${
                            isTotal
                              ? 'text-indigo-300 text-sm font-extrabold'
                              : isSubtotal
                              ? 'text-white font-bold text-xs'
                              : isHeader
                              ? ''
                              : 'text-slate-100 font-medium'
                          }`}
                        >
                          {isHeader ? '' : formatCurrency(line.cyAmount)}
                        </td>

                        {/* Previous Year (PY) Amount */}
                        <td
                          className={`py-3 px-5 text-right font-mono ${
                            isTotal
                              ? 'text-slate-300 font-bold'
                              : isSubtotal
                              ? 'text-slate-300 font-medium'
                              : isHeader
                              ? ''
                              : 'text-slate-400'
                          }`}
                        >
                          {isHeader ? '' : formatCurrency(line.pyAmount, 'Unavailable')}
                        </td>

                        {/* Change (₹) Amount */}
                        <td
                          className={`py-3 px-5 text-right font-mono ${
                            isTotal
                              ? 'text-slate-200 font-bold text-xs'
                              : isSubtotal
                              ? 'text-slate-300 font-semibold text-xs'
                              : isHeader
                              ? ''
                              : 'text-slate-300'
                          }`}
                        >
                          {isHeader
                            ? ''
                            : v.status === 'AVAILABLE' || v.status === 'ZERO_BASE'
                            ? (v.changeAmount !== null && v.changeAmount > 0 ? `+${formatCurrency(v.changeAmount)}` : formatCurrency(v.changeAmount))
                            : <span className="text-slate-500">—</span>}
                        </td>

                        {/* Change (%) Badge */}
                        <td className="py-3 px-4 text-center">
                          {isHeader ? (
                            ''
                          ) : (
                            <VarianceBadge
                              changePercent={v.changePercent}
                              status={v.status}
                              size="sm"
                            />
                          )}
                        </td>

                        {/* Action / Inspect Drilldown */}
                        <td className="py-3 px-3 text-center">
                          {!isHeader && (
                            <button
                              type="button"
                              onClick={() => handleOpenNoteDrilldown(line)}
                              className="statement-inspect-btn"
                              title="Inspect line particulars and Note link"
                            >
                              🔍
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Statement Summary Footer */}
            <div className="bg-slate-950/80 p-5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="font-semibold text-slate-300">Balance Sheet Equation:</span>
                <span className="font-mono text-slate-200">
                  Total Sources ({formatCurrency(statementData.totalLiabilitiesCY)}) = Total Applications ({formatCurrency(statementData.totalAssetsCY)})
                </span>
              </div>

              <div className="flex items-center gap-4 text-slate-400 font-mono">
                <span>
                  Equilibrium Difference:{' '}
                  <strong
                    className={
                      statementData.isBalanced ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'
                    }
                  >
                    {formatCurrency(statementData.balanceDifferenceCY)}
                  </strong>
                </span>
                <span>
                  Lines Count: <strong className="text-slate-200">{statementData.lines.length}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Note Drilldown / Line Particulars Modal ── */}
      {drillModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="bg-slate-850 p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {activeNoteInfo?.noteNumber && (
                  <span className="statement-modal-note-badge">
                    Note {activeNoteInfo.noteNumber}
                  </span>
                )}
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    {activeNoteInfo?.title || activeNoteInfo?.lineLabel}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Authoritative Note Linkage & Contributing Ledger Accounts
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setDrillModalOpen(false);
                  setDrillData(null);
                  setActiveNoteInfo(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors text-lg"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {drillLoading ? (
                <div className="py-8">
                  <LoadingState message="Loading contributing ledgers from Phase 11 Notes Engine…" />
                </div>
              ) : drillData ? (
                <div className="space-y-4">
                  {/* Drilldown Summary Card */}
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Statement Line Target
                      </span>
                      <p className="text-sm font-bold text-white">{drillData.lineLabel}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Current Year Total
                      </span>
                      <p className="text-base font-extrabold text-indigo-400 font-mono">
                        {formatCurrency(drillData.cyAmount)}
                      </p>
                    </div>
                  </div>

                  {/* Ledger Lines Table */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                      Contributing Ledger Breakdown ({drillData.ledgers?.length || 0} Accounts)
                    </h4>
                    <div className="border border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-800/80 text-slate-300 font-bold uppercase tracking-wider border-b border-slate-700">
                            <th className="py-2.5 px-4">Account Code / Node</th>
                            <th className="py-2.5 px-4">Ledger Account Name</th>
                            <th className="py-2.5 px-4">Unit</th>
                            <th className="py-2.5 px-4 text-right">Net Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-300">
                          {drillData.ledgers && drillData.ledgers.length > 0 ? (
                            drillData.ledgers.map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/40">
                                <td className="py-2 px-4 font-mono text-slate-400">
                                  {row.nodeCode || '—'}
                                </td>
                                <td className="py-2 px-4 font-medium text-slate-200">
                                  {row.ledgerName}
                                </td>
                                <td className="py-2 px-4 text-slate-400">
                                  {row.unitName}
                                </td>
                                <td className="py-2 px-4 text-right font-mono font-bold text-slate-100">
                                  {formatCurrency(row.cyNet)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className="py-4 px-4 text-center text-slate-500 italic">
                                Direct summary node or computed subtotal line.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No contributing ledger breakdown found for this line.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-850 p-4 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => {
                  setDrillModalOpen(false);
                  setDrillData(null);
                  setActiveNoteInfo(null);
                }}
                className="statement-action-btn statement-action-secondary"
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
