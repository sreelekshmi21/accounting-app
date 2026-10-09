import React, { useState, useEffect, useCallback } from 'react';
import { useReportingContext } from '../../context/ReportingContext';
import LoadingState from './LoadingState';
import ErrorState from './ErrorState';
import EmptyState from './EmptyState';
import ComparativeMetricCard from './ComparativeMetricCard';
import ComparativeTable from './ComparativeTable';
import type {
  ComparativeReportingDashboardData,
  ComparativeStatementLine,
  StatementDrillDownResult,
} from '../../../electron-api';

interface ComparativeReportingViewProps {
  onNavigateToFinancialStatementsWorkbench?: () => void;
  onNavigateToNotes?: () => void;
  onNavigateToExport?: () => void;
  onNavigateToValidation?: () => void;
}

export default function ComparativeReportingView({
  onNavigateToFinancialStatementsWorkbench,
  onNavigateToNotes,
  onNavigateToExport,
  onNavigateToValidation,
}: ComparativeReportingViewProps) {
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

  const [statementType, setStatementType] = useState<'BALANCE_SHEET' | 'INCOME_EXPENDITURE'>('BALANCE_SHEET');
  const [comparativeData, setComparativeData] = useState<ComparativeReportingDashboardData | null>(null);
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

  // Fetch comparative data via IPC
  const fetchComparativeData = useCallback(async () => {
    if (!financialYearId) {
      setComparativeData(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      if (window.electronAPI?.getComparativeReportingData) {
        const res = await window.electronAPI.getComparativeReportingData(financialYearId, {
          scope,
          unitId: scope === 'UNIT' ? unitId : undefined,
          consolidationRunId: scope === 'CONSOLIDATED' ? consolidationRunId : undefined,
        });
        setComparativeData(res);
      }
    } catch (err: unknown) {
      console.error('Failed to load comparative reporting data:', err);
      setError((err as { message?: string })?.message || 'Failed to load authoritative comparative reporting data.');
    } finally {
      setLoading(false);
    }
  }, [financialYearId, scope, unitId, consolidationRunId]);

  useEffect(() => {
    fetchComparativeData();
  }, [fetchComparativeData]);

  // Handle Note / Line drilldown
  const handleOpenNoteDrilldown = async (line: ComparativeStatementLine) => {
    const noteNum = typeof line.noteReference === 'number'
      ? line.noteReference
      : line.sourceNoteNumber;

    setActiveNoteInfo({
      noteNumber: noteNum,
      title: line.lineLabel,
      lineLabel: line.lineLabel,
    });
    setDrillModalOpen(true);
    setDrillLoading(true);

    try {
      if (window.electronAPI?.getStatementDrillDown) {
        const drill = await window.electronAPI.getStatementDrillDown(financialYearId, line.statementLineId, {
          scope,
          unitId: scope === 'UNIT' ? unitId : undefined,
          consolidationRunId: scope === 'CONSOLIDATED' ? consolidationRunId : undefined,
        });
        setDrillData(drill);
      }
    } catch (err: unknown) {
      console.error('Drilldown failed:', err);
    } finally {
      setDrillLoading(false);
    }
  };

  const handleInspectNoteNumber = (noteNumber: number) => {
    if (onNavigateToNotes) {
      onNavigateToNotes();
    }
  };

  // Run automated Phase 15.5 tests
  const handleRunTests = async () => {
    try {
      setRunningTests(true);
      setShowTests(true);
      if (window.electronAPI?.runComparativeReportingTests) {
        const res = await window.electronAPI.runComparativeReportingTests();
        setTestResults(res);
      }
    } catch (err: unknown) {
      console.error('Failed to run Phase 15.5 tests:', err);
    } finally {
      setRunningTests(false);
    }
  };

  // Readiness gates
  const hasNoData = Boolean(pipelineSummary && pipelineSummary.activeBatchesCount === 0);
  const hasUnmapped = Boolean(pipelineSummary && pipelineSummary.unmappedLedgersCount > 0);

  if (contextLoading && !comparativeData) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8">
        <LoadingState message="Fetching authoritative CY/PY comparative reporting dataset…" />
      </div>
    );
  }

  const activeDataset = statementType === 'BALANCE_SHEET'
    ? comparativeData?.balanceSheet
    : comparativeData?.incomeExpenditure;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ── Header Title & Context Chips ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold tracking-widest text-teal-400 uppercase bg-teal-950/70 border border-teal-800/60 px-2.5 py-0.5 rounded-full font-mono">
                Phase 15.5
              </span>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                CY / PY Comparative Reporting & Variance Analysis
              </h1>
            </div>
            <p className="text-xs text-slate-400">
              Authoritative Schedule III multi-period financial comparison with absolute and percentage shifts
            </p>
          </div>

          {/* Active Reporting Context Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 shadow-sm">
              <span className="text-slate-400 font-medium">CY FY:</span>
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
          title="Comparative Reporting Notice"
          message={error}
          onRetry={() => {
            refresh();
            fetchComparativeData();
          }}
        />
      )}

      {/* ── Statement Switcher Navigation Bar ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-1.5 flex items-center gap-2 max-w-xl mx-auto shadow-md">
        <button
          onClick={() => setStatementType('BALANCE_SHEET')}
          className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            statementType === 'BALANCE_SHEET'
              ? 'bg-indigo-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <span>🏛️</span>
          <span>Balance Sheet Comparison</span>
          <span className="text-[10px] font-mono bg-indigo-950/80 text-indigo-200 px-1.5 py-0.5 rounded border border-indigo-700/50">
            BS
          </span>
        </button>

        <button
          onClick={() => setStatementType('INCOME_EXPENDITURE')}
          className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            statementType === 'INCOME_EXPENDITURE'
              ? 'bg-teal-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <span>📑</span>
          <span>Income & Expenditure Comparison</span>
          <span className="text-[10px] font-mono bg-teal-950/80 text-teal-200 px-1.5 py-0.5 rounded border border-teal-700/50">
            I&E
          </span>
        </button>
      </div>

      {/* ── Empty & Unmapped Gates ── */}
      {hasNoData ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6">
          <EmptyState
            title="No Financial Data Available"
            message="Import a Trial Balance for the selected Financial Year to generate comparative financial statements."
            actionLabel={onNavigateToFinancialStatementsWorkbench ? 'Open Financial Statements Workbench →' : undefined}
            onAction={onNavigateToFinancialStatementsWorkbench}
          />
        </div>
      ) : hasUnmapped ? (
        <div className="bg-slate-900/80 border border-amber-900/60 rounded-xl p-6">
          <EmptyState
            title="Comparative Statement Unavailable"
            message={`Unmapped accounts require attention before comparative statements can be published (${pipelineSummary?.unmappedLedgersCount} pending mappings). Complete mapping in Classification or Mapping Workbench.`}
            actionLabel={onNavigateToValidation ? 'Open Validation Gate →' : undefined}
            onAction={onNavigateToValidation}
          />
        </div>
      ) : loading ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8">
          <LoadingState message="Compiling Schedule III CY/PY comparative financial statements…" />
        </div>
      ) : comparativeData && comparativeData.hasData && activeDataset ? (
        <div className="space-y-6">
          {/* ── PY Availability & Validation Gate Alert Banner ── */}
          {comparativeData.hasPY ? (
            <div className="bg-teal-950/40 border border-teal-800/60 rounded-xl p-4 flex items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-teal-900/80 border border-teal-700 flex items-center justify-center text-teal-300 text-sm font-bold">
                  ✓
                </div>
                <div>
                  <h4 className="text-xs font-bold text-teal-300 uppercase tracking-wider">
                    CY & PY Comparative Periods Active
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {comparativeData.pyStatusMessage}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold bg-teal-900/80 text-teal-200 px-2.5 py-1 rounded-md border border-teal-700">
                  CY: {financialYearLabel} | PY: {comparativeData.previousFinancialYearLabel || 'Prior FY'}
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-amber-950/40 border border-amber-800/70 rounded-xl p-4 flex items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-900/80 border border-amber-700 flex items-center justify-center text-amber-300 text-sm font-bold">
                  ℹ️
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                    Previous Year Data Unavailable (Phase 13 CY_PY_ISOLATION)
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Comparative analysis is unavailable because Previous Year data is not available for the selected context. Current Year financial statements remain fully authoritative.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold bg-amber-900/80 text-amber-200 px-2.5 py-1 rounded-md border border-amber-700">
                  PY Unavailable
                </span>
              </div>
            </div>
          )}

          {/* ── Top Comparative Headline Metrics Grid ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeDataset.headlineMetrics.map((metric, idx) => (
              <ComparativeMetricCard
                key={idx}
                metric={metric}
                hasPY={comparativeData.hasPY}
                onInspectNote={handleInspectNoteNumber}
              />
            ))}
          </div>

          {/* ── Statement Action & Test Bar ── */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-bold text-teal-400 bg-teal-950/60 border border-teal-800/60 px-3 py-1 rounded-full font-mono">
                <span>✓</span>
                <span>Phase 15.5 Comparative Active</span>
              </span>

              <span className="text-xs text-slate-400">
                Phase 12 Synchronization:{' '}
                <strong className="text-slate-200">Authoritative Read-Only Presentation</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRunTests}
                disabled={runningTests}
                className="statement-action-btn statement-action-test"
              >
                <span>🧪</span>
                <span>{runningTests ? 'Testing…' : 'Run 15.5 Tests'}</span>
              </button>

              {onNavigateToNotes && (
                <button
                  type="button"
                  onClick={onNavigateToNotes}
                  className="statement-action-btn statement-action-secondary"
                >
                  <span>📚</span>
                  <span>Notes & Schedules →</span>
                </button>
              )}

              {onNavigateToValidation && (
                <button
                  type="button"
                  onClick={onNavigateToValidation}
                  className="statement-action-btn statement-action-secondary"
                >
                  <span>✅</span>
                  <span>Validation Gate →</span>
                </button>
              )}

              {onNavigateToExport && (
                <button
                  type="button"
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
                    Phase 15.5 Comparative Reporting Automated Verification Results
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
                  type="button"
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

          {/* ── Main Schedule III Comparative Financial Statement Table ── */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            {/* Statement Top Title Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 p-6 border-b border-slate-800">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-black text-white tracking-wide uppercase">
                  {entityName || 'Santhigiri Ashram'}
                </h2>
                <h3 className={`text-sm font-extrabold tracking-wider uppercase ${statementType === 'BALANCE_SHEET' ? 'text-indigo-400' : 'text-teal-400'}`}>
                  {activeDataset.title} (CY / PY Comparative Presentation)
                </h3>
                <p className="text-xs text-slate-400">
                  {statementType === 'BALANCE_SHEET'
                    ? `As at ${activeDataset.periodOrAsAtCY || '31st March 2026'}`
                    : `For the year ended ${activeDataset.periodOrAsAtCY || '31st March 2026'}`}{' '}
                  | Context:{' '}
                  <strong className="text-slate-200">
                    {scope === 'UNIT' ? (unitName || 'Ma Bakery') : 'Consolidated'} ({financialYearLabel || '2025-26'})
                  </strong>
                </p>
              </div>
            </div>

            {/* Comparative Table Component */}
            <ComparativeTable
              lines={activeDataset.lines}
              statementCode={activeDataset.statementCode}
              periodOrAsAtCY={activeDataset.periodOrAsAtCY}
              periodOrAsAtPY={activeDataset.periodOrAsAtPY}
              hasPY={comparativeData.hasPY}
              onInspectLine={handleOpenNoteDrilldown}
            />

            {/* Statement Summary Footer */}
            <div className="bg-slate-950/80 p-5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="font-semibold text-slate-300">Phase 15.5 Presentation:</span>
                <span>
                  Comparative metrics derived from Phase 12 Financial Statement Engine without modifying accounting results.
                </span>
              </div>

              {onNavigateToFinancialStatementsWorkbench && (
                <button
                  type="button"
                  onClick={onNavigateToFinancialStatementsWorkbench}
                  className="text-teal-400 hover:text-teal-300 font-bold transition-colors flex items-center gap-1"
                >
                  <span>Open Financial Statements Workbench →</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6">
          <EmptyState
            title="No Comparative Reporting Data Available"
            message="No financial statement data is currently available for the selected context."
            actionLabel={onNavigateToFinancialStatementsWorkbench ? 'Open Financial Statements Workbench →' : undefined}
            onAction={onNavigateToFinancialStatementsWorkbench}
          />
        </div>
      )}

      {/* ── Drilldown / Note Modal ── */}
      {drillModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-3">
                <span className="text-xl">🔍</span>
                <div>
                  <div className="flex items-center gap-2">
                    {activeNoteInfo?.noteNumber && (
                      <span className="statement-modal-note-badge">
                        Note {activeNoteInfo.noteNumber}
                      </span>
                    )}
                    <h3 className="text-sm font-extrabold text-white">
                      {activeNoteInfo?.lineLabel || 'Statement Particulars'}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Drill-down traceability from Financial Statement Line to Notes & Ledger balances
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDrillModalOpen(false);
                  setDrillData(null);
                }}
                className="text-slate-400 hover:text-white text-base font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {drillLoading ? (
                <div className="py-8">
                  <LoadingState message="Loading ledger drill-down provenance…" />
                </div>
              ) : drillData ? (
                <div className="space-y-4">
                  {/* Summary row */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-[11px] text-slate-400 font-medium">CY Statement Amount:</span>
                      <p className="text-lg font-black text-white font-mono mt-0.5">
                        {drillData.cyAmount !== null ? `₹ ${drillData.cyAmount.toLocaleString('en-IN')}` : '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 font-medium">PY Statement Amount:</span>
                      <p className="text-lg font-black text-slate-300 font-mono mt-0.5">
                        {drillData.pyAmount !== null ? `₹ ${drillData.pyAmount.toLocaleString('en-IN')}` : 'Unavailable'}
                      </p>
                    </div>
                  </div>

                  {/* Ledgers table */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                      Contributing Ledgers ({drillData.ledgers?.length || 0})
                    </h4>
                    {drillData.ledgers && drillData.ledgers.length > 0 ? (
                      <div className="bg-slate-950/50 border border-slate-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-800/80 text-slate-400 text-[11px] font-bold border-b border-slate-700">
                              <th className="py-2.5 px-3">Ledger Name</th>
                              <th className="py-2.5 px-3">Unit</th>
                              <th className="py-2.5 px-3 text-right">CY Net (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 text-xs">
                            {drillData.ledgers.map((l, i) => (
                              <tr key={i} className="hover:bg-slate-800/30 text-slate-300">
                                <td className="py-2 px-3 font-medium text-slate-200">{l.ledgerName}</td>
                                <td className="py-2 px-3 text-slate-400">{l.unitName || '—'}</td>
                                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-100">
                                  ₹ {l.cyNet?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) ?? '0.00'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No direct ledger records attached.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-6">
                  No drilldown information available for this line item.
                </p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Synchronized with Phase 10 / Phase 11 engine hierarchy
              </span>
              <button
                type="button"
                onClick={() => {
                  setDrillModalOpen(false);
                  setDrillData(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all"
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
