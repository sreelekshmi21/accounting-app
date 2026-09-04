import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  RegroupingWorkbenchData,
  RegroupingWorkbenchRow,
  RegroupingStatus,
  RegroupingRuleRecord,
  RegroupingAuditRecord,
  CreateRegroupingRuleInput,
  FSLIRecord,
} from '../../electron-api';

interface RegroupingWorkbenchProps {
  onNavigateToClassification?: () => void;
  onNavigateToMapping?: () => void;
}

/** Format currency in Indian Rupees format. */
function formatINR(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `(₹${formatted})` : `₹${formatted}`;
}

/** Confidence badge color class. */
function confidenceClass(score: number): string {
  if (score >= 0.85) return 'confidence-high';
  if (score >= 0.70) return 'confidence-medium';
  return 'confidence-low';
}

/** Status badge color class. */
function statusClass(status: RegroupingStatus): string {
  switch (status) {
    case 'Applied':
    case 'AutoApplied':
      return 'rg-badge-applied';
    case 'Approved':
      return 'rg-badge-approved';
    case 'NeedsReview':
      return 'rg-badge-review';
    case 'Rejected':
      return 'rg-badge-rejected';
    case 'Undone':
      return 'rg-badge-undone';
    case 'Obsolete':
      return 'rg-badge-obsolete';
    case 'Detected':
    default:
      return 'rg-badge-detected';
  }
}

export default function RegroupingWorkbench({
  onNavigateToClassification,
  onNavigateToMapping,
}: RegroupingWorkbenchProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [data, setData] = useState<RegroupingWorkbenchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'CY' | 'PY'>('CY');

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | RegroupingStatus>('ALL');
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Action states
  const [generating, setGenerating] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Change modal
  const [changeRow, setChangeRow] = useState<RegroupingWorkbenchRow | null>(null);
  const [changeTargetFSLIId, setChangeTargetFSLIId] = useState('');
  const [changeClassification, setChangeClassification] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [fsliSearch, setFsliSearch] = useState('');

  // Create Rule modal
  const [ruleModalCandidate, setRuleModalCandidate] = useState<RegroupingWorkbenchRow | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [ruleDescription, setRuleDescription] = useState('');
  const [ruleField, setRuleField] = useState<'ledger_name' | 'tally_group' | 'parent_group'>('tally_group');
  const [ruleOperator, setRuleOperator] = useState<'equals' | 'contains' | 'starts_with'>('contains');
  const [ruleValue, setRuleValue] = useState('');
  const [ruleNature, setRuleNature] = useState<'Debit' | 'Credit' | 'Zero'>('Debit');
  const [ruleTargetFSLIId, setRuleTargetFSLIId] = useState('');
  const [ruleTargetClassification, setRuleTargetClassification] = useState('');
  const [ruleAutoApply, setRuleAutoApply] = useState(false);

  // View Rules modal
  const [showRulesModal, setShowRulesModal] = useState(false);

  // Audit History modal
  const [historyRow, setHistoryRow] = useState<RegroupingWorkbenchRow | null>(null);
  const [auditRecords, setAuditRecords] = useState<RegroupingAuditRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Determine CY and PY Financial Years ───────────────────────────────────
  const cyFY = useMemo(() => {
    if (!data || data.financialYears.length === 0) return null;
    const withData = data.financialYears.filter((fy) => fy.hasData);
    return withData.length > 0 ? withData[0] : data.financialYears[0];
  }, [data]);

  const pyFY = useMemo(() => {
    if (!data || data.financialYears.length < 2) return null;
    const withData = data.financialYears.filter((fy) => fy.hasData);
    return withData.length > 1 ? withData[1] : null;
  }, [data]);

  const activeFYId = useMemo(() => {
    if (activeTab === 'PY') return pyFY?.id || null;
    return cyFY?.id || data?.activeFinancialYearId || null;
  }, [activeTab, cyFY, pyFY, data]);

  const pyAvailable = pyFY !== null && pyFY.hasData;

  // ── Load Data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async (fyId?: string) => {
    try {
      setLoading(true);
      setError(null);
      if (window.electronAPI?.getRegroupingWorkbenchData) {
        const res = await window.electronAPI.getRegroupingWorkbenchData(fyId);
        setData(res);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload when switching CY/PY
  useEffect(() => {
    if (activeFYId) {
      loadData(activeFYId);
    }
  }, [activeFYId, loadData]);

  // Auto-dismiss toasts
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ── Extract unique Units for filter dropdown ─────────────────────────────
  const availableUnits = useMemo(() => {
    if (!data) return [];
    const unitsMap = new Map<string, string>();
    for (const r of data.rows) {
      if (r.unitId && r.unitName) {
        unitsMap.set(r.unitId, r.unitName);
      }
    }
    return Array.from(unitsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  // ── Filter Rows ───────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!data) return [];
    let rows = data.rows;

    if (statusFilter !== 'ALL') {
      rows = rows.filter((r) => r.status === statusFilter);
    }
    if (unitFilter !== 'ALL') {
      rows = rows.filter((r) => r.unitId === unitFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.ledgerName.toLowerCase().includes(q) ||
          (r.tallyGroupName || '').toLowerCase().includes(q) ||
          (r.unitName || '').toLowerCase().includes(q) ||
          (r.beforeClassification || '').toLowerCase().includes(q) ||
          (r.beforeFSLIName || '').toLowerCase().includes(q) ||
          (r.proposedClassification || '').toLowerCase().includes(q) ||
          (r.proposedFSLIName || '').toLowerCase().includes(q) ||
          (r.approvedClassification || '').toLowerCase().includes(q) ||
          (r.approvedFSLIName || '').toLowerCase().includes(q) ||
          (r.reason || '').toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data, statusFilter, unitFilter, searchQuery]);

  // ── FSLI List for Dropdowns ───────────────────────────────────────────────
  const filteredFSLIsForChange = useMemo(() => {
    const all = data?.fslis || [];
    if (!fsliSearch.trim()) return all;
    const q = fsliSearch.toLowerCase();
    return all.filter(
      (f) =>
        f.fsliName.toLowerCase().includes(q) ||
        (f.fsliCode || '').toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q),
    );
  }, [data, fsliSearch]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleGenerateSuggestions = async () => {
    if (!activeFYId) return;
    try {
      setGenerating(true);
      const result = await window.electronAPI.generateRegroupingSuggestions(activeFYId);
      setToast({
        message: `Regrouping detection complete: ${result.detectedCount} detected, ${result.autoAppliedCount} auto-applied, ${result.needsReviewCount} needs review.`,
        type: 'success',
      });
      await loadData(activeFYId);
    } catch (err) {
      setToast({
        message: `Detection failed: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async (row: RegroupingWorkbenchRow) => {
    try {
      setActionInProgress(row.id);
      await window.electronAPI.approveRegrouping(row.id, 'User');
      setToast({ message: `Approved regrouping for "${row.ledgerName}"`, type: 'success' });
      await loadData(activeFYId || undefined);
    } catch (err) {
      setToast({ message: `Approve failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (row: RegroupingWorkbenchRow) => {
    const reason = window.prompt(`Enter reason for rejecting regrouping on "${row.ledgerName}":`, 'Normal business balance');
    if (reason === null) return;
    try {
      setActionInProgress(row.id);
      await window.electronAPI.rejectRegrouping(row.id, 'User', reason);
      setToast({ message: `Rejected regrouping for "${row.ledgerName}"`, type: 'info' });
      await loadData(activeFYId || undefined);
    } catch (err) {
      setToast({ message: `Reject failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleApply = async (row: RegroupingWorkbenchRow) => {
    try {
      setActionInProgress(row.id);
      await window.electronAPI.applyRegrouping(row.id, 'User');
      setToast({ message: `Applied regrouping for "${row.ledgerName}"`, type: 'success' });
      await loadData(activeFYId || undefined);
    } catch (err) {
      setToast({ message: `Apply failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleUndo = async (row: RegroupingWorkbenchRow) => {
    const reason = window.prompt(`Enter reason for undoing regrouping on "${row.ledgerName}":`, 'User requested reversal');
    if (reason === null) return;
    try {
      setActionInProgress(row.id);
      await window.electronAPI.undoRegrouping(row.id, 'User', reason);
      setToast({ message: `Regrouping undone for "${row.ledgerName}"`, type: 'info' });
      await loadData(activeFYId || undefined);
    } catch (err) {
      setToast({ message: `Undo failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setActionInProgress(null);
    }
  };

  const openChangeModal = (row: RegroupingWorkbenchRow) => {
    setChangeRow(row);
    setChangeTargetFSLIId(row.approvedFSLIId || row.proposedFSLIId || '');
    setChangeClassification(row.approvedClassification || row.proposedClassification || '');
    setChangeReason(row.reason || '');
    setFsliSearch('');
  };

  const handleChangeSave = async () => {
    if (!changeRow || !changeTargetFSLIId || !changeReason.trim()) {
      alert('Please select a target FSLI and specify a mandatory reason.');
      return;
    }
    try {
      setActionInProgress(changeRow.id);
      await window.electronAPI.changeRegrouping(
        changeRow.id,
        changeTargetFSLIId,
        changeClassification,
        changeReason,
        'User',
      );
      setToast({ message: `Updated regrouping target for "${changeRow.ledgerName}"`, type: 'success' });
      setChangeRow(null);
      await loadData(activeFYId || undefined);
    } catch (err) {
      setToast({ message: `Change failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setActionInProgress(null);
    }
  };

  const openRuleModal = (row: RegroupingWorkbenchRow) => {
    setRuleModalCandidate(row);
    setRuleName(`Rule: ${row.tallyGroupName || row.ledgerName} ${row.balanceNature} Balance`);
    setRuleDescription(`Auto-regroup ${row.tallyGroupName || row.ledgerName} with ${row.balanceNature} balance to ${row.proposedClassification || 'Asset/Liability'}`);
    setRuleField(row.tallyGroupName ? 'tally_group' : 'ledger_name');
    setRuleOperator('contains');
    setRuleValue(row.tallyGroupName || row.ledgerName);
    setRuleNature(row.balanceNature);
    setRuleTargetFSLIId(row.proposedFSLIId || '');
    setRuleTargetClassification(row.proposedClassification || '');
    setRuleAutoApply(false);
  };

  const handleCreateRuleSave = async () => {
    if (!ruleName.trim() || !ruleValue.trim() || !ruleTargetFSLIId) {
      alert('Please provide a rule name, condition value, and target FSLI.');
      return;
    }
    try {
      const input: CreateRegroupingRuleInput = {
        ruleName: ruleName.trim(),
        description: ruleDescription.trim() || undefined,
        conditions: {
          rules: [
            { field: ruleField, operator: ruleOperator, value: ruleValue.trim() },
            { field: 'balance_nature', operator: 'equals', value: ruleNature },
          ],
        },
        targetFSLIId: ruleTargetFSLIId,
        targetClassification: ruleTargetClassification || undefined,
        autoApply: ruleAutoApply,
      };

      await window.electronAPI.createRegroupingRule(input);
      setToast({
        message: `Saved rule "${ruleName}". It will be evaluated on the next "Generate Suggestions" run.`,
        type: 'success',
      });
      setRuleModalCandidate(null);
      await loadData(activeFYId || undefined);
    } catch (err) {
      setToast({ message: `Create rule failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    }
  };

  const handleToggleRuleAutoApply = async (ruleId: string, currentAuto: boolean) => {
    try {
      await window.electronAPI.toggleRegroupingRuleAutoApply(ruleId, !currentAuto);
      setToast({ message: `Updated auto-apply status for rule`, type: 'success' });
      await loadData(activeFYId || undefined);
    } catch (err) {
      setToast({ message: `Toggle failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    }
  };

  const openHistoryModal = async (row: RegroupingWorkbenchRow) => {
    setHistoryRow(row);
    setHistoryLoading(true);
    try {
      const history = await window.electronAPI.getRegroupingAuditHistory(row.id);
      setAuditRecords(history);
    } catch (err) {
      setToast({ message: `Failed to load audit history: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && !data) {
    return <div className="loading-state">Loading Regrouping Engine data...</div>;
  }

  if (error && !data) {
    return <div className="error-state">Error: {error}</div>;
  }

  const summary = data?.summary || {
    totalCandidates: 0,
    detectedCount: 0,
    needsReviewCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    appliedCount: 0,
    autoAppliedCount: 0,
    undoneCount: 0,
    obsoleteCount: 0,
  };

  return (
    <div className="workbench-page">
      {/* Toast Notification */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="workbench-header">
        <div>
          <h2>Regrouping Engine</h2>
          <p className="subtitle">
            Detect unusual debit/credit balances and propose application-level regroupings. Original classifications and trial balances remain unchanged.
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setShowRulesModal(true)}
          >
            📋 Regrouping Rules ({data?.rules.length || 0})
          </button>
          <button
            className="btn btn-primary"
            onClick={handleGenerateSuggestions}
            disabled={generating || !activeFYId}
          >
            {generating ? 'Running Detection...' : '⚡ Run Regrouping Detection'}
          </button>
        </div>
      </div>

      {/* CY / PY Tabs */}
      <div className="fy-tabs">
        <button
          className={`fy-tab ${activeTab === 'CY' ? 'active' : ''}`}
          onClick={() => setActiveTab('CY')}
        >
          📅 Current Year (CY): {cyFY?.yearLabel || 'CY'}
        </button>
        <button
          className={`fy-tab ${activeTab === 'PY' ? 'active' : ''} ${!pyAvailable ? 'disabled' : ''}`}
          onClick={() => pyAvailable && setActiveTab('PY')}
          disabled={!pyAvailable}
          title={!pyAvailable ? 'Prior Year data not imported yet' : ''}
        >
          📅 Prior Year (PY): {pyFY?.yearLabel || 'PY (Not Available)'}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-label">Total Candidates</div>
          <div className="card-value">{summary.totalCandidates}</div>
        </div>
        <div className="summary-card" onClick={() => setStatusFilter('Detected')} style={{ cursor: 'pointer' }}>
          <div className="card-label">Detected</div>
          <div className="card-value text-info">{summary.detectedCount}</div>
        </div>
        <div className="summary-card" onClick={() => setStatusFilter('NeedsReview')} style={{ cursor: 'pointer' }}>
          <div className="card-label">Needs Review</div>
          <div className="card-value text-warning">{summary.needsReviewCount}</div>
        </div>
        <div className="summary-card" onClick={() => setStatusFilter('Approved')} style={{ cursor: 'pointer' }}>
          <div className="card-label">Approved</div>
          <div className="card-value text-primary">{summary.approvedCount}</div>
        </div>
        <div className="summary-card" onClick={() => setStatusFilter('Applied')} style={{ cursor: 'pointer' }}>
          <div className="card-label">Applied</div>
          <div className="card-value text-success">{summary.appliedCount + summary.autoAppliedCount}</div>
        </div>
        <div className="summary-card" onClick={() => setStatusFilter('Rejected')} style={{ cursor: 'pointer' }}>
          <div className="card-label">Rejected</div>
          <div className="card-value text-danger">{summary.rejectedCount}</div>
        </div>
        {summary.obsoleteCount > 0 && (
          <div className="summary-card" onClick={() => setStatusFilter('Obsolete')} style={{ cursor: 'pointer' }}>
            <div className="card-label">Obsolete</div>
            <div className="card-value text-muted">{summary.obsoleteCount}</div>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="filter-group">
          <label>Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | RegroupingStatus)}
          >
            <option value="ALL">All Statuses ({data?.rows.length || 0})</option>
            <option value="Detected">Detected ({summary.detectedCount})</option>
            <option value="NeedsReview">Needs Review ({summary.needsReviewCount})</option>
            <option value="Approved">Approved ({summary.approvedCount})</option>
            <option value="Applied">Applied ({summary.appliedCount})</option>
            <option value="AutoApplied">Auto-Applied ({summary.autoAppliedCount})</option>
            <option value="Rejected">Rejected ({summary.rejectedCount})</option>
            <option value="Undone">Undone ({summary.undoneCount})</option>
            <option value="Obsolete">Obsolete ({summary.obsoleteCount || 0})</option>
          </select>
        </div>

        {availableUnits.length > 1 && (
          <div className="filter-group">
            <label>Unit:</label>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
            >
              <option value="ALL">All Units</option>
              {availableUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="search-group" style={{ flex: 1 }}>
          <input
            type="text"
            placeholder="Search by ledger name, tally group, FSLI, or reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="table-container">
        {filteredRows.length === 0 ? (
          <div className="empty-state">
            <p>No regrouping candidates found matching the selected filters.</p>
            {data?.rows.length === 0 && (
              <button
                className="btn btn-primary"
                onClick={handleGenerateSuggestions}
                disabled={generating}
                style={{ marginTop: '12px' }}
              >
                ⚡ Run Regrouping Detection
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Unit / Ledger</th>
                <th>Tally Group</th>
                <th>Balance</th>
                <th>Nature</th>
                <th>Before (Phase 6)</th>
                <th>Proposed Regrouping</th>
                <th>Approved Final</th>
                <th>Confidence (Det / Rec)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isWorking = actionInProgress === row.id;
                return (
                  <tr key={row.id}>
                    <td>
                      <div className="ledger-name-cell">
                        <strong>{row.ledgerName}</strong>
                        {row.unitName && <span className="unit-tag">{row.unitName}</span>}
                      </div>
                    </td>
                    <td>{row.tallyGroupName || '—'}</td>
                    <td className="amount-cell">
                      {formatINR(row.balanceNet)}
                    </td>
                    <td>
                      <span className={`nature-badge nature-${row.balanceNature.toLowerCase()}`}>
                        {row.balanceNature}
                      </span>
                    </td>
                    <td>
                      <div className="cls-cell">
                        <div className="cls-app-name">{row.applicationClassification || 'Unclassified'}</div>
                        {row.beforeFSLIName && (
                          <div className="cls-sub-name">{row.beforeFSLIName}</div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="cls-cell">
                        <div className="cls-app-name text-info">{row.proposedClassification || '—'}</div>
                        {row.proposedFSLIName && (
                          <div className="cls-sub-name">{row.proposedFSLIName}</div>
                        )}
                        {row.reason && (
                          <div className="rg-reason" title={row.reason}>💡 {row.reason}</div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="cls-cell">
                        {row.approvedClassification ? (
                          <>
                            <div className="cls-app-name text-success">
                              {row.approvedClassification}
                            </div>
                            {row.approvedFSLIName && (
                              <div className="cls-sub-name">{row.approvedFSLIName}</div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted">Pending approval</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span className={`confidence-badge ${confidenceClass(row.detectionConfidence ?? 1.0)}`} title="Detection Confidence: Confidence that balance meets regrouping anomaly condition">
                          Det: {Math.round((row.detectionConfidence ?? 1.0) * 100)}%
                        </span>
                        <span className={`confidence-badge ${confidenceClass(row.recommendationConfidence ?? row.confidence ?? 0.85)}`} title="Recommendation Confidence: Confidence in suggested target FSLI">
                          Rec: {Math.round((row.recommendationConfidence ?? row.confidence ?? 0.85) * 100)}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${statusClass(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <div className="row-actions">
                        {/* Approve */}
                        {row.status !== 'Approved' && row.status !== 'Applied' && row.status !== 'AutoApplied' && (
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => handleApprove(row)}
                            disabled={isWorking}
                            title="Approve proposed regrouping"
                          >
                            ✓ Approve
                          </button>
                        )}

                        {/* Apply */}
                        {(row.status === 'Approved' || row.status === 'Detected') && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleApply(row)}
                            disabled={isWorking}
                            title="Apply regrouping to financial reporting"
                          >
                            🚀 Apply
                          </button>
                        )}

                        {/* Undo */}
                        {(row.status === 'Applied' || row.status === 'AutoApplied') && (
                          <button
                            className="btn btn-sm btn-warning"
                            onClick={() => handleUndo(row)}
                            disabled={isWorking}
                            title="Undo application"
                          >
                            ↩ Undo
                          </button>
                        )}

                        {/* Change */}
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => openChangeModal(row)}
                          disabled={isWorking}
                          title="Change target FSLI manually"
                        >
                          ✎ Change
                        </button>

                        {/* Reject */}
                        {row.status !== 'Rejected' && (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleReject(row)}
                            disabled={isWorking}
                            title="Reject regrouping proposal"
                          >
                            ✗ Reject
                          </button>
                        )}

                        {/* Create Rule */}
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => openRuleModal(row)}
                          disabled={isWorking}
                          title="Create reusable regrouping rule"
                        >
                          + Rule
                        </button>

                        {/* History */}
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => openHistoryModal(row)}
                          title="View audit trail"
                        >
                          📜
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal: Change Target FSLI ───────────────────────────────────────── */}
      {changeRow && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <h3>Change Regrouping Target</h3>
            <p className="subtitle">
              Ledger: <strong>{changeRow.ledgerName}</strong> ({changeRow.balanceNature} Balance of {formatINR(changeRow.balanceNet)})
            </p>

            <div className="modal-body">
              <div className="form-group">
                <label>Filter FSLI:</label>
                <input
                  type="text"
                  placeholder="Search FSLI catalog..."
                  value={fsliSearch}
                  onChange={(e) => setFsliSearch(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Target FSLI: *</label>
                <select
                  value={changeTargetFSLIId}
                  onChange={(e) => {
                    const selId = e.target.value;
                    setChangeTargetFSLIId(selId);
                    const sel = data?.fslis.find((f) => f.id === selId);
                    if (sel) setChangeClassification(sel.fsliName);
                  }}
                  size={6}
                  style={{ width: '100%' }}
                >
                  {filteredFSLIsForChange.map((f) => (
                    <option key={f.id} value={f.id}>
                      [{f.category}] {f.fsliName} {f.fsliCode ? `(${f.fsliCode})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Classification Name:</label>
                <input
                  type="text"
                  value={changeClassification}
                  onChange={(e) => setChangeClassification(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Reason for Regrouping: *</label>
                <textarea
                  rows={3}
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="Explain why this account is being regrouped..."
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setChangeRow(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleChangeSave}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Create Regrouping Rule ───────────────────────────────────── */}
      {ruleModalCandidate && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <h3>Create Regrouping Rule</h3>
            <p className="subtitle">
              Created rules will automatically evaluate on future "Generate Suggestions" runs.
            </p>

            <div className="modal-body">
              <div className="form-group">
                <label>Rule Name: *</label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Description:</label>
                <input
                  type="text"
                  value={ruleDescription}
                  onChange={(e) => setRuleDescription(e.target.value)}
                />
              </div>

              <div className="form-row" style={{ display: 'flex', gap: '8px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Field:</label>
                  <select
                    value={ruleField}
                    onChange={(e) => setRuleField(e.target.value as any)}
                  >
                    <option value="tally_group">Tally Group</option>
                    <option value="ledger_name">Ledger Name</option>
                    <option value="parent_group">Parent Group</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Operator:</label>
                  <select
                    value={ruleOperator}
                    onChange={(e) => setRuleOperator(e.target.value as any)}
                  >
                    <option value="contains">Contains</option>
                    <option value="equals">Equals</option>
                    <option value="starts_with">Starts With</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Value:</label>
                  <input
                    type="text"
                    value={ruleValue}
                    onChange={(e) => setRuleValue(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Balance Nature Condition:</label>
                <select
                  value={ruleNature}
                  onChange={(e) => setRuleNature(e.target.value as any)}
                >
                  <option value="Debit">Debit Balance</option>
                  <option value="Credit">Credit Balance</option>
                </select>
              </div>

              <div className="form-group">
                <label>Target FSLI: *</label>
                <select
                  value={ruleTargetFSLIId}
                  onChange={(e) => {
                    const selId = e.target.value;
                    setRuleTargetFSLIId(selId);
                    const sel = data?.fslis.find((f) => f.id === selId);
                    if (sel) setRuleTargetClassification(sel.fsliName);
                  }}
                >
                  <option value="">-- Select Target FSLI --</option>
                  {data?.fslis.map((f) => (
                    <option key={f.id} value={f.id}>
                      [{f.category}] {f.fsliName} {f.fsliCode ? `(${f.fsliCode})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={ruleAutoApply}
                    onChange={(e) => setRuleAutoApply(e.target.checked)}
                  />
                  <span>
                    <strong>Allow Automatic Application (Auto-Apply)</strong>
                    <br />
                    <small className="text-muted">
                      When checked, matching items will be marked 'AutoApplied' directly during suggestion generation.
                    </small>
                  </span>
                </label>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRuleModalCandidate(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreateRuleSave}>
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Manage Rules List ────────────────────────────────────────── */}
      {showRulesModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px' }}>
            <h3>Regrouping Rules</h3>
            <p className="subtitle">
              Active rules are evaluated during suggestion generation. Toggle auto-apply to control automation.
            </p>

            <div className="modal-body">
              {data?.rules.length === 0 ? (
                <div className="empty-state">
                  <p>No user-defined regrouping rules created yet.</p>
                </div>
              ) : (
                <table className="data-table" style={{ marginTop: '12px' }}>
                  <thead>
                    <tr>
                      <th>Rule Name</th>
                      <th>Condition</th>
                      <th>Target Classification</th>
                      <th>Confidence</th>
                      <th>Auto-Apply</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.rules.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <strong>{rule.ruleName}</strong>
                          {rule.description && (
                            <div className="text-muted" style={{ fontSize: '12px' }}>{rule.description}</div>
                          )}
                        </td>
                        <td>
                          <code>{rule.conditions}</code>
                        </td>
                        <td>{rule.targetClassification || '—'}</td>
                        <td>{Math.round(rule.confidence * 100)}%</td>
                        <td>
                          <button
                            className={`btn btn-sm ${rule.autoApply ? 'btn-success' : 'btn-outline'}`}
                            onClick={() => handleToggleRuleAutoApply(rule.id, rule.autoApply)}
                          >
                            {rule.autoApply ? '✓ Enabled' : '○ Disabled'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setShowRulesModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Audit History ────────────────────────────────────────────── */}
      {historyRow && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '750px' }}>
            <h3>Regrouping Audit History</h3>
            <p className="subtitle">
              Audit log for <strong>{historyRow.ledgerName}</strong>
            </p>

            <div className="modal-body">
              {historyLoading ? (
                <div className="loading-state">Loading history...</div>
              ) : auditRecords.length === 0 ? (
                <div className="empty-state">No audit entries recorded yet.</div>
              ) : (
                <div className="audit-timeline">
                  {auditRecords.map((rec) => (
                    <div key={rec.id} className="audit-item">
                      <div className="audit-header">
                        <span className="audit-action badge">{rec.action}</span>
                        <span className="audit-time">{new Date(rec.performedAt).toLocaleString()}</span>
                        <span className="audit-user">by {rec.performedBy || 'System'}</span>
                      </div>
                      <div className="audit-body">
                        {rec.beforeClassification && rec.afterClassification && (
                          <div className="audit-diff">
                            <span className="diff-before">{rec.beforeClassification}</span>
                            <span className="diff-arrow"> → </span>
                            <span className="diff-after">{rec.afterClassification}</span>
                          </div>
                        )}
                        {rec.reason && <div className="audit-reason">Reason: {rec.reason}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setHistoryRow(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
