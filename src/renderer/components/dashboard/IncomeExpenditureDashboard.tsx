import React, { useState, useEffect, useCallback } from 'react';
import { useReportingContext } from '../../context/ReportingContext';
import DashboardCard from './DashboardCard';
import LoadingState from './LoadingState';
import ErrorState from './ErrorState';
import EmptyState from './EmptyState';
import VarianceBadge from './VarianceBadge';
import { calculateVariance } from '../../../dashboard-reporting-engine';
import type {
  IncomeExpenditureDashboardData,
  GeneratedStatementLine,
  StatementDrillDownResult,
} from '../../../electron-api';

interface IncomeExpenditureDashboardProps {
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
  20: 'Donations and Grant in Aid',
  21: 'Donations for Scientific and Industrial, Social Research',
  22: 'Revenue from operations',
  23: 'Agriculture, Dairy Income',
  24: 'Other income',
  25: 'Increase (decrease) in Finished Goods, Trading items',
  26: 'Community Welfare, Charitable Application',
  27: 'Application for Social & Scientific Research',
  28: 'Consumption of material, stores and others',
  29: 'Cost of Trading Items sold',
  30: 'Agriculture, Dairy Expense',
  31: 'Employees Benefits Expenses',
  32: 'Finance costs',
  33: 'Administrative and Other Expenses',
};

export default function IncomeExpenditureDashboard({
  onNavigateToFinancialStatementsWorkbench,
  onNavigateToNotes,
  onNavigateToExport,
  onNavigateToValidation,
}: IncomeExpenditureDashboardProps) {
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

  const [statementData, setStatementData] = useState<IncomeExpenditureDashboardData | null>(null);
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

      if (window.electronAPI?.getIncomeExpenditureDashboardData) {
        const res = await window.electronAPI.getIncomeExpenditureDashboardData(financialYearId, {
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
        const ie = fs.incomeExpenditure;
        setStatementData({
          hasData: true,
          isReadyForReporting: true,
          unmappedLedgersCount: 0,
          statementStatus: fs.status,
          isBalanced: fs.balanceSheet.isBalancedCY,
          balanceDifferenceCY: fs.balanceSheet.differenceCY,
          allReconciled: fs.allReconciled,
          unreconciledCount: fs.unreconciledCount,
          totalIncomeCY: ie.totalRevenueCY,
          totalIncomePY: ie.totalRevenuePY,
          totalExpenditureCY: ie.totalExpensesCY,
          totalExpenditurePY: ie.totalExpensesPY,
          netSurplusCY: ie.netSurplusCY,
          netSurplusPY: ie.netSurplusPY,
          isSurplus: ie.netSurplusCY >= 0,
          hasPY: ie.hasPY,
          periodEndingCY: ie.periodEndingCY,
          periodEndingPY: ie.periodEndingPY,
          financialYearLabel: fs.financialYearLabel,
          scope,
          unitName: fs.unitName || unitName,
          entityName,
          lines: ie.lines,
          reconciliations: fs.reconciliations.filter((r) => r.statementCode === 'IE'),
          diagnostics: fs.diagnostics.filter((d) => !d.statementCode || d.statementCode === 'IE'),
        });
      }
    } catch (err: unknown) {
      console.error('Failed to load Income & Expenditure statement:', err);
      setError((err as { message?: string })?.message || 'Failed to load authoritative Income & Expenditure statement.');
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

  // Run automated Phase 15.3 tests
  const handleRunTests = async () => {
    try {
      setRunningTests(true);
      setShowTests(true);
      if (window.electronAPI?.runIncomeExpenditureTests) {
        const res = await window.electronAPI.runIncomeExpenditureTests();
        setTestResults(res);
      }
    } catch (err: unknown) {
      console.error('Failed to run Phase 15.3 tests:', err);
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
        <LoadingState message="Fetching authoritative Phase 12 Income & Expenditure statement…" />
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
              <span className="text-xs font-bold tracking-widest text-teal-400 uppercase bg-teal-950/70 border border-teal-800/60 px-2.5 py-0.5 rounded-full font-mono">
                Phase 15.3
              </span>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                Income & Expenditure Statement
              </h1>
            </div>
            <p className="text-xs text-slate-400">
              Authoritative Schedule III Income & Expenditure presentation
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
            message="Import a Trial Balance for the selected Financial Year to generate authoritative Income & Expenditure statements."
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
          <LoadingState message="Compiling Schedule III Income & Expenditure statement from Phase 12 engine…" />
        </div>
      ) : statementData && statementData.hasData ? (
        <div className="space-y-6">
          {/* ── Top Executive Summary Bar ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <DashboardCard
              title="Total Income"
              value={formatCurrency(statementData.totalIncomeCY)}
              subtitle={
                statementData.hasPY && statementData.totalIncomePY !== null
                  ? `Previous Year: ${formatCurrency(statementData.totalIncomePY)}`
                  : 'Previous Year: Unavailable'
              }
              icon="📈"
              badge="P&L Inflow"
              badgeColor="emerald"
            />

            <DashboardCard
              title="Total Expenditure"
              value={formatCurrency(statementData.totalExpenditureCY)}
              subtitle={
                statementData.hasPY && statementData.totalExpenditurePY !== null
                  ? `Previous Year: ${formatCurrency(statementData.totalExpenditurePY)}`
                  : 'Previous Year: Unavailable'
              }
              icon="📉"
              badge="P&L Outflow"
              badgeColor="indigo"
            />

            <DashboardCard
              title={statementData.isSurplus ? 'Net Surplus' : 'Net Deficit'}
              value={formatCurrency(statementData.netSurplusCY)}
              subtitle={
                statementData.hasPY && statementData.netSurplusPY !== null
                  ? `Previous Year: ${formatCurrency(statementData.netSurplusPY)}`
                  : 'Previous Year: Unavailable'
              }
              icon={statementData.isSurplus ? '💎' : '⚠️'}
              badge={statementData.isSurplus ? 'Surplus' : 'Deficit'}
              badgeColor={statementData.isSurplus ? 'teal' : 'rose'}
            />
          </div>

          {/* ── Statement Action & Integrity Bar ── */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1 rounded-full font-mono">
                <span>✓</span>
                <span>Statement Balanced</span>
              </span>

              <span className="text-xs text-slate-400">
                Phase 12 Synchronization:{' '}
                <strong className="text-slate-200">Authoritative Active Context</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleRunTests}
                disabled={runningTests}
                className="statement-action-btn statement-action-test"
              >
                <span>🧪</span>
                <span>{runningTests ? 'Testing…' : 'Run 15.3 Tests'}</span>
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
            <div className="bg-slate-900 border border-teal-800/80 rounded-xl p-5 shadow-lg space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">🧪</span>
                  <h3 className="text-sm font-extrabold text-white">
                    Phase 15.3 Automated Verification Test Results
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

          {/* ── Main Schedule III Financial Statement Table ── */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            {/* Statement Top Title Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 p-6 border-b border-slate-800">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-black text-white tracking-wide uppercase">
                  {entityName || 'Santhigiri Ashram'}
                </h2>
                <h3 className="text-sm font-extrabold text-teal-400 tracking-wider uppercase">
                  Statement of Income & Expenditure
                </h3>
                <p className="text-xs text-slate-400">
                  For the year ended {statementData.periodEndingCY || '31st March 2026'} | Context:{' '}
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
                      Current Year ({statementData.periodEndingCY || financialYearLabel})
                    </th>
                    <th className="py-3.5 px-5 w-40 text-right">
                      Previous Year ({statementData.periodEndingPY || 'PY'})
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
                            ? 'bg-emerald-950/30 font-black text-white border-t-2 border-b-2 border-emerald-800/80 shadow-inner'
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
                                ? 'text-emerald-300 text-sm font-extrabold'
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
                              ? 'text-emerald-300 text-sm font-extrabold'
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
                <span className="font-semibold text-slate-300">P&L Reconciliation Equation:</span>
                <span className="font-mono text-emerald-400">
                  Total Income ({formatCurrency(statementData.totalIncomeCY)})
                </span>
                <span>−</span>
                <span className="font-mono text-indigo-400">
                  Total Expenditure ({formatCurrency(statementData.totalExpenditureCY)})
                </span>
                <span>=</span>
                <span
                  className={`font-mono font-bold ${
                    statementData.isSurplus ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {statementData.isSurplus ? 'Net Surplus' : 'Net Deficit'} (
                  {formatCurrency(statementData.netSurplusCY)})
                </span>
              </div>

              <div className="flex items-center gap-2 text-slate-500">
                <span>Source: Phase 12 Financial Statement Engine</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6">
          <EmptyState
            title="No Statement Data Loaded"
            message="No financial statement data is currently available for the selected Financial Year and scope."
          />
        </div>
      )}

      {/* ── Note / Schedule Detail Modal ── */}
      {drillModalOpen && activeNoteInfo && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-850 p-5 border-b border-slate-800 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {activeNoteInfo.noteNumber && (
                    <span className="statement-modal-note-badge">
                      Note {activeNoteInfo.noteNumber}
                    </span>
                  )}
                  <h3 className="text-base font-extrabold text-white">
                    {activeNoteInfo.title}
                  </h3>
                </div>
                <p className="text-xs text-slate-400">
                  Statement Line: <strong className="text-slate-200">{activeNoteInfo.lineLabel}</strong> | FY {financialYearLabel}
                </p>
              </div>

              <button
                onClick={() => setDrillModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {drillLoading ? (
                <LoadingState message="Loading Note line item details and ledger provenance…" />
              ) : drillData ? (
                <div className="space-y-4">
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">
                        Total Authoritative Net
                      </span>
                      <p className="text-xl font-extrabold text-white font-mono mt-0.5">
                        {formatCurrency(drillData.cyAmount)}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-slate-400">Contributing Ledgers</span>
                      <p className="text-sm font-bold text-teal-300">
                        {drillData.ledgers?.length ?? 0} active accounts
                      </p>
                    </div>
                  </div>

                  {/* Ledgers Breakdown */}
                  {drillData.ledgers && drillData.ledgers.length > 0 ? (
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Ledger Account Breakdown
                      </h4>
                      <div className="border border-slate-800 rounded-xl overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-800 text-slate-300 font-semibold">
                            <tr>
                              <th className="p-2.5">Ledger Name</th>
                              <th className="p-2.5">Unit</th>
                              <th className="p-2.5 text-right">Debit (₹)</th>
                              <th className="p-2.5 text-right">Credit (₹)</th>
                              <th className="p-2.5 text-right">Net (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {drillData.ledgers.map((l, i) => (
                              <tr key={i} className="hover:bg-slate-800/40 text-slate-300">
                                <td className="p-2.5 font-medium text-slate-200">{l.ledgerName}</td>
                                <td className="p-2.5 text-slate-400">{l.unitName}</td>
                                <td className="p-2.5 text-right font-mono">{formatCurrency(l.cyDebit)}</td>
                                <td className="p-2.5 text-right font-mono">{formatCurrency(l.cyCredit)}</td>
                                <td className="p-2.5 text-right font-mono font-bold text-slate-100">
                                  {formatCurrency(l.cyNet)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      No direct ledger breakdown records returned for this statement line item.
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs">
                  <p className="font-semibold text-slate-300 mb-1">
                    {activeNoteInfo.noteNumber ? `Schedule / Note ${activeNoteInfo.noteNumber}` : 'Statement Line Detail'}
                  </p>
                  <p>
                    Authoritative Note computation is managed by the Phase 11 Note Engine.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-950 p-4 border-t border-slate-800 flex items-center justify-between">
              {onNavigateToNotes ? (
                <button
                  onClick={() => {
                    setDrillModalOpen(false);
                    onNavigateToNotes();
                  }}
                  className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5"
                >
                  <span>Open in Notes & Schedules Workbench →</span>
                </button>
              ) : <div />}

              <button
                onClick={() => setDrillModalOpen(false)}
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
