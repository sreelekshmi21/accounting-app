import React, { useState, useEffect, useCallback } from 'react';
import type {
  ExportFormat,
  ExportReportType,
  ExportReportOptions,
  ExportReportResult,
  ExportDatasetBundle,
} from '../../electron-api';

interface ExportWorkbenchProps {
  onNavigateToFinancialStatements?: () => void;
  onNavigateToNotes?: () => void;
  onNavigateToFinalValidation?: () => void;
  onNavigateToReporting?: () => void;
}

type PreviewTab = 'OVERVIEW' | 'BALANCE_SHEET' | 'INCOME_EXPENDITURE' | 'NOTES' | 'VALIDATION' | 'TESTS';

function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function ExportWorkbench({
  onNavigateToFinancialStatements,
  onNavigateToNotes,
  onNavigateToFinalValidation,
  onNavigateToReporting,
}: ExportWorkbenchProps) {
  // State: Selection & Scope
  const [financialYears, setFinancialYears] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedFyId, setSelectedFyId] = useState<string>('');
  const [scope, setScope] = useState<'UNIT' | 'CONSOLIDATED'>('CONSOLIDATED');
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [consolidationRuns, setConsolidationRuns] = useState<Array<{ id: string; runNumber: string; status: string }>>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');

  // State: Export Options
  const [format, setFormat] = useState<ExportFormat>('EXCEL');
  const [reportType, setReportType] = useState<ExportReportType>('COMPLETE');
  const [allowDraftExport, setAllowDraftExport] = useState<boolean>(false);

  // State: Preview Dataset & UI
  const [activeTab, setActiveTab] = useState<PreviewTab>('OVERVIEW');
  const [loading, setLoading] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<ExportReportResult | null>(null);
  const [previewBundle, setPreviewBundle] = useState<ExportDatasetBundle | null>(null);

  // State: Automated Test Runner
  const [runningTests, setRunningTests] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<{
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    results: Array<{ name: string; passed: boolean; message: string }>;
  } | null>(null);

  // Load initial FYs, Units, and Consolidation Runs
  useEffect(() => {
    const loadInit = async () => {
      try {
        setLoading(true);
        if (window.electronAPI?.getConsolidationWorkbenchData) {
          const cData = await window.electronAPI.getConsolidationWorkbenchData();
          setFinancialYears(cData.financialYears.map((f: any) => ({ id: f.id, label: f.yearLabel || f.id })));
          setUnits(cData.units.map((u: any) => ({ id: u.id, name: u.unitName || u.name || u.id })));
          setConsolidationRuns(cData.runs.map((r: any) => ({ id: r.id, runNumber: r.runNumber, status: r.status })));

          if (cData.financialYears.length > 0) {
            setSelectedFyId(cData.financialYears[0].id);
          }
          if (cData.units.length > 0) {
            setSelectedUnitId(cData.units[0].id);
          }
          if (cData.runs.length > 0) {
            setSelectedRunId(cData.runs[0].id);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to initialize Export Workbench.');
      } finally {
        setLoading(false);
      }
    };
    loadInit();
  }, []);

  // Fetch Preview Bundle when selection changes
  const fetchPreview = useCallback(async () => {
    if (!selectedFyId) return;
    try {
      setLoading(true);
      setError(null);

      const result = await window.electronAPI.getExportPreviewData(selectedFyId, {
        scope,
        unitId: scope === 'UNIT' ? selectedUnitId : undefined,
        consolidationRunId: scope === 'CONSOLIDATED' ? selectedRunId : undefined,
      });

      setPreviewBundle(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load report preview.');
    } finally {
      setLoading(false);
    }
  }, [selectedFyId, scope, selectedUnitId, selectedRunId]);

  useEffect(() => {
    if (selectedFyId) {
      fetchPreview();
    }
  }, [selectedFyId, scope, selectedUnitId, selectedRunId, fetchPreview]);

  // Execute Export
  const handleExport = async (targetFormat: ExportFormat = format) => {
    if (!selectedFyId) return;
    try {
      setExporting(true);
      setError(null);
      setSuccessResult(null);

      const options: ExportReportOptions = {
        financialYearId: selectedFyId,
        scope,
        unitId: scope === 'UNIT' ? selectedUnitId : undefined,
        consolidationRunId: scope === 'CONSOLIDATED' ? selectedRunId : undefined,
        format: targetFormat,
        reportType,
        allowDraftExport,
      };

      const result = await window.electronAPI.exportFinancialReport(options);
      if (result.success) {
        setSuccessResult(result);
      } else {
        setError(result.error || 'Export failed.');
      }
    } catch (err: any) {
      setError(err.message || 'Export failed with an error.');
    } finally {
      setExporting(false);
    }
  };

  // Run Test Suite
  const handleRunTests = async () => {
    try {
      setRunningTests(true);
      const res = await window.electronAPI.runExportEngineTests();
      setTestResults(res);
      setActiveTab('TESTS');
    } catch (err: any) {
      setError(err.message || 'Failed to execute test suite.');
    } finally {
      setRunningTests(false);
    }
  };

  const valSummary = previewBundle?.validationData?.summary;
  const overallGateStatus = previewBundle?.validationData?.overallStatus || 'PENDING';
  const isGateBlocked = overallGateStatus === 'BLOCKED';
  const hasGateErrors = overallGateStatus === 'ERROR' && !allowDraftExport;
  const canExport = !isGateBlocked && (!hasGateErrors || allowDraftExport);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* ── Top Header / Control Bar ── */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-widest text-teal-400 uppercase bg-teal-950/70 border border-teal-800/60 px-2.5 py-0.5 rounded-full">
              Phase 14
            </span>
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              Excel / PDF Export Engine
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Authoritative financial report publishing with Phase 13 Validation Gate & 100% numerical fidelity
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleExport('EXCEL')}
            disabled={exporting || loading || !canExport}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
              canExport && !exporting
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <span>📊</span>
            <span>Export Excel (.xlsx)</span>
          </button>

          <button
            onClick={() => handleExport('PDF')}
            disabled={exporting || loading || !canExport}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
              canExport && !exporting
                ? 'bg-teal-600 hover:bg-teal-500 text-white shadow-teal-900/30'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <span>📑</span>
            <span>Export PDF (.pdf)</span>
          </button>

          <button
            onClick={handleRunTests}
            disabled={runningTests}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all flex items-center gap-1.5"
          >
            <span>🧪</span>
            <span>{runningTests ? 'Testing...' : 'Run Phase 14 Tests'}</span>
          </button>
        </div>
      </div>

      {/* ── Filter / Config Strip ── */}
      <div className="bg-slate-900/70 border-b border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* FY Selector */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-sm">
            <label className="text-xs font-semibold text-slate-400">FY:</label>
            <select
              value={selectedFyId}
              onChange={(e) => setSelectedFyId(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
            >
              {financialYears.map((fy) => (
                <option key={fy.id} value={fy.id} className="bg-slate-800 text-white">
                  {fy.label}
                </option>
              ))}
            </select>
          </div>

          {/* Scope Selector */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-sm">
            <label className="text-xs font-semibold text-slate-400">Scope:</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as any)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
            >
              <option value="CONSOLIDATED" className="bg-slate-800 text-white">Consolidated</option>
              <option value="UNIT" className="bg-slate-800 text-white">Unit Level</option>
            </select>
          </div>

          {/* Unit / Run Selector */}
          {scope === 'UNIT' ? (
            <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-sm">
              <label className="text-xs font-semibold text-slate-400">Unit:</label>
              <select
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer max-w-[140px] truncate"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id} className="bg-slate-800 text-white">
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-sm">
              <label className="text-xs font-semibold text-slate-400">Run:</label>
              <select
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
              >
                {consolidationRuns.map((r) => (
                  <option key={r.id} value={r.id} className="bg-slate-800 text-white">
                    {r.runNumber} ({r.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Report Content Scope */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-sm">
            <label className="text-xs font-semibold text-slate-400">Content:</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
            >
              <option value="COMPLETE" className="bg-slate-800 text-white">Complete Financial Report</option>
              <option value="BALANCE_SHEET" className="bg-slate-800 text-white">Balance Sheet Only</option>
              <option value="INCOME_EXPENDITURE" className="bg-slate-800 text-white">Income & Expenditure Only</option>
              <option value="NOTES" className="bg-slate-800 text-white">Notes & Schedules (4-33)</option>
              <option value="VALIDATION" className="bg-slate-800 text-white">Validation Summary Only</option>
            </select>
          </div>
        </div>

        {/* Validation Gate Status Pill */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Phase 13 Gate:</span>
          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
              overallGateStatus === 'PASS'
                ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-400'
                : overallGateStatus === 'WARNING'
                ? 'bg-amber-950/80 border-amber-700/60 text-amber-400'
                : 'bg-rose-950/80 border-rose-700/60 text-rose-400'
            }`}
          >
            {overallGateStatus}
            {valSummary && ` (${valSummary.passed} Passed / ${valSummary.warnings} Warn / ${valSummary.errors} Err)`}
          </span>
        </div>
      </div>

      {/* ── Success / Warning / Error Banner ── */}
      {successResult && (
        <div className="bg-emerald-950/80 border-b border-emerald-800/80 px-6 py-2.5 flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>
              <strong>Export Successful:</strong> Generated {successResult.fileName} ({Math.round((successResult.fileSizeBytes || 0) / 1024)} KB)
            </span>
          </div>
          <span className="text-slate-400 font-mono text-[11px]">{successResult.filePath}</span>
        </div>
      )}

      {error && (
        <div className="bg-rose-950/80 border-b border-rose-800/80 px-6 py-2.5 flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <span>❌</span>
            <span><strong>Export Notice:</strong> {error}</span>
          </div>
          {overallGateStatus === 'ERROR' && (
            <label className="flex items-center gap-1.5 cursor-pointer text-amber-400 font-bold">
              <input
                type="checkbox"
                checked={allowDraftExport}
                onChange={(e) => setAllowDraftExport(e.target.checked)}
                className="rounded text-amber-500 focus:ring-0"
              />
              <span>Allow Draft Export</span>
            </label>
          )}
        </div>
      )}

      {/* ── Tab Navigation ── */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 flex items-center gap-2">
        <button
          onClick={() => setActiveTab('OVERVIEW')}
          className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'OVERVIEW'
              ? 'border-teal-400 text-teal-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          📋 Report Overview
        </button>

        <button
          onClick={() => setActiveTab('BALANCE_SHEET')}
          className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'BALANCE_SHEET'
              ? 'border-teal-400 text-teal-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          🏛️ Balance Sheet Preview
        </button>

        <button
          onClick={() => setActiveTab('INCOME_EXPENDITURE')}
          className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'INCOME_EXPENDITURE'
              ? 'border-teal-400 text-teal-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          📈 Income & Expenditure Preview
        </button>

        <button
          onClick={() => setActiveTab('NOTES')}
          className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'NOTES'
              ? 'border-teal-400 text-teal-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          📑 Notes & Schedules (4–33)
        </button>

        <button
          onClick={() => setActiveTab('VALIDATION')}
          className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'VALIDATION'
              ? 'border-teal-400 text-teal-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          🛡️ Validation Gate Summary
        </button>

        <button
          onClick={() => setActiveTab('TESTS')}
          className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'TESTS'
              ? 'border-teal-400 text-teal-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          🧪 Automated Tests {testResults ? `(${testResults.passedTests}/${testResults.totalTests})` : ''}
        </button>
      </div>

      {/* ── Main Tab Content ── */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
            <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-semibold">Compiling authoritative reporting data...</span>
          </div>
        ) : (
          <>
            {/* ── TAB 1: OVERVIEW ── */}
            {activeTab === 'OVERVIEW' && previewBundle && (
              <div className="space-y-6 max-w-5xl mx-auto">
                {/* Meta summary card */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
                  <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                    <span>🏢</span>
                    <span>{previewBundle.entityName} — Financial Reporting Overview</span>
                  </h2>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                      <div className="text-slate-500 font-semibold uppercase text-[10px]">Financial Year</div>
                      <div className="text-sm font-bold text-white mt-1">{previewBundle.financialYearLabel}</div>
                    </div>
                    <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                      <div className="text-slate-500 font-semibold uppercase text-[10px]">Reporting Scope</div>
                      <div className="text-sm font-bold text-teal-400 mt-1">
                        {previewBundle.scope === 'UNIT' ? `Unit: ${previewBundle.unitName}` : 'Consolidated'}
                      </div>
                    </div>
                    <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                      <div className="text-slate-500 font-semibold uppercase text-[10px]">Comparative PY Data</div>
                      <div className="text-sm font-bold text-white mt-1">
                        {previewBundle.hasPY ? 'Available' : 'Isolated / CY Only'}
                      </div>
                    </div>
                    <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                      <div className="text-slate-500 font-semibold uppercase text-[10px]">Validation Status</div>
                      <div className="text-sm font-bold text-emerald-400 mt-1">{overallGateStatus}</div>
                    </div>
                  </div>
                </div>

                {/* Quick Export Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Excel Card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-emerald-700/60 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">📊</span>
                          <h3 className="text-sm font-extrabold text-white">Excel Workbook (.xlsx)</h3>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded">
                          Multi-Sheet
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed mb-4">
                        Includes dedicated tabs: Cover, Balance Sheet, Income & Expenditure, Notes 4–33, Validation Summary, and Statement-to-Note Reconciliations with full formatting and freeze panes.
                      </p>
                    </div>
                    <button
                      onClick={() => handleExport('EXCEL')}
                      disabled={exporting || !canExport}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                    >
                      {exporting ? 'Generating...' : 'Export Complete Excel Workbook'}
                    </button>
                  </div>

                  {/* PDF Card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-teal-700/60 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">📑</span>
                          <h3 className="text-sm font-extrabold text-white">Print-Ready PDF (.pdf)</h3>
                        </div>
                        <span className="text-[10px] font-bold text-teal-400 bg-teal-950/80 border border-teal-800/60 px-2 py-0.5 rounded">
                          Vector PDF
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed mb-4">
                        Professional, high-resolution printable report formatted with page breaks, header banners, aligned monetary amounts, structured tables, and verification audit badges.
                      </p>
                    </div>
                    <button
                      onClick={() => handleExport('PDF')}
                      disabled={exporting || !canExport}
                      className="w-full py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                    >
                      {exporting ? 'Generating...' : 'Export Complete PDF Report'}
                    </button>
                  </div>
                </div>

                {/* Key Financial Totals Grid */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                    Key Statement Totals (Phase 12 Reference)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="text-slate-500 text-[11px]">Total Liabilities</div>
                      <div className="text-base font-extrabold text-white mt-1">
                        {formatINR(previewBundle.financialStatements.balanceSheet.totalLiabilitiesCY)}
                      </div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="text-slate-500 text-[11px]">Total Assets</div>
                      <div className="text-base font-extrabold text-white mt-1">
                        {formatINR(previewBundle.financialStatements.balanceSheet.totalAssetsCY)}
                      </div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="text-slate-500 text-[11px]">Total Revenue</div>
                      <div className="text-base font-extrabold text-emerald-400 mt-1">
                        {formatINR(previewBundle.financialStatements.incomeExpenditure.totalRevenueCY)}
                      </div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <div className="text-slate-500 text-[11px]">Net Surplus / (Deficit)</div>
                      <div className="text-base font-extrabold text-teal-400 mt-1">
                        {formatINR(previewBundle.financialStatements.incomeExpenditure.netSurplusCY)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 2: BALANCE SHEET PREVIEW ── */}
            {activeTab === 'BALANCE_SHEET' && previewBundle && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-5xl mx-auto space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h2 className="text-sm font-bold text-white">Balance Sheet as at {previewBundle.asAtDateCY}</h2>
                    <p className="text-xs text-slate-400">Authoritative Phase 12 statement lines</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                    previewBundle.financialStatements.balanceSheet.isBalancedCY
                      ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                      : 'bg-rose-950 border-rose-800 text-rose-400'
                  }`}>
                    {previewBundle.financialStatements.balanceSheet.isBalancedCY ? 'Balanced' : 'Imbalanced'}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-800 text-left">
                        <th className="py-2 px-3">Particulars</th>
                        <th className="py-2 px-3">Note Ref</th>
                        <th className="py-2 px-3 text-right">CY Amount (₹)</th>
                        <th className="py-2 px-3 text-right">PY Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {previewBundle.financialStatements.balanceSheet.lines.map((line) => {
                        const isTotal = line.lineType === 'TOTAL';
                        const isSubtotal = line.lineType === 'SUBTOTAL';
                        const isHeader = line.lineType === 'SECTION_HEADER' || line.lineType === 'SUBSECTION_HEADER' || line.lineType === 'GROUP_HEADER';

                        return (
                          <tr
                            key={line.statementLineId}
                            className={`${isTotal ? 'bg-teal-950/40 font-bold text-teal-300' : isSubtotal ? 'bg-slate-800/40 font-semibold text-white' : isHeader ? 'text-slate-400 uppercase font-bold text-[11px]' : 'text-slate-200'}`}
                          >
                            <td className="py-1.5 px-3" style={{ paddingLeft: `${line.depth * 16 + 12}px` }}>
                              {line.lineLabel}
                            </td>
                            <td className="py-1.5 px-3 text-slate-400">
                              {line.noteReference ? (typeof line.noteReference === 'number' ? `Note ${line.noteReference}` : line.noteReference) : ''}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono">
                              {isHeader ? '' : (line.cyAmount !== null && line.cyAmount !== undefined ? formatINR(line.cyAmount) : '—')}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono text-slate-400">
                              {isHeader ? '' : (previewBundle.hasPY && line.pyAmount !== null && line.pyAmount !== undefined ? formatINR(line.pyAmount) : '—')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 3: INCOME & EXPENDITURE PREVIEW ── */}
            {activeTab === 'INCOME_EXPENDITURE' && previewBundle && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-5xl mx-auto space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h2 className="text-sm font-bold text-white">Statement of Income & Expenditure for Year Ended {previewBundle.periodEndingCY}</h2>
                    <p className="text-xs text-slate-400">Authoritative Phase 12 statement lines</p>
                  </div>
                  <div className="text-xs text-slate-400">
                    Net Surplus: <strong className="text-teal-400">{formatINR(previewBundle.financialStatements.incomeExpenditure.netSurplusCY)}</strong>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-800 text-left">
                        <th className="py-2 px-3">Particulars</th>
                        <th className="py-2 px-3">Note Ref</th>
                        <th className="py-2 px-3 text-right">CY Amount (₹)</th>
                        <th className="py-2 px-3 text-right">PY Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {previewBundle.financialStatements.incomeExpenditure.lines.map((line) => {
                        const isTotal = line.lineType === 'TOTAL';
                        const isSubtotal = line.lineType === 'SUBTOTAL';
                        const isHeader = line.lineType === 'SECTION_HEADER' || line.lineType === 'SUBSECTION_HEADER' || line.lineType === 'GROUP_HEADER';

                        return (
                          <tr
                            key={line.statementLineId}
                            className={`${isTotal ? 'bg-teal-950/40 font-bold text-teal-300' : isSubtotal ? 'bg-slate-800/40 font-semibold text-white' : isHeader ? 'text-slate-400 uppercase font-bold text-[11px]' : 'text-slate-200'}`}
                          >
                            <td className="py-1.5 px-3" style={{ paddingLeft: `${line.depth * 16 + 12}px` }}>
                              {line.lineLabel}
                            </td>
                            <td className="py-1.5 px-3 text-slate-400">
                              {line.noteReference ? (typeof line.noteReference === 'number' ? `Note ${line.noteReference}` : line.noteReference) : ''}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono">
                              {isHeader ? '' : (line.cyAmount !== null && line.cyAmount !== undefined ? formatINR(line.cyAmount) : '—')}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono text-slate-400">
                              {isHeader ? '' : (previewBundle.hasPY && line.pyAmount !== null && line.pyAmount !== undefined ? formatINR(line.pyAmount) : '—')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 4: NOTES & SCHEDULES PREVIEW ── */}
            {activeTab === 'NOTES' && previewBundle && (
              <div className="max-w-5xl mx-auto space-y-4">
                {previewBundle.notesData.notes.map((note) => (
                  <div key={note.noteNumber} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                      <div className="font-bold text-white text-xs">
                        Note {note.noteNumber}: {note.title} <span className="text-slate-400 text-[11px] font-normal">({note.scheduleCode})</span>
                      </div>
                      <div className="text-xs font-mono font-bold text-teal-400">
                        Total: {formatINR(note.cyTotal)}
                      </div>
                    </div>

                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-800 text-left text-[11px]">
                          <th className="py-1 px-2">Line Particulars</th>
                          <th className="py-1 px-2">Code Ref</th>
                          <th className="py-1 px-2 text-right">CY (₹)</th>
                          <th className="py-1 px-2 text-right">PY (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {note.lines.map((l) => (
                          <tr key={l.lineId} className={l.lineType === 'TOTAL' || l.lineType === 'SUBTOTAL' ? 'font-bold text-slate-200' : 'text-slate-300'}>
                            <td className="py-1 px-2" style={{ paddingLeft: `${l.depth * 12 + 8}px` }}>{l.lineLabel}</td>
                            <td className="py-1 px-2 text-slate-500 text-[11px]">{l.sourceNodeCodes?.join(', ')}</td>
                            <td className="py-1 px-2 text-right font-mono">{l.cyAmount !== null && l.cyAmount !== undefined ? formatINR(l.cyAmount) : '—'}</td>
                            <td className="py-1 px-2 text-right font-mono text-slate-500">{previewBundle.hasPY && l.pyAmount !== null && l.pyAmount !== undefined ? formatINR(l.pyAmount) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {/* ── TAB 5: VALIDATION SUMMARY PREVIEW ── */}
            {activeTab === 'VALIDATION' && previewBundle && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-5xl mx-auto space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h2 className="text-sm font-bold text-white">Phase 13 Final Validation Audit</h2>
                    <p className="text-xs text-slate-400">Comprehensive integrity verification across all phases</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded border ${
                    overallGateStatus === 'PASS'
                      ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                      : overallGateStatus === 'WARNING'
                      ? 'bg-amber-950 border-amber-800 text-amber-400'
                      : 'bg-rose-950 border-rose-800 text-rose-400'
                  }`}>
                    {overallGateStatus}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2 text-center text-xs">
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                    <div className="text-base font-bold text-teal-400">{valSummary?.totalChecks || 0}</div>
                    <div className="text-[10px] text-slate-500 uppercase">Total Checks</div>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                    <div className="text-base font-bold text-emerald-400">{valSummary?.passed || 0}</div>
                    <div className="text-[10px] text-slate-500 uppercase">Passed</div>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                    <div className="text-base font-bold text-amber-400">{valSummary?.warnings || 0}</div>
                    <div className="text-[10px] text-slate-500 uppercase">Warnings</div>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                    <div className="text-base font-bold text-rose-400">{valSummary?.errors || 0}</div>
                    <div className="text-[10px] text-slate-500 uppercase">Errors</div>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                    <div className="text-base font-bold text-slate-400">{valSummary?.blocked || 0}</div>
                    <div className="text-[10px] text-slate-500 uppercase">Blocked</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-800 text-left">
                        <th className="py-2 px-3">Validation ID</th>
                        <th className="py-2 px-3">Module</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3 text-right">Discrepancy</th>
                        <th className="py-2 px-3">Description & Resolution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {previewBundle.validationData.results.map((check) => (
                        <tr key={check.validation_id} className="text-slate-300">
                          <td className="py-2 px-3 font-bold text-white">
                            {check.validation_id}
                            <div className="text-[10px] text-slate-500 font-normal">{check.category}</div>
                          </td>
                          <td className="py-2 px-3 text-slate-400">{check.affected_module}</td>
                          <td className="py-2 px-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              check.severity === 'PASS'
                                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-400'
                                : check.severity === 'WARNING'
                                ? 'bg-amber-950/80 border-amber-800 text-amber-400'
                                : 'bg-rose-950/80 border-rose-800 text-rose-400'
                            }`}>
                              {check.severity}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            {check.difference !== undefined && check.difference !== null ? formatINR(check.difference) : '₹0.00'}
                          </td>
                          <td className="py-2 px-3">
                            <div>{check.description}</div>
                            {check.resolution && (
                              <div className="text-[11px] text-slate-400 mt-0.5">{check.resolution}</div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 6: AUTOMATED TESTS ── */}
            {activeTab === 'TESTS' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-5xl mx-auto space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h2 className="text-sm font-bold text-white">Phase 14 Export Engine Automated Test Suite</h2>
                    <p className="text-xs text-slate-400">10 comprehensive tests validating CY/PY isolation, gate policy, consistency, and non-mutation</p>
                  </div>
                  <button
                    onClick={handleRunTests}
                    disabled={runningTests}
                    className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-lg transition-all"
                  >
                    {runningTests ? 'Running...' : 'Re-Run All 10 Tests'}
                  </button>
                </div>

                {testResults ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <span className={`text-sm font-bold px-2.5 py-0.5 rounded border ${
                        testResults.allPassed
                          ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                          : 'bg-rose-950 border-rose-800 text-rose-400'
                      }`}>
                        {testResults.allPassed ? 'ALL TESTS PASSED' : 'TESTS FAILED'}
                      </span>
                      <span className="text-xs text-slate-300">
                        {testResults.passedTests} of {testResults.totalTests} tests passed successfully
                      </span>
                    </div>

                    <div className="space-y-2">
                      {testResults.results.map((t, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 flex items-start justify-between text-xs"
                        >
                          <div>
                            <div className="font-bold text-white">{t.name}</div>
                            <div className="text-slate-400 text-[11px] mt-0.5">{t.message}</div>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ml-3 shrink-0 ${
                            t.passed
                              ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                              : 'bg-rose-950 border-rose-800 text-rose-400'
                          }`}>
                            {t.passed ? 'PASSED' : 'FAILED'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    Click "Run Phase 14 Tests" above to execute the automated verification suite.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
