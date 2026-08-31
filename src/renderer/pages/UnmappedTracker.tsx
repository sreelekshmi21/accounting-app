import React, { useState, useEffect, useMemo } from 'react';
import type {
  UnmappedTrackerData,
  UnmappedTrackerRow,
  MappingStatus,
  FSLIRecord,
  BulkUpdateMappingItem,
} from '../../electron-api';

interface UnmappedTrackerProps {
  onNavigateToWorkbench?: () => void;
}

export default function UnmappedTracker({ onNavigateToWorkbench }: UnmappedTrackerProps) {
  const [data, setData] = useState<UnmappedTrackerData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Materiality control
  const [customMaterialityInput, setCustomMaterialityInput] = useState<string>('');
  const [activeThreshold, setActiveThreshold] = useState<number | undefined>(undefined);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | MappingStatus>('ALL');
  const [fsliFilter, setFsliFilter] = useState<string>('ALL');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [balanceFilter, setBalanceFilter] = useState<'ALL' | 'DEBIT' | 'CREDIT' | 'GT_1L' | 'GT_10L'>('ALL');
  const [materialityFilter, setMaterialityFilter] = useState<'ALL' | 'MATERIAL' | 'IMMATERIAL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Quick Map Modal
  const [mapModalTarget, setMapModalTarget] = useState<UnmappedTrackerRow | null>(null);
  const [fsliSearch, setFsliSearch] = useState<string>('');
  const [fsliCategoryFilter, setFsliCategoryFilter] = useState<string>('ALL');

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadTrackerData = async (fyId?: string, threshold?: number) => {
    try {
      setLoading(true);
      setError(null);
      if (window.electronAPI?.getUnmappedTrackerData) {
        const res = await window.electronAPI.getUnmappedTrackerData(fyId, threshold);
        setData(res);
        if (threshold !== undefined) {
          setActiveThreshold(threshold);
        } else {
          setActiveThreshold(res.summary.materialityThreshold);
        }
      } else {
        // Fallback demo data for standalone preview
        const mockFSLIs: FSLIRecord[] = [
          { id: 'fsli-1', fsliName: 'Trade Payables', fsliCode: 'CL_TRADE_PAY', category: 'Liability', subCategory: 'Current Liabilities', displayOrder: 80, active: true, createdAt: new Date().toISOString() },
          { id: 'fsli-2', fsliName: 'Trade Receivables', fsliCode: 'CA_TRADE_REC', category: 'Asset', subCategory: 'Current Assets', displayOrder: 290, active: true, createdAt: new Date().toISOString() },
          { id: 'fsli-3', fsliName: 'Cash and Cash Equivalents', fsliCode: 'CA_CASH_EQUIV', category: 'Asset', subCategory: 'Current Assets', displayOrder: 300, active: true, createdAt: new Date().toISOString() },
          { id: 'fsli-4', fsliName: 'Employee Benefit Expense', fsliCode: 'EXP_EMP_BEN', category: 'Expense', subCategory: 'Employee Benefits', displayOrder: 530, active: true, createdAt: new Date().toISOString() },
          { id: 'fsli-5', fsliName: 'Short-Term Borrowings', fsliCode: 'CL_ST_BORR', category: 'Liability', subCategory: 'Current Liabilities', displayOrder: 70, active: true, createdAt: new Date().toISOString() },
        ];

        const mockRows: UnmappedTrackerRow[] = [
          { ledgerId: 'l-1', ledgerName: 'Sundry Creditors (Trade)', unitId: 'u-1', unitName: 'Main Plant', tallyGroupId: 'g-1', tallyGroupName: 'Sundry Creditors', parentGroupName: 'Current Liabilities', debit: 795625.83, credit: 5745028.22, netBalance: -4949402.39, balanceNature: 'Credit', isMaterial: true, status: 'Suggested', mappedFSLIId: null, mappedFSLIName: null, mappedFSLICode: null, suggestedFSLIId: 'fsli-1', suggestedFSLIName: 'Trade Payables', confidenceScore: 0.95, mappingSource: 'SystemSuggestion', isManualOverride: false, reason: "Standard group 'Sundry Creditors' maps to Trade Payables" },
          { ledgerId: 'l-2', ledgerName: 'Sundry Debtors', unitId: 'u-1', unitName: 'Main Plant', tallyGroupId: 'g-2', tallyGroupName: 'Current Assets', parentGroupName: null, debit: 29109514.68, credit: 7550147.79, netBalance: 21559366.89, balanceNature: 'Debit', isMaterial: true, status: 'Suggested', mappedFSLIId: null, mappedFSLIName: null, mappedFSLICode: null, suggestedFSLIId: 'fsli-2', suggestedFSLIName: 'Trade Receivables', confidenceScore: 0.95, mappingSource: 'SystemSuggestion', isManualOverride: false, reason: "Standard group 'Sundry Debtors' maps to Trade Receivables" },
          { ledgerId: 'l-3', ledgerName: 'Term Loans from Banks', unitId: 'u-1', unitName: 'Main Plant', tallyGroupId: 'g-3', tallyGroupName: 'Working Capital Loans', parentGroupName: 'Loans (Liability)', debit: 0, credit: 144727156.65, netBalance: -144727156.65, balanceNature: 'Credit', isMaterial: true, status: 'NeedsReview', mappedFSLIId: null, mappedFSLIName: null, mappedFSLICode: null, suggestedFSLIId: 'fsli-5', suggestedFSLIName: 'Short-Term Borrowings', confidenceScore: 0.88, mappingSource: 'SystemSuggestion', isManualOverride: false, reason: "Large borrowing balance requires verification" },
          { ledgerId: 'l-4', ledgerName: 'Petty Cash', unitId: 'u-2', unitName: 'Branch Office', tallyGroupId: 'g-4', tallyGroupName: 'Cash-in-hand', parentGroupName: 'Current Assets', debit: 45000, credit: 0, netBalance: 45000, balanceNature: 'Debit', isMaterial: false, status: 'Mapped', mappedFSLIId: 'fsli-3', mappedFSLIName: 'Cash and Cash Equivalents', mappedFSLICode: 'CA_CASH_EQUIV', suggestedFSLIId: 'fsli-3', suggestedFSLIName: 'Cash and Cash Equivalents', confidenceScore: 1.0, mappingSource: 'UserMapping', isManualOverride: true, reason: 'Manually mapped' },
          { ledgerId: 'l-5', ledgerName: 'Suspense Account', unitId: 'u-1', unitName: 'Main Plant', tallyGroupId: null, tallyGroupName: 'Suspense A/c', parentGroupName: null, debit: 1250000, credit: 0, netBalance: 1250000, balanceNature: 'Debit', isMaterial: true, status: 'Unmapped', mappedFSLIId: null, mappedFSLIName: null, mappedFSLICode: null, suggestedFSLIId: null, suggestedFSLIName: null, confidenceScore: 0, mappingSource: 'SystemSuggestion', isManualOverride: false, reason: 'Unclassified suspense balance' },
        ];

        setData({
          financialYears: [{ id: 'fy-demo', yearLabel: 'FY 2025-26 (Preview)' }],
          activeFinancialYearId: 'fy-demo',
          activeFinancialYearLabel: 'FY 2025-26 (Preview)',
          units: [{ id: 'u-1', unitName: 'Main Plant' }, { id: 'u-2', unitName: 'Branch Office' }],
          tallyGroups: ['Sundry Creditors', 'Current Assets', 'Working Capital Loans', 'Cash-in-hand', 'Suspense A/c'],
          fslis: mockFSLIs,
          summary: {
            totalLedgers: mockRows.length,
            mappedCount: 1,
            suggestedCount: 2,
            needsReviewCount: 1,
            unmappedCount: 1,
            rejectedCount: 0,
            totalGrossBalance: 178026525.93,
            materialityThreshold: 500000,
            materialLedgersCount: 4,
            unmappedMaterialCount: 3,
            unmappedMaterialAmount: 171235925.93,
            isReadyForReporting: false,
            blockingReason: '3 material account(s) totaling ₹17,12,35,925.93 require mapping confirmation before reporting.',
          },
          rows: mockRows,
        });
        setActiveThreshold(500000);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load Unmapped Tracker data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrackerData();
  }, []);

  const handleApplyCustomThreshold = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(customMaterialityInput);
    if (!val || val <= 0) {
      showToast('Please enter a valid positive materiality threshold amount.', 'error');
      return;
    }
    loadTrackerData(data?.activeFinancialYearId, val);
    showToast(`Applied materiality threshold: ₹${val.toLocaleString('en-IN')}`);
  };

  // ── Filtered Rows ─────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((r) => {
      // Status
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;

      // FSLI
      if (fsliFilter !== 'ALL') {
        const matchesMapped = r.mappedFSLIId === fsliFilter;
        const matchesSuggested = r.suggestedFSLIId === fsliFilter;
        if (!matchesMapped && !matchesSuggested) return false;
      }

      // Group
      if (groupFilter !== 'ALL' && r.tallyGroupName !== groupFilter) return false;

      // Unit
      if (unitFilter !== 'ALL' && r.unitId !== unitFilter) return false;

      // Materiality
      if (materialityFilter === 'MATERIAL' && !r.isMaterial) return false;
      if (materialityFilter === 'IMMATERIAL' && r.isMaterial) return false;

      // Balance
      if (balanceFilter === 'DEBIT' && r.balanceNature !== 'Debit') return false;
      if (balanceFilter === 'CREDIT' && r.balanceNature !== 'Credit') return false;
      if (balanceFilter === 'GT_1L' && Math.abs(r.netBalance) < 100000) return false;
      if (balanceFilter === 'GT_10L' && Math.abs(r.netBalance) < 1000000) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = r.ledgerName.toLowerCase().includes(q);
        const matchesGroup = (r.tallyGroupName || '').toLowerCase().includes(q);
        const matchesMapped = (r.mappedFSLIName || '').toLowerCase().includes(q);
        const matchesSuggested = (r.suggestedFSLIName || '').toLowerCase().includes(q);
        const matchesReason = (r.reason || '').toLowerCase().includes(q);
        if (!matchesName && !matchesGroup && !matchesMapped && !matchesSuggested && !matchesReason) {
          return false;
        }
      }

      return true;
    });
  }, [data, statusFilter, fsliFilter, groupFilter, unitFilter, materialityFilter, balanceFilter, searchQuery]);

  // ── Quick Mapping Actions ─────────────────────────────────────────────────
  const handleQuickAccept = async (row: UnmappedTrackerRow) => {
    if (!data || !row.suggestedFSLIId) return;
    try {
      const update: BulkUpdateMappingItem = {
        ledgerId: row.ledgerId,
        mappedFSLIId: row.suggestedFSLIId,
        status: 'Mapped',
        mappingSource: row.mappingSource,
        confidenceScore: row.confidenceScore,
        approvedBy: 'User (Tracker)',
      };
      if (window.electronAPI?.bulkUpdateLedgerMappings) {
        await window.electronAPI.bulkUpdateLedgerMappings(data.activeFinancialYearId, [update]);
        await loadTrackerData(data.activeFinancialYearId, activeThreshold);
      } else {
        setData({
          ...data,
          rows: data.rows.map((r) =>
            r.ledgerId === row.ledgerId
              ? { ...r, status: 'Mapped', mappedFSLIId: row.suggestedFSLIId, mappedFSLIName: row.suggestedFSLIName }
              : r
          ),
        });
      }
      showToast(`Mapped "${row.ledgerName}" → ${row.suggestedFSLIName}`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to accept mapping', 'error');
    }
  };

  const handleQuickReject = async (row: UnmappedTrackerRow) => {
    if (!data) return;
    try {
      const update: BulkUpdateMappingItem = {
        ledgerId: row.ledgerId,
        mappedFSLIId: null as string | null,
        status: 'Rejected' as MappingStatus,
        mappingSource: 'UserMapping' as const,
        approvedBy: 'User (Tracker)',
      };
      if (window.electronAPI?.bulkUpdateLedgerMappings) {
        await window.electronAPI.bulkUpdateLedgerMappings(data.activeFinancialYearId, [update]);
        await loadTrackerData(data.activeFinancialYearId, activeThreshold);
      } else {
        setData({
          ...data,
          rows: data.rows.map((r) => (r.ledgerId === row.ledgerId ? { ...r, status: 'Rejected' } : r)),
        });
      }
      showToast(`Rejected suggestion for "${row.ledgerName}"`, 'info');
    } catch (err: any) {
      showToast(err?.message || 'Failed to reject mapping', 'error');
    }
  };

  const handleOpenMapModal = (row: UnmappedTrackerRow) => {
    setMapModalTarget(row);
    setFsliSearch('');
    setFsliCategoryFilter('ALL');
  };

  const handleConfirmModalFSLI = async (selectedFSLI: FSLIRecord) => {
    if (!data || !mapModalTarget) return;
    try {
      const update: BulkUpdateMappingItem = {
        ledgerId: mapModalTarget.ledgerId,
        mappedFSLIId: selectedFSLI.id,
        status: 'Mapped',
        mappingSource: 'UserMapping',
        isManualOverride: true,
        confidenceScore: 1.0,
        approvedBy: 'User (Tracker)',
      };
      if (window.electronAPI?.bulkUpdateLedgerMappings) {
        await window.electronAPI.bulkUpdateLedgerMappings(data.activeFinancialYearId, [update]);
        await loadTrackerData(data.activeFinancialYearId, activeThreshold);
      } else {
        setData({
          ...data,
          rows: data.rows.map((r) =>
            r.ledgerId === mapModalTarget.ledgerId
              ? {
                  ...r,
                  status: 'Mapped',
                  mappedFSLIId: selectedFSLI.id,
                  mappedFSLIName: selectedFSLI.fsliName,
                  mappedFSLICode: selectedFSLI.fsliCode,
                  isManualOverride: true,
                }
              : r
          ),
        });
      }
      showToast(`Mapped "${mapModalTarget.ledgerName}" → ${selectedFSLI.fsliName}`);
      setMapModalTarget(null);
    } catch (err: any) {
      showToast(err?.message || 'Failed to map account', 'error');
    }
  };

  const formatCurrency = (val: number) => {
    const abs = Math.abs(val);
    return abs.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const renderStatusBadge = (status: MappingStatus) => {
    switch (status) {
      case 'Mapped':
        return <span className="badge badge-mapped">✓ Mapped</span>;
      case 'Suggested':
        return <span className="badge badge-suggested">💡 Suggested</span>;
      case 'NeedsReview':
        return <span className="badge badge-needs-review">⚠️ Needs Review</span>;
      case 'Rejected':
        return <span className="badge badge-rejected">✕ Rejected</span>;
      case 'Unmapped':
      default:
        return <span className="badge badge-unmapped">⚪ Unmapped</span>;
    }
  };

  return (
    <div className="unmapped-tracker-container">
      {/* Toast Notification */}
      {toast && <div className={`toast-banner toast-${toast.type}`}>{toast.message}</div>}

      {/* Header Area */}
      <div className="tracker-header">
        <div className="tracker-title-area">
          <h1 className="tracker-title">Unmapped & Review Tracker</h1>
          <p className="tracker-subtitle">
            Audit mapping readiness, materiality thresholds, and unmapped accounts before final financial statement reporting.
          </p>
        </div>

        <div className="tracker-top-actions">
          {data && data.financialYears.length > 0 && (
            <div className="fy-picker-wrapper">
              <label htmlFor="tracker-fy-select">Financial Year:</label>
              <select
                id="tracker-fy-select"
                className="fy-select"
                value={data.activeFinancialYearId}
                onChange={(e) => loadTrackerData(e.target.value, activeThreshold)}
              >
                {data.financialYears.map((fy) => (
                  <option key={fy.id} value={fy.id}>
                    {fy.yearLabel}
                  </option>
                ))}
              </select>
            </div>
          )}

          {onNavigateToWorkbench && (
            <button className="btn btn-secondary" onClick={onNavigateToWorkbench}>
              ← Back to Mapping Workbench
            </button>
          )}
        </div>
      </div>

      {/* Loading / Error States */}
      {loading && (
        <div className="workbench-loading-banner">
          <div className="spinner"></div>
          <span>Loading Unmapped & Review Tracker data...</span>
        </div>
      )}

      {error && (
        <div className="workbench-error-banner">
          <strong>Error:</strong> {error}
          <button className="btn btn-sm btn-secondary" onClick={() => loadTrackerData()}>
            Retry
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Pre-Reporting Readiness Alert Banner */}
          {!data.summary.isReadyForReporting ? (
            <div className="pre-reporting-warning-banner">
              <div className="warning-icon-col">⚠️</div>
              <div className="warning-content-col">
                <div className="warning-headline">
                  Pre-Reporting Warning: Unmapped / Pending Items Detected
                </div>
                <div className="warning-description">{data.summary.blockingReason}</div>
                <div className="warning-metrics-row">
                  <span className="warning-metric-pill">
                    Unmapped Material Accounts: <strong>{data.summary.unmappedMaterialCount}</strong>
                  </span>
                  <span className="warning-metric-pill">
                    Total Pending Material Amount:{' '}
                    <strong>₹{formatCurrency(data.summary.unmappedMaterialAmount)}</strong>
                  </span>
                  <span className="warning-metric-pill">
                    Materiality Threshold:{' '}
                    <strong>₹{formatCurrency(data.summary.materialityThreshold)}</strong>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="pre-reporting-success-banner">
              <div className="success-icon-col">✓</div>
              <div className="success-content-col">
                <div className="success-headline">
                  Mapping Audit Passed: Ready for Financial Reporting
                </div>
                <div className="success-description">
                  All {data.summary.totalLedgers} trial balance ledgers (including all{' '}
                  {data.summary.materialLedgersCount} material accounts) have been verified and mapped.
                </div>
              </div>
            </div>
          )}

          {/* KPI Ribbon */}
          <div className="kpi-ribbon">
            <div
              className={`kpi-card ${statusFilter === 'ALL' ? 'kpi-active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
            >
              <div className="kpi-label">Total Accounts</div>
              <div className="kpi-value">{data.summary.totalLedgers}</div>
            </div>

            <div
              className={`kpi-card ${statusFilter === 'Mapped' ? 'kpi-active' : ''}`}
              onClick={() => setStatusFilter('Mapped')}
            >
              <div className="kpi-label">Mapped</div>
              <div className="kpi-value kpi-green">{data.summary.mappedCount}</div>
            </div>

            <div
              className={`kpi-card ${statusFilter === 'Suggested' ? 'kpi-active' : ''}`}
              onClick={() => setStatusFilter('Suggested')}
            >
              <div className="kpi-label">Suggested</div>
              <div className="kpi-value kpi-blue">{data.summary.suggestedCount}</div>
            </div>

            <div
              className={`kpi-card ${statusFilter === 'NeedsReview' ? 'kpi-active' : ''}`}
              onClick={() => setStatusFilter('NeedsReview')}
            >
              <div className="kpi-label">Needs Review</div>
              <div className="kpi-value kpi-amber">{data.summary.needsReviewCount}</div>
            </div>

            <div
              className={`kpi-card ${statusFilter === 'Unmapped' ? 'kpi-active' : ''}`}
              onClick={() => setStatusFilter('Unmapped')}
            >
              <div className="kpi-label">Unmapped</div>
              <div className="kpi-value kpi-red">{data.summary.unmappedCount}</div>
            </div>

            <div
              className={`kpi-card ${statusFilter === 'Rejected' ? 'kpi-active' : ''}`}
              onClick={() => setStatusFilter('Rejected')}
            >
              <div className="kpi-label">Rejected</div>
              <div className="kpi-value kpi-red">{data.summary.rejectedCount}</div>
            </div>
          </div>

          {/* Materiality Control Toolbar */}
          <div className="materiality-toolbar">
            <div className="materiality-info">
              <span className="materiality-title">Materiality Benchmark:</span>
              <span className="materiality-val">₹{formatCurrency(data.summary.materialityThreshold)}</span>
              <span className="materiality-hint">
                (Based on total gross balance ₹{formatCurrency(data.summary.totalGrossBalance)})
              </span>
            </div>

            <form onSubmit={handleApplyCustomThreshold} className="materiality-form">
              <label>Set Custom Threshold (₹):</label>
              <input
                type="number"
                placeholder={String(data.summary.materialityThreshold)}
                value={customMaterialityInput}
                onChange={(e) => setCustomMaterialityInput(e.target.value)}
                className="materiality-input"
              />
              <button type="submit" className="btn btn-sm btn-secondary">
                Apply Threshold
              </button>
            </form>
          </div>

          {/* Comprehensive Multi-Dimensional Filters */}
          <div className="tracker-filter-bar">
            {/* Status Tabs */}
            <div className="status-tabs">
              {(['ALL', 'Unmapped', 'NeedsReview', 'Suggested', 'Rejected', 'Mapped'] as const).map((st) => (
                <button
                  key={st}
                  className={`status-tab ${statusFilter === st ? 'active' : ''}`}
                  onClick={() => setStatusFilter(st)}
                >
                  {st === 'ALL' ? 'All' : st === 'NeedsReview' ? 'Needs Review' : st}
                </button>
              ))}
            </div>

            {/* Filter Dropdowns Grid */}
            <div className="tracker-filter-controls">
              {/* Materiality Filter */}
              <select
                className="select-input"
                value={materialityFilter}
                onChange={(e) => setMaterialityFilter(e.target.value as any)}
              >
                <option value="ALL">All Materiality Levels</option>
                <option value="MATERIAL">🚨 Material Accounts Only</option>
                <option value="IMMATERIAL">Immaterial Accounts Only</option>
              </select>

              {/* Tally Group Filter */}
              <select
                className="select-input"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <option value="ALL">All Tally Groups ({data.tallyGroups.length})</option>
                {data.tallyGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>

              {/* Unit Filter */}
              {data.units.length > 0 && (
                <select
                  className="select-input"
                  value={unitFilter}
                  onChange={(e) => setUnitFilter(e.target.value)}
                >
                  <option value="ALL">All Business Units ({data.units.length})</option>
                  {data.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unitName}
                    </option>
                  ))}
                </select>
              )}

              {/* FSLI Filter */}
              <select
                className="select-input"
                value={fsliFilter}
                onChange={(e) => setFsliFilter(e.target.value)}
              >
                <option value="ALL">All Target FSLIs ({data.fslis.length})</option>
                {data.fslis.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.parentFSLIId ? '    └─ ' : ''}[{f.category}] {f.fsliName}
                  </option>
                ))}
              </select>

              {/* Balance Filter */}
              <select
                className="select-input"
                value={balanceFilter}
                onChange={(e) => setBalanceFilter(e.target.value as any)}
              >
                <option value="ALL">All Balances</option>
                <option value="DEBIT">Debit Balances (Dr)</option>
                <option value="CREDIT">Credit Balances (Cr)</option>
                <option value="GT_1L">Balance &gt; ₹1,00,000</option>
                <option value="GT_10L">Balance &gt; ₹10,00,000</option>
              </select>

              {/* Search */}
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search accounts, groups, reason..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                {searchQuery && (
                  <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tracker Table */}
          <div className="workbench-table-container">
            <table className="workbench-table">
              <thead>
                <tr>
                  <th>Ledger Account</th>
                  <th>Unit</th>
                  <th>Tally Group</th>
                  <th style={{ textAlign: 'right' }}>Net Balance</th>
                  <th style={{ textAlign: 'center' }}>Materiality</th>
                  <th>Status</th>
                  <th>Mapped FSLI</th>
                  <th>Suggested FSLI</th>
                  <th>Reason / Rule</th>
                  <th style={{ textAlign: 'right', minWidth: '150px' }}>Quick Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="empty-table-cell">
                      No ledger accounts match the specified criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.ledgerId} className={row.isMaterial && row.status !== 'Mapped' ? 'material-unmapped-row' : ''}>
                      {/* Ledger Name */}
                      <td>
                        <div className="ledger-name-cell">
                          <span className="ledger-name-text">{row.ledgerName}</span>
                          <span className={`nature-tag nature-${row.balanceNature.toLowerCase()}`}>
                            {row.balanceNature === 'Debit' ? 'Dr' : row.balanceNature === 'Credit' ? 'Cr' : '0'}
                          </span>
                        </div>
                      </td>

                      {/* Unit */}
                      <td>
                        <span className="unit-text">{row.unitName || 'Primary Unit'}</span>
                      </td>

                      {/* Group */}
                      <td>
                        <div className="group-cell">
                          <span className="group-name">{row.tallyGroupName || '—'}</span>
                          {row.parentGroupName && (
                            <span className="parent-group-sub">↳ {row.parentGroupName}</span>
                          )}
                        </div>
                      </td>

                      {/* Net Balance */}
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        <span className={row.netBalance >= 0 ? 'balance-dr' : 'balance-cr'}>
                          ₹{formatCurrency(row.netBalance)}{' '}
                          <small>{row.netBalance >= 0 ? 'Dr' : 'Cr'}</small>
                        </span>
                      </td>

                      {/* Materiality */}
                      <td style={{ textAlign: 'center' }}>
                        {row.isMaterial ? (
                          <span className="materiality-badge material-pill" title="Exceeds Materiality Threshold">
                            🚨 Material
                          </span>
                        ) : (
                          <span className="materiality-badge immaterial-pill">Immaterial</span>
                        )}
                      </td>

                      {/* Status */}
                      <td>{renderStatusBadge(row.status)}</td>

                      {/* Mapped FSLI */}
                      <td>
                        {row.mappedFSLIName ? (
                          <span className="mapped-fsli-tag">{row.mappedFSLIName}</span>
                        ) : (
                          <span className="unmapped-placeholder">— None —</span>
                        )}
                      </td>

                      {/* Suggested FSLI */}
                      <td>
                        {row.suggestedFSLIName ? (
                          <span className="sug-name">{row.suggestedFSLIName}</span>
                        ) : (
                          <span className="unmapped-placeholder">—</span>
                        )}
                      </td>

                      {/* Reason */}
                      <td>
                        <div className="reason-cell" title={row.reason}>
                          {row.reason}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div className="action-button-group">
                          {row.status !== 'Mapped' && row.suggestedFSLIId && (
                            <button
                              className="action-btn action-accept"
                              onClick={() => handleQuickAccept(row)}
                              title="Accept Suggestion"
                            >
                              ✓ Accept
                            </button>
                          )}

                          <button
                            className="action-btn action-change"
                            onClick={() => handleOpenMapModal(row)}
                            title="Map Account"
                          >
                            Map...
                          </button>

                          {row.status !== 'Rejected' && (
                            <button
                              className="action-btn action-reject"
                              onClick={() => handleQuickReject(row)}
                              title="Reject"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Quick Map Modal ───────────────────────────────────────────────── */}
      {mapModalTarget && (
        <div className="modal-overlay" onClick={() => setMapModalTarget(null)}>
          <div className="modal-content fsli-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Map Account: "{mapModalTarget.ledgerName}"</h2>
              <button className="modal-close-btn" onClick={() => setMapModalTarget(null)}>
                ✕
              </button>
            </div>

            <div className="fsli-modal-filters">
              <input
                type="text"
                placeholder="Search FSLI line item..."
                value={fsliSearch}
                onChange={(e) => setFsliSearch(e.target.value)}
                className="search-input"
                autoFocus
              />

              <div className="category-pills">
                {['ALL', 'Asset', 'Liability', 'Equity', 'Income', 'Expense'].map((cat) => (
                  <button
                    key={cat}
                    className={`cat-pill ${fsliCategoryFilter === cat ? 'active' : ''}`}
                    onClick={() => setFsliCategoryFilter(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="fsli-list-container">
              {data?.fslis
                .filter((f) => {
                  if (fsliCategoryFilter !== 'ALL' && f.category !== fsliCategoryFilter) return false;
                  if (fsliSearch.trim()) {
                    const q = fsliSearch.toLowerCase();
                    return f.fsliName.toLowerCase().includes(q) || (f.subCategory || '').toLowerCase().includes(q);
                  }
                  return true;
                })
                .map((f) => (
                  <div
                    key={f.id}
                    className={`fsli-item-card ${f.parentFSLIId ? 'fsli-item-child' : ''}`}
                    onClick={() => handleConfirmModalFSLI(f)}
                  >
                    <div className="fsli-card-name">
                      {f.parentFSLIId && <span className="fsli-picker-indent">└─ </span>}
                      {f.fsliName}
                    </div>
                    <div className="fsli-card-sub">
                      {f.category} • {f.subCategory || 'General'}
                    </div>
                  </div>
                ))}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setMapModalTarget(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
