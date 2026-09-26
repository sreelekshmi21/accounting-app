import React, { useState, useEffect, useCallback } from 'react';
import type {
  FinalValidationDataset,
  FinalValidationResult,
  FinalValidationCategory,
  ValidationSeverity,
  OverallValidationStatus,
  StatementDrillDownResult,
} from '../../electron-api';

interface FinalValidationWorkbenchProps {
  onNavigateToFinancialStatements?: () => void;
  onNavigateToNotes?: () => void;
  onNavigateToReporting?: () => void;
  onNavigateToConsolidation?: () => void;
  onNavigateToAdjustments?: () => void;
  onNavigateToMapping?: () => void;
}

type SeverityFilter = 'ALL' | 'ERROR' | 'WARNING' | 'BLOCKED' | 'PASS';

export default function FinalValidationWorkbench({
  onNavigateToFinancialStatements,
  onNavigateToNotes,
  onNavigateToReporting,
  onNavigateToConsolidation,
  onNavigateToAdjustments,
  onNavigateToMapping,
}: FinalValidationWorkbenchProps) {
  // State: Scope & Selection
  const [financialYears, setFinancialYears] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedFyId, setSelectedFyId] = useState<string>('');
  const [scope, setScope] = useState<'UNIT' | 'CONSOLIDATED'>('CONSOLIDATED');
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [consolidationRuns, setConsolidationRuns] = useState<Array<{ id: string; runNumber: string; status: string }>>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');

  // State: Validation Dataset
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [validationData, setValidationData] = useState<FinalValidationDataset | null>(null);

  // State: Filtering & Search
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // State: Drilldown Modal
  const [drillDownModalOpen, setDrillDownModalOpen] = useState<boolean>(false);
  const [drillDownLoading, setDrillDownLoading] = useState<boolean>(false);
  const [drillDownData, setDrillDownData] = useState<StatementDrillDownResult | null>(null);
  const [selectedResult, setSelectedResult] = useState<FinalValidationResult | null>(null);

  // State: Test Suite Execution Modal
  const [testModalOpen, setTestModalOpen] = useState<boolean>(false);
  const [runningTests, setRunningTests] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<{
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    results: Array<{ name: string; passed: boolean; message: string }>;
  } | null>(null);

  // State: Export notification
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Initialize FYs, Units & Runs
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
        setError(err.message || 'Failed to initialize Final Validation workbench.');
      } finally {
        setLoading(false);
      }
    };
    loadInit();
  }, []);

  // Fetch Validation Data
  const runValidation = useCallback(async () => {
    if (!selectedFyId) return;
    try {
      setLoading(true);
      setError(null);

      const result = await window.electronAPI.runFinalValidation(selectedFyId, {
        scope,
        unitId: scope === 'UNIT' ? selectedUnitId : undefined,
        consolidationRunId: scope === 'CONSOLIDATED' ? selectedRunId : undefined,
      });

      setValidationData(result);

      // Default expand categories with errors or warnings
      const expanded: Record<string, boolean> = {};
      for (const group of result.categoryGroups) {
        if (group.summary.errors > 0 || group.summary.warnings > 0 || group.summary.blocked > 0) {
          expanded[group.category] = true;
        } else {
          expanded[group.category] = false;
        }
      }
      setExpandedCategories(expanded);
    } catch (err: any) {
      setError(err.message || 'Validation execution failed.');
    } finally {
      setLoading(false);
    }
  }, [selectedFyId, scope, selectedUnitId, selectedRunId]);

  useEffect(() => {
    if (selectedFyId) {
      runValidation();
    }
  }, [selectedFyId, scope, selectedUnitId, selectedRunId, runValidation]);

  // Export Validation Report
  const handleExportReport = async () => {
    if (!selectedFyId) return;
    try {
      const res = await window.electronAPI.exportFinalValidationReport(selectedFyId, {
        scope,
        unitId: scope === 'UNIT' ? selectedUnitId : undefined,
        consolidationRunId: scope === 'CONSOLIDATED' ? selectedRunId : undefined,
      });

      if (res.success) {
        setExportNotice(`Validation Report exported successfully${res.filePath ? ` to ${res.filePath}` : ''}`);
        setTimeout(() => setExportNotice(null), 5000);
      } else {
        setError(res.error || 'Export failed.');
      }
    } catch (err: any) {
      setError(err.message || 'Export error.');
    }
  };

  // Run Automated Test Suite
  const handleRunTests = async () => {
    try {
      setRunningTests(true);
      setTestModalOpen(true);
      const res = await window.electronAPI.runFinalValidationTests();
      setTestResults(res);
    } catch (err: any) {
      setError(err.message || 'Failed to run tests.');
    } finally {
      setRunningTests(false);
    }
  };

  // Drilldown handler
  const handleOpenDrillDown = async (res: FinalValidationResult) => {
    setSelectedResult(res);
    setDrillDownModalOpen(true);

    if (res.lineage?.statementLineId && window.electronAPI?.getStatementDrillDown) {
      try {
        setDrillDownLoading(true);
        const data = await window.electronAPI.getStatementDrillDown(selectedFyId, res.lineage.statementLineId, {
          scope,
          unitId: scope === 'UNIT' ? selectedUnitId : undefined,
          consolidationRunId: scope === 'CONSOLIDATED' ? selectedRunId : undefined,
        });
        setDrillDownData(data);
      } catch {
        setDrillDownData(null);
      } finally {
        setDrillDownLoading(false);
      }
    } else {
      setDrillDownData(null);
    }
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  };

  const formatINRValue = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '₹0.00';
    const isNeg = val < 0;
    const abs = Math.abs(val);
    const str = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return isNeg ? `-₹${str}` : `₹${str}`;
  };

  // Filter Results
  const filteredCategoryGroups = (validationData?.categoryGroups || []).map(group => {
    let list = group.results;

    if (severityFilter === 'ERROR') {
      list = list.filter(r => r.severity === 'ERROR' && r.status !== 'BLOCKED');
    } else if (severityFilter === 'WARNING') {
      list = list.filter(r => r.severity === 'WARNING');
    } else if (severityFilter === 'BLOCKED') {
      list = list.filter(r => r.status === 'BLOCKED');
    } else if (severityFilter === 'PASS') {
      list = list.filter(r => r.severity === 'PASS' && r.status !== 'BLOCKED');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r =>
        r.validation_id.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.affected_module.toLowerCase().includes(q) ||
        (r.affected_ledger && r.affected_ledger.toLowerCase().includes(q)) ||
        r.resolution.toLowerCase().includes(q)
      );
    }

    return {
      ...group,
      results: list,
    };
  }).filter(group => {
    if (selectedCategory !== 'ALL' && group.category !== selectedCategory) {
      return false;
    }
    return group.results.length > 0;
  });

  const getStatusBadge = (status: OverallValidationStatus | ValidationSeverity | undefined) => {
    switch (status) {
      case 'PASS':
        return <span className="fs-badge fs-badge-success">✓ PASS</span>;
      case 'WARNING':
        return <span className="fs-badge fs-badge-warning">⚠ WARNING</span>;
      case 'ERROR':
        return <span className="fs-badge fs-badge-danger">✕ ERROR</span>;
      case 'BLOCKED':
        return <span className="fs-badge" style={{ background: 'rgba(234, 88, 12, 0.15)', color: '#ea580c', border: '1px solid #ea580c' }}>🚫 BLOCKED</span>;
      default:
        return <span className="fs-badge fs-badge-secondary">{status}</span>;
    }
  };

  const getOverallStatusBanner = () => {
    if (!validationData) return null;
    const { overallStatus, summary } = validationData;

    let bg = 'rgba(16, 185, 129, 0.1)';
    let border = '#10b981';
    let title = '✓ FINAL VALIDATION — PASS';
    let subtitle = 'All 13 validation categories verified. Financial statements are internally consistent and ready for final reporting.';

    if (overallStatus === 'BLOCKED') {
      bg = 'rgba(234, 88, 12, 0.1)';
      border = '#ea580c';
      title = '🚫 FINAL VALIDATION — BLOCKED';
      subtitle = 'Upstream phases are incomplete. Downstream checks cannot reliably be performed until prerequisites are resolved.';
    } else if (overallStatus === 'ERROR') {
      bg = 'rgba(239, 68, 68, 0.1)';
      border = '#ef4444';
      title = `✕ FINAL VALIDATION — ${summary.errors} CRITICAL ERROR${summary.errors > 1 ? 'S' : ''}`;
      subtitle = 'Material discrepancies or imbalances detected. Resolve the errors listed below before final reporting.';
    } else if (overallStatus === 'WARNING') {
      bg = 'rgba(245, 158, 11, 0.1)';
      border = '#f59e0b';
      title = `⚠ FINAL VALIDATION — ${summary.warnings} WARNING${summary.warnings > 1 ? 'S' : ''}`;
      subtitle = 'Non-critical items require review (e.g. Prior Year unavailable or pending classifications).';
    }

    return (
      <div
        className="fs-card"
        style={{
          backgroundColor: bg,
          border: `1.5px solid ${border}`,
          marginBottom: '20px',
          padding: '16px 20px',
          borderRadius: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: border }}>{title}</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>{subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {onNavigateToFinancialStatements && (
              <button className="fs-btn fs-btn-outline" onClick={onNavigateToFinancialStatements}>
                📊 Financial Statements
              </button>
            )}
            {onNavigateToNotes && (
              <button className="fs-btn fs-btn-outline" onClick={onNavigateToNotes}>
                📑 Notes & Schedules
              </button>
            )}
            {onNavigateToConsolidation && (
              <button className="fs-btn fs-btn-outline" onClick={onNavigateToConsolidation}>
                🔄 Consolidation
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fs-workbench">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="fs-header">
        <div>
          <h1 className="fs-title">Phase 13: Final Validation Engine</h1>
          <p className="fs-subtitle">
            Centralized, read-only validation layer auditing Phases 1–12 for internal consistency, completeness, and mathematical accuracy
          </p>
        </div>
        <div className="fs-header-actions">
          <button
            className="fs-btn fs-btn-secondary"
            onClick={handleExportReport}
            disabled={loading || !validationData}
            title="Export validation report with resolutions"
          >
            📥 Export Validation Report
          </button>
          <button
            className="fs-btn fs-btn-secondary"
            onClick={handleRunTests}
            disabled={runningTests}
            title="Run 27 automated Phase 13 verification tests"
          >
            {runningTests ? 'Running Tests...' : '🛡️ Run Phase 13 Tests (27)'}
          </button>
          <button
            className="fs-btn fs-btn-primary"
            onClick={runValidation}
            disabled={loading}
          >
            {loading ? 'Validating...' : '🔄 Re-run Validation'}
          </button>
        </div>
      </div>

      {/* ── Notifications ───────────────────────────────────────────────── */}
      {exportNotice && (
        <div className="fs-alert fs-alert-success" style={{ marginBottom: '16px' }}>
          {exportNotice}
        </div>
      )}
      {error && (
        <div className="fs-alert fs-alert-danger" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* ── Scope Selectors ─────────────────────────────────────────────── */}
      <div className="fs-card fs-control-panel">
        <div className="fs-control-grid">
          <div className="fs-control-item">
            <label>Financial Year:</label>
            <select
              value={selectedFyId}
              onChange={e => setSelectedFyId(e.target.value)}
              disabled={loading}
            >
              {financialYears.map(fy => (
                <option key={fy.id} value={fy.id}>{fy.label}</option>
              ))}
            </select>
          </div>

          <div className="fs-control-item">
            <label>Reporting Scope:</label>
            <div className="fs-pill-toggle">
              <button
                className={`fs-pill-btn ${scope === 'CONSOLIDATED' ? 'active' : ''}`}
                onClick={() => setScope('CONSOLIDATED')}
              >
                Consolidated
              </button>
              <button
                className={`fs-pill-btn ${scope === 'UNIT' ? 'active' : ''}`}
                onClick={() => setScope('UNIT')}
              >
                Specific Unit
              </button>
            </div>
          </div>

          {scope === 'UNIT' ? (
            <div className="fs-control-item">
              <label>Business Unit:</label>
              <select
                value={selectedUnitId}
                onChange={e => setSelectedUnitId(e.target.value)}
                disabled={loading}
              >
                {units.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="fs-control-item">
              <label>Consolidation Run:</label>
              <select
                value={selectedRunId}
                onChange={e => setSelectedRunId(e.target.value)}
                disabled={loading}
              >
                <option value="">Latest Active Consolidation</option>
                {consolidationRuns.map(r => (
                  <option key={r.id} value={r.id}>{r.runNumber} ({r.status})</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Overall Status Banner ───────────────────────────────────────── */}
      {getOverallStatusBanner()}

      {/* ── Summary Metric Cards ────────────────────────────────────────── */}
      {validationData && (
        <div className="fs-summary-cards" style={{ marginBottom: '20px' }}>
          <div className="fs-summary-card">
            <span className="fs-card-label">Total Checks</span>
            <span className="fs-card-value">{validationData.summary.totalChecks}</span>
          </div>
          <div className="fs-summary-card" style={{ borderLeft: '4px solid #10b981' }}>
            <span className="fs-card-label">Passed</span>
            <span className="fs-card-value" style={{ color: '#10b981' }}>{validationData.summary.passed}</span>
          </div>
          <div className="fs-summary-card" style={{ borderLeft: '4px solid #f59e0b' }}>
            <span className="fs-card-label">Warnings</span>
            <span className="fs-card-value" style={{ color: '#f59e0b' }}>{validationData.summary.warnings}</span>
          </div>
          <div className="fs-summary-card" style={{ borderLeft: '4px solid #ef4444' }}>
            <span className="fs-card-label">Errors</span>
            <span className="fs-card-value" style={{ color: '#ef4444' }}>{validationData.summary.errors}</span>
          </div>
          <div className="fs-summary-card" style={{ borderLeft: '4px solid #ea580c' }}>
            <span className="fs-card-label">Blocked</span>
            <span className="fs-card-value" style={{ color: '#ea580c' }}>{validationData.summary.blocked}</span>
          </div>
        </div>
      )}

      {/* ── Filters & Search ────────────────────────────────────────────── */}
      <div className="fs-card" style={{ padding: '12px 16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Filter Severity:</span>
            <button
              className={`fs-btn fs-btn-sm ${severityFilter === 'ALL' ? 'fs-btn-primary' : 'fs-btn-secondary'}`}
              onClick={() => setSeverityFilter('ALL')}
            >
              All ({validationData?.summary.totalChecks || 0})
            </button>
            <button
              className={`fs-btn fs-btn-sm ${severityFilter === 'ERROR' ? 'fs-btn-danger' : 'fs-btn-secondary'}`}
              onClick={() => setSeverityFilter('ERROR')}
            >
              ✕ Errors ({validationData?.summary.errors || 0})
            </button>
            <button
              className={`fs-btn fs-btn-sm ${severityFilter === 'WARNING' ? 'fs-btn-warning' : 'fs-btn-secondary'}`}
              onClick={() => setSeverityFilter('WARNING')}
            >
              ⚠ Warnings ({validationData?.summary.warnings || 0})
            </button>
            {validationData?.summary.blocked ? (
              <button
                className={`fs-btn fs-btn-sm ${severityFilter === 'BLOCKED' ? 'fs-btn-primary' : 'fs-btn-secondary'}`}
                style={severityFilter === 'BLOCKED' ? { backgroundColor: '#ea580c', borderColor: '#ea580c' } : {}}
                onClick={() => setSeverityFilter('BLOCKED')}
              >
                🚫 Blocked ({validationData.summary.blocked})
              </button>
            ) : null}
            <button
              className={`fs-btn fs-btn-sm ${severityFilter === 'PASS' ? 'fs-btn-success' : 'fs-btn-secondary'}`}
              onClick={() => setSeverityFilter('PASS')}
            >
              ✓ Passed ({validationData?.summary.passed || 0})
            </button>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
            >
              <option value="ALL">All Categories</option>
              {validationData?.categoryGroups.map(g => (
                <option key={g.category} value={g.category}>{g.title} ({g.summary.totalChecks})</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Search validation ID, ledger, or resolution..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                minWidth: '260px',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Validation Results by Category ──────────────────────────────── */}
      {loading ? (
        <div className="fs-loading-container" style={{ padding: '40px', textAlign: 'center' }}>
          <div className="fs-spinner" />
          <p>Auditing and validating financial reporting pipeline across Phases 1–12...</p>
        </div>
      ) : filteredCategoryGroups.length === 0 ? (
        <div className="fs-card" style={{ padding: '40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No validation checks match the selected filter criteria.</p>
        </div>
      ) : (
        <div className="fs-category-list">
          {filteredCategoryGroups.map(group => {
            const isExpanded = expandedCategories[group.category] !== false;
            const hasErrors = group.summary.errors > 0;
            const hasWarnings = group.summary.warnings > 0;
            const hasBlocked = group.summary.blocked > 0;

            return (
              <div
                key={group.category}
                className="fs-card"
                style={{
                  marginBottom: '16px',
                  borderLeft: hasErrors
                    ? '4px solid #ef4444'
                    : hasBlocked
                    ? '4px solid #ea580c'
                    : hasWarnings
                    ? '4px solid #f59e0b'
                    : '4px solid #10b981',
                }}
              >
                {/* Accordion Header */}
                <div
                  onClick={() => toggleCategory(group.category)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
                      {isExpanded ? '▼' : '▶'}
                    </span>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>{group.title}</h3>
                    <span className="fs-badge fs-badge-secondary" style={{ fontSize: '11px' }}>
                      {group.summary.totalChecks} Checks
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {group.summary.errors > 0 && (
                      <span className="fs-badge fs-badge-danger">{group.summary.errors} Error{group.summary.errors > 1 ? 's' : ''}</span>
                    )}
                    {group.summary.warnings > 0 && (
                      <span className="fs-badge fs-badge-warning">{group.summary.warnings} Warning{group.summary.warnings > 1 ? 's' : ''}</span>
                    )}
                    {group.summary.blocked > 0 && (
                      <span className="fs-badge" style={{ background: 'rgba(234, 88, 12, 0.15)', color: '#ea580c' }}>{group.summary.blocked} Blocked</span>
                    )}
                    {group.summary.passed > 0 && (
                      <span className="fs-badge fs-badge-success">{group.summary.passed} Passed</span>
                    )}
                  </div>
                </div>

                {/* Checks Table */}
                {isExpanded && (
                  <div style={{ marginTop: '16px', overflowX: 'auto' }}>
                    <table className="fs-table" style={{ width: '100%', fontSize: '13px' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '90px' }}>Status</th>
                          <th style={{ width: '220px' }}>Validation ID</th>
                          <th>Description</th>
                          <th style={{ width: '140px' }}>Affected Module</th>
                          <th style={{ width: '120px' }}>Discrepancy</th>
                          <th style={{ width: '280px' }}>Resolution Guidance</th>
                          <th style={{ width: '80px', textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.results.map((res, idx) => (
                          <tr
                            key={`${res.validation_id}-${idx}`}
                            style={{
                              backgroundColor: res.status === 'BLOCKED'
                                ? 'rgba(234, 88, 12, 0.03)'
                                : res.severity === 'ERROR'
                                ? 'rgba(239, 68, 68, 0.03)'
                                : res.severity === 'WARNING'
                                ? 'rgba(245, 158, 11, 0.03)'
                                : 'transparent',
                            }}
                          >
                            <td>{getStatusBadge(res.status || res.severity)}</td>
                            <td>
                              <strong style={{ fontFamily: 'monospace', fontSize: '12px' }}>{res.validation_id}</strong>
                              {res.affected_ledger && (
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                  Ledger: {res.affected_ledger}
                                </div>
                              )}
                            </td>
                            <td>
                              <div style={{ lineHeight: '1.4' }}>{res.description}</div>
                              {res.unitName && (
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                  Unit: {res.unitName}
                                </div>
                              )}
                            </td>
                            <td>
                              <span className="fs-badge fs-badge-secondary" style={{ fontSize: '11px' }}>
                                {res.affected_module}
                              </span>
                            </td>
                            <td style={{ fontFamily: 'monospace' }}>
                              {res.amount ? (
                                <span style={{ color: res.severity === 'ERROR' ? '#ef4444' : 'inherit', fontWeight: 600 }}>
                                  {formatINRValue(res.amount)}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)' }}>₹0.00</span>
                              )}
                            </td>
                            <td>
                              <div
                                style={{
                                  fontSize: '12px',
                                  color: res.severity === 'ERROR' ? '#b91c1c' : res.severity === 'WARNING' ? '#b45309' : 'var(--text-secondary)',
                                  lineHeight: '1.4',
                                }}
                              >
                                {res.resolution}
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {res.lineage?.statementLineId || res.lineage?.ledgerId ? (
                                <button
                                  className="fs-btn fs-btn-sm fs-btn-outline"
                                  onClick={() => handleOpenDrillDown(res)}
                                  title="View audit drilldown lineage"
                                  style={{ padding: '4px 8px', fontSize: '11px' }}
                                >
                                  🔍 Trace
                                </button>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Lineage / Drill-down Modal ───────────────────────────────────── */}
      {drillDownModalOpen && selectedResult && (
        <div className="fs-modal-overlay">
          <div className="fs-modal" style={{ maxWidth: '850px' }}>
            <div className="fs-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Audit Lineage & Diagnostic Trace</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Validation ID: {selectedResult.validation_id} | {selectedResult.affected_module}
                </span>
              </div>
              <button className="fs-modal-close" onClick={() => setDrillDownModalOpen(false)}>×</button>
            </div>

            <div className="fs-modal-body">
              <div className="fs-card" style={{ backgroundColor: 'var(--bg-secondary)', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '13px' }}>
                  <div><strong>Severity:</strong> {getStatusBadge(selectedResult.status || selectedResult.severity)}</div>
                  <div><strong>Category:</strong> {selectedResult.category}</div>
                  <div><strong>Discrepancy:</strong> {formatINRValue(selectedResult.amount)}</div>
                </div>
                <div style={{ marginTop: '10px', fontSize: '13px' }}>
                  <strong>Description:</strong> {selectedResult.description}
                </div>
                <div style={{ marginTop: '8px', fontSize: '13px', color: '#b91c1c' }}>
                  <strong>Actionable Resolution:</strong> {selectedResult.resolution}
                </div>
              </div>

              <h4 style={{ margin: '16px 0 8px 0', fontSize: '14px' }}>Underlying Lineage & Ledger Contributions</h4>

              {drillDownLoading ? (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <div className="fs-spinner" />
                  <p>Loading ledger lineage...</p>
                </div>
              ) : drillDownData && drillDownData.ledgers.length > 0 ? (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <table className="fs-table" style={{ width: '100%', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>Ledger Name</th>
                        <th>Unit</th>
                        <th>Reporting Node</th>
                        <th style={{ textAlign: 'right' }}>Debit</th>
                        <th style={{ textAlign: 'right' }}>Credit</th>
                        <th style={{ textAlign: 'right' }}>Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillDownData.ledgers.map((l, idx) => (
                        <tr key={`${l.ledgerId}-${idx}`}>
                          <td><strong>{l.ledgerName}</strong></td>
                          <td>{l.unitName}</td>
                          <td>{l.nodeName} ({l.nodeCode})</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatINRValue(l.cyDebit)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatINRValue(l.cyCredit)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{formatINRValue(l.cyNet)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  {selectedResult.affected_ledger ? (
                    <p>Affected Ledger: <strong>{selectedResult.affected_ledger}</strong></p>
                  ) : (
                    <p>No additional sub-ledger lineage items for this validation item.</p>
                  )}
                </div>
              )}
            </div>

            <div className="fs-modal-footer">
              <button className="fs-btn fs-btn-secondary" onClick={() => setDrillDownModalOpen(false)}>
                Close Trace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Automated Verification Test Suite Modal ─────────────────────── */}
      {testModalOpen && (
        <div className="fs-modal-overlay">
          <div className="fs-modal" style={{ maxWidth: '850px' }}>
            <div className="fs-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Phase 13 Final Validation Test Suite Results (27 Tests)</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Comprehensive verification of accounting tolerance, double-counting, signed stock movement, PPE roll-forwards, and upstream isolation
                </span>
              </div>
              <button className="fs-modal-close" onClick={() => setTestModalOpen(false)}>×</button>
            </div>

            <div className="fs-modal-body" style={{ maxHeight: '550px', overflowY: 'auto' }}>
              {runningTests ? (
                <div className="fs-loading-container">
                  <div className="fs-spinner" />
                  <p>Executing 27 automated Phase 13 verification tests...</p>
                </div>
              ) : testResults ? (
                <div>
                  <div
                    className="fs-card"
                    style={{
                      backgroundColor: testResults.allPassed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      border: `1.5px solid ${testResults.allPassed ? '#10b981' : '#ef4444'}`,
                      marginBottom: '16px',
                      padding: '12px 16px',
                    }}
                  >
                    <h4 style={{ margin: 0, color: testResults.allPassed ? '#10b981' : '#ef4444' }}>
                      {testResults.allPassed
                        ? `✓ All ${testResults.totalTests} Phase 13 Verification Tests PASSED`
                        : `✕ ${testResults.totalTests - testResults.passedTests} of ${testResults.totalTests} Tests FAILED`}
                    </h4>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {testResults.results.map((r, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 12px',
                          borderRadius: '4px',
                          backgroundColor: r.passed ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                          borderLeft: `4px solid ${r.passed ? '#10b981' : '#ef4444'}`,
                        }}
                      >
                        <span style={{ fontSize: '13px', fontWeight: 500 }}>{r.name}</span>
                        <span
                          className={`fs-badge ${r.passed ? 'fs-badge-success' : 'fs-badge-danger'}`}
                          style={{ fontSize: '11px' }}
                        >
                          {r.passed ? 'PASSED' : r.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="fs-modal-footer">
              <button
                className="fs-btn fs-btn-secondary"
                onClick={handleRunTests}
                disabled={runningTests}
              >
                {runningTests ? 'Running...' : 'Re-run Test Suite'}
              </button>
              <button className="fs-btn fs-btn-primary" onClick={() => setTestModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
