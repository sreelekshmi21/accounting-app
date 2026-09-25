import React, { useState, useEffect, useCallback } from 'react';
import type {
  FinancialStatementsData,
  GeneratedStatementLine,
  StatementNoteReconciliation,
  FinancialStatementDiagnostic,
  StatementDrillDownResult,
} from '../../electron-api';

interface FinancialStatementsWorkbenchProps {
  onNavigateToNotes?: () => void;
  onNavigateToReporting?: () => void;
  onNavigateToConsolidation?: () => void;
  onNavigateToAdjustments?: () => void;
  onNavigateToMapping?: () => void;
}

type ActiveTab = 'BALANCE_SHEET' | 'INCOME_EXPENDITURE' | 'RECONCILIATION' | 'DIAGNOSTICS' | 'TESTS';

export default function FinancialStatementsWorkbench({
  onNavigateToNotes,
  onNavigateToReporting,
  onNavigateToConsolidation,
  onNavigateToAdjustments,
  onNavigateToMapping,
}: FinancialStatementsWorkbenchProps) {
  // State: Selection & Scope
  const [financialYears, setFinancialYears] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedFyId, setSelectedFyId] = useState<string>('');
  const [scope, setScope] = useState<'UNIT' | 'CONSOLIDATED'>('CONSOLIDATED');
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [consolidationRuns, setConsolidationRuns] = useState<Array<{ id: string; runNumber: string; status: string }>>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');

  // State: Financial Statements Dataset
  const [activeTab, setActiveTab] = useState<ActiveTab>('BALANCE_SHEET');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [statementData, setStatementData] = useState<FinancialStatementsData | null>(null);

  // State: Drill-down Modal
  const [drillDownModalOpen, setDrillDownModalOpen] = useState<boolean>(false);
  const [drillDownLoading, setDrillDownLoading] = useState<boolean>(false);
  const [drillDownData, setDrillDownData] = useState<StatementDrillDownResult | null>(null);

  // State: Test Suite Execution
  const [runningTests, setRunningTests] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<{
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    results: Array<{ name: string; passed: boolean; message: string }>;
  } | null>(null);

  // Load initial FYs and Units
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
        setError(err.message || 'Failed to initialize Financial Statements workbench.');
      } finally {
        setLoading(false);
      }
    };
    loadInit();
  }, []);

  // Fetch Financial Statements dataset
  const fetchStatements = useCallback(async () => {
    if (!selectedFyId) return;
    try {
      setLoading(true);
      setError(null);

      const result = await window.electronAPI.getFinancialStatementsData(selectedFyId, {
        scope,
        unitId: scope === 'UNIT' ? selectedUnitId : undefined,
        consolidationRunId: scope === 'CONSOLIDATED' ? selectedRunId : undefined,
      });

      setStatementData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to generate financial statements dataset.');
    } finally {
      setLoading(false);
    }
  }, [selectedFyId, scope, selectedUnitId, selectedRunId]);

  useEffect(() => {
    if (selectedFyId) {
      fetchStatements();
    }
  }, [fetchStatements, selectedFyId]);

  // Handle Drill-Down
  const handleOpenDrillDown = async (statementLineId: string) => {
    try {
      setDrillDownModalOpen(true);
      setDrillDownLoading(true);
      const res = await window.electronAPI.getStatementDrillDown(selectedFyId, statementLineId, {
        scope,
        unitId: scope === 'UNIT' ? selectedUnitId : undefined,
        consolidationRunId: scope === 'CONSOLIDATED' ? selectedRunId : undefined,
      });
      setDrillDownData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load ledger drill-down.');
    } finally {
      setDrillDownLoading(false);
    }
  };

  // Run Tests
  const handleRunTests = async () => {
    try {
      setRunningTests(true);
      const res = await window.electronAPI.runFinancialStatementTests();
      setTestResults(res);
      setActiveTab('TESTS');
    } catch (err: any) {
      setError(err.message || 'Failed to run verification tests.');
    } finally {
      setRunningTests(false);
    }
  };

  // Currency Formatter helper
  const formatCurrency = (val: number | null | undefined, placeholder: string = '-') => {
    if (val === null || val === undefined) return placeholder;
    if (val === 0) return '₹0.00';
    const formatted = Math.abs(val).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return val < 0 ? `(₹${formatted})` : `₹${formatted}`;
  };

  // Helper for Export to CSV
  const handleExportCSV = () => {
    if (!statementData) return;
    const isBS = activeTab === 'BALANCE_SHEET';
    const lines = isBS ? statementData.balanceSheet.lines : statementData.incomeExpenditure.lines;
    const title = isBS ? 'Balance_Sheet' : 'Income_and_Expenditure';

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += `Line Index,Particulars,Note Reference,CY Amount (INR),PY Amount (INR)\n`;

    for (const l of lines) {
      const idx = l.lineIndex ? `"${l.lineIndex}"` : '""';
      const label = `"${l.lineLabel.replace(/"/g, '""')}"`;
      const noteRef = l.noteReference ? `"${l.noteReference}"` : '""';
      const cy = l.cyAmount !== null ? l.cyAmount : '';
      const py = l.pyAmount !== null ? l.pyAmount : '';
      csvContent += `${idx},${label},${noteRef},${cy},${py}\n`;
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${title}_${selectedFyId}_${scope}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* ── Top Header / Control Bar ── */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase bg-emerald-950/70 border border-emerald-800/60 px-2.5 py-0.5 rounded-full">
              Phase 12
            </span>
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              Financial Statement Engine
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Authoritative Balance Sheet & Income & Expenditure Statements matching organisation format
          </p>
        </div>

        {/* Filters and Action Buttons */}
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

          {/* Refresh Button */}
          <button
            onClick={fetchStatements}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
          >
            {loading ? 'Compiling...' : 'Refresh'}
          </button>

          {/* Export CSV Button */}
          {(activeTab === 'BALANCE_SHEET' || activeTab === 'INCOME_EXPENDITURE') && (
            <button
              onClick={handleExportCSV}
              disabled={!statementData}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg shadow-sm transition-all"
            >
              Export CSV
            </button>
          )}

          {/* Run Tests Button */}
          <button
            onClick={handleRunTests}
            disabled={runningTests}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
          >
            {runningTests ? 'Testing...' : 'Run Engine Tests'}
          </button>
        </div>
      </div>

      {/* ── Status and Summary Banner ── */}
      {statementData && (
        <div className="bg-slate-900/90 border-b border-slate-800 px-6 py-2.5 flex flex-wrap items-center justify-between text-xs gap-3">
          <div className="flex items-center gap-4">
            <span className="text-slate-400">
              Statements Status:
              <span
                className={`ml-1.5 font-bold px-2 py-0.5 rounded ${
                  statementData.status === 'COMPLETE'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : statementData.status === 'PY_UNAVAILABLE'
                    ? 'bg-blue-950 text-blue-300 border border-blue-800'
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}
              >
                {statementData.status}
              </span>
            </span>

            <span className="text-slate-400">
              BS Balance:
              <span
                className={`ml-1.5 font-bold ${
                  statementData.balanceSheet.isBalancedCY ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {statementData.balanceSheet.isBalancedCY
                  ? 'BALANCED (Diff ₹0.00)'
                  : `IMBALANCE (Diff ${formatCurrency(statementData.balanceSheet.differenceCY)})`}
              </span>
            </span>

            <span className="text-slate-400">
              Reconciliations:
              <span
                className={`ml-1.5 font-bold ${
                  statementData.allReconciled ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {statementData.allReconciled
                  ? 'All Notes Reconciled (100%)'
                  : `${statementData.unreconciledCount} Note Differences`}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <span>Period: <strong className="text-slate-200">{statementData.financialYearLabel}</strong></span>
            <span>•</span>
            <span>Generated: <strong className="text-slate-200">{new Date(statementData.generatedAt).toLocaleTimeString()}</strong></span>
          </div>
        </div>
      )}

      {/* ── Tabs Navigation ── */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 flex space-x-6">
        <button
          onClick={() => setActiveTab('BALANCE_SHEET')}
          className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === 'BALANCE_SHEET'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Balance Sheet
        </button>
        <button
          onClick={() => setActiveTab('INCOME_EXPENDITURE')}
          className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === 'INCOME_EXPENDITURE'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Income & Expenditure
        </button>
        <button
          onClick={() => setActiveTab('RECONCILIATION')}
          className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === 'RECONCILIATION'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Statement ↔ Note Reconciliation
          {statementData && statementData.unreconciledCount > 0 && (
            <span className="ml-1.5 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-extrabold">
              {statementData.unreconciledCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('DIAGNOSTICS')}
          className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === 'DIAGNOSTICS'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Diagnostics ({statementData?.diagnostics.length || 0})
        </button>
        {testResults && (
          <button
            onClick={() => setActiveTab('TESTS')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === 'TESTS'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Test Results ({testResults.passedTests}/{testResults.totalTests})
          </button>
        )}
      </div>

      {/* ── Main Tab Content ── */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 bg-rose-950/60 border border-rose-800 text-rose-300 px-4 py-3 rounded-lg text-xs flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200 font-bold">×</button>
          </div>
        )}

        {loading && !statementData && (
          <div className="flex flex-col items-center justify-center h-64 space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            <p className="text-xs text-slate-400 font-medium">Assembling authoritative financial statements from Notes & Schedules...</p>
          </div>
        )}

        {statementData && activeTab === 'BALANCE_SHEET' && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden shadow-xl max-w-5xl mx-auto">
            <div className="bg-gradient-to-r from-slate-900 to-slate-800/90 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white">{statementData.balanceSheet.title}</h2>
                <p className="text-xs text-slate-400">{statementData.balanceSheet.asAtDateCY} (with comparative {statementData.balanceSheet.asAtDatePY})</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-slate-400">Status: </span>
                <span className={`text-xs font-bold ${statementData.balanceSheet.isBalancedCY ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {statementData.balanceSheet.isBalancedCY ? '✓ Balanced' : '✗ Out of Balance'}
                </span>
              </div>
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800/80 text-slate-300 text-xs font-bold uppercase tracking-wider border-b border-slate-700">
                  <th className="py-3 px-4 w-12 text-center">Ref</th>
                  <th className="py-3 px-4">Particulars</th>
                  <th className="py-3 px-4 w-28 text-center">Note No.</th>
                  <th className="py-3 px-4 w-44 text-right">CY ({statementData.balanceSheet.asAtDateCY})</th>
                  <th className="py-3 px-4 w-44 text-right">PY ({statementData.balanceSheet.asAtDatePY})</th>
                  <th className="py-3 px-4 w-16 text-center">Drill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-xs">
                {statementData.balanceSheet.lines.map((line) => {
                  const isHeader = line.lineType.includes('HEADER');
                  const isTotal = line.lineType === 'TOTAL';
                  const isSubtotal = line.lineType === 'SUBTOTAL';

                  return (
                    <tr
                      key={line.statementLineId}
                      className={`hover:bg-slate-800/50 transition-colors ${
                        isHeader
                          ? 'bg-slate-800/30 font-bold text-slate-200'
                          : isTotal
                          ? 'bg-emerald-950/20 font-extrabold text-white border-t-2 border-slate-700'
                          : isSubtotal
                          ? 'font-bold text-slate-100 bg-slate-800/20'
                          : 'text-slate-300'
                      }`}
                    >
                      <td className="py-2.5 px-4 text-center font-semibold text-slate-400">{line.lineIndex || ''}</td>
                      <td className="py-2.5 px-4" style={{ paddingLeft: `${Math.max(16, (line.depth || 0) * 24)}px` }}>
                        <span className={isTotal ? 'text-emerald-400' : isHeader ? 'text-slate-100 uppercase tracking-wide' : ''}>
                          {line.lineLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center font-bold text-indigo-400">
                        {line.noteReference ? (
                          <button
                            onClick={() => handleOpenDrillDown(line.statementLineId)}
                            className="hover:underline hover:text-indigo-300 cursor-pointer"
                          >
                            {line.noteReference}
                          </button>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-medium">
                        {isHeader ? '' : formatCurrency(line.cyAmount)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-400">
                        {isHeader ? '' : formatCurrency(line.pyAmount)}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {!isHeader && line.sourceType !== 'HEADER' && (
                          <button
                            onClick={() => handleOpenDrillDown(line.statementLineId)}
                            className="text-slate-500 hover:text-indigo-400 p-1"
                            title="Drill down to ledgers"
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
        )}

        {statementData && activeTab === 'INCOME_EXPENDITURE' && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden shadow-xl max-w-5xl mx-auto">
            <div className="bg-gradient-to-r from-slate-900 to-slate-800/90 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white">{statementData.incomeExpenditure.title}</h2>
                <p className="text-xs text-slate-400">{statementData.incomeExpenditure.periodEndingCY} (with comparative {statementData.incomeExpenditure.periodEndingPY})</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-slate-400">Net Result: </span>
                <span className={`text-xs font-bold ${statementData.incomeExpenditure.netSurplusCY >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {statementData.incomeExpenditure.netSurplusCY >= 0 ? 'Surplus ' : 'Deficit '}
                  {formatCurrency(statementData.incomeExpenditure.netSurplusCY)}
                </span>
              </div>
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800/80 text-slate-300 text-xs font-bold uppercase tracking-wider border-b border-slate-700">
                  <th className="py-3 px-4 w-12 text-center">Ref</th>
                  <th className="py-3 px-4">Particulars</th>
                  <th className="py-3 px-4 w-28 text-center">Note No.</th>
                  <th className="py-3 px-4 w-44 text-right">CY ({statementData.incomeExpenditure.periodEndingCY})</th>
                  <th className="py-3 px-4 w-44 text-right">PY ({statementData.incomeExpenditure.periodEndingPY})</th>
                  <th className="py-3 px-4 w-16 text-center">Drill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-xs">
                {statementData.incomeExpenditure.lines.map((line) => {
                  const isHeader = line.lineType.includes('HEADER');
                  const isTotal = line.lineType === 'TOTAL';
                  const isSubtotal = line.lineType === 'SUBTOTAL';

                  return (
                    <tr
                      key={line.statementLineId}
                      className={`hover:bg-slate-800/50 transition-colors ${
                        isHeader
                          ? 'bg-slate-800/30 font-bold text-slate-200'
                          : isTotal
                          ? 'bg-emerald-950/20 font-extrabold text-white border-t-2 border-slate-700'
                          : isSubtotal
                          ? 'font-bold text-slate-100 bg-slate-800/20'
                          : 'text-slate-300'
                      }`}
                    >
                      <td className="py-2.5 px-4 text-center font-semibold text-slate-400">{line.lineIndex || ''}</td>
                      <td className="py-2.5 px-4" style={{ paddingLeft: `${Math.max(16, (line.depth || 0) * 24)}px` }}>
                        <span className={isTotal ? 'text-emerald-400' : isHeader ? 'text-slate-100 uppercase tracking-wide' : ''}>
                          {line.lineLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center font-bold text-indigo-400">
                        {line.noteReference ? (
                          <button
                            onClick={() => handleOpenDrillDown(line.statementLineId)}
                            className="hover:underline hover:text-indigo-300 cursor-pointer"
                          >
                            {line.noteReference}
                          </button>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-medium">
                        {isHeader ? '' : formatCurrency(line.cyAmount)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-400">
                        {isHeader ? '' : formatCurrency(line.pyAmount)}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {!isHeader && line.sourceType !== 'HEADER' && (
                          <button
                            onClick={() => handleOpenDrillDown(line.statementLineId)}
                            className="text-slate-500 hover:text-indigo-400 p-1"
                            title="Drill down to ledgers"
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
        )}

        {statementData && activeTab === 'RECONCILIATION' && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden shadow-xl max-w-6xl mx-auto">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-white">Statement ↔ Note Reconciliation Proof</h2>
                <p className="text-xs text-slate-400">Verification of exact balance alignment between Statements and Note engines</p>
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                statementData.allReconciled ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
              }`}>
                {statementData.allReconciled ? '100% Reconciled (Difference = 0)' : `${statementData.unreconciledCount} Discrepancies`}
              </span>
            </div>

            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-800/80 text-slate-300 font-bold uppercase tracking-wider border-b border-slate-700">
                  <th className="py-3 px-4">Stmt</th>
                  <th className="py-3 px-4">Statement Line</th>
                  <th className="py-3 px-4 w-20 text-center">Note</th>
                  <th className="py-3 px-4">Note Title</th>
                  <th className="py-3 px-4 text-right">Statement CY</th>
                  <th className="py-3 px-4 text-right">Note CY</th>
                  <th className="py-3 px-4 text-right">Difference</th>
                  <th className="py-3 px-4 w-28 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {statementData.reconciliations.map((rec) => (
                  <tr key={rec.statementLineId} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-bold text-slate-400">{rec.statementCode}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-200">{rec.lineLabel}</td>
                    <td className="py-2.5 px-4 text-center font-bold text-indigo-400">Note {rec.noteNumber}</td>
                    <td className="py-2.5 px-4 text-slate-400">{rec.noteTitle}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(rec.statementAmountCY)}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(rec.noteAmountCY)}</td>
                    <td className={`py-2.5 px-4 text-right font-mono font-bold ${rec.differenceCY === 0 ? 'text-slate-400' : 'text-rose-400'}`}>
                      {formatCurrency(rec.differenceCY)}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        rec.isReconciledCY
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}>
                        {rec.isReconciledCY ? 'RECONCILED' : 'MISMATCH'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {statementData && activeTab === 'DIAGNOSTICS' && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 shadow-xl">
              <h2 className="text-base font-bold text-white mb-4">Financial Statement Diagnostics & Audit Log</h2>
              {statementData.diagnostics.length === 0 ? (
                <div className="bg-emerald-950/40 border border-emerald-800 text-emerald-300 p-4 rounded-lg text-xs font-semibold">
                  ✓ No diagnostic errors or warnings detected. Financial statements are fully validated.
                </div>
              ) : (
                <div className="space-y-3">
                  {statementData.diagnostics.map((diag, i) => (
                    <div
                      key={i}
                      className={`p-4 rounded-lg border text-xs flex items-start gap-3 ${
                        diag.severity === 'ERROR'
                          ? 'bg-rose-950/40 border-rose-800 text-rose-200'
                          : diag.severity === 'WARNING'
                          ? 'bg-amber-950/40 border-amber-800 text-amber-200'
                          : 'bg-blue-950/40 border-blue-800 text-blue-200'
                      }`}
                    >
                      <span className="font-extrabold uppercase px-2 py-0.5 rounded bg-slate-900/80 text-[10px] border border-slate-700">
                        {diag.code}
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold">{diag.message}</p>
                        {diag.details && <p className="text-slate-400 mt-1">{diag.details}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'TESTS' && testResults && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden shadow-xl max-w-4xl mx-auto">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/60">
              <div>
                <h2 className="text-base font-bold text-white">Automated Verification Test Suite</h2>
                <p className="text-xs text-slate-400">Phase 12 Financial Statement Engine Test Report</p>
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                testResults.allPassed ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
              }`}>
                {testResults.passedTests} / {testResults.totalTests} Passed ({testResults.allPassed ? '100%' : 'Failed'})
              </span>
            </div>

            <div className="p-6 space-y-2">
              {testResults.results.map((r, i) => (
                <div
                  key={i}
                  className={`px-4 py-2.5 rounded-lg border text-xs flex justify-between items-center ${
                    r.passed
                      ? 'bg-emerald-950/20 border-emerald-800/60 text-emerald-300'
                      : 'bg-rose-950/30 border-rose-800/80 text-rose-300'
                  }`}
                >
                  <span className="font-semibold">{i + 1}. {r.name}</span>
                  <span className="font-bold">{r.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Drill-Down Modal ── */}
      {drillDownModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Statement Line Drill-Down: {drillDownData?.lineLabel || 'Loading...'}
                </h3>
                {drillDownData?.noteNumber && (
                  <p className="text-xs text-indigo-400 mt-0.5">
                    Note {drillDownData.noteNumber} — {drillDownData.noteTitle || ''}
                  </p>
                )}
              </div>
              <button
                onClick={() => setDrillDownModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold text-lg px-2"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {drillDownLoading ? (
                <div className="flex items-center justify-center h-48 space-x-2">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
                  <span className="text-xs text-slate-400">Tracing underlying ledgers...</span>
                </div>
              ) : drillDownData ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-slate-800/40 p-3 rounded-lg text-xs">
                    <span className="text-slate-400">Total Ledgers Contributing: <strong className="text-white">{drillDownData.ledgers.length}</strong></span>
                    <span className="text-slate-400">Reporting Nodes: <strong className="text-indigo-300">{drillDownData.reportingNodeCodes.join(', ') || 'N/A'}</strong></span>
                  </div>

                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-800 text-slate-300 font-bold uppercase tracking-wider border-b border-slate-700">
                        <th className="py-2.5 px-3">Unit</th>
                        <th className="py-2.5 px-3">Ledger Name</th>
                        <th className="py-2.5 px-3">Node Name</th>
                        <th className="py-2.5 px-3 text-right">Debit</th>
                        <th className="py-2.5 px-3 text-right">Credit</th>
                        <th className="py-2.5 px-3 text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {drillDownData.ledgers.map((l, i) => (
                        <tr key={i} className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-slate-400">{l.unitName}</td>
                          <td className="py-2 px-3 font-medium text-slate-200">{l.ledgerName}</td>
                          <td className="py-2 px-3 text-slate-400">{l.nodeName}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatCurrency(l.cyDebit)}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatCurrency(l.cyCredit)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">{formatCurrency(l.cyNet)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
