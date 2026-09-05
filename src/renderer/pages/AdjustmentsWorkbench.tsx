import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  AdjustmentsWorkbenchData,
  AdjustmentRecord,
  AdjustmentStatus,
  AdjustmentType,
  AdjustmentAuditRecord,
  CreateAdjustmentInput,
  CreateAdjustmentLineInput,
  AdjustedTrialBalanceData,
  FSLIRecord,
} from '../../electron-api';

interface AdjustmentsWorkbenchProps {
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

/** Status badge styling. */
function statusClass(status: AdjustmentStatus): string {
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

const ADJUSTMENT_TYPES: AdjustmentType[] = [
  'Accrued Expense',
  'Outstanding Expense',
  'Prepaid Expense',
  'Provision',
  'Depreciation',
  'Income Accrual',
  'Closing Stock',
  'Other Adjustment',
];

export default function AdjustmentsWorkbench({
  onNavigateToRegrouping,
  onNavigateToClassification,
  onNavigateToMapping,
}: AdjustmentsWorkbenchProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [data, setData] = useState<AdjustmentsWorkbenchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'CY' | 'PY'>('CY');

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | AdjustmentStatus>('ALL');
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Row expansion for journal lines
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Action in progress indicator
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingAdj, setEditingAdj] = useState<AdjustmentRecord | null>(null);
  const [showClosingStockModal, setShowClosingStockModal] = useState(false);
  const [showTrialBalanceModal, setShowTrialBalanceModal] = useState(false);
  const [trialBalanceData, setTrialBalanceData] = useState<AdjustedTrialBalanceData | null>(null);
  const [tbLoading, setTbLoading] = useState(false);

  // Reason Modals
  const [rejectModalAdj, setRejectModalAdj] = useState<AdjustmentRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [returnDraftModalAdj, setReturnDraftModalAdj] = useState<AdjustmentRecord | null>(null);
  const [returnDraftReason, setReturnDraftReason] = useState('');

  const [reverseModalAdj, setReverseModalAdj] = useState<AdjustmentRecord | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  // Audit History Modal
  const [historyAdj, setHistoryAdj] = useState<AdjustmentRecord | null>(null);
  const [auditRecords, setAuditRecords] = useState<AdjustmentAuditRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Test Runner Modal
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testResults, setTestResults] = useState<{
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    results: Array<{ name: string; passed: boolean; message: string }>;
  } | null>(null);
  const [testingInProgress, setTestingInProgress] = useState(false);

  // Form states for New / Edit Adjustment
  const [formUnitId, setFormUnitId] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formType, setFormType] = useState<AdjustmentType>('Outstanding Expense');
  const [formNarration, setFormNarration] = useState('');
  const [formLines, setFormLines] = useState<CreateAdjustmentLineInput[]>([
    { ledgerName: '', fsliId: '', debit: 0, credit: 0, description: '' },
    { ledgerName: '', fsliId: '', debit: 0, credit: 0, description: '' },
  ]);

  // Form states for Closing Stock Modal
  const [csUnitId, setCsUnitId] = useState('');
  const [csDate, setCsDate] = useState(new Date().toISOString().split('T')[0]);
  const [csValue, setCsValue] = useState<number | ''>('');
  const [csInventoryFSLIId, setCsInventoryFSLIId] = useState('');
  const [csNarration, setCsNarration] = useState('');

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
      if (window.electronAPI?.getAdjustmentsWorkbenchData) {
        const res = await window.electronAPI.getAdjustmentsWorkbenchData(
          fyId,
          unitFilter !== 'ALL' ? unitFilter : undefined,
          typeFilter !== 'ALL' ? typeFilter : undefined,
          statusFilter !== 'ALL' ? statusFilter : undefined,
        );
        setData(res);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [unitFilter, typeFilter, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // Set default form unit when data loads
  useEffect(() => {
    if (data?.units && data.units.length > 0 && !formUnitId) {
      setFormUnitId(data.units[0].id);
      setCsUnitId(data.units[0].id);
    }
    if (data?.fslis && data.fslis.length > 0 && !csInventoryFSLIId) {
      const invFSLI = data.fslis.find(
        (f) =>
          (f.fsliCode || (f as any).fsli_code) === 'CA_INVENT' ||
          (f.fsliName || (f as any).fsli_name || '').toLowerCase().includes('inventor'),
      );
      if (invFSLI) setCsInventoryFSLIId(invFSLI.id);
    }
  }, [data, formUnitId, csInventoryFSLIId]);

  // ── Filtered Rows ─────────────────────────────────────────────────────────
  const filteredAdjustments = useMemo(() => {
    if (!data) return [];
    let list = data.adjustments;

    if (statusFilter !== 'ALL') {
      list = list.filter((a) => a.status === statusFilter);
    }
    if (unitFilter !== 'ALL') {
      list = list.filter((a) => a.unitId === unitFilter);
    }
    if (typeFilter !== 'ALL') {
      list = list.filter((a) => a.adjustmentType === typeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((a) =>
        (a.adjustmentNumber || '').toLowerCase().includes(q) ||
        (a.narration || '').toLowerCase().includes(q) ||
        (a.unitName || '').toLowerCase().includes(q) ||
        (a.adjustmentType || '').toLowerCase().includes(q) ||
        (a.lines || []).some((l) =>
          (l.ledgerName || '').toLowerCase().includes(q) ||
          (l.fsliName || '').toLowerCase().includes(q) ||
          (l.description || '').toLowerCase().includes(q),
        ),
      );
    }
    return list;
  }, [data, statusFilter, unitFilter, typeFilter, searchQuery]);

  // ── Calculated Journal Balance in Modal ────────────────────────────────────
  const { formTotalDr, formTotalCr, formDiff, formBalanced } = useMemo(() => {
    let dr = 0;
    let cr = 0;
    for (const line of formLines) {
      dr += Number(line.debit) || 0;
      cr += Number(line.credit) || 0;
    }
    dr = Math.round(dr * 100) / 100;
    cr = Math.round(cr * 100) / 100;
    const diff = Math.round(Math.abs(dr - cr) * 100) / 100;
    return {
      formTotalDr: dr,
      formTotalCr: cr,
      formDiff: diff,
      formBalanced: diff < 0.01 && dr > 0 && formLines.length >= 2,
    };
  }, [formLines]);

  // ── Helper to Toggle Row Expansion ────────────────────────────────────────
  const toggleRowExpanded = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Open New Modal ────────────────────────────────────────────────────────
  const handleOpenNewModal = () => {
    setEditingAdj(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormType('Outstanding Expense');
    setFormNarration('');
    setFormUnitId(data?.units[0]?.id || '');
    setFormLines([
      { ledgerName: '', fsliId: '', debit: 0, credit: 0, description: '' },
      { ledgerName: '', fsliId: '', debit: 0, credit: 0, description: '' },
    ]);
    setShowNewModal(true);
  };

  // ── Open Edit Modal ───────────────────────────────────────────────────────
  const handleOpenEditModal = (adj: AdjustmentRecord) => {
    if (adj.status !== 'Draft') {
      setToast({ message: `Cannot edit adjustment with status "${adj.status}". Only Draft adjustments can be edited.`, type: 'error' });
      return;
    }
    setEditingAdj(adj);
    setFormUnitId(adj.unitId);
    setFormDate(adj.adjustmentDate);
    setFormType(adj.adjustmentType);
    setFormNarration(adj.narration);
    setFormLines(
      adj.lines.map((l) => ({
        ledgerId: l.ledgerId,
        ledgerName: l.ledgerName,
        fsliId: l.fsliId,
        debit: l.debit,
        credit: l.credit,
        description: l.description || '',
      })),
    );
    setShowNewModal(true);
  };

  // ── Add / Remove Journal Line ─────────────────────────────────────────────
  const handleAddLine = () => {
    setFormLines((prev) => [...prev, { ledgerName: '', fsliId: '', debit: 0, credit: 0, description: '' }]);
  };

  const handleRemoveLine = (index: number) => {
    if (formLines.length <= 2) {
      setToast({ message: 'An adjustment must have at least 2 journal lines.', type: 'error' });
      return;
    }
    setFormLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof CreateAdjustmentLineInput, value: string | number) => {
    setFormLines((prev) => {
      const next = [...prev];
      const target = { ...next[index] };
      if (field === 'debit') {
        target.debit = Number(value) || 0;
        if (target.debit > 0) target.credit = 0; // mutually exclusive
      } else if (field === 'credit') {
        target.credit = Number(value) || 0;
        if (target.credit > 0) target.debit = 0; // mutually exclusive
      } else if (field === 'fsliId') {
        target.fsliId = String(value);
      } else if (field === 'ledgerName') {
        target.ledgerName = String(value);
      } else if (field === 'description') {
        target.description = String(value);
      }
      next[index] = target;
      return next;
    });
  };

  // ── Save Adjustment (Create / Update) ─────────────────────────────────────
  const handleSaveAdjustment = async () => {
    if (!activeFYId) return;
    if (!formUnitId) {
      setToast({ message: 'Please select a unit.', type: 'error' });
      return;
    }
    if (!formNarration.trim()) {
      setToast({ message: 'Please enter a narration for the adjustment.', type: 'error' });
      return;
    }
    if (!formBalanced) {
      setToast({ message: `Adjustment is unbalanced! Total Debit (₹${formTotalDr}) != Total Credit (₹${formTotalCr}).`, type: 'error' });
      return;
    }

    try {
      setActionInProgress('save');
      if (editingAdj) {
        await window.electronAPI.updateAdjustment(editingAdj.id, {
          unitId: formUnitId,
          financialYearId: activeFYId,
          adjustmentDate: formDate,
          adjustmentType: formType,
          narration: formNarration,
          lines: formLines,
          updatedBy: 'User',
        });
        setToast({ message: `Updated adjustment ${editingAdj.adjustmentNumber}`, type: 'success' });
      } else {
        const res = await window.electronAPI.createAdjustment({
          unitId: formUnitId,
          financialYearId: activeFYId,
          adjustmentDate: formDate,
          adjustmentType: formType,
          narration: formNarration,
          lines: formLines,
          createdBy: 'User',
        });
        setToast({ message: `Created adjustment ${res.adjustmentNumber} in Draft`, type: 'success' });
      }
      setShowNewModal(false);
      await loadData(activeFYId);
    } catch (err) {
      setToast({ message: `Save failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setActionInProgress(null);
    }
  };

  // ── Create Closing Stock Adjustment ───────────────────────────────────────
  const handleSaveClosingStock = async () => {
    if (!activeFYId) return;
    if (!csUnitId) {
      setToast({ message: 'Please select a unit for the Closing Stock adjustment.', type: 'error' });
      return;
    }
    const val = Number(csValue);
    if (!val || val <= 0) {
      setToast({ message: 'Please enter a valid closing stock value greater than ₹0.', type: 'error' });
      return;
    }

    try {
      setActionInProgress('closing-stock');
      const invFSLI = csInventoryFSLIId || data?.fslis.find((f) => f.fsliCode === 'CA_INVENT')?.id || '';
      const chgInvFSLI = data?.fslis.find((f) => f.fsliCode === 'EXP_CHG_INV')?.id || '';

      const res = await window.electronAPI.createAdjustment({
        unitId: csUnitId,
        financialYearId: activeFYId,
        adjustmentDate: csDate,
        adjustmentType: 'Closing Stock',
        narration: csNarration || `Closing Stock valuation adjustment as on ${csDate}`,
        isClosingStock: true,
        closingStockValue: val,
        createdBy: 'Store Manager',
        lines: [
          {
            ledgerName: 'Closing Stock (Inventories)',
            fsliId: invFSLI,
            debit: val,
            credit: 0,
            description: 'Closing Stock added to Current Assets (Inventories)',
          },
          {
            ledgerName: 'Closing Stock (Trading / P&L)',
            fsliId: chgInvFSLI,
            debit: 0,
            credit: val,
            description: 'Closing Stock credited to Changes in Inventories (Expense credit)',
          },
        ],
      });

      setToast({ message: `Created Closing Stock adjustment ${res.adjustmentNumber} (₹${formatINR(val)}) in Draft`, type: 'success' });
      setShowClosingStockModal(false);
      setCsValue('');
      await loadData(activeFYId);
    } catch (err) {
      setToast({ message: `Closing Stock creation failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setActionInProgress(null);
    }
  };

  // ── Lifecycle Actions ─────────────────────────────────────────────────────

  const handleSubmitForReview = async (adj: AdjustmentRecord) => {
    try {
      setActionInProgress(adj.id);
      await window.electronAPI.submitAdjustmentForReview(adj.id, 'User');
      setToast({ message: `Submitted ${adj.adjustmentNumber} for review`, type: 'success' });
      await loadData(activeFYId || undefined);
    } catch (err) {
      setToast({ message: `Submit failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleApprove = async (adj: AdjustmentRecord) => {
    try {
      setActionInProgress(adj.id);
      await window.electronAPI.approveAdjustment(adj.id, 'Reviewer');
      setToast({ message: `Approved adjustment ${adj.adjustmentNumber}`, type: 'success' });
      await loadData(activeFYId || undefined);
    } catch (err) {
      setToast({ message: `Approve failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleOpenRejectModal = (adj: AdjustmentRecord) => {
    setRejectModalAdj(adj);
    setRejectReason('');
  };

  const handleConfirmReject = async () => {
    if (!rejectModalAdj) return;
    if (!rejectReason.trim()) {
      setToast({ message: 'A rejection reason is mandatory.', type: 'error' });
      return;
    }
    try {
      setActionInProgress(rejectModalAdj.id);
      await window.electronAPI.rejectAdjustment(rejectModalAdj.id, rejectReason.trim(), 'Reviewer');
      setToast({ message: `Rejected adjustment ${rejectModalAdj.adjustmentNumber}`, type: 'info' });
      setRejectModalAdj(null);
      await loadData(activeFYId || undefined);
    } catch (err) {
      setToast({ message: `Reject failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleOpenReturnDraftModal = (adj: AdjustmentRecord) => {
    setReturnDraftModalAdj(adj);
    setReturnDraftReason('');
  };

  const handleConfirmReturnDraft = async () => {
    if (!returnDraftModalAdj) return;
    if (!returnDraftReason.trim()) {
      setToast({ message: 'A reason is mandatory to return an approved adjustment to Draft.', type: 'error' });
      return;
    }
    try {
      setActionInProgress(returnDraftModalAdj.id);
      await window.electronAPI.returnAdjustmentToDraft(returnDraftModalAdj.id, returnDraftReason.trim(), 'User');
      setToast({ message: `Returned ${returnDraftModalAdj.adjustmentNumber} to Draft`, type: 'info' });
      setReturnDraftModalAdj(null);
      await loadData(activeFYId || undefined);
    } catch (err) {
      setToast({ message: `Return to draft failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleApply = async (adj: AdjustmentRecord) => {
    if (!window.confirm(`Apply adjustment ${adj.adjustmentNumber}? Once applied, this entry will be active in financial reports and become immutable.`)) {
      return;
    }
    try {
      setActionInProgress(adj.id);
      await window.electronAPI.applyAdjustment(adj.id, 'Accountant');
      setToast({ message: `Successfully applied ${adj.adjustmentNumber}`, type: 'success' });
      await loadData(activeFYId || undefined);
    } catch (err) {
      setToast({ message: `Apply failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleOpenReverseModal = (adj: AdjustmentRecord) => {
    setReverseModalAdj(adj);
    setReverseReason('');
  };

  const handleConfirmReverse = async () => {
    if (!reverseModalAdj) return;
    if (!reverseReason.trim()) {
      setToast({ message: 'A reason is mandatory to reverse an applied adjustment.', type: 'error' });
      return;
    }
    try {
      setActionInProgress(reverseModalAdj.id);
      const res = await window.electronAPI.reverseAdjustment(reverseModalAdj.id, reverseReason.trim(), 'Accountant');
      setToast({
        message: `Reversed ${reverseModalAdj.adjustmentNumber}. Reversal entry ${res.reversal.adjustmentNumber} applied.`,
        type: 'success',
      });
      setReverseModalAdj(null);
      await loadData(activeFYId || undefined);
    } catch (err) {
      setToast({ message: `Reversal failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteDraft = async (adj: AdjustmentRecord) => {
    if (!window.confirm(`Are you sure you want to permanently delete draft adjustment ${adj.adjustmentNumber}?`)) {
      return;
    }
    try {
      setActionInProgress(adj.id);
      await window.electronAPI.deleteAdjustment(adj.id);
      setToast({ message: `Deleted draft adjustment ${adj.adjustmentNumber}`, type: 'info' });
      await loadData(activeFYId || undefined);
    } catch (err) {
      setToast({ message: `Delete failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleViewAuditHistory = async (adj: AdjustmentRecord) => {
    setHistoryAdj(adj);
    setHistoryLoading(true);
    try {
      const records = await window.electronAPI.getAdjustmentAuditHistory(adj.id);
      setAuditRecords(records);
    } catch (err) {
      setToast({ message: `Failed to load audit history: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── View Adjusted Trial Balance ───────────────────────────────────────────
  const handleOpenTrialBalance = async () => {
    if (!activeFYId) return;
    setShowTrialBalanceModal(true);
    setTbLoading(true);
    try {
      const tbRes = await window.electronAPI.getAdjustedTrialBalance(
        activeFYId,
        unitFilter !== 'ALL' ? unitFilter : undefined,
      );
      setTrialBalanceData(tbRes);
    } catch (err) {
      setToast({ message: `Failed to compute adjusted trial balance: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setTbLoading(false);
    }
  };

  // ── Run Automated Tests ───────────────────────────────────────────────────
  const handleRunTests = async () => {
    setTestingInProgress(true);
    setTestModalOpen(true);
    try {
      const res = await window.electronAPI.runAdjustmentsTests();
      setTestResults(res);
      setToast({
        message: res.allPassed
          ? `All ${res.totalTests} Phase 8 verification tests passed!`
          : `${res.passedTests}/${res.totalTests} tests passed.`,
        type: res.allPassed ? 'success' : 'error',
      });
    } catch (err) {
      setToast({ message: `Test execution failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    } finally {
      setTestingInProgress(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="workbench-loading">
        <div className="spinner" />
        <p>Loading Phase 8 Adjustments Engine...</p>
      </div>
    );
  }

  return (
    <div className="rg-workbench">
      {/* Toast Notification */}
      {toast && (
        <div className={`rg-toast rg-toast-${toast.type}`}>
          {toast.type === 'success' && '✓ '}
          {toast.type === 'error' && '⚠ '}
          {toast.type === 'info' && 'ℹ '}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="rg-header">
        <div>
          <h2>Phase 8 — Adjustments Engine</h2>
          <p className="rg-subtitle">
            Auditable accounting-adjustment layer that operates strictly AFTER Phase 7 Regrouping and BEFORE Phase 9 Consolidation.
          </p>
        </div>

        <div className="rg-header-actions">
          {/* CY / PY Tab Buttons */}
          <div className="rg-fy-tabs">
            <button
              className={`rg-fy-tab ${activeTab === 'CY' ? 'active' : ''}`}
              onClick={() => setActiveTab('CY')}
            >
              Current Year ({cyFY?.yearLabel || '2025-26'})
            </button>
            <button
              className={`rg-fy-tab ${activeTab === 'PY' ? 'active' : ''} ${!pyAvailable ? 'disabled' : ''}`}
              onClick={() => pyAvailable && setActiveTab('PY')}
              disabled={!pyAvailable}
              title={pyAvailable ? `Switch to PY (${pyFY?.yearLabel})` : 'Prior year data not available'}
            >
              Prior Year {pyFY ? `(${pyFY.yearLabel})` : '(PY)'}
            </button>
          </div>

          <button
            className="btn btn-secondary"
            onClick={handleRunTests}
            title="Run all 14 Phase 8 automated verification tests"
          >
            🛡 Run Verification Tests
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleOpenTrialBalance}
            title="View Before / Adjustment / After comparison table"
          >
            📊 Adjusted Trial Balance
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => setShowClosingStockModal(true)}
            title="Create a dedicated Closing Stock adjustment entry"
          >
            📦 + Closing Stock
          </button>

          <button
            className="btn btn-primary"
            onClick={handleOpenNewModal}
            title="Create a new journal adjustment entry"
          >
            + New Adjustment
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {data && (
        <div className="rg-kpi-grid">
          <div className="rg-kpi-card">
            <div className="rg-kpi-label">Total Adjustments</div>
            <div className="rg-kpi-value">{data.summary.totalAdjustments}</div>
            <div className="rg-kpi-sub">Total recorded entries</div>
          </div>

          <div className="rg-kpi-card rg-kpi-detected">
            <div className="rg-kpi-label">Draft</div>
            <div className="rg-kpi-value">{data.summary.draftCount}</div>
            <div className="rg-kpi-sub">Editable in workbench</div>
          </div>

          <div className="rg-kpi-card rg-kpi-review">
            <div className="rg-kpi-label">Pending Review</div>
            <div className="rg-kpi-value">{data.summary.pendingReviewCount}</div>
            <div className="rg-kpi-sub">Awaiting approval</div>
          </div>

          <div className="rg-kpi-card rg-kpi-approved">
            <div className="rg-kpi-label">Approved</div>
            <div className="rg-kpi-value">{data.summary.approvedCount}</div>
            <div className="rg-kpi-sub">Ready to apply</div>
          </div>

          <div className="rg-kpi-card rg-kpi-applied">
            <div className="rg-kpi-label">Applied</div>
            <div className="rg-kpi-value">{data.summary.appliedCount}</div>
            <div className="rg-kpi-sub">
              ₹{formatINR(data.summary.totalDebitApplied)} active
            </div>
          </div>

          <div className="rg-kpi-card rg-kpi-rejected">
            <div className="rg-kpi-label">Rejected</div>
            <div className="rg-kpi-value">{data.summary.rejectedCount}</div>
            <div className="rg-kpi-sub">Excluded from reports</div>
          </div>

          <div className="rg-kpi-card rg-kpi-undone">
            <div className="rg-kpi-label">Reversed</div>
            <div className="rg-kpi-value">{data.summary.reversedCount}</div>
            <div className="rg-kpi-sub">Offset by inverse entry</div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="rg-filter-bar">
        <div className="rg-filter-group">
          <label>Unit:</label>
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
          >
            <option value="ALL">All Units ({data?.units.length || 0})</option>
            {data?.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.unitName}
              </option>
            ))}
          </select>
        </div>

        <div className="rg-filter-group">
          <label>Type:</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">All Types</option>
            {ADJUSTMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="rg-filter-group">
          <label>Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | AdjustmentStatus)}
          >
            <option value="ALL">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="PendingReview">Pending Review</option>
            <option value="Approved">Approved</option>
            <option value="Applied">Applied</option>
            <option value="Rejected">Rejected</option>
            <option value="Reversed">Reversed</option>
          </select>
        </div>

        <div className="rg-search-group">
          <input
            type="text"
            placeholder="Search by Adj #, narration, ledger, FSLI..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="rg-clear-btn" onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>
      </div>

      {/* Adjustments Register Table */}
      <div className="rg-table-container">
        {filteredAdjustments.length === 0 ? (
          <div className="rg-empty-state">
            <p>No adjustments found matching the selected filters.</p>
            <button className="btn btn-primary" onClick={handleOpenNewModal}>
              + Create First Adjustment
            </button>
          </div>
        ) : (
          <table className="rg-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>Adj Number</th>
                <th>Date</th>
                <th>Unit</th>
                <th>Type</th>
                <th>Narration</th>
                <th className="num-col">Debit (₹)</th>
                <th className="num-col">Credit (₹)</th>
                <th>Status</th>
                <th style={{ width: '220px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAdjustments.map((adj) => {
                const isExpanded = expandedRows.has(adj.id);
                return (
                  <React.Fragment key={adj.id}>
                    <tr className={isExpanded ? 'rg-row-expanded' : ''}>
                      <td>
                        <button
                          className="rg-expand-btn"
                          onClick={() => toggleRowExpanded(adj.id)}
                          title={isExpanded ? 'Collapse lines' : 'Expand lines'}
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                      </td>
                      <td>
                        <span className="rg-ledger-name font-mono font-bold">
                          {adj.adjustmentNumber}
                        </span>
                        {adj.isClosingStock && (
                          <span className="rg-nature-badge rg-nature-zero" style={{ marginLeft: '6px' }}>
                            📦 Closing Stock
                          </span>
                        )}
                        {adj.reversalOfNumber && (
                          <span className="rg-nature-badge rg-nature-credit" style={{ marginLeft: '6px' }}>
                            ↺ Reversal of {adj.reversalOfNumber}
                          </span>
                        )}
                        {adj.reversedByNumber && (
                          <span className="rg-nature-badge rg-nature-debit" style={{ marginLeft: '6px' }}>
                            Reversed by {adj.reversedByNumber}
                          </span>
                        )}
                      </td>
                      <td>{adj.adjustmentDate}</td>
                      <td>{adj.unitName || '—'}</td>
                      <td>
                        <span className="rg-confidence-badge confidence-high">
                          {adj.adjustmentType}
                        </span>
                      </td>
                      <td style={{ maxWidth: '240px' }} title={adj.narration}>
                        <div className="truncate">{adj.narration}</div>
                        {adj.rejectionReason && (
                          <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '2px' }}>
                            Rejection: {adj.rejectionReason}
                          </div>
                        )}
                        {adj.reversalReason && (
                          <div style={{ color: '#f59e0b', fontSize: '11px', marginTop: '2px' }}>
                            Reversal: {adj.reversalReason}
                          </div>
                        )}
                      </td>
                      <td className="num-col font-bold" style={{ color: '#059669' }}>
                        {formatINR(adj.totalDebit)}
                      </td>
                      <td className="num-col font-bold" style={{ color: '#2563eb' }}>
                        {formatINR(adj.totalCredit)}
                      </td>
                      <td>
                        <span className={`rg-status-badge ${statusClass(adj.status)}`}>
                          {adj.status}
                        </span>
                      </td>
                      <td>
                        <div className="rg-action-buttons">
                          {/* DRAFT ACTIONS */}
                          {adj.status === 'Draft' && (
                            <>
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handleSubmitForReview(adj)}
                                disabled={actionInProgress === adj.id}
                                title="Submit draft for approval"
                              >
                                Submit
                              </button>
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => handleOpenEditModal(adj)}
                                disabled={actionInProgress === adj.id}
                                title="Edit draft adjustment"
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() => handleDeleteDraft(adj)}
                                disabled={actionInProgress === adj.id}
                                title="Delete draft adjustment"
                              >
                                Delete
                              </button>
                            </>
                          )}

                          {/* PENDING REVIEW ACTIONS */}
                          {adj.status === 'PendingReview' && (
                            <>
                              <button
                                className="btn btn-sm btn-success"
                                onClick={() => handleApprove(adj)}
                                disabled={actionInProgress === adj.id}
                                title="Approve adjustment"
                              >
                                Approve
                              </button>
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() => handleOpenRejectModal(adj)}
                                disabled={actionInProgress === adj.id}
                                title="Reject adjustment"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {/* APPROVED ACTIONS */}
                          {adj.status === 'Approved' && (
                            <>
                              <button
                                className="btn btn-sm btn-success"
                                onClick={() => handleApply(adj)}
                                disabled={actionInProgress === adj.id}
                                title="Apply approved adjustment to financial numbers"
                              >
                                Apply
                              </button>
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => handleOpenReturnDraftModal(adj)}
                                disabled={actionInProgress === adj.id}
                                title="Return to draft for corrections"
                              >
                                Return Draft
                              </button>
                            </>
                          )}

                          {/* APPLIED ACTIONS */}
                          {adj.status === 'Applied' && (
                            <>
                              <button
                                className="btn btn-sm btn-warning"
                                onClick={() => handleOpenReverseModal(adj)}
                                disabled={actionInProgress === adj.id}
                                title="Reverse applied adjustment with linked inverse entry"
                              >
                                ↺ Reverse
                              </button>
                              <span className="text-xs text-muted" title="Applied adjustments are immutable">
                                🔒 Applied
                              </span>
                            </>
                          )}

                          {/* AUDIT BUTTON (Available on all statuses) */}
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => handleViewAuditHistory(adj)}
                            title="View audit trail history"
                          >
                            📜 Audit
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* EXPANDED JOURNAL LINES DRAWER */}
                    {isExpanded && (
                      <tr className="rg-expanded-details-row">
                        <td colSpan={10} style={{ padding: '12px 24px', backgroundColor: 'var(--bg-secondary, #f8fafc)' }}>
                          <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '13px' }}>
                            Journal Entry Lines ({adj.lines.length} lines):
                          </div>
                          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', backgroundColor: '#ffffff', borderRadius: '6px', overflow: 'hidden' }}>
                            <thead>
                              <tr style={{ backgroundColor: 'var(--bg-hover, #e2e8f0)', textAlign: 'left' }}>
                                <th style={{ padding: '6px 12px', width: '40px' }}>#</th>
                                <th style={{ padding: '6px 12px' }}>Ledger / Account</th>
                                <th style={{ padding: '6px 12px' }}>Canonical FSLI</th>
                                <th style={{ padding: '6px 12px', textAlign: 'right', width: '120px' }}>Debit (₹)</th>
                                <th style={{ padding: '6px 12px', textAlign: 'right', width: '120px' }}>Credit (₹)</th>
                                <th style={{ padding: '6px 12px' }}>Description / Line Narration</th>
                              </tr>
                            </thead>
                            <tbody>
                              {adj.lines.map((l) => (
                                <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '6px 12px', color: '#64748b' }}>{l.lineNumber}</td>
                                  <td style={{ padding: '6px 12px', fontWeight: '500' }}>{l.ledgerName}</td>
                                  <td style={{ padding: '6px 12px' }}>
                                    <span style={{ color: '#0284c7', fontWeight: '500' }}>{l.fsliName}</span>
                                    {l.fsliCode && <span style={{ color: '#94a3b8', marginLeft: '6px', fontSize: '11px' }}>({l.fsliCode})</span>}
                                  </td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 'bold', color: l.debit > 0 ? '#059669' : '#94a3b8' }}>
                                    {l.debit > 0 ? formatINR(l.debit) : '—'}
                                  </td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 'bold', color: l.credit > 0 ? '#2563eb' : '#94a3b8' }}>
                                    {l.credit > 0 ? formatINR(l.credit) : '—'}
                                  </td>
                                  <td style={{ padding: '6px 12px', color: '#475569' }}>{l.description || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── MODAL: CREATE / EDIT ADJUSTMENT ──────────────────────────────────── */}
      {showNewModal && (
        <div className="rg-modal-backdrop">
          <div className="rg-modal" style={{ maxWidth: '850px' }}>
            <div className="rg-modal-header">
              <h3>{editingAdj ? `Edit Adjustment ${editingAdj.adjustmentNumber}` : 'Create New Adjustment Entry'}</h3>
              <button className="rg-modal-close" onClick={() => setShowNewModal(false)}>×</button>
            </div>

            <div className="rg-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '12px' }}>Unit *</label>
                  <select
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    value={formUnitId}
                    onChange={(e) => setFormUnitId(e.target.value)}
                  >
                    {data?.units.map((u) => (
                      <option key={u.id} value={u.id}>{u.unitName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '12px' }}>Date *</label>
                  <input
                    type="date"
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '12px' }}>Adjustment Type *</label>
                  <select
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as AdjustmentType)}
                  >
                    {ADJUSTMENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '12px' }}>Narration / Reference *</label>
                <input
                  type="text"
                  placeholder="e.g. Accrual of Audit Fee for Q4 FY 2025-26"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  value={formNarration}
                  onChange={(e) => setFormNarration(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: '14px' }}>Journal Lines (Min. 2 lines, Balanced)</h4>
                <button className="btn btn-sm btn-secondary" onClick={handleAddLine}>+ Add Line</button>
              </div>

              {/* Lines Table */}
              <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '12px' }}>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px', width: '30px' }}>#</th>
                      <th style={{ padding: '6px 8px', width: '220px' }}>Ledger Name *</th>
                      <th style={{ padding: '6px 8px', width: '220px' }}>Canonical FSLI *</th>
                      <th style={{ padding: '6px 8px', width: '110px', textAlign: 'right' }}>Debit (₹)</th>
                      <th style={{ padding: '6px 8px', width: '110px', textAlign: 'right' }}>Credit (₹)</th>
                      <th style={{ padding: '6px 8px' }}>Description</th>
                      <th style={{ padding: '6px 8px', width: '30px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formLines.map((line, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 8px', color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ padding: '4px 6px' }}>
                          <input
                            type="text"
                            placeholder="Ledger / Account name"
                            list="ledger-options"
                            style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                            value={line.ledgerName}
                            onChange={(e) => handleLineChange(idx, 'ledgerName', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <select
                            style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                            value={line.fsliId}
                            onChange={(e) => handleLineChange(idx, 'fsliId', e.target.value)}
                          >
                            <option value="">Select FSLI...</option>
                            {data?.fslis.map((f) => (
                              <option key={f.id} value={f.id}>
                                [{f.category}] {f.fsliName || (f as any).fsli_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            style={{ width: '100%', padding: '4px 6px', textAlign: 'right', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: line.debit > 0 ? 'bold' : 'normal', color: line.debit > 0 ? '#059669' : 'inherit' }}
                            value={line.debit || ''}
                            onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            style={{ width: '100%', padding: '4px 6px', textAlign: 'right', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: line.credit > 0 ? 'bold' : 'normal', color: line.credit > 0 ? '#2563eb' : 'inherit' }}
                            value={line.credit || ''}
                            onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <input
                            type="text"
                            placeholder="Line narration"
                            style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                            value={line.description || ''}
                            onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <button
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                            onClick={() => handleRemoveLine(idx)}
                            title="Remove line"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Autocomplete Datalist */}
              <datalist id="ledger-options">
                {data?.availableLedgers.map((l) => (
                  <option key={l.id} value={l.ledgerName} />
                ))}
              </datalist>

              {/* Balance Summary Footer Bar */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: formBalanced ? '#ecfdf5' : '#fef2f2',
                border: formBalanced ? '1px solid #a7f3d0' : '1px solid #fecaca',
              }}>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <div>Total Debit: <span style={{ fontWeight: 'bold', color: '#059669' }}>₹{formatINR(formTotalDr)}</span></div>
                  <div>Total Credit: <span style={{ fontWeight: 'bold', color: '#2563eb' }}>₹{formatINR(formTotalCr)}</span></div>
                </div>
                <div>
                  {formBalanced ? (
                    <span style={{ color: '#059669', fontWeight: 'bold' }}>✓ Perfectly Balanced (Difference: ₹0.00)</span>
                  ) : (
                    <span style={{ color: '#dc2626', fontWeight: 'bold' }}>⚠ Unbalanced! Difference: ₹{formatINR(formDiff)}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="rg-modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleSaveAdjustment}
                disabled={!formBalanced || actionInProgress === 'save'}
              >
                {editingAdj ? 'Save Changes' : 'Save as Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CLOSING STOCK ADJUSTMENT ──────────────────────────────────── */}
      {showClosingStockModal && (
        <div className="rg-modal-backdrop">
          <div className="rg-modal" style={{ maxWidth: '600px' }}>
            <div className="rg-modal-header">
              <h3>📦 Unit-Specific Closing Stock Adjustment</h3>
              <button className="rg-modal-close" onClick={() => setShowClosingStockModal(false)}>×</button>
            </div>

            <div className="rg-modal-body">
              <p style={{ fontSize: '13px', color: '#475569', marginBottom: '16px' }}>
                Creates a balanced accounting adjustment for year-end inventory valuation strictly scoped to the selected Unit and Financial Year.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '12px' }}>Unit *</label>
                  <select
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    value={csUnitId}
                    onChange={(e) => setCsUnitId(e.target.value)}
                  >
                    {data?.units.map((u) => (
                      <option key={u.id} value={u.id}>{u.unitName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '12px' }}>Valuation Date *</label>
                  <input
                    type="date"
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    value={csDate}
                    onChange={(e) => setCsDate(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '12px' }}>Closing Stock Value (₹) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="e.g. 300000"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '15px', fontWeight: 'bold' }}
                  value={csValue}
                  onChange={(e) => setCsValue(e.target.value ? Number(e.target.value) : '')}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '12px' }}>Inventory Asset FSLI</label>
                <select
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  value={csInventoryFSLIId}
                  onChange={(e) => setCsInventoryFSLIId(e.target.value)}
                >
                  {data?.fslis.filter((f) => f.category === 'Asset').map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.fsliName || (f as any).fsli_name} ({f.fsliCode || (f as any).fsli_code || ''})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '12px' }}>Narration</label>
                <input
                  type="text"
                  placeholder="e.g. Closing Stock valuation as on 31-03-2025"
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  value={csNarration}
                  onChange={(e) => setCsNarration(e.target.value)}
                />
              </div>

              {/* Live Balanced Preview */}
              <div style={{ padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '6px' }}>Auto-Generated Balanced Journal Entry:</div>
                <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px dashed #cbd5e1' }}>
                  <span>Dr Inventories (CA_INVENT) [Balance Sheet Asset]</span>
                  <span style={{ fontWeight: 'bold', color: '#059669' }}>₹{formatINR(Number(csValue) || 0)}</span>
                </div>
                <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span>Cr Changes in Inventories (EXP_CHG_INV) [Trading/P&L Credit]</span>
                  <span style={{ fontWeight: 'bold', color: '#2563eb' }}>₹{formatINR(Number(csValue) || 0)}</span>
                </div>
              </div>
            </div>

            <div className="rg-modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowClosingStockModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleSaveClosingStock}
                disabled={!csValue || Number(csValue) <= 0 || actionInProgress === 'closing-stock'}
              >
                Create Closing Stock Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: REJECT REASON ─────────────────────────────────────────────── */}
      {rejectModalAdj && (
        <div className="rg-modal-backdrop">
          <div className="rg-modal" style={{ maxWidth: '480px' }}>
            <div className="rg-modal-header">
              <h3>Reject Adjustment {rejectModalAdj.adjustmentNumber}</h3>
              <button className="rg-modal-close" onClick={() => setRejectModalAdj(null)}>×</button>
            </div>
            <div className="rg-modal-body">
              <p style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
                Please provide a mandatory reason for rejecting this adjustment. The rejection will be recorded in the audit trail.
              </p>
              <textarea
                rows={3}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                placeholder="Reason for rejection (mandatory)..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="rg-modal-footer">
              <button className="btn btn-secondary" onClick={() => setRejectModalAdj(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={handleConfirmReject}
                disabled={!rejectReason.trim()}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: RETURN TO DRAFT ───────────────────────────────────────────── */}
      {returnDraftModalAdj && (
        <div className="rg-modal-backdrop">
          <div className="rg-modal" style={{ maxWidth: '480px' }}>
            <div className="rg-modal-header">
              <h3>Return Adjustment {returnDraftModalAdj.adjustmentNumber} to Draft</h3>
              <button className="rg-modal-close" onClick={() => setReturnDraftModalAdj(null)}>×</button>
            </div>
            <div className="rg-modal-body">
              <p style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
                Returning this approved adjustment to Draft will allow editing of amounts and lines. A mandatory reason is required and will be logged in the audit trail.
              </p>
              <textarea
                rows={3}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                placeholder="Reason for returning to Draft (mandatory)..."
                value={returnDraftReason}
                onChange={(e) => setReturnDraftReason(e.target.value)}
              />
            </div>
            <div className="rg-modal-footer">
              <button className="btn btn-secondary" onClick={() => setReturnDraftModalAdj(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmReturnDraft}
                disabled={!returnDraftReason.trim()}
              >
                Return to Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: REVERSE ADJUSTMENT ────────────────────────────────────────── */}
      {reverseModalAdj && (
        <div className="rg-modal-backdrop">
          <div className="rg-modal" style={{ maxWidth: '520px' }}>
            <div className="rg-modal-header">
              <h3>↺ Reverse Applied Adjustment {reverseModalAdj.adjustmentNumber}</h3>
              <button className="rg-modal-close" onClick={() => setReverseModalAdj(null)}>×</button>
            </div>
            <div className="rg-modal-body">
              <p style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
                Applied adjustments cannot be edited or deleted. Reversing this adjustment will mark it as <strong>Reversed</strong> and auto-generate an applied inverse entry with swapped Debits and Credits to offset the financial impact to zero.
              </p>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '12px' }}>Mandatory Reversal Reason *</label>
                <textarea
                  rows={3}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  placeholder="Reason for reversal (e.g. Duplicate entry, incorrect valuation)..."
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                />
              </div>
            </div>
            <div className="rg-modal-footer">
              <button className="btn btn-secondary" onClick={() => setReverseModalAdj(null)}>Cancel</button>
              <button
                className="btn btn-warning"
                onClick={handleConfirmReverse}
                disabled={!reverseReason.trim()}
              >
                Confirm & Create Reversal Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: AUDIT TRAIL ───────────────────────────────────────────────── */}
      {historyAdj && (
        <div className="rg-modal-backdrop">
          <div className="rg-modal" style={{ maxWidth: '650px' }}>
            <div className="rg-modal-header">
              <h3>📜 Audit Trail: {historyAdj.adjustmentNumber}</h3>
              <button className="rg-modal-close" onClick={() => setHistoryAdj(null)}>×</button>
            </div>
            <div className="rg-modal-body">
              {historyLoading ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>Loading audit records...</div>
              ) : auditRecords.length === 0 ? (
                <p>No audit records found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {auditRecords.map((ar) => (
                    <div
                      key={ar.id}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        backgroundColor: '#f8fafc',
                        borderLeft: '4px solid #3b82f6',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 'bold', color: '#1e293b' }}>
                          Action: {ar.action}
                        </span>
                        <span style={{ color: '#64748b' }}>
                          {new Date(ar.performedAt).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ color: '#475569', marginBottom: '2px' }}>
                        Performed By: <strong>{ar.performedBy || 'System'}</strong>
                        {ar.beforeStatus && ar.afterStatus && (
                          <span style={{ marginLeft: '12px' }}>
                            Status: <span className="rg-status-badge rg-badge-detected">{ar.beforeStatus}</span> → <span className="rg-status-badge rg-badge-applied">{ar.afterStatus}</span>
                          </span>
                        )}
                      </div>
                      {ar.reason && (
                        <div style={{ color: '#b91c1c', fontStyle: 'italic', marginTop: '4px' }}>
                          Reason: "{ar.reason}"
                        </div>
                      )}
                      {ar.details && (
                        <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', fontFamily: 'monospace' }}>
                          Details: {ar.details}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rg-modal-footer">
              <button className="btn btn-secondary" onClick={() => setHistoryAdj(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ADJUSTED TRIAL BALANCE / COMPARISON VIEW ─────────────────── */}
      {showTrialBalanceModal && (
        <div className="rg-modal-backdrop">
          <div className="rg-modal" style={{ maxWidth: '1000px', width: '90vw' }}>
            <div className="rg-modal-header">
              <h3>📊 Adjusted Trial Balance & Financial Integration (Phase 8)</h3>
              <button className="rg-modal-close" onClick={() => setShowTrialBalanceModal(false)}>×</button>
            </div>
            <div className="rg-modal-body">
              <div style={{ padding: '8px 12px', backgroundColor: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe', fontSize: '12px', color: '#1e40af', marginBottom: '14px' }}>
                <strong>Formula:</strong> Adjusted Balance = Phase 7 Base Balance + Applied Phase 8 Adjustments. Original TB and Phase 7 regrouping records are strictly preserved without debit/credit netting.
              </div>

              {tbLoading || !trialBalanceData ? (
                <div style={{ textAlign: 'center', padding: '30px' }}>Computing Adjusted Trial Balance...</div>
              ) : (
                <>
                  {/* Category Summary */}
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ fontSize: '13px', marginBottom: '6px' }}>Category Summary</h4>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', border: '1px solid #e2e8f0' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f1f5f9' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left' }}>Category</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Phase 7 Base Dr</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Phase 7 Base Cr</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', color: '#3b82f6' }}>Adj Dr</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', color: '#3b82f6' }}>Adj Cr</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>Adjusted Dr</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>Adjusted Cr</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trialBalanceData.categoryTotals.map((cat) => (
                          <tr key={cat.category} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>{cat.category}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatINR(cat.baseDebit)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatINR(cat.baseCredit)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#059669' }}>{formatINR(cat.adjustmentDebit)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#2563eb' }}>{formatINR(cat.adjustmentCredit)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>{formatINR(cat.adjustedDebit)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>{formatINR(cat.adjustedCredit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* FSLI Details */}
                  <h4 style={{ fontSize: '13px', marginBottom: '6px' }}>FSLI Breakdown ({trialBalanceData.rows.length} active FSLIs)</h4>
                  <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0, borderBottom: '1px solid #cbd5e1' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left' }}>FSLI Name</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left' }}>Category</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Base Dr (₹)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Base Cr (₹)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', color: '#059669' }}>Adj Dr (₹)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', color: '#2563eb' }}>Adj Cr (₹)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>Final Dr (₹)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>Final Cr (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trialBalanceData.rows.map((row) => (
                          <tr key={row.fsliId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 8px', fontWeight: '500' }}>
                              {row.fsliName}
                              {row.fsliCode && <span style={{ color: '#94a3b8', fontSize: '11px', marginLeft: '6px' }}>({row.fsliCode})</span>}
                            </td>
                            <td style={{ padding: '6px 8px', color: '#64748b' }}>{row.category}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{row.baseDebit ? formatINR(row.baseDebit) : '—'}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{row.baseCredit ? formatINR(row.baseCredit) : '—'}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#059669', fontWeight: row.adjustmentDebit ? 'bold' : 'normal' }}>
                              {row.adjustmentDebit ? formatINR(row.adjustmentDebit) : '—'}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#2563eb', fontWeight: row.adjustmentCredit ? 'bold' : 'normal' }}>
                              {row.adjustmentCredit ? formatINR(row.adjustmentCredit) : '—'}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>
                              {row.adjustedDebit ? formatINR(row.adjustedDebit) : '—'}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>
                              {row.adjustedCredit ? formatINR(row.adjustedCredit) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                          <td colSpan={2} style={{ padding: '8px' }}>Total</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{formatINR(trialBalanceData.totalBaseDebit)}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{formatINR(trialBalanceData.totalBaseCredit)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#059669' }}>{formatINR(trialBalanceData.totalAdjDebit)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#2563eb' }}>{formatINR(trialBalanceData.totalAdjCredit)}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{formatINR(trialBalanceData.totalAdjustedDebit)}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{formatINR(trialBalanceData.totalAdjustedCredit)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className="rg-modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowTrialBalanceModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: VERIFICATION TEST RESULTS ─────────────────────────────────── */}
      {testModalOpen && (
        <div className="rg-modal-backdrop">
          <div className="rg-modal" style={{ maxWidth: '750px' }}>
            <div className="rg-modal-header">
              <h3>🛡 Phase 8 Verification Test Suite</h3>
              <button className="rg-modal-close" onClick={() => setTestModalOpen(false)}>×</button>
            </div>
            <div className="rg-modal-body">
              {testingInProgress ? (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                  <div className="spinner" style={{ margin: '0 auto 12px' }} />
                  <p>Running all 14 Phase 8 automated verification tests...</p>
                </div>
              ) : testResults ? (
                <div>
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '6px',
                    backgroundColor: testResults.allPassed ? '#ecfdf5' : '#fef2f2',
                    border: testResults.allPassed ? '1px solid #a7f3d0' : '1px solid #fecaca',
                    marginBottom: '16px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    color: testResults.allPassed ? '#065f46' : '#991b1b',
                  }}>
                    {testResults.allPassed
                      ? `✓ All ${testResults.totalTests} Phase 8 Verification Tests Passed Successfully!`
                      : `⚠ ${testResults.passedTests} / ${testResults.totalTests} Tests Passed.`}
                  </div>

                  <div style={{ maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {testResults.results.map((tr, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          backgroundColor: '#f8fafc',
                          borderLeft: tr.passed ? '4px solid #10b981' : '4px solid #ef4444',
                          fontSize: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: tr.passed ? '#065f46' : '#991b1b' }}>
                          <span>{tr.passed ? '✓' : '✗'} {tr.name}</span>
                          <span>{tr.passed ? 'PASS' : 'FAIL'}</span>
                        </div>
                        <div style={{ color: '#475569', marginTop: '2px' }}>{tr.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="rg-modal-footer">
              <button className="btn btn-secondary" onClick={() => setTestModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
