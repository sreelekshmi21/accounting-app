import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  ClassificationData,
  ClassificationRow,
  ClassificationStatus,
  ClassificationSource,
  ClassificationUpdateItem,
  FSLIRecord,
} from '../../electron-api';

interface ClassificationEngineProps {
  onNavigateToWorkbench?: () => void;
}

/** Format a number as Indian rupee with commas. */
function formatINR(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `(₹${formatted})` : `₹${formatted}`;
}

/** Confidence badge color */
function confidenceClass(score: number): string {
  if (score >= 0.85) return 'confidence-high';
  if (score >= 0.70) return 'confidence-medium';
  return 'confidence-low';
}

/** Status badge color */
function statusClass(status: ClassificationStatus): string {
  switch (status) {
    case 'Classified': return 'cls-badge-classified';
    case 'ManualOverride': return 'cls-badge-manual';
    case 'NeedsReview': return 'cls-badge-review';
    default: return 'cls-badge-unclassified';
  }
}

export default function ClassificationEngine({ onNavigateToWorkbench }: ClassificationEngineProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [data, setData] = useState<ClassificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'CY' | 'PY'>('CY');

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | ClassificationStatus>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | ClassificationSource>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Manual edit modal
  const [editRow, setEditRow] = useState<ClassificationRow | null>(null);
  const [editChildFSLIId, setEditChildFSLIId] = useState<string>('');
  const [editParentFSLIId, setEditParentFSLIId] = useState<string>('');
  const [editAppClassification, setEditAppClassification] = useState<string>('');
  const [fsliSearch, setFsliSearch] = useState('');

  // Action states
  const [autoClassifying, setAutoClassifying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pending changes (unsaved manual edits)
  const [pendingChanges, setPendingChanges] = useState<Map<string, ClassificationUpdateItem>>(new Map());

  // ── Determine CY and PY Financial Years ───────────────────────────────────
  const cyFY = useMemo(() => {
    if (!data || data.financialYears.length === 0) return null;
    // CY is the most recent FY with data, or the first FY with data
    const withData = data.financialYears.filter(fy => fy.hasData);
    return withData.length > 0 ? withData[0] : data.financialYears[0];
  }, [data]);

  const pyFY = useMemo(() => {
    if (!data || data.financialYears.length < 2) return null;
    const withData = data.financialYears.filter(fy => fy.hasData);
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
      if (window.electronAPI?.getClassificationData) {
        const res = await window.electronAPI.getClassificationData(fyId);
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
      setPendingChanges(new Map());
    }
  }, [activeFYId, loadData]);

  // Auto-dismiss toasts
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ── Filter Rows ───────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!data) return [];
    let rows = data.rows;

    if (statusFilter !== 'ALL') {
      rows = rows.filter(r => r.status === statusFilter);
    }
    if (sourceFilter !== 'ALL') {
      rows = rows.filter(r => r.classificationSource === sourceFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r =>
        r.ledgerName.toLowerCase().includes(q) ||
        (r.tallyGroupName || '').toLowerCase().includes(q) ||
        (r.applicationClassification || '').toLowerCase().includes(q) ||
        (r.childFSLIName || '').toLowerCase().includes(q) ||
        (r.parentFSLIName || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [data, statusFilter, sourceFilter, searchQuery]);

  // ── FSLI Lists for dropdowns ──────────────────────────────────────────────
  const topLevelFSLIs = useMemo(() => {
    if (!data) return [];
    return data.fslis.filter(f => !f.parentFSLIId);
  }, [data]);

  const childFSLIs = useMemo(() => {
    if (!data) return [];
    return data.fslis.filter(f => f.parentFSLIId);
  }, [data]);

  const filteredFSLIsForEdit = useMemo(() => {
    const all = data?.fslis || [];
    if (!fsliSearch.trim()) return all;
    const q = fsliSearch.toLowerCase();
    return all.filter(f =>
      f.fsliName.toLowerCase().includes(q) ||
      (f.fsliCode || '').toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q)
    );
  }, [data, fsliSearch]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleAutoClassify = async () => {
    if (!activeFYId) return;
    try {
      setAutoClassifying(true);
      const result = await window.electronAPI.autoClassifyLedgers(activeFYId);
      setToast({
        message: `Auto-classified ${result.classifiedCount} ledgers (${result.skippedCount} manual overrides preserved)`,
        type: 'success',
      });
      setPendingChanges(new Map());
      await loadData(activeFYId);
    } catch (err) {
      setToast({ message: `Auto-classify failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setAutoClassifying(false);
    }
  };

  const handleReset = async () => {
    if (!activeFYId) return;
    const confirmed = window.confirm(
      'This will remove all classification decisions for the selected financial year.\n\n' +
      'Original Tally classifications and Phase 5 mappings will NOT be affected.\n\n' +
      'Continue?'
    );
    if (!confirmed) return;

    try {
      setResetting(true);
      const result = await window.electronAPI.resetClassifications(activeFYId);
      setToast({
        message: `Reset complete — ${result.deletedCount} classification(s) removed`,
        type: 'info',
      });
      setPendingChanges(new Map());
      await loadData(activeFYId);
    } catch (err) {
      setToast({ message: `Reset failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setResetting(false);
    }
  };

  const handleSave = async () => {
    if (!activeFYId || pendingChanges.size === 0) return;
    try {
      setSaving(true);
      const items = Array.from(pendingChanges.values());
      const result = await window.electronAPI.saveClassifications(activeFYId, items);
      setToast({
        message: `Saved ${result.savedCount} classification(s)`,
        type: 'success',
      });
      setPendingChanges(new Map());
      await loadData(activeFYId);
    } catch (err) {
      setToast({ message: `Save failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ── Manual Edit ───────────────────────────────────────────────────────────

  const openEditModal = (row: ClassificationRow) => {
    setEditRow(row);
    setEditChildFSLIId(row.childFSLIId || '');
    setEditParentFSLIId(row.parentFSLIId || '');
    setEditAppClassification(row.applicationClassification || '');
    setFsliSearch('');
  };

  const handleEditSave = () => {
    if (!editRow) return;

    // Resolve names for display
    const childFSLI = data?.fslis.find(f => f.id === editChildFSLIId);
    const parentFSLI = data?.fslis.find(f => f.id === editParentFSLIId);

    // Determine final FSLI: parent if set, otherwise child
    const finalFSLIId = editParentFSLIId || editChildFSLIId || null;

    const update: ClassificationUpdateItem = {
      ledgerId: editRow.ledgerId,
      applicationClassification: editAppClassification || childFSLI?.fsliName || editRow.applicationClassification || undefined,
      childFSLIId: editChildFSLIId || null,
      parentFSLIId: editParentFSLIId || null,
      finalFSLIId,
      classificationSource: 'MANUAL',
      confidenceScore: 1.0,
      reason: 'Manual classification by user',
      isManualOverride: true,
      status: 'ManualOverride',
    };

    setPendingChanges(prev => {
      const next = new Map(prev);
      next.set(editRow.ledgerId, update);
      return next;
    });

    setEditRow(null);
    setToast({ message: `Classification updated for "${editRow.ledgerName}" — click Save to persist`, type: 'info' });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="cls-loading">
        <div className="cls-spinner" />
        <p>Loading Classification Engine…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cls-error">
        <h3>⚠ Error</h3>
        <p>{error}</p>
        <button className="cls-btn cls-btn-primary" onClick={() => loadData()}>Retry</button>
      </div>
    );
  }

  // PY tab selected but no PY data
  const showPYUnavailable = activeTab === 'PY' && !pyAvailable;

  return (
    <div className="cls-engine">
      {/* Toast */}
      {toast && (
        <div className={`cls-toast cls-toast-${toast.type}`}>
          {toast.message}
          <button onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* Header */}
      <div className="cls-header">
        <div className="cls-header-left">
          <h2>Classification Engine</h2>
          <span className="cls-header-phase">Phase 6</span>
        </div>
        <div className="cls-header-actions">
          <button
            className="cls-btn cls-btn-auto"
            onClick={handleAutoClassify}
            disabled={autoClassifying || showPYUnavailable || !activeFYId}
          >
            {autoClassifying ? '⏳ Classifying…' : '⚡ Auto Classify'}
          </button>
          <button
            className="cls-btn cls-btn-reset"
            onClick={handleReset}
            disabled={resetting || showPYUnavailable || !activeFYId}
          >
            {resetting ? '⏳ Resetting…' : '↺ Reset'}
          </button>
          <button
            className="cls-btn cls-btn-save"
            onClick={handleSave}
            disabled={saving || pendingChanges.size === 0}
          >
            {saving ? '⏳ Saving…' : `💾 Save${pendingChanges.size > 0 ? ` (${pendingChanges.size})` : ''}`}
          </button>
        </div>
      </div>

      {/* CY / PY Tabs */}
      <div className="cls-tabs">
        <button
          className={`cls-tab ${activeTab === 'CY' ? 'cls-tab-active' : ''}`}
          onClick={() => setActiveTab('CY')}
        >
          CY — {cyFY?.yearLabel || '2025-26'}
        </button>
        <button
          className={`cls-tab ${activeTab === 'PY' ? 'cls-tab-active' : ''}`}
          onClick={() => setActiveTab('PY')}
        >
          PY — {pyFY?.yearLabel || 'Previous Year'}
          {!pyAvailable && <span className="cls-tab-badge">N/A</span>}
        </button>
      </div>

      {/* PY Unavailable */}
      {showPYUnavailable && (
        <div className="cls-py-unavailable">
          <div className="cls-py-unavailable-icon">📭</div>
          <h3>Previous Year — Not Available / Not Imported</h3>
          <p>
            No Previous Year Trial Balance has been imported for this entity.
            Import a PY Trial Balance through the Trial Balance page to enable PY classification.
          </p>
          <p className="cls-py-unavailable-note">
            CY classification is fully functional and independent of PY data.
            When PY is imported later, it will be classified independently.
          </p>
        </div>
      )}

      {/* Main Content */}
      {!showPYUnavailable && (
        <>
          {/* Summary KPIs */}
          {data && (
            <div className="cls-summary">
              <div className="cls-kpi">
                <span className="cls-kpi-value">{data.summary.totalLedgers}</span>
                <span className="cls-kpi-label">Total Ledgers</span>
              </div>
              <div className="cls-kpi cls-kpi-classified">
                <span className="cls-kpi-value">{data.summary.classifiedCount}</span>
                <span className="cls-kpi-label">Classified</span>
              </div>
              <div className="cls-kpi cls-kpi-unclassified">
                <span className="cls-kpi-value">{data.summary.unclassifiedCount}</span>
                <span className="cls-kpi-label">Unclassified</span>
              </div>
              <div className="cls-kpi cls-kpi-review">
                <span className="cls-kpi-value">{data.summary.needsReviewCount}</span>
                <span className="cls-kpi-label">Needs Review</span>
              </div>
              <div className="cls-kpi cls-kpi-manual">
                <span className="cls-kpi-value">{data.summary.manualOverrideCount}</span>
                <span className="cls-kpi-label">Manual Override</span>
              </div>
              <div className="cls-kpi cls-kpi-auto">
                <span className="cls-kpi-value">{data.summary.autoClassifiedCount}</span>
                <span className="cls-kpi-label">Auto-Classified</span>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="cls-filters">
            <div className="cls-filter-group">
              <label>Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
                <option value="ALL">All Status</option>
                <option value="Classified">Classified</option>
                <option value="Unclassified">Unclassified</option>
                <option value="NeedsReview">Needs Review</option>
                <option value="ManualOverride">Manual Override</option>
              </select>
            </div>
            <div className="cls-filter-group">
              <label>Source</label>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as any)}>
                <option value="ALL">All Sources</option>
                <option value="AUTO">Auto</option>
                <option value="MANUAL">Manual</option>
                <option value="RULE">Rule</option>
                <option value="MAPPING">Mapping</option>
                <option value="PENDING">Pending</option>
              </select>
            </div>
            <div className="cls-filter-group cls-filter-search">
              <label>Search</label>
              <input
                type="text"
                placeholder="Search ledger, group, FSLI…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="cls-filter-count">
              {filteredRows.length} of {data?.summary.totalLedgers || 0} ledgers
            </div>
          </div>

          {/* Data Table */}
          <div className="cls-table-container">
            {filteredRows.length === 0 ? (
              <div className="cls-empty">
                <p>No ledgers found. {data?.summary.totalLedgers === 0
                  ? 'Import a Trial Balance first.'
                  : 'Try adjusting your filters.'}</p>
              </div>
            ) : (
              <table className="cls-table">
                <thead>
                  <tr>
                    <th className="cls-col-ledger">Ledger</th>
                    <th className="cls-col-group">Tally Group</th>
                    <th className="cls-col-balance">Balance</th>
                    <th className="cls-col-orig">Original Tally Classification</th>
                    <th className="cls-col-app">Application Classification</th>
                    <th className="cls-col-child">Child FSLI</th>
                    <th className="cls-col-parent">Parent FSLI</th>
                    <th className="cls-col-source">Source</th>
                    <th className="cls-col-conf">Confidence</th>
                    <th className="cls-col-reason">Reason</th>
                    <th className="cls-col-status">Status</th>
                    <th className="cls-col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const hasPending = pendingChanges.has(row.ledgerId);
                    return (
                      <tr
                        key={row.ledgerId}
                        className={`${hasPending ? 'cls-row-pending' : ''} ${row.isManualOverride ? 'cls-row-manual' : ''}`}
                      >
                        <td className="cls-col-ledger" title={row.ledgerName}>
                          <span className="cls-ledger-name">{row.ledgerName}</span>
                        </td>
                        <td className="cls-col-group">{row.tallyGroupName || '—'}</td>
                        <td className={`cls-col-balance cls-balance-${row.balanceNature.toLowerCase()}`}>
                          {formatINR(row.netBalance)}
                        </td>
                        <td className="cls-col-orig">
                          {row.originalTallyClassification || '—'}
                        </td>
                        <td className="cls-col-app">
                          {hasPending
                            ? <span className="cls-pending-value">{pendingChanges.get(row.ledgerId)?.applicationClassification || '—'}</span>
                            : (row.applicationClassification || <span className="cls-empty-val">—</span>)
                          }
                        </td>
                        <td className="cls-col-child">
                          {row.childFSLIName || '—'}
                        </td>
                        <td className="cls-col-parent">
                          {row.parentFSLIName || '—'}
                        </td>
                        <td className="cls-col-source">
                          <span className={`cls-source-badge cls-source-${row.classificationSource.toLowerCase()}`}>
                            {row.classificationSource}
                          </span>
                        </td>
                        <td className="cls-col-conf">
                          <div className={`cls-confidence ${confidenceClass(row.confidenceScore)}`}>
                            <div className="cls-confidence-bar" style={{ width: `${Math.round(row.confidenceScore * 100)}%` }} />
                            <span>{Math.round(row.confidenceScore * 100)}%</span>
                          </div>
                        </td>
                        <td className="cls-col-reason" title={row.reason || ''}>
                          {row.reason || '—'}
                        </td>
                        <td className="cls-col-status">
                          <span className={`cls-status-badge ${statusClass(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="cls-col-actions">
                          <button
                            className="cls-btn-edit"
                            onClick={() => openEditModal(row)}
                            title="Edit Classification"
                          >
                            ✏️
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Edit Modal */}
      {editRow && (
        <div className="cls-modal-overlay" onClick={() => setEditRow(null)}>
          <div className="cls-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cls-modal-header">
              <h3>Edit Classification</h3>
              <button className="cls-modal-close" onClick={() => setEditRow(null)}>✕</button>
            </div>
            <div className="cls-modal-body">
              <div className="cls-modal-info">
                <div className="cls-modal-info-row">
                  <label>Ledger:</label>
                  <span>{editRow.ledgerName}</span>
                </div>
                <div className="cls-modal-info-row">
                  <label>Tally Group:</label>
                  <span>{editRow.tallyGroupName || '—'}</span>
                </div>
                <div className="cls-modal-info-row">
                  <label>Balance:</label>
                  <span className={`cls-balance-${editRow.balanceNature.toLowerCase()}`}>
                    {formatINR(editRow.netBalance)}
                  </span>
                </div>
                <div className="cls-modal-info-row">
                  <label>Original Tally:</label>
                  <span>{editRow.originalTallyClassification || '—'}</span>
                </div>
              </div>

              <hr className="cls-modal-divider" />

              <div className="cls-modal-field">
                <label>Application Classification</label>
                <input
                  type="text"
                  value={editAppClassification}
                  onChange={(e) => setEditAppClassification(e.target.value)}
                  placeholder="Enter classification label…"
                />
              </div>

              <div className="cls-modal-field">
                <label>Search FSLI</label>
                <input
                  type="text"
                  value={fsliSearch}
                  onChange={(e) => setFsliSearch(e.target.value)}
                  placeholder="Search by name, code, or category…"
                />
              </div>

              <div className="cls-modal-field">
                <label>Child FSLI</label>
                <select
                  value={editChildFSLIId}
                  onChange={(e) => {
                    setEditChildFSLIId(e.target.value);
                    // Auto-set parent if child has a parent
                    const selected = data?.fslis.find(f => f.id === e.target.value);
                    if (selected?.parentFSLIId) {
                      setEditParentFSLIId(selected.parentFSLIId);
                    }
                    // Auto-fill classification name
                    if (selected && !editAppClassification) {
                      setEditAppClassification(selected.fsliName);
                    }
                  }}
                >
                  <option value="">— Select Child FSLI —</option>
                  {filteredFSLIsForEdit.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.fsliName} ({f.fsliCode}) [{f.category}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="cls-modal-field">
                <label>Parent FSLI</label>
                <select
                  value={editParentFSLIId}
                  onChange={(e) => setEditParentFSLIId(e.target.value)}
                >
                  <option value="">— Select Parent FSLI —</option>
                  {topLevelFSLIs.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.fsliName} ({f.fsliCode}) [{f.category}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="cls-modal-note">
                <strong>Note:</strong> This will mark the classification as <code>Manual Override</code>.
                Manual overrides are preserved when Auto Classify is run again.
              </div>
            </div>
            <div className="cls-modal-footer">
              <button className="cls-btn cls-btn-secondary" onClick={() => setEditRow(null)}>Cancel</button>
              <button
                className="cls-btn cls-btn-primary"
                onClick={handleEditSave}
                disabled={!editChildFSLIId && !editAppClassification}
              >
                Apply Classification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigate to Workbench */}
      {onNavigateToWorkbench && (
        <div className="cls-nav-link">
          <button className="cls-btn cls-btn-link" onClick={onNavigateToWorkbench}>
            ← Back to Account Mapping
          </button>
        </div>
      )}
    </div>
  );
}
