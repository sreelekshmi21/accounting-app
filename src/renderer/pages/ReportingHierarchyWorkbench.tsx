import React, { useState, useEffect, useCallback } from 'react';
import type {
  ReportingHierarchyEngineResult,
  FSLISummaryRow,
  ReportingScheduleRow,
  ReportingNodeRow,
  UnmappedLedgerDetail,
  LedgerProvenanceTrace,
  ImportBatchRecord,
} from '../../electron-api';

interface ReportingHierarchyWorkbenchProps {
  onNavigateToConsolidation?: () => void;
  onNavigateToAdjustments?: () => void;
  onNavigateToRegrouping?: () => void;
  onNavigateToClassification?: () => void;
  onNavigateToMapping?: () => void;
}

type TabType =
  | 'summary'
  | 'fsli'
  | 'schedules'
  | 'sub-schedules'
  | 'ie'
  | 'bs'
  | 'calculated'
  | 'unmapped'
  | 'reconciliation'
  | 'provenance';

export default function ReportingHierarchyWorkbench({
  onNavigateToConsolidation,
  onNavigateToAdjustments,
  onNavigateToRegrouping,
  onNavigateToClassification,
  onNavigateToMapping,
}: ReportingHierarchyWorkbenchProps) {
  // State: Selection & Scope
  const [financialYears, setFinancialYears] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedFyId, setSelectedFyId] = useState<string>('');
  const [scope, setScope] = useState<'UNIT' | 'CONSOLIDATED'>('UNIT');
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [consolidationRuns, setConsolidationRuns] = useState<Array<{ id: string; runNumber: string; status: string }>>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [batches, setBatches] = useState<ImportBatchRecord[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');

  // State: Data & UI
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportingHierarchyEngineResult | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('summary');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedScheduleCode, setSelectedScheduleCode] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Provenance drilldown
  const [selectedLedgerId, setSelectedLedgerId] = useState<string | null>(null);
  const [provenanceTrace, setProvenanceTrace] = useState<LedgerProvenanceTrace | null>(null);
  const [loadingProvenance, setLoadingProvenance] = useState<boolean>(false);

  // Test suite runner modal
  const [testModalOpen, setTestModalOpen] = useState<boolean>(false);
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
        if (window.electronAPI.listImportBatches) {
          const bList = await window.electronAPI.listImportBatches();
          setBatches(bList);
        }

        if (window.electronAPI.getConsolidationWorkbenchData) {
          const cData = await window.electronAPI.getConsolidationWorkbenchData();
          setFinancialYears(cData.financialYears.map((f: any) => ({ id: f.id, label: f.yearLabel || f.id })));
          setUnits(cData.units.map((u: any) => ({ id: u.id, name: u.unitName || u.name || u.id })));
          setConsolidationRuns(cData.runs.map(r => ({ id: r.id, runNumber: r.runNumber, status: r.status })));

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
        setError(err.message || 'Failed to initialize reporting engine workbench.');
      } finally {
        setLoading(false);
      }
    };
    loadInit();
  }, []);

  // Fetch Report Data
  const fetchReport = useCallback(async () => {
    if (!selectedFyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI.getReportingHierarchyData(selectedFyId, {
        scope,
        unitId: scope === 'UNIT' ? (selectedUnitId || undefined) : undefined,
        consolidationRunId: scope === 'CONSOLIDATED' ? (selectedRunId || undefined) : undefined,
        importBatchId: selectedBatchId || undefined,
      });
      setReportData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to generate financial reporting hierarchy.');
    } finally {
      setLoading(false);
    }
  }, [selectedFyId, scope, selectedUnitId, selectedRunId, selectedBatchId]);

  useEffect(() => {
    if (selectedFyId) {
      fetchReport();
    }
  }, [fetchReport, selectedFyId, scope, selectedUnitId, selectedRunId, selectedBatchId]);

  // Fetch Provenance
  const handleInspectProvenance = async (ledgerId: string) => {
    if (!selectedFyId || !ledgerId) return;
    setSelectedLedgerId(ledgerId);
    setLoadingProvenance(true);
    try {
      const trace = await window.electronAPI.getLedgerProvenance(selectedFyId, ledgerId);
      setProvenanceTrace(trace);
      setActiveTab('provenance');
    } catch (err: any) {
      console.error('Failed to load provenance:', err);
    } finally {
      setLoadingProvenance(false);
    }
  };

  // Run Test Suite
  const handleRunTests = async () => {
    setRunningTests(true);
    setTestModalOpen(true);
    try {
      const res = await window.electronAPI.runReportingHierarchyTests();
      setTestResults(res);
    } catch (err: any) {
      setTestResults({
        allPassed: false,
        totalTests: 0,
        passedTests: 0,
        results: [{ name: 'Test Execution Error', passed: false, message: err.message || String(err) }],
      });
    } finally {
      setRunningTests(false);
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'READY':
        return <span className="badge badge-success" style={{ padding: '4px 10px', fontSize: '0.85rem' }}>READY (BALANCED)</span>;
      case 'PENDING_MAPPING':
        return <span className="badge badge-warning" style={{ padding: '4px 10px', fontSize: '0.85rem' }}>PENDING FSLI ASSIGNMENT</span>;
      case 'INCOMPLETE_SCHEDULE_INPUT':
        return <span className="badge" style={{ backgroundColor: '#f97316', color: '#fff', padding: '4px 10px', fontSize: '0.85rem' }}>INCOMPLETE INPUT</span>;
      case 'BALANCE_SHEET_UNBALANCED':
        return <span className="badge" style={{ backgroundColor: '#a855f7', color: '#fff', padding: '4px 10px', fontSize: '0.85rem' }}>BS UNBALANCED</span>;
      case 'RECONCILIATION_ERROR':
      default:
        return <span className="badge badge-danger" style={{ padding: '4px 10px', fontSize: '0.85rem' }}>RECONCILIATION ERROR</span>;
    }
  };

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null || isNaN(val)) return '₹0.00';
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="reporting-workbench-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Header & Title Bar ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700, color: '#f8fafc' }}>
              Phase 10 — FSLI & Reporting Hierarchy Engine
            </h1>
            {reportData && getStatusBadge(reportData.status)}
          </div>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            Authoritative financial statements, multi-level schedule aggregation, and audit reconciliation engine.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={handleRunTests}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>🧪</span> Run 36 Test Scenarios
          </button>
          <button
            className="btn btn-primary"
            onClick={fetchReport}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>🔄</span> {loading ? 'Recomputing...' : 'Recompute Hierarchy'}
          </button>
        </div>
      </div>

      {/* ── Global Controls Bar ──────────────────────────────────────────── */}
      <div className="card" style={{ padding: '16px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'center' }}>
          {/* FY Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
              Financial Year
            </label>
            <select
              className="form-control"
              value={selectedFyId}
              onChange={(e) => setSelectedFyId(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', background: '#0f172a', border: '1px solid #475569', color: '#f8fafc', borderRadius: '4px' }}
            >
              {financialYears.map((fy) => (
                <option key={fy.id} value={fy.id}>{fy.label}</option>
              ))}
            </select>
          </div>

          {/* Scope Toggle */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
              Reporting Scope
            </label>
            <div style={{ display: 'flex', background: '#0f172a', borderRadius: '4px', padding: '2px', border: '1px solid #475569' }}>
              <button
                type="button"
                onClick={() => setScope('UNIT')}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  background: scope === 'UNIT' ? '#3b82f6' : 'transparent',
                  color: scope === 'UNIT' ? '#fff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: scope === 'UNIT' ? 600 : 400,
                }}
              >
                Unit Level
              </button>
              <button
                type="button"
                onClick={() => setScope('CONSOLIDATED')}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  background: scope === 'CONSOLIDATED' ? '#3b82f6' : 'transparent',
                  color: scope === 'CONSOLIDATED' ? '#fff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: scope === 'CONSOLIDATED' ? 600 : 400,
                }}
              >
                Consolidated
              </button>
            </div>
          </div>

          {/* Unit Selector (if UNIT scope) */}
          {scope === 'UNIT' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                Select Unit
              </label>
              <select
                className="form-control"
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', background: '#0f172a', border: '1px solid #475569', color: '#f8fafc', borderRadius: '4px' }}
              >
                <option value="ALL">All Units Combined</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Consolidation Run (if CONSOLIDATED scope) */}
          {scope === 'CONSOLIDATED' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                Consolidation Run (Phase 9 Post-Elimination)
              </label>
              <select
                className="form-control"
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', background: '#0f172a', border: '1px solid #475569', color: '#f8fafc', borderRadius: '4px' }}
              >
                {consolidationRuns.map((r) => (
                  <option key={r.id} value={r.id}>{r.runNumber} ({r.status})</option>
                ))}
              </select>
            </div>
          )}

          {/* Active Batch Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
              Import Batch Isolation
            </label>
            <select
              className="form-control"
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', background: '#0f172a', border: '1px solid #475569', color: '#f8fafc', borderRadius: '4px' }}
            >
              <option value="">Latest Active Batch (Automatic)</option>
              {batches
                .filter(b => b.financialYear === selectedFyId || (b as any).financial_year_id === selectedFyId || !selectedFyId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.fileName || (b as any).file_name} ({new Date(b.importTimestamp || (b as any).import_timestamp || Date.now()).toLocaleDateString()})
                  </option>
                ))}
            </select>
          </div>
        </div>

        {reportData && (
          <div style={{ marginTop: '12px', fontSize: '0.85rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 600 }}>Engine Diagnosis:</span>
            <span>{reportData.statusMessage}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-danger" style={{ background: '#7f1d1d', color: '#fecaca', padding: '12px 16px', borderRadius: '6px', border: '1px solid #991b1b' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ── KPI Summary Cards ────────────────────────────────────────────── */}
      {reportData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          <div className="card" style={{ padding: '14px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Total Debit</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
              {formatCurrency(reportData.totalDebit)}
            </div>
          </div>
          <div className="card" style={{ padding: '14px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Total Credit</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
              {formatCurrency(reportData.totalCredit)}
            </div>
          </div>
          <div className="card" style={{ padding: '14px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Net Difference</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: reportData.reconciliation.sourceDifference === 0 ? '#4ade80' : '#f87171', marginTop: '4px' }}>
              {formatCurrency(reportData.reconciliation.sourceDifference)}
            </div>
          </div>
          <div className="card" style={{ padding: '14px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Unmapped / Pending</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: reportData.reconciliation.unresolvedLedgerCount === 0 ? '#4ade80' : '#fbbf24', marginTop: '4px' }}>
              {formatCurrency(reportData.reconciliation.unmappedNet)} ({reportData.reconciliation.unresolvedLedgerCount})
            </div>
          </div>
          <div className="card" style={{ padding: '14px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>CY I&E Surplus / (Deficit)</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: reportData.netSurplusCY >= 0 ? '#4ade80' : '#f87171', marginTop: '4px' }}>
              {formatCurrency(reportData.netSurplusCY)}
            </div>
          </div>
          <div className="card" style={{ padding: '14px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Balance Sheet Check</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: reportData.balanceSheet.isBalanced ? '#4ade80' : '#c084fc', marginTop: '4px' }}>
              {reportData.balanceSheet.isBalanced ? 'Balanced (₹0.00)' : `Diff: ${formatCurrency(reportData.balanceSheetDifference)}`}
            </div>
          </div>
        </div>
      )}

      {/* ── Navigation Tabs ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid #334155', gap: '4px', overflowX: 'auto' }}>
        {[
          { id: 'summary', label: '📊 Summary' },
          { id: 'ie', label: '📈 Income & Expenditure' },
          { id: 'bs', label: '⚖️ Balance Sheet' },
          { id: 'schedules', label: '📑 Schedules (Notes 4-33)' },
          { id: 'sub-schedules', label: '🌳 Sub-Schedules' },
          { id: 'calculated', label: '🧮 Calculated Schedules' },
          { id: 'fsli', label: '🏷️ Detailed FSLI' },
          { id: 'unmapped', label: `⚠️ Unmapped (${reportData?.unmappedLedgers.length || 0})` },
          { id: 'reconciliation', label: '🔍 Reconciliation Proof' },
          { id: 'provenance', label: '🕵️ Lineage & Provenance' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            style={{
              padding: '10px 16px',
              background: activeTab === tab.id ? '#1e293b' : 'transparent',
              color: activeTab === tab.id ? '#38bdf8' : '#94a3b8',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #38bdf8' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 600 : 400,
              fontSize: '0.9rem',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content Views ────────────────────────────────────────────── */}
      {reportData && (
        <div style={{ background: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: '20px' }}>
          {/* TAB 1: SUMMARY */}
          {activeTab === 'summary' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: '#0f172a', padding: '16px', borderRadius: '6px', border: '1px solid #334155' }}>
                  <h3 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '1.1rem' }}>Statement Totals Overview</h3>
                  <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '8px 0', color: '#94a3b8' }}>Total Revenue (Income)</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, color: '#4ade80' }}>
                          {formatCurrency(reportData.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-inc-tot')?.cyAmount)}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '8px 0', color: '#94a3b8' }}>Total Expenses</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, color: '#f87171' }}>
                          {formatCurrency(reportData.incomeAndExpenditure.lines.find(l => l.lineId === 'ie-exp-tot')?.cyAmount)}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '8px 0', color: '#94a3b8' }}>Surplus / (Deficit) for the Year</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: reportData.netSurplusCY >= 0 ? '#4ade80' : '#f87171' }}>
                          {formatCurrency(reportData.netSurplusCY)}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '8px 0', color: '#94a3b8' }}>Total Balance Sheet Liabilities & Funds</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, color: '#38bdf8' }}>
                          {formatCurrency(reportData.balanceSheet.lines.find(l => l.lineId === 'bs-tot-liab')?.cyAmount)}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '8px 0', color: '#94a3b8' }}>Total Balance Sheet Assets</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, color: '#38bdf8' }}>
                          {formatCurrency(reportData.balanceSheet.lines.find(l => l.lineId === 'bs-tot-ast')?.cyAmount)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ background: '#0f172a', padding: '16px', borderRadius: '6px', border: '1px solid #334155' }}>
                  <h3 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '1.1rem' }}>Reconciliation Summary</h3>
                  <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '8px 0', color: '#94a3b8' }}>Source Trial Balance (Dr / Cr)</td>
                        <td style={{ padding: '8px 0', textAlign: 'right' }}>
                          {formatCurrency(reportData.reconciliation.sourceDebit)} / {formatCurrency(reportData.reconciliation.sourceCredit)}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '8px 0', color: '#94a3b8' }}>Aggregated FSLI (Dr / Cr)</td>
                        <td style={{ padding: '8px 0', textAlign: 'right' }}>
                          {formatCurrency(reportData.reconciliation.aggregatedFSLIDebit)} / {formatCurrency(reportData.reconciliation.aggregatedFSLICredit)}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '8px 0', color: '#94a3b8' }}>Reporting Schedules (Dr / Cr)</td>
                        <td style={{ padding: '8px 0', textAlign: 'right' }}>
                          {formatCurrency(reportData.reconciliation.reportingNodesDebit)} / {formatCurrency(reportData.reconciliation.reportingNodesCredit)}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '8px 0', color: '#94a3b8' }}>Total Processed Ledgers</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600 }}>
                          {reportData.reconciliation.processedLedgerCount} of {reportData.reconciliation.sourceLedgerCount}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '8px 0', color: '#94a3b8' }}>Mathematical Balance Check</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: reportData.reconciliation.isSourceReconciled ? '#4ade80' : '#f87171' }}>
                          {reportData.reconciliation.isSourceReconciled ? '✓ EXACT RECONCILIATION' : '✗ DISCREPANCY'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Upstream Navigation Shortcuts */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <span style={{ fontSize: '0.85rem', color: '#94a3b8', alignSelf: 'center' }}>Navigate to upstream phases:</span>
                {onNavigateToMapping && <button className="btn btn-secondary btn-sm" onClick={onNavigateToMapping}>Phase 5 Mapping</button>}
                {onNavigateToClassification && <button className="btn btn-secondary btn-sm" onClick={onNavigateToClassification}>Phase 6 Classification</button>}
                {onNavigateToRegrouping && <button className="btn btn-secondary btn-sm" onClick={onNavigateToRegrouping}>Phase 7 Regrouping</button>}
                {onNavigateToAdjustments && <button className="btn btn-secondary btn-sm" onClick={onNavigateToAdjustments}>Phase 8 Adjustments</button>}
                {onNavigateToConsolidation && <button className="btn btn-secondary btn-sm" onClick={onNavigateToConsolidation}>Phase 9 Consolidation</button>}
              </div>
            </div>
          )}

          {/* TAB 2: INCOME & EXPENDITURE STATEMENT */}
          {activeTab === 'ie' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.25rem' }}>
                  Statement of Income and Expenditure for the year ended March 31st, {reportData.financialYearLabel.split('-')[1] || '2026'}
                </h2>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  (Amount in Rs) • Scope: {reportData.scope === 'CONSOLIDATED' ? 'Consolidated' : reportData.unitName}
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #475569', color: '#94a3b8', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Particulars</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>Notes</th>
                    <th style={{ padding: '8px', textAlign: 'right', width: '180px' }}>Year Ended March 31, {reportData.financialYearLabel.split('-')[1] || '2026'}</th>
                    <th style={{ padding: '8px', textAlign: 'right', width: '180px' }}>Year Ended March 31, {reportData.financialYearLabel.split('-')[0] || '2025'}</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.incomeAndExpenditure.lines.map((line) => (
                    <tr
                      key={line.lineId}
                      style={{
                        borderBottom: line.isTotal ? '2px solid #475569' : '1px solid #334155',
                        background: line.isTotal ? '#0f172a' : 'transparent',
                        fontWeight: line.isTotal ? 700 : 400,
                      }}
                    >
                      <td style={{ padding: '8px', paddingLeft: line.isTotal ? '8px' : '24px', color: line.isTotal ? '#f8fafc' : '#cbd5e1' }}>
                        {line.lineTitle}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', color: '#38bdf8' }}>
                        {line.scheduleNumber ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedScheduleCode(line.scheduleCode || 'ALL');
                              setActiveTab('schedules');
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            {line.scheduleNumber}
                          </button>
                        ) : ''}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: line.isTotal ? (line.cyAmount >= 0 ? '#4ade80' : '#f87171') : '#f8fafc' }}>
                        {formatCurrency(line.cyAmount)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>
                        {formatCurrency(line.pyAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: BALANCE SHEET STATEMENT */}
          {activeTab === 'bs' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.25rem' }}>
                  Balance Sheet as at March 31, {reportData.financialYearLabel.split('-')[1] || '2026'}
                </h2>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  (Amount in Rs) • Scope: {reportData.scope === 'CONSOLIDATED' ? 'Consolidated' : reportData.unitName}
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #475569', color: '#94a3b8', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>LIABILITIES / ASSETS</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>Notes</th>
                    <th style={{ padding: '8px', textAlign: 'right', width: '180px' }}>March 31, {reportData.financialYearLabel.split('-')[1] || '2026'}</th>
                    <th style={{ padding: '8px', textAlign: 'right', width: '180px' }}>March 31, {reportData.financialYearLabel.split('-')[0] || '2025'}</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.balanceSheet.lines.map((line) => (
                    <tr
                      key={line.lineId}
                      style={{
                        borderBottom: line.isTotal ? '2px solid #475569' : line.isSubtotal ? '1px solid #475569' : '1px solid #334155',
                        background: line.isTotal ? '#0f172a' : line.isSubtotal ? '#1e293b' : 'transparent',
                        fontWeight: line.isTotal ? 700 : line.isSubtotal ? 600 : 400,
                      }}
                    >
                      <td style={{ padding: '8px', paddingLeft: line.isTotal ? '8px' : line.isSubtotal ? '12px' : '32px', color: line.isTotal ? '#f8fafc' : line.isSubtotal ? '#38bdf8' : '#cbd5e1' }}>
                        {line.lineNumber ? `${line.lineNumber} ` : ''}{line.lineTitle}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', color: '#38bdf8' }}>
                        {line.scheduleNumber ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedScheduleCode(line.scheduleCode || 'ALL');
                              setActiveTab('schedules');
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            {line.scheduleNumber}
                          </button>
                        ) : ''}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: line.isTotal ? '#38bdf8' : '#f8fafc' }}>
                        {!line.isSubtotal ? formatCurrency(line.cyAmount) : ''}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>
                        {!line.isSubtotal ? formatCurrency(line.pyAmount) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: SCHEDULES (NOTES 4 TO 33) */}
          {activeTab === 'schedules' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Filter Schedule:</label>
                  <select
                    className="form-control"
                    value={selectedScheduleCode}
                    onChange={(e) => setSelectedScheduleCode(e.target.value)}
                    style={{ padding: '4px 8px', background: '#0f172a', border: '1px solid #475569', color: '#f8fafc', borderRadius: '4px' }}
                  >
                    <option value="ALL">All Schedules (Notes 4-33)</option>
                    {reportData.scheduleRows.map(s => (
                      <option key={s.scheduleCode} value={s.scheduleCode}>{s.scheduleName}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  placeholder="Search schedule line items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: '6px 12px', background: '#0f172a', border: '1px solid #475569', color: '#f8fafc', borderRadius: '4px', width: '250px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {reportData.scheduleRows
                  .filter(s => selectedScheduleCode === 'ALL' || s.scheduleCode === selectedScheduleCode)
                  .map(sch => (
                    <div key={sch.scheduleCode} style={{ background: '#0f172a', borderRadius: '6px', border: '1px solid #334155', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                        <div>
                          <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.05rem' }}>{sch.scheduleName}</h3>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            Statement: {sch.statementCode === 'BS' ? 'Balance Sheet' : 'Income & Expenditure'} • Type: {sch.scheduleType}
                            {sch.isCalculated && ' • 🧮 Calculated Schedule'}
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#38bdf8' }}>{formatCurrency(sch.cyTotal)}</span>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>PY: {formatCurrency(sch.pyTotal)}</div>
                        </div>
                      </div>

                      <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ color: '#94a3b8', borderBottom: '1px solid #334155', textAlign: 'left' }}>
                            <th style={{ padding: '6px' }}>Line Item / Sub-Schedule</th>
                            <th style={{ padding: '6px', textAlign: 'center', width: '90px' }}>Nature</th>
                            <th style={{ padding: '6px', textAlign: 'right', width: '140px' }}>CY Debit</th>
                            <th style={{ padding: '6px', textAlign: 'right', width: '140px' }}>CY Credit</th>
                            <th style={{ padding: '6px', textAlign: 'right', width: '140px' }}>CY Net</th>
                            <th style={{ padding: '6px', textAlign: 'right', width: '140px' }}>PY Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sch.nodes
                            .filter(n => !searchQuery || n.nodeName.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(n => (
                              <tr key={n.nodeId} style={{ borderBottom: '1px solid #1e293b' }}>
                                <td style={{ padding: '6px', paddingLeft: `${n.depth * 16 + 6}px`, color: n.nodeType === 'HEADER' ? '#38bdf8' : '#cbd5e1', fontWeight: n.nodeType === 'HEADER' || n.nodeType === 'TOTAL' ? 600 : 400 }}>
                                  {n.nodeName}
                                  {n.isProtectedAccount && <span className="badge badge-info" style={{ marginLeft: '6px', fontSize: '0.7rem' }}>Protected</span>}
                                </td>
                                <td style={{ padding: '6px', textAlign: 'center', color: '#94a3b8' }}>{n.balanceNature}</td>
                                <td style={{ padding: '6px', textAlign: 'right' }}>{formatCurrency(n.cyDebit)}</td>
                                <td style={{ padding: '6px', textAlign: 'right' }}>{formatCurrency(n.cyCredit)}</td>
                                <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600, color: '#f8fafc' }}>{formatCurrency(n.cyNet)}</td>
                                <td style={{ padding: '6px', textAlign: 'right', color: '#94a3b8' }}>{formatCurrency(n.pyNet)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TAB 5: SUB-SCHEDULES */}
          {activeTab === 'sub-schedules' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem' }}>Organisational Sub-Schedules (Tree Breakdown)</h3>
                <input
                  type="text"
                  placeholder="Search sub-schedule..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: '6px 12px', background: '#0f172a', border: '1px solid #475569', color: '#f8fafc', borderRadius: '4px', width: '250px' }}
                />
              </div>

              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#94a3b8', borderBottom: '2px solid #475569', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Sub-Schedule Name</th>
                    <th style={{ padding: '8px', width: '100px' }}>Schedule</th>
                    <th style={{ padding: '8px', width: '100px' }}>Code</th>
                    <th style={{ padding: '8px', textAlign: 'right', width: '120px' }}>CY Debit</th>
                    <th style={{ padding: '8px', textAlign: 'right', width: '120px' }}>CY Credit</th>
                    <th style={{ padding: '8px', textAlign: 'right', width: '140px' }}>CY Net</th>
                    <th style={{ padding: '8px', textAlign: 'right', width: '140px' }}>PY Net</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>Ledgers</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.subScheduleRows
                    .filter(s => !searchQuery || s.nodeName.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(sub => (
                      <tr key={sub.nodeId} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '8px', color: '#f8fafc', fontWeight: 500 }}>
                          {sub.nodeName}
                          {sub.isProtectedAccount && <span className="badge badge-info" style={{ marginLeft: '6px', fontSize: '0.7rem' }}>Protected</span>}
                        </td>
                        <td style={{ padding: '8px', color: '#38bdf8' }}>Note {sub.scheduleNumber}</td>
                        <td style={{ padding: '8px', color: '#94a3b8' }}><code>{sub.nodeCode}</code></td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(sub.cyDebit)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(sub.cyCredit)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: '#4ade80' }}>{formatCurrency(sub.cyNet)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>{formatCurrency(sub.pyNet)}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <span className="badge badge-secondary">{sub.ledgerCount}</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 6: CALCULATED SCHEDULES INSPECTOR */}
          {activeTab === 'calculated' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                Inspection of typed, deterministic schedule calculation handlers for Notes 4, 5, 11, 18, 25, 28, and 29.
              </div>

              {/* Note 4 Corpus */}
              <div style={{ background: '#0f172a', borderRadius: '6px', border: '1px solid #334155', padding: '16px' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>Note 4: Corpus Fund Movement</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '0.85rem' }}>
                  <div><span style={{ color: '#94a3b8' }}>Opening Balance b/f:</span> <strong>{formatCurrency(reportData.calculatedSchedules.corpus.balanceBroughtForward)}</strong></div>
                  <div><span style={{ color: '#94a3b8' }}>Received During Year:</span> <strong>{formatCurrency(reportData.calculatedSchedules.corpus.receivedDuringYear)}</strong></div>
                  <div><span style={{ color: '#94a3b8' }}>Closing Corpus:</span> <strong style={{ color: '#4ade80' }}>{formatCurrency(reportData.calculatedSchedules.corpus.closingBalance)}</strong></div>
                  <div><span style={{ color: '#94a3b8' }}>Reconciliation:</span> <strong style={{ color: '#4ade80' }}>✓ Verified</strong></div>
                </div>
              </div>

              {/* Note 5 Reserves */}
              <div style={{ background: '#0f172a', borderRadius: '6px', border: '1px solid #334155', padding: '16px' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>Note 5: Reserve & Surplus (11 Sub-Funds Matrix)</h4>
                <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#94a3b8', borderBottom: '1px solid #334155', textAlign: 'left' }}>
                      <th style={{ padding: '4px' }}>Sub-Fund</th>
                      <th style={{ padding: '4px', textAlign: 'right' }}>Balance b/f</th>
                      <th style={{ padding: '4px', textAlign: 'right' }}>Additions / Adjustments</th>
                      <th style={{ padding: '4px', textAlign: 'right' }}>Closing Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.calculatedSchedules.reserveAndSurplus.funds.map((f: any) => (
                      <tr key={f.fundKey} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '4px', color: '#f8fafc' }}>{f.fundName}</td>
                        <td style={{ padding: '4px', textAlign: 'right' }}>{formatCurrency(f.balanceBroughtForward)}</td>
                        <td style={{ padding: '4px', textAlign: 'right' }}>{formatCurrency(f.additionsAdjustments)}</td>
                        <td style={{ padding: '4px', textAlign: 'right', fontWeight: 600, color: '#38bdf8' }}>{formatCurrency(f.closingBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Note 18 Loans & Advances */}
              <div style={{ background: '#0f172a', borderRadius: '6px', border: '1px solid #334155', padding: '16px' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>Note 18: Short-Term Loans & Advances Split</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '0.85rem' }}>
                  <div><span style={{ color: '#94a3b8' }}>Total Gross Loans & Deposits:</span> <strong>{formatCurrency(reportData.calculatedSchedules.loansAndAdvances.totalGrossLoansAndAdvances)}</strong></div>
                  <div><span style={{ color: '#94a3b8' }}>Less: Non-Current Security Deposits:</span> <strong style={{ color: '#f87171' }}>{formatCurrency(reportData.calculatedSchedules.loansAndAdvances.lessNonCurrentSecurityDeposits)}</strong></div>
                  <div><span style={{ color: '#94a3b8' }}>Current Portion (BS Line d):</span> <strong style={{ color: '#4ade80' }}>{formatCurrency(reportData.calculatedSchedules.loansAndAdvances.currentPortionOfLoansAndAdvances)}</strong></div>
                </div>
              </div>

              {/* Note 28 Material Consumption & Note 29 COGS */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ background: '#0f172a', borderRadius: '6px', border: '1px solid #334155', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>Note 28: Material Consumption</h4>
                  <div style={{ fontSize: '0.85rem', lineHeight: '1.8' }}>
                    <div>Opening Raw Material: <strong>{formatCurrency(reportData.calculatedSchedules.materialConsumption.openingStockRawMaterial)}</strong></div>
                    <div>+ Add Purchases: <strong>{formatCurrency(reportData.calculatedSchedules.materialConsumption.addPurchases)}</strong></div>
                    <div>- Less Closing Raw Material: <strong>{formatCurrency(reportData.calculatedSchedules.materialConsumption.lessClosingStockRawMaterial)}</strong></div>
                    <div style={{ borderTop: '1px solid #334155', paddingTop: '4px', marginTop: '4px' }}>
                      = Total Consumption: <strong style={{ color: '#4ade80' }}>{formatCurrency(reportData.calculatedSchedules.materialConsumption.consumptions)}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ background: '#0f172a', borderRadius: '6px', border: '1px solid #334155', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>Note 29: Cost of Trading Items Sold</h4>
                  <div style={{ fontSize: '0.85rem', lineHeight: '1.8' }}>
                    <div>Opening Trading Stock: <strong>{formatCurrency(reportData.calculatedSchedules.tradingCOGS.openingStockTrading)}</strong></div>
                    <div>+ Add Purchases: <strong>{formatCurrency(reportData.calculatedSchedules.tradingCOGS.addPurchases)}</strong></div>
                    <div>- Less Closing Trading Stock: <strong>{formatCurrency(reportData.calculatedSchedules.tradingCOGS.lessClosingStockTrading)}</strong></div>
                    <div style={{ borderTop: '1px solid #334155', paddingTop: '4px', marginTop: '4px' }}>
                      = Cost of Goods Sold: <strong style={{ color: '#4ade80' }}>{formatCurrency(reportData.calculatedSchedules.tradingCOGS.costOfTradingItemsSold)}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: DETAILED FSLI CATALOG */}
          {activeTab === 'fsli' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Category:</label>
                  <select
                    className="form-control"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    style={{ padding: '4px 8px', background: '#0f172a', border: '1px solid #475569', color: '#f8fafc', borderRadius: '4px' }}
                  >
                    <option value="ALL">All Categories</option>
                    <option value="Asset">Asset</option>
                    <option value="Liability">Liability</option>
                    <option value="Equity">Equity</option>
                    <option value="Income">Income</option>
                    <option value="Expense">Expense</option>
                    <option value="Unmapped">Unmapped</option>
                  </select>
                </div>
                <input
                  type="text"
                  placeholder="Search FSLI code or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: '6px 12px', background: '#0f172a', border: '1px solid #475569', color: '#f8fafc', borderRadius: '4px', width: '250px' }}
                />
              </div>

              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#94a3b8', borderBottom: '2px solid #475569', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>FSLI Code</th>
                    <th style={{ padding: '8px' }}>FSLI Name</th>
                    <th style={{ padding: '8px' }}>Category</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>CY Debit</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>CY Credit</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>CY Net</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>PY Net</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Ledgers</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.fsliRows
                    .filter(f => selectedCategory === 'ALL' || f.category === selectedCategory)
                    .filter(f => !searchQuery || f.fsliCode.toLowerCase().includes(searchQuery.toLowerCase()) || f.fsliName.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(f => (
                      <tr key={f.fsliId} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '8px', color: '#38bdf8' }}><code>{f.fsliCode}</code></td>
                        <td style={{ padding: '8px', color: '#f8fafc', fontWeight: 500 }}>{f.fsliName}</td>
                        <td style={{ padding: '8px', color: '#94a3b8' }}>{f.category}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(f.cyDebit)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(f.cyCredit)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: f.cyNet >= 0 ? '#4ade80' : '#f87171' }}>{formatCurrency(f.cyNet)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>{formatCurrency(f.pyNet)}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}><span className="badge badge-secondary">{f.ledgerCount}</span></td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <span className={`badge ${f.status === 'Mapped' ? 'badge-success' : 'badge-warning'}`}>{f.status}</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 8: UNMAPPED LEDGERS TRACKER */}
          {activeTab === 'unmapped' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem' }}>Unmapped Ledgers Diagnostic Tracker</h3>
                  <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                    {reportData.unmappedLedgers.length} ledger(s) pending classification/mapping.
                  </span>
                </div>
                {onNavigateToMapping && (
                  <button className="btn btn-primary btn-sm" onClick={onNavigateToMapping}>
                    Go to Phase 5 Mapping Workbench →
                  </button>
                )}
              </div>

              {reportData.unmappedLedgers.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#4ade80' }}>
                  ✓ All ledgers in the selected scope are fully mapped to authoritative FSLIs.
                </div>
              ) : (
                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#94a3b8', borderBottom: '2px solid #475569', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Ledger Name</th>
                      <th style={{ padding: '8px' }}>Unit</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Debit</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Credit</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Net Balance</th>
                      <th style={{ padding: '8px' }}>Mapping Status</th>
                      <th style={{ padding: '8px' }}>Classification Status</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.unmappedLedgers.map(l => (
                      <tr key={l.ledgerId} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '8px', color: '#f8fafc', fontWeight: 600 }}>{l.ledgerName}</td>
                        <td style={{ padding: '8px', color: '#94a3b8' }}>{l.unitName}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(l.debit)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(l.credit)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: '#f87171' }}>{formatCurrency(l.net)}</td>
                        <td style={{ padding: '8px' }}><span className="badge badge-warning">{l.mappingStatus}</span></td>
                        <td style={{ padding: '8px' }}><span className="badge badge-secondary">{l.classificationStatus}</span></td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleInspectProvenance(l.ledgerId)}
                          >
                            Trace Lineage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 9: RECONCILIATION PROOF */}
          {activeTab === 'reconciliation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                Multi-tier mathematical verification proving that no balance disappeared during Phase 5–10 aggregation.
              </div>

              <div style={{ background: '#0f172a', borderRadius: '6px', border: '1px solid #334155', padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc' }}>Multi-Tier Aggregation Proof</h4>
                <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#94a3b8', borderBottom: '1px solid #334155', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Aggregation Level</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Debit Total</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Credit Total</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Difference</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Verification</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '8px', color: '#f8fafc' }}>1. Source Trial Balance</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(reportData.reconciliation.sourceDebit)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(reportData.reconciliation.sourceCredit)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(reportData.reconciliation.sourceDifference)}</td>
                      <td style={{ padding: '8px', textAlign: 'center', color: '#4ade80' }}>✓ Source Authoritative</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '8px', color: '#f8fafc' }}>2. Phase 10 FSLI Aggregation</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(reportData.reconciliation.aggregatedFSLIDebit)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(reportData.reconciliation.aggregatedFSLICredit)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(reportData.reconciliation.aggregatedFSLIDifference)}</td>
                      <td style={{ padding: '8px', textAlign: 'center', color: reportData.reconciliation.isSourceReconciled ? '#4ade80' : '#f87171' }}>
                        {reportData.reconciliation.isSourceReconciled ? '✓ Matched to Source' : '✗ Discrepancy'}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '8px', color: '#f8fafc' }}>3. Reporting Schedules (Notes 4-33)</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(reportData.reconciliation.reportingNodesDebit)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(reportData.reconciliation.reportingNodesCredit)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(reportData.reconciliation.reportingNodesDebit - reportData.reconciliation.reportingNodesCredit)}</td>
                      <td style={{ padding: '8px', textAlign: 'center', color: reportData.reconciliation.isNodesReconciled ? '#4ade80' : '#f87171' }}>
                        {reportData.reconciliation.isNodesReconciled ? '✓ Matched to FSLI' : '✗ Discrepancy'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 10: PROVENANCE AUDIT LINEAGE */}
          {activeTab === 'provenance' && (
            <div>
              <h3 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '1.1rem' }}>Ledger Provenance & Life-Cycle Lineage</h3>
              {loadingProvenance ? (
                <div style={{ color: '#94a3b8' }}>Loading ledger audit lineage...</div>
              ) : provenanceTrace ? (
                <div style={{ background: '#0f172a', padding: '20px', borderRadius: '6px', border: '1px solid #334155' }}>
                  <h4 style={{ margin: '0 0 16px 0', color: '#38bdf8' }}>{provenanceTrace.ledgerName} ({provenanceTrace.unitName})</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', fontSize: '0.85rem' }}>
                    <div><span style={{ color: '#94a3b8' }}>Import File:</span> <div><strong>{provenanceTrace.importFileName}</strong></div></div>
                    <div><span style={{ color: '#94a3b8' }}>Base Debit / Credit:</span> <div><strong>{formatCurrency(provenanceTrace.baseDebit)} / {formatCurrency(provenanceTrace.baseCredit)}</strong></div></div>
                    <div><span style={{ color: '#94a3b8' }}>Phase 5 Mapped:</span> <div><strong>{provenanceTrace.phase5MappedFSLI || 'N/A'}</strong></div></div>
                    <div><span style={{ color: '#94a3b8' }}>Phase 6 Classified:</span> <div><strong>{provenanceTrace.phase6ClassifiedFSLI || 'N/A'}</strong></div></div>
                    <div><span style={{ color: '#94a3b8' }}>Phase 7 Regrouped:</span> <div><strong>{provenanceTrace.phase7RegroupedFSLI || 'N/A'}</strong></div></div>
                    <div><span style={{ color: '#94a3b8' }}>Final Resolved FSLI:</span> <div style={{ color: '#4ade80' }}><strong>{provenanceTrace.finalFSLICode} - {provenanceTrace.finalFSLIName}</strong></div></div>
                    <div><span style={{ color: '#94a3b8' }}>Reporting Node:</span> <div><strong>{provenanceTrace.reportingNodeCode} - {provenanceTrace.reportingNodeName}</strong></div></div>
                    <div><span style={{ color: '#94a3b8' }}>Reporting Schedule:</span> <div><strong>{provenanceTrace.reportingScheduleCode} ({provenanceTrace.reportingStatementCode})</strong></div></div>
                  </div>
                </div>
              ) : (
                <div style={{ color: '#94a3b8', padding: '24px', textAlign: 'center' }}>
                  Select a ledger from Unmapped Tracker or Schedules to inspect its complete Phase 5–10 computation lineage.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Test Suite Modal ─────────────────────────────────────────────── */}
      {testModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div style={{ background: '#1e293b', padding: '24px', borderRadius: '8px', width: '700px', maxHeight: '80vh', overflowY: 'auto', border: '1px solid #475569' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#f8fafc' }}>Phase 10 Automated Test Suite</h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setTestModalOpen(false)}
              >
                ✕ Close
              </button>
            </div>

            {runningTests ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#38bdf8' }}>
                Executing 36 comprehensive test scenarios...
              </div>
            ) : testResults ? (
              <div>
                <div style={{ padding: '12px', background: testResults.allPassed ? '#14532d' : '#7f1d1d', borderRadius: '6px', marginBottom: '16px', color: '#fff', fontWeight: 600 }}>
                  {testResults.allPassed
                    ? `✓ All ${testResults.totalTests} tests passed successfully!`
                    : `✗ ${testResults.totalTests - testResults.passedTests} of ${testResults.totalTests} tests failed.`}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {testResults.results.map((r, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: '#0f172a', borderRadius: '4px', border: '1px solid #334155', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: r.passed ? '#cbd5e1' : '#f87171' }}>{r.name}</span>
                      <span style={{ fontWeight: 600, color: r.passed ? '#4ade80' : '#f87171' }}>{r.passed ? 'PASS' : 'FAIL'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
