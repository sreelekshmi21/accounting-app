import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  ConsolidationWorkbenchData,
  ConsolidationRunRecord,
  ConsolidationEliminationRecord,
  ConsolidationAuditRecord,
  ConsolidatedTrialBalanceData,
  EliminationReviewData,
  EliminationReviewRow,
  InternalAccountType,
  EliminationMatchStatus,
  EliminationStatus,
  CreateEliminationInput,
  UpdateEliminationInput,
  AdjustedTrialBalanceData,
  ConsolidatedBalanceSheetPreviewData,
} from '../../electron-api';

interface ConsolidationWorkbenchProps {
  onNavigateToAdjustments?: () => void;
  onNavigateToRegrouping?: () => void;
  onNavigateToClassification?: () => void;
  onNavigateToMapping?: () => void;
}

/** Format currency in Indian Rupees format. */
function formatINR(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `(₹${formatted})` : `₹${formatted}`;
}

/** Status badge styling for Eliminations. */
function elimStatusClass(status: EliminationStatus): string {
  switch (status) {
    case 'Applied':
      return 'rg-badge-applied';
    case 'Approved':
      return 'rg-badge-approved';
    case 'PendingReview':
      return 'rg-badge-review';
    case 'Rejected':
      return 'rg-badge-rejected';
    case 'Reversed':
      return 'rg-badge-undone';
    case 'Draft':
    default:
      return 'rg-badge-detected';
  }
}

/** Match status badge styling. */
function matchStatusClass(status: EliminationMatchStatus): string {
  switch (status) {
    case 'Matched':
    case 'Approved':
    case 'Applied':
      return 'rg-badge-applied';
    case 'PartiallyMatched':
      return 'rg-badge-review';
    case 'NeedsReview':
    case 'Unmatched':
      return 'rg-badge-detected';
    case 'Rejected':
      return 'rg-badge-rejected';
    case 'Reversed':
      return 'rg-badge-undone';
    default:
      return 'rg-badge-detected';
  }
}

/** Consolidation Run status badge styling. */
function runStatusClass(status: string): string {
  switch (status) {
    case 'Completed':
      return 'rg-badge-applied';
    case 'InProgress':
      return 'rg-badge-review';
    case 'Cancelled':
      return 'rg-badge-rejected';
    case 'Draft':
    default:
      return 'rg-badge-detected';
  }
}

export default function ConsolidationWorkbench({
  onNavigateToAdjustments,
  onNavigateToRegrouping,
  onNavigateToClassification,
  onNavigateToMapping,
}: ConsolidationWorkbenchProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [data, setData] = useState<ConsolidationWorkbenchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Main Tabs
  const [activeTab, setActiveTab] = useState<'setup' | 'eliminations' | 'trial-balance' | 'balance-sheet' | 'audit'>('setup');

  // Active Consolidation Run
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<ConsolidationRunRecord | null>(null);

  // Review & TB Data for active run
  const [reviewData, setReviewData] = useState<EliminationReviewData | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const [tbData, setTbData] = useState<ConsolidatedTrialBalanceData | null>(null);
  const [tbLoading, setTbLoading] = useState(false);

  const [bsData, setBsData] = useState<ConsolidatedBalanceSheetPreviewData | null>(null);
  const [bsLoading, setBsLoading] = useState(false);

  // Unit Selection for New Run Setup
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());

  // Unit ATB Modal
  const [viewingUnitATB, setViewingUnitATB] = useState<{ unitId: string; unitName: string } | null>(null);
  const [unitATBData, setUnitATBData] = useState<AdjustedTrialBalanceData | null>(null);
  const [unitATBLoading, setUnitATBLoading] = useState(false);

  // Elimination Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Action / Mutating States
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Modals
  const [showNewRunModal, setShowNewRunModal] = useState(false);
  const [showManualElimModal, setShowManualElimModal] = useState(false);
  const [editingElim, setEditingElim] = useState<ConsolidationEliminationRecord | null>(null);

  // Rejection & Reversal Dialogs
  const [rejectModalElim, setRejectModalElim] = useState<EliminationReviewRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [reverseModalElim, setReverseModalElim] = useState<EliminationReviewRow | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  // Audit History
  const [auditRecords, setAuditRecords] = useState<ConsolidationAuditRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Automated Test Suite Modal
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testResults, setTestResults] = useState<{
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    results: Array<{ name: string; passed: boolean; message: string }>;
  } | null>(null);
  const [testingInProgress, setTestingInProgress] = useState(false);

  // Manual Elimination Form
  const [formSourceUnitId, setFormSourceUnitId] = useState('');
  const [formCounterpartyUnitId, setFormCounterpartyUnitId] = useState('');
  const [formSourceLedgerName, setFormSourceLedgerName] = useState('');
  const [formCounterpartyLedgerName, setFormCounterpartyLedgerName] = useState('');
  const [formType, setFormType] = useState<InternalAccountType>('Branch/Division');
  const [formDebit, setFormDebit] = useState<number | ''>('');
  const [formCredit, setFormCredit] = useState<number | ''>('');
  const [formEliminatedAmount, setFormEliminatedAmount] = useState<number | ''>('');
  const [formReason, setFormReason] = useState('');

  // ── Data Loading ──────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadWorkbenchData = useCallback(async (fyId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI.getConsolidationWorkbenchData(fyId);
      setData(res);

      // Auto-select all units that have data by default
      if (res.units) {
        const withDataIds = new Set(res.units.filter((u) => u.hasData).map((u) => u.id));
        setSelectedUnitIds(withDataIds);
      }

      // If a run is already selected, update activeRun
      if (selectedRunId && res.runs) {
        const matching = res.runs.find((r) => r.id === selectedRunId);
        if (matching) setActiveRun(matching);
      } else if (res.runs && res.runs.length > 0 && !selectedRunId) {
        // Auto-select most recent run
        setSelectedRunId(res.runs[0].id);
        setActiveRun(res.runs[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load consolidation data.');
    } finally {
      setLoading(false);
    }
  }, [selectedRunId]);

  useEffect(() => {
    loadWorkbenchData();
  }, [loadWorkbenchData]);

  // Load Review Data whenever active run changes
  const loadReviewData = useCallback(async (runId: string) => {
    setReviewLoading(true);
    try {
      const res = await window.electronAPI.getEliminationReviewData(runId);
      setReviewData(res);
    } catch (err: any) {
      showToast(err?.message || 'Failed to load elimination review data.', 'error');
    } finally {
      setReviewLoading(false);
    }
  }, [showToast]);

  // Load Consolidated TB whenever active run changes
  const loadTBData = useCallback(async (runId: string) => {
    setTbLoading(true);
    try {
      const res = await window.electronAPI.getConsolidatedTrialBalance(runId);
      setTbData(res);
    } catch (err: any) {
      showToast(err?.message || 'Failed to load consolidated trial balance.', 'error');
    } finally {
      setTbLoading(false);
    }
  }, [showToast]);

  // Load Consolidated Balance Sheet Preview whenever active run changes
  const loadBSData = useCallback(async (runId: string) => {
    setBsLoading(true);
    try {
      const res = await window.electronAPI.getConsolidatedBalanceSheetPreview(runId);
      setBsData(res);
    } catch (err: any) {
      showToast(err?.message || 'Failed to load consolidated balance sheet preview.', 'error');
    } finally {
      setBsLoading(false);
    }
  }, [showToast]);

  // Load Audit History
  const loadAuditHistory = useCallback(async (runId?: string) => {
    setAuditLoading(true);
    try {
      const res = await window.electronAPI.getConsolidationAuditHistory(runId);
      setAuditRecords(res);
    } catch (err: any) {
      showToast(err?.message || 'Failed to load audit history.', 'error');
    } finally {
      setAuditLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (selectedRunId) {
      loadReviewData(selectedRunId);
      loadTBData(selectedRunId);
      loadBSData(selectedRunId);
      loadAuditHistory(selectedRunId);
    }
  }, [selectedRunId, loadReviewData, loadTBData, loadBSData, loadAuditHistory]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleSelectRun = (run: ConsolidationRunRecord) => {
    setSelectedRunId(run.id);
    setActiveRun(run);
    setActiveTab('eliminations');
    showToast(`Switched to Consolidation Run ${run.runNumber}`, 'info');
  };

  const handleCreateRun = async () => {
    if (selectedUnitIds.size === 0) {
      showToast('Please select at least one unit for consolidation.', 'error');
      return;
    }
    if (!data?.activeFinancialYearId) {
      showToast('No active financial year found.', 'error');
      return;
    }
    setActionInProgress('create-run');
    try {
      const newRun = await window.electronAPI.createConsolidationRun({
        financialYearId: data.activeFinancialYearId,
        selectedUnitIds: Array.from(selectedUnitIds),
        createdBy: 'User',
      });
      showToast(`Consolidation Run ${newRun.runNumber} created successfully!`, 'success');
      setShowNewRunModal(false);
      await loadWorkbenchData(data.activeFinancialYearId);
      setSelectedRunId(newRun.id);
      setActiveRun(newRun);
      setActiveTab('eliminations');
    } catch (err: any) {
      showToast(err?.message || 'Failed to create consolidation run.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDetectInternalBalances = async () => {
    if (!selectedRunId) return;
    setActionInProgress('detect');
    try {
      const res = await window.electronAPI.detectInternalBalances(selectedRunId);
      showToast(
        `Detection complete: ${res.detectedCount} detected (${res.matchedCount} matched, ${res.needsReviewCount} needs review, ${res.unmatchedCount} unmatched)`,
        'success',
      );
      await loadReviewData(selectedRunId);
      await loadTBData(selectedRunId);
      await loadWorkbenchData(data?.activeFinancialYearId);
    } catch (err: any) {
      showToast(err?.message || 'Failed to run internal balance detection.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSubmitElimination = async (id: string) => {
    setActionInProgress(id);
    try {
      await window.electronAPI.submitEliminationForReview(id, 'User');
      showToast('Elimination submitted for review.', 'success');
      if (selectedRunId) {
        await loadReviewData(selectedRunId);
        await loadTBData(selectedRunId);
        await loadBSData(selectedRunId);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to submit elimination.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleApproveElimination = async (id: string) => {
    setActionInProgress(id);
    try {
      await window.electronAPI.approveElimination(id, 'Auditor');
      showToast('Elimination approved.', 'success');
      if (selectedRunId) {
        await loadReviewData(selectedRunId);
        await loadTBData(selectedRunId);
        await loadBSData(selectedRunId);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to approve elimination.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRejectElimination = async () => {
    if (!rejectModalElim) return;
    if (!rejectReason.trim()) {
      showToast('Please enter a rejection reason.', 'error');
      return;
    }
    setActionInProgress(rejectModalElim.eliminationId);
    try {
      await window.electronAPI.rejectElimination(rejectModalElim.eliminationId, rejectReason, 'Auditor');
      showToast('Elimination rejected.', 'success');
      setRejectModalElim(null);
      setRejectReason('');
      if (selectedRunId) {
        await loadReviewData(selectedRunId);
        await loadTBData(selectedRunId);
        await loadBSData(selectedRunId);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to reject elimination.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleApplyElimination = async (id: string) => {
    setActionInProgress(id);
    try {
      await window.electronAPI.applyElimination(id, 'Auditor');
      showToast('Elimination applied. (Now immutable)', 'success');
      if (selectedRunId) {
        await loadReviewData(selectedRunId);
        await loadTBData(selectedRunId);
        await loadBSData(selectedRunId);
        await loadWorkbenchData(data?.activeFinancialYearId);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to apply elimination.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReverseElimination = async () => {
    if (!reverseModalElim) return;
    if (!reverseReason.trim()) {
      showToast('Please enter a reversal reason.', 'error');
      return;
    }
    setActionInProgress(reverseModalElim.eliminationId);
    try {
      await window.electronAPI.reverseElimination(reverseModalElim.eliminationId, reverseReason, 'Auditor');
      showToast('Elimination reversed. Inverse linked entry created.', 'success');
      setReverseModalElim(null);
      setReverseReason('');
      if (selectedRunId) {
        await loadReviewData(selectedRunId);
        await loadTBData(selectedRunId);
        await loadBSData(selectedRunId);
        await loadWorkbenchData(data?.activeFinancialYearId);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to reverse elimination.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteElimination = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this draft elimination?')) return;
    setActionInProgress(id);
    try {
      await window.electronAPI.deleteConsolidationElimination(id);
      showToast('Elimination deleted.', 'success');
      if (selectedRunId) {
        await loadReviewData(selectedRunId);
        await loadTBData(selectedRunId);
        await loadBSData(selectedRunId);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete elimination.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCompleteRun = async () => {
    if (!selectedRunId) return;
    if (!window.confirm('Are you sure you want to complete this consolidation run? Final totals will be frozen.')) return;
    setActionInProgress('complete-run');
    try {
      const completed = await window.electronAPI.completeConsolidationRun(selectedRunId, 'Auditor');
      showToast(`Consolidation Run ${completed.runNumber} completed successfully!`, 'success');
      await loadWorkbenchData(data?.activeFinancialYearId);
      setActiveRun(completed);
    } catch (err: any) {
      showToast(err?.message || 'Failed to complete consolidation run.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCancelRun = async () => {
    if (!selectedRunId) return;
    if (!window.confirm('Are you sure you want to cancel this consolidation run?')) return;
    setActionInProgress('cancel-run');
    try {
      const cancelled = await window.electronAPI.cancelConsolidationRun(selectedRunId, 'Auditor');
      showToast(`Consolidation Run ${cancelled.runNumber} cancelled.`, 'info');
      await loadWorkbenchData(data?.activeFinancialYearId);
      setActiveRun(cancelled);
    } catch (err: any) {
      showToast(err?.message || 'Failed to cancel consolidation run.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleViewUnitATB = async (unitId: string, unitName: string) => {
    if (!data?.activeFinancialYearId) return;
    setViewingUnitATB({ unitId, unitName });
    setUnitATBLoading(true);
    try {
      const atb = await window.electronAPI.getUnitAdjustedTrialBalance(data.activeFinancialYearId, unitId);
      setUnitATBData(atb);
    } catch (err: any) {
      showToast(err?.message || 'Failed to load Unit Adjusted Trial Balance.', 'error');
    } finally {
      setUnitATBLoading(false);
    }
  };

  const handleRunTests = async () => {
    setTestingInProgress(true);
    setTestModalOpen(true);
    try {
      const res = await window.electronAPI.runConsolidationTests();
      setTestResults(res);
      if (res.allPassed) {
        showToast(`All ${res.totalTests} Phase 9 verification tests passed!`, 'success');
      } else {
        showToast(`${res.passedTests}/${res.totalTests} tests passed. Check test details.`, 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to run Phase 9 tests.', 'error');
    } finally {
      setTestingInProgress(false);
    }
  };

  const handleSaveManualElimination = async () => {
    if (!selectedRunId) return;
    if (!formSourceUnitId) {
      showToast('Source unit is required.', 'error');
      return;
    }
    if (!formSourceLedgerName.trim()) {
      showToast('Source ledger name is required.', 'error');
      return;
    }

    const debitAmt = Number(formDebit) || 0;
    const creditAmt = Number(formCredit) || 0;
    const elimAmt = Number(formEliminatedAmount) || Math.min(debitAmt, creditAmt);
    const diffAmt = Math.abs(debitAmt - creditAmt);

    setActionInProgress('save-manual-elim');
    try {
      await window.electronAPI.createConsolidationElimination({
        consolidationRunId: selectedRunId,
        sourceUnitId: formSourceUnitId,
        counterpartyUnitId: formCounterpartyUnitId || undefined,
        sourceLedgerName: formSourceLedgerName,
        counterpartyLedgerName: formCounterpartyLedgerName || undefined,
        internalAccountType: formType,
        debitAmount: debitAmt,
        creditAmount: creditAmt,
        eliminatedAmount: elimAmt,
        unmatchedAmount: diffAmt,
        matchingBasis: 'Manual User Elimination',
        confidence: 1.0,
        matchStatus: diffAmt === 0 ? 'Matched' : 'NeedsReview',
        reason: formReason || undefined,
        createdBy: 'User',
      });
      showToast('Manual elimination entry created.', 'success');
      setShowManualElimModal(false);
      setFormSourceUnitId('');
      setFormCounterpartyUnitId('');
      setFormSourceLedgerName('');
      setFormCounterpartyLedgerName('');
      setFormDebit('');
      setFormCredit('');
      setFormEliminatedAmount('');
      setFormReason('');
      await loadReviewData(selectedRunId);
      await loadTBData(selectedRunId);
    } catch (err: any) {
      showToast(err?.message || 'Failed to create manual elimination.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  // Toggle selection for all units
  const handleSelectAllUnits = () => {
    if (!data?.units) return;
    const all = new Set(data.units.map((u) => u.id));
    setSelectedUnitIds(all);
  };

  const handleClearAllUnits = () => {
    setSelectedUnitIds(new Set());
  };

  const handleToggleUnit = (unitId: string) => {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  // Filtered rows for Eliminations table
  const filteredEliminationRows = useMemo(() => {
    if (!reviewData) return [];
    return reviewData.rows.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter && row.matchStatus !== statusFilter) {
        return false;
      }
      if (typeFilter !== 'ALL' && row.internalAccountType !== typeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSrc = row.sourceLedgerName.toLowerCase().includes(q) || row.sourceUnitName.toLowerCase().includes(q);
        const matchCpty = (row.counterpartyLedgerName || '').toLowerCase().includes(q) || (row.counterpartyUnitName || '').toLowerCase().includes(q);
        const matchNum = row.eliminationNumber.toLowerCase().includes(q);
        if (!matchSrc && !matchCpty && !matchNum) return false;
      }
      return true;
    });
  }, [reviewData, statusFilter, typeFilter, searchQuery]);

  // ── Render Helpers ────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="rg-loading-container">
        <div className="rg-spinner" />
        <p>Loading Consolidation & Interbranch Elimination Engine...</p>
      </div>
    );
  }

  return (
    <div className="adjustments-workbench-page">
      {/* Toast Notification */}
      {toast && (
        <div className={`rg-toast rg-toast-${toast.type}`}>
          <span>{toast.message}</span>
          <button className="rg-toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {/* Header Bar */}
      <div className="rg-header">
        <div className="rg-header-left">
          <div className="rg-phase-badge">Phase 9 Layer</div>
          <h1 className="rg-title">Consolidation & Interbranch Elimination</h1>
          <span className="rg-subtitle">
            Multi-Unit Consolidation, Multi-Layer Internal Account Detection & Isolation
          </span>
        </div>

        <div className="rg-header-actions">
          {/* Active FY Pill */}
          <div className="rg-fy-pill">
            <span className="rg-fy-label">Financial Year:</span>
            <select
              value={data?.activeFinancialYearId || ''}
              onChange={(e) => loadWorkbenchData(e.target.value)}
              className="rg-fy-select"
            >
              {data?.financialYears.map((fy) => (
                <option key={fy.id} value={fy.id}>
                  {fy.yearLabel} {fy.hasData ? '(Imported)' : '(No Data)'}
                </option>
              ))}
            </select>
          </div>

          {/* Verification Test Runner */}
          <button
            className="rg-btn rg-btn-secondary"
            onClick={handleRunTests}
            disabled={testingInProgress}
            title="Run 34 automated Phase 9 verification tests"
          >
            {testingInProgress ? 'Running Tests...' : '🛡️ Run Phase 9 Tests (34)'}
          </button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="rg-tabs-nav">
        <button
          className={`rg-tab-btn ${activeTab === 'setup' ? 'active' : ''}`}
          onClick={() => setActiveTab('setup')}
        >
          ⚙️ 1. Setup & Scope ({data?.unitSummaries.length || 0} Units)
        </button>

        <button
          className={`rg-tab-btn ${activeTab === 'eliminations' ? 'active' : ''}`}
          onClick={() => setActiveTab('eliminations')}
          disabled={!selectedRunId}
        >
          🔍 2. Interbranch Eliminations {reviewData ? `(${reviewData.summary.totalDetected})` : ''}
        </button>

        <button
          className={`rg-tab-btn ${activeTab === 'trial-balance' ? 'active' : ''}`}
          onClick={() => setActiveTab('trial-balance')}
          disabled={!selectedRunId}
        >
          📊 3. Consolidated Trial Balance
        </button>

        <button
          className={`rg-tab-btn ${activeTab === 'balance-sheet' ? 'active' : ''}`}
          onClick={() => setActiveTab('balance-sheet')}
          disabled={!selectedRunId}
        >
          📑 4. Consolidated Balance Sheet
        </button>

        <button
          className={`rg-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          📜 5. Audit Trail
        </button>
      </div>

      {/* Active Run Selector Bar (when a run exists) */}
      {data?.runs && data.runs.length > 0 && activeTab !== 'setup' && (
        <div className="rg-run-bar">
          <div className="rg-run-bar-left">
            <span className="rg-run-bar-label">Active Consolidation Run:</span>
            <select
              value={selectedRunId || ''}
              onChange={(e) => {
                const r = data.runs.find((x) => x.id === e.target.value);
                if (r) handleSelectRun(r);
              }}
              className="rg-run-select"
            >
              {data.runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.runNumber} — {r.totalUnits} Units ({r.status})
                </option>
              ))}
            </select>

            {activeRun && (
              <span className={`rg-badge ${runStatusClass(activeRun.status)}`}>
                {activeRun.status}
              </span>
            )}
          </div>

          <div className="rg-run-bar-right">
            {activeRun && activeRun.status !== 'Completed' && activeRun.status !== 'Cancelled' && (
              <>
                <button
                  className="rg-btn rg-btn-primary"
                  onClick={handleCompleteRun}
                  disabled={actionInProgress === 'complete-run'}
                >
                  ✓ Complete Consolidation Run
                </button>
                <button
                  className="rg-btn rg-btn-danger-outline"
                  onClick={handleCancelRun}
                  disabled={actionInProgress === 'cancel-run'}
                >
                  ✕ Cancel Run
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: SETUP & UNIT SCOPE */}
      {activeTab === 'setup' && (
        <div className="rg-tab-content">
          {/* Pre-Consolidation KPI Cards */}
          <div className="rg-kpi-grid">
            <div className="rg-kpi-card">
              <span className="rg-kpi-title">Total Active Units</span>
              <span className="rg-kpi-value">{data?.unitSummaries.length || 0}</span>
              <span className="rg-kpi-sub">Imported Units with balances</span>
            </div>

            <div className="rg-kpi-card">
              <span className="rg-kpi-title">Consolidation Runs</span>
              <span className="rg-kpi-value">{data?.runs.length || 0}</span>
              <span className="rg-kpi-sub">
                {data?.summary.completedCount} Completed · {data?.summary.inProgressCount} In Progress
              </span>
            </div>

            <div className="rg-kpi-card">
              <span className="rg-kpi-title">Selected Units in Scope</span>
              <span className="rg-kpi-value">{selectedUnitIds.size}</span>
              <span className="rg-kpi-sub">Units selected for consolidation</span>
            </div>

            <div className="rg-kpi-card">
              <span className="rg-kpi-title">Total Internal Difference</span>
              <span className="rg-kpi-value">
                {formatINR(
                  data?.unitSummaries.reduce((sum, u) => sum + u.internalDifference, 0) || 0,
                )}
              </span>
              <span className="rg-kpi-sub">Pre-elimination internal diff</span>
            </div>
          </div>

          {/* Unit Scope Selection Table */}
          <div className="rg-section">
            <div className="rg-section-header">
              <div>
                <h3 className="rg-section-title">Pre-Consolidation Unit Balances & Scope Selection</h3>
                <p className="rg-section-subtitle">
                  Select units to include in the consolidation run. Unit balances remain isolated and unmodified.
                </p>
              </div>

              <div className="rg-section-actions">
                <button className="rg-btn rg-btn-sm" onClick={handleSelectAllUnits}>
                  Select All
                </button>
                <button className="rg-btn rg-btn-sm rg-btn-secondary" onClick={handleClearAllUnits}>
                  Clear Selection
                </button>
                <button
                  className="rg-btn rg-btn-primary"
                  onClick={() => setShowNewRunModal(true)}
                  disabled={selectedUnitIds.size === 0}
                >
                  + Create Consolidation Run ({selectedUnitIds.size} Units)
                </button>
              </div>
            </div>

            <div className="rg-table-wrapper">
              <table className="rg-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={data?.units && selectedUnitIds.size === data.units.length && data.units.length > 0}
                        onChange={(e) => (e.target.checked ? handleSelectAllUnits() : handleClearAllUnits())}
                      />
                    </th>
                    <th>Unit Name</th>
                    <th>Ledgers</th>
                    <th>Total Debit</th>
                    <th>Total Credit</th>
                    <th>Unit Difference</th>
                    <th>Branch/Div Dr</th>
                    <th>Branch/Div Cr</th>
                    <th>Santhigiri HO Dr</th>
                    <th>Santhigiri HO Cr</th>
                    <th>Internal Diff</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.unitSummaries && data.unitSummaries.length > 0 ? (
                    data.unitSummaries.map((u) => {
                      const isSelected = selectedUnitIds.has(u.unitId);
                      return (
                        <tr key={u.unitId} className={isSelected ? 'rg-row-selected' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleUnit(u.unitId)}
                            />
                          </td>
                          <td>
                            <strong>{u.unitName}</strong>
                            {u.appliedAdjustmentsCount > 0 && (
                              <span className="rg-tag rg-tag-sm" style={{ marginLeft: '6px' }}>
                                {u.appliedAdjustmentsCount} Adj
                              </span>
                            )}
                          </td>
                          <td>{u.ledgerCount}</td>
                          <td>{formatINR(u.totalDebit)}</td>
                          <td>{formatINR(u.totalCredit)}</td>
                          <td style={{ color: u.difference !== 0 ? '#ef4444' : 'inherit' }}>
                            {formatINR(u.difference)}
                          </td>
                          <td>{formatINR(u.branchDivisionDebit)}</td>
                          <td>{formatINR(u.branchDivisionCredit)}</td>
                          <td>{formatINR(u.santhigiriHODebit)}</td>
                          <td>{formatINR(u.santhigiriHOCredit)}</td>
                          <td style={{ color: u.internalDifference !== 0 ? '#f59e0b' : 'inherit' }}>
                            {formatINR(u.internalDifference)}
                          </td>
                          <td>
                            <button
                              className="rg-btn rg-btn-sm rg-btn-secondary"
                              onClick={() => handleViewUnitATB(u.unitId, u.unitName)}
                            >
                              View ATB
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={12} className="rg-empty-state">
                        No imported unit trial balances found for this financial year.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Consolidation Runs List */}
          {data?.runs && data.runs.length > 0 && (
            <div className="rg-section" style={{ marginTop: '24px' }}>
              <div className="rg-section-header">
                <div>
                  <h3 className="rg-section-title">Consolidation Runs History</h3>
                  <p className="rg-section-subtitle">
                    Past and active consolidation executions for Financial Year {data.activeFinancialYearLabel}
                  </p>
                </div>
              </div>

              <div className="rg-table-wrapper">
                <table className="rg-table">
                  <thead>
                    <tr>
                      <th>Run Number</th>
                      <th>Status</th>
                      <th>Units</th>
                      <th>Consolidated Dr</th>
                      <th>Consolidated Cr</th>
                      <th>Internal Eliminated</th>
                      <th>Unmatched Diff</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.runs.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.runNumber}</strong>
                        </td>
                        <td>
                          <span className={`rg-badge ${runStatusClass(r.status)}`}>{r.status}</span>
                        </td>
                        <td>{r.totalUnits} Units</td>
                        <td>{formatINR(r.consolidatedDebit)}</td>
                        <td>{formatINR(r.consolidatedCredit)}</td>
                        <td>{formatINR(r.internalDebit - r.internalDifference)}</td>
                        <td style={{ color: r.internalDifference !== 0 ? '#ef4444' : 'inherit' }}>
                          {formatINR(r.internalDifference)}
                        </td>
                        <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                        <td>
                          <button
                            className="rg-btn rg-btn-sm rg-btn-primary"
                            onClick={() => handleSelectRun(r)}
                          >
                            Open Run →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INTERBRANCH ELIMINATIONS REVIEW */}
      {activeTab === 'eliminations' && (
        <div className="rg-tab-content">
          {/* Review KPI Summary Cards */}
          {reviewData && (
            <div className="rg-kpi-grid">
              <div className="rg-kpi-card">
                <span className="rg-kpi-title">Detected Internals</span>
                <span className="rg-kpi-value">{reviewData.summary.totalDetected}</span>
                <span className="rg-kpi-sub">
                  {reviewData.summary.matchedCount} Matched · {reviewData.summary.needsReviewCount} Review
                </span>
              </div>

              <div className="rg-kpi-card">
                <span className="rg-kpi-title">Total Internal Debit</span>
                <span className="rg-kpi-value">{formatINR(reviewData.summary.totalInternalDebit)}</span>
                <span className="rg-kpi-sub">Across all selected units</span>
              </div>

              <div className="rg-kpi-card">
                <span className="rg-kpi-title">Total Internal Credit</span>
                <span className="rg-kpi-value">{formatINR(reviewData.summary.totalInternalCredit)}</span>
                <span className="rg-kpi-sub">Across all selected units</span>
              </div>

              <div className="rg-kpi-card">
                <span className="rg-kpi-title">Proposed Elimination</span>
                <span className="rg-kpi-value" style={{ color: '#10b981' }}>
                  {formatINR(reviewData.summary.totalProposedElimination)}
                </span>
                <span className="rg-kpi-sub">
                  {reviewData.summary.appliedCount} Applied · {reviewData.summary.approvedCount} Approved
                </span>
              </div>

              <div className="rg-kpi-card">
                <span className="rg-kpi-title">Unmatched Difference</span>
                <span
                  className="rg-kpi-value"
                  style={{ color: reviewData.summary.internalDifference !== 0 ? '#ef4444' : '#10b981' }}
                >
                  {formatINR(reviewData.summary.internalDifference)}
                </span>
                <span className="rg-kpi-sub">Reported difference (never forced)</span>
              </div>
            </div>
          )}

          {/* Action & Filter Toolbar */}
          <div className="rg-toolbar">
            <div className="rg-toolbar-left">
              <button
                className="rg-btn rg-btn-primary"
                onClick={handleDetectInternalBalances}
                disabled={actionInProgress === 'detect' || activeRun?.status === 'Completed'}
              >
                {actionInProgress === 'detect' ? 'Detecting...' : '⚡ Re-Detect Internal Balances'}
              </button>

              <button
                className="rg-btn rg-btn-secondary"
                onClick={() => setShowManualElimModal(true)}
                disabled={activeRun?.status === 'Completed'}
              >
                + Add Manual Elimination
              </button>
            </div>

            <div className="rg-toolbar-right">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rg-select-sm"
              >
                <option value="ALL">All Statuses</option>
                <option value="Matched">Matched</option>
                <option value="PartiallyMatched">Partially Matched</option>
                <option value="NeedsReview">Needs Review</option>
                <option value="Approved">Approved</option>
                <option value="Applied">Applied</option>
                <option value="Rejected">Rejected</option>
                <option value="Reversed">Reversed</option>
              </select>

              {/* Account Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rg-select-sm"
              >
                <option value="ALL">All Account Types</option>
                <option value="Branch/Division">Branch/Division</option>
                <option value="Santhigiri Ashram HO">Santhigiri Ashram HO</option>
                <option value="Other Internal">Other Internal</option>
              </select>

              {/* Search */}
              <input
                type="text"
                placeholder="Search ledger or unit..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rg-input-sm"
              />
            </div>
          </div>

          {/* Eliminations Table */}
          <div className="rg-table-wrapper">
            <table className="rg-table">
              <thead>
                <tr>
                  <th>Elimination #</th>
                  <th>Source Unit & Ledger</th>
                  <th>Counterparty Unit & Ledger</th>
                  <th>Internal Type</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Proposed Elim</th>
                  <th>Unmatched Diff</th>
                  <th>Match Status</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEliminationRows.length > 0 ? (
                  filteredEliminationRows.map((row) => {
                    const isExpanded = expandedRows.has(row.eliminationId);
                    return (
                      <React.Fragment key={row.eliminationId}>
                        <tr>
                          <td>
                            <strong>{row.eliminationNumber}</strong>
                          </td>
                          <td>
                            <div><strong>{row.sourceUnitName}</strong></div>
                            <div className="rg-sub-text">{row.sourceLedgerName}</div>
                          </td>
                          <td>
                            {row.counterpartyUnitName ? (
                              <>
                                <div><strong>{row.counterpartyUnitName}</strong></div>
                                <div className="rg-sub-text">{row.counterpartyLedgerName}</div>
                              </>
                            ) : (
                              <span className="rg-badge rg-badge-detected">No Counterparty (Single-Sided)</span>
                            )}
                          </td>
                          <td>
                            <span className="rg-tag">{row.internalAccountType}</span>
                          </td>
                          <td>{formatINR(row.debitAmount)}</td>
                          <td>{formatINR(row.creditAmount)}</td>
                          <td style={{ color: '#10b981', fontWeight: 600 }}>
                            {formatINR(row.proposedElimination)}
                          </td>
                          <td style={{ color: row.unmatchedDifference !== 0 ? '#ef4444' : 'inherit' }}>
                            {formatINR(row.unmatchedDifference)}
                          </td>
                          <td>
                            <span className={`rg-badge ${matchStatusClass(row.matchStatus)}`}>
                              {row.matchStatus} ({Math.round(row.confidence * 100)}%)
                            </span>
                          </td>
                          <td>
                            <span className={`rg-badge ${elimStatusClass(row.status)}`}>
                              {row.status}
                            </span>
                          </td>
                          <td>
                            <div className="rg-action-btn-group">
                              {/* Workflow buttons based on status */}
                              {row.status === 'Draft' && (
                                <button
                                  className="rg-btn rg-btn-xs rg-btn-primary"
                                  onClick={() => handleSubmitElimination(row.eliminationId)}
                                  disabled={actionInProgress === row.eliminationId}
                                >
                                  Submit
                                </button>
                              )}

                              {row.status === 'PendingReview' && (
                                <>
                                  <button
                                    className="rg-btn rg-btn-xs rg-btn-success"
                                    onClick={() => handleApproveElimination(row.eliminationId)}
                                    disabled={actionInProgress === row.eliminationId}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    className="rg-btn rg-btn-xs rg-btn-danger"
                                    onClick={() => setRejectModalElim(row)}
                                    disabled={actionInProgress === row.eliminationId}
                                  >
                                    Reject
                                  </button>
                                </>
                              )}

                              {row.status === 'Approved' && (
                                <button
                                  className="rg-btn rg-btn-xs rg-btn-primary"
                                  onClick={() => handleApplyElimination(row.eliminationId)}
                                  disabled={actionInProgress === row.eliminationId}
                                >
                                  Apply
                                </button>
                              )}

                              {row.status === 'Applied' && (
                                <button
                                  className="rg-btn rg-btn-xs rg-btn-warning"
                                  onClick={() => setReverseModalElim(row)}
                                  disabled={actionInProgress === row.eliminationId}
                                >
                                  Reverse
                                </button>
                              )}

                              {row.status === 'Draft' && (
                                <button
                                  className="rg-btn rg-btn-xs rg-btn-danger-outline"
                                  onClick={() => handleDeleteElimination(row.eliminationId)}
                                  disabled={actionInProgress === row.eliminationId}
                                >
                                  Delete
                                </button>
                              )}

                              {/* Expansion Toggle */}
                              <button
                                className="rg-btn rg-btn-xs rg-btn-secondary"
                                onClick={() => {
                                  setExpandedRows((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(row.eliminationId)) next.delete(row.eliminationId);
                                    else next.add(row.eliminationId);
                                    return next;
                                  });
                                }}
                              >
                                {isExpanded ? '▲ Details' : '▼ Details'}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Details Row */}
                        {isExpanded && (
                          <tr className="rg-row-expanded">
                            <td colSpan={11}>
                              <div className="rg-expanded-content">
                                <div className="rg-evidence-box">
                                  <strong>Detection Evidence Hierarchy:</strong>
                                  <p>{row.reason || 'Manual entry'}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={11} className="rg-empty-state">
                      {reviewLoading ? 'Loading review data...' : 'No interbranch eliminations match your filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CONSOLIDATED TRIAL BALANCE */}
      {activeTab === 'trial-balance' && (
        <div className="rg-tab-content">
          {tbData && (
            <>
              {/* TB KPI Summary */}
              <div className="rg-kpi-grid">
                <div className="rg-kpi-card">
                  <span className="rg-kpi-title">Before Elimination Debit</span>
                  <span className="rg-kpi-value">{formatINR(tbData.totalBeforeDebit)}</span>
                  <span className="rg-kpi-sub">Sum of selected unit ATBs</span>
                </div>

                <div className="rg-kpi-card">
                  <span className="rg-kpi-title">Elimination Debit</span>
                  <span className="rg-kpi-value" style={{ color: '#10b981' }}>
                    {formatINR(tbData.totalEliminationDebit)}
                  </span>
                  <span className="rg-kpi-sub">Total applied eliminations</span>
                </div>

                <div className="rg-kpi-card">
                  <span className="rg-kpi-title">Consolidated Debit</span>
                  <span className="rg-kpi-value">{formatINR(tbData.totalAfterDebit)}</span>
                  <span className="rg-kpi-sub">Final authorative output</span>
                </div>

                <div className="rg-kpi-card">
                  <span className="rg-kpi-title">Consolidated Credit</span>
                  <span className="rg-kpi-value">{formatINR(tbData.totalAfterCredit)}</span>
                  <span className="rg-kpi-sub">Final authorative output</span>
                </div>

                <div className="rg-kpi-card">
                  <span className="rg-kpi-title">Trial Balance Net Difference</span>
                  <span
                    className="rg-kpi-value"
                    style={{ color: tbData.finalDifference !== 0 ? '#ef4444' : '#10b981' }}
                  >
                    {formatINR(tbData.finalDifference)}
                  </span>
                  <span className="rg-kpi-sub">{tbData.finalDifference === 0 ? '✓ Balanced' : '⚠ Discrepancy'}</span>
                </div>
              </div>

              {/* Internal Control Summary Card */}
              <div className="rg-section">
                <div className="rg-section-header">
                  <div>
                    <h3 className="rg-section-title">Internal Balance Control Reconciliation</h3>
                    <p className="rg-section-subtitle">
                      Audit reconciliation between Branch/Division and Santhigiri Ashram HO internal balances
                    </p>
                  </div>
                </div>

                <div className="rg-control-grid">
                  <div className="rg-control-item">
                    <span>Branch/Division Internal Dr:</span>
                    <strong>{formatINR(tbData.internalControl.branchDivisionDebit)}</strong>
                  </div>
                  <div className="rg-control-item">
                    <span>Branch/Division Internal Cr:</span>
                    <strong>{formatINR(tbData.internalControl.branchDivisionCredit)}</strong>
                  </div>
                  <div className="rg-control-item">
                    <span>Santhigiri Ashram HO Dr:</span>
                    <strong>{formatINR(tbData.internalControl.santhigiriHODebit)}</strong>
                  </div>
                  <div className="rg-control-item">
                    <span>Santhigiri Ashram HO Cr:</span>
                    <strong>{formatINR(tbData.internalControl.santhigiriHOCredit)}</strong>
                  </div>
                  <div className="rg-control-item" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                    <span>Total Internal Debit:</span>
                    <strong>{formatINR(tbData.internalControl.totalInternalDebit)}</strong>
                  </div>
                  <div className="rg-control-item" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                    <span>Total Internal Credit:</span>
                    <strong>{formatINR(tbData.internalControl.totalInternalCredit)}</strong>
                  </div>
                  <div className="rg-control-item" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                    <span>Total Eliminated:</span>
                    <strong style={{ color: '#10b981' }}>{formatINR(tbData.internalControl.eliminationAmount)}</strong>
                  </div>
                  <div className="rg-control-item" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                    <span>Unmatched Reported Diff:</span>
                    <strong style={{ color: tbData.internalControl.unmatchedDifference !== 0 ? '#ef4444' : '#10b981' }}>
                      {formatINR(tbData.internalControl.unmatchedDifference)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Consolidated TB Grid */}
              <div className="rg-section" style={{ marginTop: '20px' }}>
                <div className="rg-table-wrapper">
                  <table className="rg-table">
                    <thead>
                      <tr>
                        <th>FSLI Code</th>
                        <th>FSLI Name</th>
                        <th>Category</th>
                        <th>Before Dr</th>
                        <th>Before Cr</th>
                        <th>Elim Dr</th>
                        <th>Elim Cr</th>
                        <th>Consolidated Dr</th>
                        <th>Consolidated Cr</th>
                        <th>Consolidated Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tbData.rows.map((r) => (
                        <tr key={r.fsliId}>
                          <td><code>{r.fsliCode || '—'}</code></td>
                          <td><strong>{r.fsliName}</strong></td>
                          <td><span className="rg-tag">{r.category}</span></td>
                          <td>{formatINR(r.beforeEliminationDebit)}</td>
                          <td>{formatINR(r.beforeEliminationCredit)}</td>
                          <td style={{ color: '#10b981' }}>{formatINR(r.eliminationDebit)}</td>
                          <td style={{ color: '#10b981' }}>{formatINR(r.eliminationCredit)}</td>
                          <td><strong>{formatINR(r.afterEliminationDebit)}</strong></td>
                          <td><strong>{formatINR(r.afterEliminationCredit)}</strong></td>
                          <td>{formatINR(r.afterEliminationNet)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 4: CONSOLIDATED BALANCE SHEET SCHEDULE */}
      {activeTab === 'balance-sheet' && (
        <div className="rg-tab-content">
          <div className="rg-section">
            <div className="rg-section-header">
              <div>
                <h3 className="rg-section-title">Consolidated Balance Sheet (Phase 9 Preview)</h3>
                <p className="rg-section-subtitle">
                  Balance sheet representation with internal Branch/Division and Santhigiri Ashram HO eliminations applied
                </p>
              </div>

              {bsData && (
                <div>
                  {bsData.isComplete ? (
                    <span
                      className="rg-tag"
                      style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        color: '#10b981',
                        fontWeight: 600,
                        padding: '6px 12px',
                      }}
                    >
                      ✓ Approved FSLI Classification (Complete)
                    </span>
                  ) : (
                    <span
                      className="rg-tag"
                      style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.15)',
                        color: '#f59e0b',
                        fontWeight: 600,
                        padding: '6px 12px',
                      }}
                    >
                      ⚠️ Pending FSLI Assignment (Incomplete Preview)
                    </span>
                  )}
                </div>
              )}
            </div>

            {bsData && (
              <>
                {/* 1. Pending FSLI Assignment Warning Banner */}
                {bsData.hasUnmappedBalances && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '14px',
                      alignItems: 'flex-start',
                      padding: '16px',
                      backgroundColor: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      borderRadius: '8px',
                      marginBottom: '20px',
                    }}
                  >
                    <span style={{ fontSize: '22px' }}>⚠️</span>
                    <div style={{ flex: 1 }}>
                      <h4
                        style={{
                          margin: '0 0 6px 0',
                          color: '#f59e0b',
                          fontSize: '14px',
                          fontWeight: 600,
                        }}
                      >
                        Pending FSLI Assignment — Consolidated Balance Sheet Incomplete
                      </h4>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '13px',
                          lineHeight: '1.5',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {bsData.warningMessage}
                      </p>
                    </div>
                  </div>
                )}

                {/* 2. BS KPI Summary */}
                <div className="rg-kpi-grid">
                  <div className="rg-kpi-card">
                    <span className="rg-kpi-title">Total Mapped Assets</span>
                    <span className="rg-kpi-value">{formatINR(bsData.totalAssetsConsolidated)}</span>
                    <span className="rg-kpi-sub">
                      Before Elim: {formatINR(bsData.totalAssetsBeforeElimination)}
                    </span>
                  </div>

                  <div className="rg-kpi-card">
                    <span className="rg-kpi-title">Total Mapped Equity & Liab</span>
                    <span className="rg-kpi-value">
                      {formatINR(bsData.totalEquityLiabilitiesConsolidated)}
                    </span>
                    <span className="rg-kpi-sub">
                      Before Elim: {formatINR(bsData.totalEquityLiabilitiesBeforeElimination)}
                    </span>
                  </div>

                  <div className="rg-kpi-card">
                    <span className="rg-kpi-title">Pending FSLI Assignment</span>
                    <span
                      className="rg-kpi-value"
                      style={{ color: bsData.unmappedDebit !== 0 ? '#f59e0b' : '#10b981' }}
                    >
                      {formatINR(bsData.unmappedDebit)}
                    </span>
                    <span className="rg-kpi-sub">
                      {bsData.hasUnmappedBalances ? '⚠ Unresolved Ledgers' : '✓ 0 Unresolved'}
                    </span>
                  </div>

                  <div className="rg-kpi-card">
                    <span className="rg-kpi-title">Applied Eliminations</span>
                    <span className="rg-kpi-value" style={{ color: '#10b981' }}>
                      {formatINR(bsData.reconciliation.totalEliminations)}
                    </span>
                    <span className="rg-kpi-sub">Total interbranch reductions</span>
                  </div>

                  <div className="rg-kpi-card">
                    <span className="rg-kpi-title">Balance Sheet Status</span>
                    <span
                      className="rg-kpi-value"
                      style={{ color: bsData.isComplete ? '#10b981' : '#f59e0b' }}
                    >
                      {bsData.isComplete ? 'Complete' : 'Incomplete'}
                    </span>
                    <span className="rg-kpi-sub">
                      {bsData.isComplete ? '✓ Approved FSLI Structure' : '⚠ Phase 5–7 Mapping Pending'}
                    </span>
                  </div>
                </div>

                {/* 3. Reconciliation Control Panel */}
                <div className="rg-section" style={{ marginTop: '20px' }}>
                  <div className="rg-section-header">
                    <div>
                      <h4 className="rg-section-title" style={{ fontSize: '14px' }}>
                        Consolidated Source Reconciliation Control
                      </h4>
                      <p className="rg-section-subtitle" style={{ fontSize: '12px' }}>
                        Mathematical reconciliation between Consolidated Trial Balance source balances and Balance Sheet schedules
                      </p>
                    </div>
                    <span
                      className="rg-tag"
                      style={{
                        backgroundColor: bsData.reconciliation.isReconciled
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'rgba(239, 68, 68, 0.15)',
                        color: bsData.reconciliation.isReconciled ? '#10b981' : '#ef4444',
                      }}
                    >
                      {bsData.reconciliation.isReconciled
                        ? '✓ Reconciled to Trial Balance'
                        : '⚠ Source Discrepancy'}
                    </span>
                  </div>

                  <div className="rg-control-grid">
                    <div className="rg-control-item">
                      <span>Trial Balance Consolidated Debit:</span>
                      <strong>{formatINR(bsData.reconciliation.totalTrialBalanceDebit)}</strong>
                    </div>
                    <div className="rg-control-item">
                      <span>Trial Balance Consolidated Credit:</span>
                      <strong>{formatINR(bsData.reconciliation.totalTrialBalanceCredit)}</strong>
                    </div>
                    <div className="rg-control-item">
                      <span>Mapped Assets Consolidated:</span>
                      <strong>{formatINR(bsData.totalAssetsConsolidated)}</strong>
                    </div>
                    <div className="rg-control-item">
                      <span>Mapped Equity & Liabilities:</span>
                      <strong>{formatINR(bsData.totalEquityLiabilitiesConsolidated)}</strong>
                    </div>
                    <div
                      className="rg-control-item"
                      style={{ borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}
                    >
                      <span>Unresolved / Unmapped Debit:</span>
                      <strong style={{ color: bsData.unmappedDebit !== 0 ? '#f59e0b' : 'inherit' }}>
                        {formatINR(bsData.unmappedDebit)}
                      </strong>
                    </div>
                    <div
                      className="rg-control-item"
                      style={{ borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}
                    >
                      <span>Unresolved / Unmapped Credit:</span>
                      <strong style={{ color: bsData.unmappedCredit !== 0 ? '#f59e0b' : 'inherit' }}>
                        {formatINR(bsData.unmappedCredit)}
                      </strong>
                    </div>
                    <div
                      className="rg-control-item"
                      style={{ borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}
                    >
                      <span>Total Eliminations:</span>
                      <strong style={{ color: '#10b981' }}>
                        {formatINR(bsData.reconciliation.totalEliminations)}
                      </strong>
                    </div>
                    <div
                      className="rg-control-item"
                      style={{ borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}
                    >
                      <span>Trial Balance Difference:</span>
                      <strong
                        style={{
                          color:
                            bsData.reconciliation.reconciliationDifference !== 0
                              ? '#ef4444'
                              : '#10b981',
                        }}
                      >
                        {formatINR(bsData.reconciliation.reconciliationDifference)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* 4. Balance Sheet Schedules Grid */}
                <div className="rg-bs-grid" style={{ marginTop: '20px' }}>
                  {/* Assets Column */}
                  <div className="rg-bs-col">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '10px',
                      }}
                    >
                      <h4 className="rg-bs-col-title" style={{ margin: 0 }}>
                        ASSETS
                      </h4>
                      <span className="rg-tag" style={{ fontSize: '11px' }}>
                        {bsData.assetRows.length} Mapped Lines
                      </span>
                    </div>
                    {bsData.assetRows.length > 0 ? (
                      <table className="rg-table rg-table-sm">
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>FSLI Name</th>
                            <th>Before Elim</th>
                            <th>Elimination</th>
                            <th>Consolidated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bsData.assetRows.map((r) => (
                            <tr key={r.fsliId}>
                              <td>
                                <code>{r.fsliCode || '—'}</code>
                              </td>
                              <td>{r.fsliName}</td>
                              <td>{formatINR(r.beforeEliminationDebit)}</td>
                              <td style={{ color: '#10b981' }}>{formatINR(r.eliminationDebit)}</td>
                              <td>
                                <strong>{formatINR(r.afterEliminationDebit)}</strong>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ fontWeight: 600, backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
                            <td colSpan={2}>TOTAL ASSETS</td>
                            <td>{formatINR(bsData.totalAssetsBeforeElimination)}</td>
                            <td style={{ color: '#10b981' }}>
                              {formatINR(bsData.totalAssetsElimination)}
                            </td>
                            <td>
                              <strong style={{ color: 'var(--primary-color)' }}>
                                {formatINR(bsData.totalAssetsConsolidated)}
                              </strong>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    ) : (
                      <div
                        style={{
                          padding: '36px 16px',
                          textAlign: 'center',
                          color: 'var(--text-secondary)',
                          border: '1px dashed var(--border-color)',
                          borderRadius: '6px',
                        }}
                      >
                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>📋</div>
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 500 }}>
                          No classified Asset balances
                        </p>
                        <p
                          style={{
                            margin: '4px 0 0 0',
                            fontSize: '11px',
                            color: '#f59e0b',
                          }}
                        >
                          Balances remain under Pending FSLI Assignment
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Equity & Liabilities Column */}
                  <div className="rg-bs-col">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '10px',
                      }}
                    >
                      <h4 className="rg-bs-col-title" style={{ margin: 0 }}>
                        EQUITY & LIABILITIES
                      </h4>
                      <span className="rg-tag" style={{ fontSize: '11px' }}>
                        {bsData.equityLiabilityRows.length} Mapped Lines
                      </span>
                    </div>
                    {bsData.equityLiabilityRows.length > 0 ? (
                      <table className="rg-table rg-table-sm">
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>FSLI Name</th>
                            <th>Before Elim</th>
                            <th>Elimination</th>
                            <th>Consolidated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bsData.equityLiabilityRows.map((r) => (
                            <tr key={r.fsliId}>
                              <td>
                                <code>{r.fsliCode || '—'}</code>
                              </td>
                              <td>{r.fsliName}</td>
                              <td>{formatINR(r.beforeEliminationCredit)}</td>
                              <td style={{ color: '#10b981' }}>{formatINR(r.eliminationCredit)}</td>
                              <td>
                                <strong>{formatINR(r.afterEliminationCredit)}</strong>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ fontWeight: 600, backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
                            <td colSpan={2}>TOTAL EQUITY & LIABILITIES</td>
                            <td>{formatINR(bsData.totalEquityLiabilitiesBeforeElimination)}</td>
                            <td style={{ color: '#10b981' }}>
                              {formatINR(bsData.totalEquityLiabilitiesElimination)}
                            </td>
                            <td>
                              <strong style={{ color: 'var(--primary-color)' }}>
                                {formatINR(bsData.totalEquityLiabilitiesConsolidated)}
                              </strong>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    ) : (
                      <div
                        style={{
                          padding: '36px 16px',
                          textAlign: 'center',
                          color: 'var(--text-secondary)',
                          border: '1px dashed var(--border-color)',
                          borderRadius: '6px',
                        }}
                      >
                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>📋</div>
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 500 }}>
                          No classified Equity or Liability balances
                        </p>
                        <p
                          style={{
                            margin: '4px 0 0 0',
                            fontSize: '11px',
                            color: '#f59e0b',
                          }}
                        >
                          Balances remain under Pending FSLI Assignment
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. Dedicated Unresolved / Pending Assignment Section */}
                {bsData.hasUnmappedBalances && (
                  <div
                    className="rg-section"
                    style={{
                      marginTop: '20px',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      backgroundColor: 'rgba(245, 158, 11, 0.03)',
                    }}
                  >
                    <div className="rg-section-header">
                      <div>
                        <h4
                          className="rg-section-title"
                          style={{ color: '#f59e0b', fontSize: '14px' }}
                        >
                          Unresolved Balances (Pending Phase 5–7 FSLI Assignment)
                        </h4>
                        <p className="rg-section-subtitle" style={{ fontSize: '12px' }}>
                          These balances belong to newly imported ledgers without approved FSLI classifications. They are quarantined and NOT treated as genuine FSLIs in financial statements.
                        </p>
                      </div>
                    </div>
                    <div className="rg-table-wrapper">
                      <table className="rg-table rg-table-sm">
                        <thead>
                          <tr>
                            <th>Bucket Reference</th>
                            <th>Description</th>
                            <th>Category</th>
                            <th>Unresolved Debit</th>
                            <th>Unresolved Credit</th>
                            <th>Net Balance</th>
                            <th>Action Required</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>
                              <code>UNMAPPED</code>
                            </td>
                            <td>
                              <strong>Unmapped / Pending FSLI Assignment</strong>
                            </td>
                            <td>
                              <span
                                className="rg-tag"
                                style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}
                              >
                                Unmapped
                              </span>
                            </td>
                            <td>{formatINR(bsData.unmappedDebit)}</td>
                            <td>{formatINR(bsData.unmappedCredit)}</td>
                            <td>{formatINR(bsData.unmappedNet)}</td>
                            <td>
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                Complete Phase 5 Mapping → Phase 6 Classification
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="rg-tab-content">
          <div className="rg-section">
            <div className="rg-section-header">
              <div>
                <h3 className="rg-section-title">Consolidation Audit Trail</h3>
                <p className="rg-section-subtitle">
                  Immutable chronological log of all consolidation, detection, and elimination actions
                </p>
              </div>

              <div className="rg-section-actions">
                <button
                  className="rg-btn rg-btn-sm rg-btn-secondary"
                  onClick={() => loadAuditHistory(selectedRunId || undefined)}
                  disabled={auditLoading}
                >
                  🔄 Refresh Log
                </button>
              </div>
            </div>

            <div className="rg-table-wrapper">
              <table className="rg-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Before Status</th>
                    <th>After Status</th>
                    <th>Details</th>
                    <th>Reason / Notes</th>
                    <th>Performed By</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRecords.length > 0 ? (
                    auditRecords.map((a) => (
                      <tr key={a.id}>
                        <td>{new Date(a.performedAt).toLocaleString()}</td>
                        <td>
                          <span className="rg-tag">{a.action}</span>
                        </td>
                        <td>{a.beforeStatus || '—'}</td>
                        <td>{a.afterStatus || '—'}</td>
                        <td>{a.details || '—'}</td>
                        <td>{a.reason || '—'}</td>
                        <td>{a.performedBy || 'System'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="rg-empty-state">
                        {auditLoading ? 'Loading audit records...' : 'No audit records logged yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS ────────────────────────────────────────────────────────── */}

      {/* New Consolidation Run Modal */}
      {showNewRunModal && (
        <div className="rg-modal-overlay">
          <div className="rg-modal">
            <div className="rg-modal-header">
              <h3>Create New Consolidation Run</h3>
              <button className="rg-modal-close" onClick={() => setShowNewRunModal(false)}>×</button>
            </div>
            <div className="rg-modal-body">
              <p>
                You are creating a consolidation run for Financial Year{' '}
                <strong>{data?.activeFinancialYearLabel}</strong> with{' '}
                <strong>{selectedUnitIds.size} selected units</strong>.
              </p>
              <div className="rg-form-group" style={{ marginTop: '12px' }}>
                <label>Selected Units Scope:</label>
                <div className="rg-units-list-preview">
                  {data?.units
                    .filter((u) => selectedUnitIds.has(u.id))
                    .map((u) => (
                      <span key={u.id} className="rg-tag rg-tag-sm">{u.unitName}</span>
                    ))}
                </div>
              </div>
            </div>
            <div className="rg-modal-footer">
              <button className="rg-btn rg-btn-secondary" onClick={() => setShowNewRunModal(false)}>
                Cancel
              </button>
              <button
                className="rg-btn rg-btn-primary"
                onClick={handleCreateRun}
                disabled={actionInProgress === 'create-run'}
              >
                {actionInProgress === 'create-run' ? 'Creating...' : 'Confirm & Create Run'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Elimination Modal */}
      {showManualElimModal && (
        <div className="rg-modal-overlay">
          <div className="rg-modal" style={{ maxWidth: '600px' }}>
            <div className="rg-modal-header">
              <h3>Add Manual Elimination Entry</h3>
              <button className="rg-modal-close" onClick={() => setShowManualElimModal(false)}>×</button>
            </div>
            <div className="rg-modal-body">
              <div className="rg-form-group">
                <label>Source Unit *</label>
                <select
                  value={formSourceUnitId}
                  onChange={(e) => setFormSourceUnitId(e.target.value)}
                  className="rg-input"
                >
                  <option value="">Select source unit...</option>
                  {data?.units
                    .filter((u) => activeRun?.selectedUnitIds.includes(u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.unitName}</option>
                    ))}
                </select>
              </div>

              <div className="rg-form-group">
                <label>Source Ledger Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Kozhikode Branch Divn A/c"
                  value={formSourceLedgerName}
                  onChange={(e) => setFormSourceLedgerName(e.target.value)}
                  className="rg-input"
                >
                </input>
              </div>

              <div className="rg-form-group">
                <label>Counterparty Unit (Optional for single-sided)</label>
                <select
                  value={formCounterpartyUnitId}
                  onChange={(e) => setFormCounterpartyUnitId(e.target.value)}
                  className="rg-input"
                >
                  <option value="">Select counterparty unit...</option>
                  {data?.units
                    .filter((u) => activeRun?.selectedUnitIds.includes(u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.unitName}</option>
                    ))}
                </select>
              </div>

              <div className="rg-form-group">
                <label>Counterparty Ledger Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Kollam Branch Divn A/c"
                  value={formCounterpartyLedgerName}
                  onChange={(e) => setFormCounterpartyLedgerName(e.target.value)}
                  className="rg-input"
                />
              </div>

              <div className="rg-form-group">
                <label>Internal Account Type</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as InternalAccountType)}
                  className="rg-input"
                >
                  <option value="Branch/Division">Branch/Division</option>
                  <option value="Santhigiri Ashram HO">Santhigiri Ashram HO</option>
                  <option value="Other Internal">Other Internal</option>
                </select>
              </div>

              <div className="rg-form-row">
                <div className="rg-form-group" style={{ flex: 1 }}>
                  <label>Debit Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formDebit}
                    onChange={(e) => setFormDebit(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="rg-input"
                  />
                </div>
                <div className="rg-form-group" style={{ flex: 1 }}>
                  <label>Credit Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formCredit}
                    onChange={(e) => setFormCredit(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="rg-input"
                  />
                </div>
              </div>

              <div className="rg-form-group">
                <label>Eliminated Amount (to eliminate)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Leave blank to match lower amount"
                  value={formEliminatedAmount}
                  onChange={(e) => setFormEliminatedAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="rg-input"
                />
              </div>

              <div className="rg-form-group">
                <label>Reason / Notes</label>
                <textarea
                  placeholder="Audit reason for manual elimination..."
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  className="rg-input"
                  rows={2}
                />
              </div>
            </div>
            <div className="rg-modal-footer">
              <button className="rg-btn rg-btn-secondary" onClick={() => setShowManualElimModal(false)}>
                Cancel
              </button>
              <button
                className="rg-btn rg-btn-primary"
                onClick={handleSaveManualElimination}
                disabled={actionInProgress === 'save-manual-elim'}
              >
                {actionInProgress === 'save-manual-elim' ? 'Saving...' : 'Save Elimination'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Elimination Reason Dialog */}
      {rejectModalElim && (
        <div className="rg-modal-overlay">
          <div className="rg-modal">
            <div className="rg-modal-header">
              <h3>Reject Elimination {rejectModalElim.eliminationNumber}</h3>
              <button className="rg-modal-close" onClick={() => setRejectModalElim(null)}>×</button>
            </div>
            <div className="rg-modal-body">
              <p>Please enter the mandatory audit reason for rejecting this elimination:</p>
              <textarea
                placeholder="Reason for rejection (mandatory)..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="rg-input"
                rows={3}
                style={{ marginTop: '10px' }}
              />
            </div>
            <div className="rg-modal-footer">
              <button className="rg-btn rg-btn-secondary" onClick={() => setRejectModalElim(null)}>
                Cancel
              </button>
              <button className="rg-btn rg-btn-danger" onClick={handleRejectElimination}>
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reverse Elimination Reason Dialog */}
      {reverseModalElim && (
        <div className="rg-modal-overlay">
          <div className="rg-modal">
            <div className="rg-modal-header">
              <h3>Reverse Elimination {reverseModalElim.eliminationNumber}</h3>
              <button className="rg-modal-close" onClick={() => setReverseModalElim(null)}>×</button>
            </div>
            <div className="rg-modal-body">
              <p>
                Reversing will create a linked inverse entry that reinstates the internal balance.
                Please provide an audit reason:
              </p>
              <textarea
                placeholder="Reason for reversal (mandatory)..."
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                className="rg-input"
                rows={3}
                style={{ marginTop: '10px' }}
              />
            </div>
            <div className="rg-modal-footer">
              <button className="rg-btn rg-btn-secondary" onClick={() => setReverseModalElim(null)}>
                Cancel
              </button>
              <button className="rg-btn rg-btn-warning" onClick={handleReverseElimination}>
                Confirm Reversal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unit ATB Modal */}
      {viewingUnitATB && (
        <div className="rg-modal-overlay">
          <div className="rg-modal" style={{ maxWidth: '850px' }}>
            <div className="rg-modal-header">
              <h3>{viewingUnitATB.unitName} — Unit Adjusted Trial Balance (Read-Only)</h3>
              <button className="rg-modal-close" onClick={() => setViewingUnitATB(null)}>×</button>
            </div>
            <div className="rg-modal-body" style={{ maxHeight: '550px', overflowY: 'auto' }}>
              {unitATBLoading ? (
                <div className="rg-loading-container">
                  <div className="rg-spinner" />
                  <p>Loading Unit Trial Balance...</p>
                </div>
              ) : unitATBData ? (
                <div>
                  <div className="rg-kpi-grid" style={{ marginBottom: '16px' }}>
                    <div className="rg-kpi-card">
                      <span className="rg-kpi-title">Adjusted Debit</span>
                      <span className="rg-kpi-value">{formatINR(unitATBData.totalAdjustedDebit)}</span>
                    </div>
                    <div className="rg-kpi-card">
                      <span className="rg-kpi-title">Adjusted Credit</span>
                      <span className="rg-kpi-value">{formatINR(unitATBData.totalAdjustedCredit)}</span>
                    </div>
                    <div className="rg-kpi-card">
                      <span className="rg-kpi-title">Net Difference</span>
                      <span
                        className="rg-kpi-value"
                        style={{
                          color:
                            Math.abs(unitATBData.totalAdjustedDebit - unitATBData.totalAdjustedCredit) > 0.01
                              ? '#ef4444'
                              : '#10b981',
                        }}
                      >
                        {formatINR(unitATBData.totalAdjustedDebit - unitATBData.totalAdjustedCredit)}
                      </span>
                    </div>
                  </div>

                  <table className="rg-table rg-table-sm">
                    <thead>
                      <tr>
                        <th>FSLI Code</th>
                        <th>FSLI Name</th>
                        <th>Category</th>
                        <th>Adjusted Debit</th>
                        <th>Adjusted Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unitATBData.rows.map((r) => (
                        <tr key={r.fsliId}>
                          <td><code>{r.fsliCode || '—'}</code></td>
                          <td>{r.fsliName}</td>
                          <td><span className="rg-tag">{r.category}</span></td>
                          <td>{formatINR(r.adjustedDebit)}</td>
                          <td>{formatINR(r.adjustedCredit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No data available for this unit.</p>
              )}
            </div>
            <div className="rg-modal-footer">
              <button className="rg-btn rg-btn-secondary" onClick={() => setViewingUnitATB(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Automated Verification Test Modal */}
      {testModalOpen && (
        <div className="rg-modal-overlay">
          <div className="rg-modal" style={{ maxWidth: '800px' }}>
            <div className="rg-modal-header">
              <h3>Phase 9 Verification Test Suite Results (34 Tests)</h3>
              <button className="rg-modal-close" onClick={() => setTestModalOpen(false)}>×</button>
            </div>
            <div className="rg-modal-body" style={{ maxHeight: '550px', overflowY: 'auto' }}>
              {testingInProgress ? (
                <div className="rg-loading-container">
                  <div className="rg-spinner" />
                  <p>Executing 34 automated Phase 9 verification tests...</p>
                </div>
              ) : testResults ? (
                <div>
                  <div className="rg-kpi-grid" style={{ marginBottom: '16px' }}>
                    <div className="rg-kpi-card">
                      <span className="rg-kpi-title">Total Tests</span>
                      <span className="rg-kpi-value">{testResults.totalTests}</span>
                    </div>
                    <div className="rg-kpi-card">
                      <span className="rg-kpi-title">Passed</span>
                      <span className="rg-kpi-value" style={{ color: '#10b981' }}>{testResults.passedTests}</span>
                    </div>
                    <div className="rg-kpi-card">
                      <span className="rg-kpi-title">Failed</span>
                      <span className="rg-kpi-value" style={{ color: testResults.totalTests - testResults.passedTests > 0 ? '#ef4444' : '#10b981' }}>
                        {testResults.totalTests - testResults.passedTests}
                      </span>
                    </div>
                  </div>

                  <table className="rg-table rg-table-sm">
                    <thead>
                      <tr>
                        <th>Test Name</th>
                        <th>Status</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testResults.results.map((t, idx) => (
                        <tr key={idx}>
                          <td><strong>{t.name}</strong></td>
                          <td>
                            <span className={`rg-badge ${t.passed ? 'rg-badge-applied' : 'rg-badge-rejected'}`}>
                              {t.passed ? 'PASS' : 'FAIL'}
                            </span>
                          </td>
                          <td style={{ color: t.passed ? 'inherit' : '#ef4444' }}>{t.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
            <div className="rg-modal-footer">
              <button className="rg-btn rg-btn-secondary" onClick={() => setTestModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
