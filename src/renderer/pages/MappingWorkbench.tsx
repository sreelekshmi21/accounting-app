import React, { useState, useEffect, useMemo } from 'react';
import type {
  MappingWorkbenchData,
  WorkbenchLedgerRow,
  FSLIRecord,
  MappingStatus,
  BulkUpdateMappingItem,
} from '../../electron-api';

import RulesManagerModal from '../components/RulesManagerModal';
import FSLIManagerModal from '../components/FSLIManagerModal';

interface MappingWorkbenchProps {
  onNavigateToTrialBalance?: () => void;
  onNavigateToUnmappedTracker?: () => void;
}

export default function MappingWorkbench({
  onNavigateToTrialBalance,
  onNavigateToUnmappedTracker,
}: MappingWorkbenchProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [data, setData] = useState<MappingWorkbenchData | null>(null);
  const [rulesManagerOpen, setRulesManagerOpen] = useState<boolean>(false);
  const [fsliManagerOpen, setFsliManagerOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAutoMapping, setIsAutoMapping] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Selectors
  const [selectedUnitId, setSelectedUnitId] = useState<string>('ALL');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('ALL');
  const [auditMode, setAuditMode] = useState<boolean>(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | MappingStatus>('ALL');
  const [confidenceFilter, setConfidenceFilter] = useState<'ALL' | 'HIGH' | 'MED' | 'LOW'>('ALL');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selection for Bulk Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals
  const [fsliModalOpen, setFsliModalOpen] = useState<boolean>(false);
  const [fsliModalTarget, setFsliModalTarget] = useState<
    | { type: 'single'; row: WorkbenchLedgerRow }
    | { type: 'bulk' }
    | null
  >(null);
  const [fsliSearch, setFsliSearch] = useState<string>('');
  const [fsliCategoryFilter, setFsliCategoryFilter] = useState<string>('ALL');

  const [ruleModalOpen, setRuleModalOpen] = useState<boolean>(false);
  const [ruleForm, setRuleForm] = useState<{
    ruleName: string;
    priority: number;
    field: string;
    operator: string;
    value: string;
    targetFSLIId: string;
    scope: 'Global' | 'Client' | 'Entity';
  }>({
    ruleName: '',
    priority: 10,
    field: 'tally_group',
    operator: 'equals',
    value: '',
    targetFSLIId: '',
    scope: 'Global',
  });

  const [applySimilarModalOpen, setApplySimilarModalOpen] = useState<boolean>(false);
  const [applySimilarTarget, setApplySimilarTarget] = useState<{
    row: WorkbenchLedgerRow;
    criteriaType: 'group' | 'keyword';
    criteriaValue: string;
    affectedCount: number;
  } | null>(null);

  // ── Load Workbench Data ───────────────────────────────────────────────────
  const loadData = async (fyId?: string, uId?: string, bId?: string) => {
    try {
      setLoading(true);
      setError(null);
      const targetFy = fyId !== undefined ? fyId : (data?.activeFinancialYearId || undefined);
      const targetUnit = uId !== undefined ? uId : selectedUnitId;
      const targetBatch = bId !== undefined ? bId : selectedBatchId;

      if (window.electronAPI?.getMappingWorkbenchData) {
        const res = await window.electronAPI.getMappingWorkbenchData(
          targetFy,
          targetUnit === 'ALL' ? undefined : targetUnit,
          targetBatch === 'ALL' ? undefined : targetBatch
        );
        setData(res);
      } else {
        // Fallback for standalone browser testing/preview
        const mockFSLIs: FSLIRecord[] = [
          { id: 'fsli-1', fsliName: 'Trade Payables', fsliCode: 'CL_TRADE_PAY', category: 'Liability', subCategory: 'Current Liabilities', displayOrder: 80, active: true, createdAt: new Date().toISOString() },
          { id: 'fsli-2', fsliName: 'Trade Receivables', fsliCode: 'CA_TRADE_REC', category: 'Asset', subCategory: 'Current Assets', displayOrder: 290, active: true, createdAt: new Date().toISOString() },
          { id: 'fsli-3', fsliName: 'Cash and Cash Equivalents', fsliCode: 'CA_CASH_EQUIV', category: 'Asset', subCategory: 'Current Assets', displayOrder: 300, active: true, createdAt: new Date().toISOString() },
          { id: 'fsli-4', fsliName: 'Employee Benefit Expense', fsliCode: 'EXP_EMP_BEN', category: 'Expense', subCategory: 'Employee Benefits', displayOrder: 530, active: true, createdAt: new Date().toISOString() },
          { id: 'fsli-5', fsliName: 'Short-Term Borrowings', fsliCode: 'CL_ST_BORR', category: 'Liability', subCategory: 'Current Liabilities', displayOrder: 70, active: true, createdAt: new Date().toISOString() },
          { id: 'fsli-6', fsliName: 'Other Expenses', fsliCode: 'EXP_OTH_EXP', category: 'Expense', subCategory: 'Other Expenses', displayOrder: 570, active: true, createdAt: new Date().toISOString() },
          { id: 'fsli-7', fsliName: 'Revenue from Operations', fsliCode: 'INC_REV_OPS', category: 'Income', subCategory: 'Revenue', displayOrder: 400, active: true, createdAt: new Date().toISOString() },
        ];

        const mockRows: WorkbenchLedgerRow[] = [
          { ledgerId: 'l-1', ledgerName: 'Sundry Creditors (Trade)', unitId: 'unit-1', unitName: 'SA Bioproducts', tallyGroupId: 'g-1', tallyGroupName: 'Sundry Creditors', parentGroupId: null, parentGroupName: null, debit: 795625.83, credit: 5745028.22, netBalance: -4949402.39, balanceNature: 'Credit', mappingId: null, status: 'Suggested', cyFSLIId: null, cyFSLIName: null, cyFSLICode: null, pyFSLIId: null, pyFSLIName: null, pyFSLICode: null, suggestedFSLIId: 'fsli-1', suggestedFSLIName: 'Trade Payables', suggestedFSLICode: 'CL_TRADE_PAY', category: 'Liability', confidenceScore: 0.95, reason: "Standard Tally group 'Sundry Creditors' directly maps to Trade Payables", mappingSource: 'SystemSuggestion', isManualOverride: false, approvedBy: null, approvedAt: null },
          { ledgerId: 'l-2', ledgerName: 'Sundry Debtors', unitId: 'unit-1', unitName: 'SA Bioproducts', tallyGroupId: 'g-2', tallyGroupName: 'Current Assets', parentGroupId: null, parentGroupName: null, debit: 29109514.68, credit: 7550147.79, netBalance: 21559366.89, balanceNature: 'Debit', mappingId: null, status: 'Suggested', cyFSLIId: null, cyFSLIName: null, cyFSLICode: null, pyFSLIId: null, pyFSLIName: null, pyFSLICode: null, suggestedFSLIId: 'fsli-2', suggestedFSLIName: 'Trade Receivables', suggestedFSLICode: 'CA_TRADE_REC', category: 'Asset', confidenceScore: 0.95, reason: "Standard Tally group 'Sundry Debtors' directly maps to Trade Receivables", mappingSource: 'SystemSuggestion', isManualOverride: false, approvedBy: null, approvedAt: null },
        ];

        setData({
          financialYears: [{ id: 'fy-demo', yearLabel: 'FY 2025-26 (Browser Preview)' }],
          activeFinancialYearId: 'fy-demo',
          activeFinancialYearLabel: 'FY 2025-26 (Browser Preview)',
          units: [{ id: 'unit-1', unitName: 'SA Bioproducts' }],
          importBatches: [],
          fslis: mockFSLIs,
          rules: [],
          summary: {
            totalLedgers: mockRows.length,
            mappedCount: 0,
            alreadyMappedCount: 0,
            autoMappedCount: 0,
            suggestedCount: mockRows.length,
            needsReviewCount: 0,
            unmappedCount: 0,
            rejectedCount: 0,
            highConfidenceCount: mockRows.length,
            mediumConfidenceCount: 0,
            lowConfidenceCount: 0,
          },
          rows: mockRows,
        });
      }
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err?.message || 'Failed to load Mapping Workbench data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // ── Derived / Filtered Data ───────────────────────────────────────────────
  const availableBatchesForSelectedUnit = useMemo(() => {
    if (!data || !data.importBatches) return [];
    if (selectedUnitId === 'ALL') {
      return data.importBatches;
    }
    return data.importBatches.filter((b) => b.unitId === selectedUnitId);
  }, [data, selectedUnitId]);

  const handleUnitChange = (newUnitId: string) => {
    setSelectedUnitId(newUnitId);
    setSelectedBatchId('ALL');
    loadData(data?.activeFinancialYearId, newUnitId, 'ALL');
  };

  const handleBatchChange = (newBatchId: string) => {
    setSelectedBatchId(newBatchId);
    loadData(data?.activeFinancialYearId, selectedUnitId, newBatchId);
  };

  const selectedUnitName = useMemo(() => {
    if (!data || selectedUnitId === 'ALL') return null;
    return data.units.find((u) => u.id === selectedUnitId)?.unitName || null;
  }, [data, selectedUnitId]);

  const tallyGroups = useMemo(() => {
    if (!data) return [];
    const groups = new Set<string>();
    for (const r of data.rows) {
      if (r.tallyGroupName) groups.add(r.tallyGroupName);
    }
    return Array.from(groups).sort();
  }, [data]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((row) => {
      // Status filter
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;

      // Confidence filter
      if (confidenceFilter === 'HIGH' && row.confidenceScore < 0.85) return false;
      if (confidenceFilter === 'MED' && (row.confidenceScore < 0.7 || row.confidenceScore >= 0.85)) return false;
      if (confidenceFilter === 'LOW' && row.confidenceScore >= 0.7) return false;

      // Group filter
      if (groupFilter !== 'ALL' && row.tallyGroupName !== groupFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = row.ledgerName.toLowerCase().includes(q);
        const matchesGroup = (row.tallyGroupName || '').toLowerCase().includes(q);
        const matchesCY = (row.cyFSLIName || '').toLowerCase().includes(q);
        const matchesSug = (row.suggestedFSLIName || '').toLowerCase().includes(q);
        const matchesReason = (row.reason || '').toLowerCase().includes(q);
        if (!matchesName && !matchesGroup && !matchesCY && !matchesSug && !matchesReason) {
          return false;
        }
      }

      return true;
    });
  }, [data, statusFilter, confidenceFilter, groupFilter, searchQuery]);

  const fslisByCategory = useMemo(() => {
    if (!data) return {};
    const categories: Record<string, FSLIRecord[]> = {};
    // Build children lookup
    const childrenByParent = new Map<string, FSLIRecord[]>();
    const topLevel: FSLIRecord[] = [];
    for (const f of data.fslis) {
      if (f.parentFSLIId) {
        if (!childrenByParent.has(f.parentFSLIId)) childrenByParent.set(f.parentFSLIId, []);
        childrenByParent.get(f.parentFSLIId)!.push(f);
      } else {
        topLevel.push(f);
      }
    }
    // Build ordered list: parent followed by its children
    for (const f of topLevel) {
      if (!categories[f.category]) categories[f.category] = [];
      categories[f.category].push(f);
      const children = childrenByParent.get(f.id);
      if (children) {
        for (const child of children) {
          categories[f.category].push(child);
        }
      }
    }
    return categories;
  }, [data]);

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Execute Phase 5 Auto Mapping strictly for selected unit / import batch */
  const handleAutoMap = async () => {
    if (!data) return;
    if (selectedUnitId === 'ALL') {
      showToast('Please select a specific Unit (e.g. SA Bioproducts) before running Auto-Map.', 'error');
      return;
    }

    try {
      setIsAutoMapping(true);
      const targetUnitName = selectedUnitName || 'Unit';

      // Find unmapped / suggested high-confidence rows in the current filtered unit population
      const highConfRows = data.rows.filter(
        (r) => (r.status === 'Suggested' || r.status === 'Unmapped') && r.confidenceScore >= 0.85 && r.suggestedFSLIId
      );

      if (highConfRows.length === 0) {
        showToast(`No pending high-confidence suggestions to auto-map for ${targetUnitName}.`, 'info');
        return;
      }

      const updates: BulkUpdateMappingItem[] = highConfRows.map((r) => ({
        ledgerId: r.ledgerId,
        mappedFSLIId: r.suggestedFSLIId!,
        status: 'Mapped',
        mappingSource: r.mappingSource,
        confidenceScore: r.confidenceScore,
        approvedBy: `AutoMap (${targetUnitName})`,
      }));

      if (window.electronAPI?.bulkUpdateLedgerMappings) {
        const res = await window.electronAPI.bulkUpdateLedgerMappings(data.activeFinancialYearId, updates);
        showToast(`Successfully auto-mapped and saved ${res.updatedCount} ledgers for ${targetUnitName}!`, 'success');
        await loadData(data.activeFinancialYearId, selectedUnitId, selectedBatchId);
      } else {
        showToast(`Auto-mapped ${updates.length} ledgers for ${targetUnitName}!`);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to auto-map unit ledgers', 'error');
    } finally {
      setIsAutoMapping(false);
    }
  };

  /** Accept a single suggested mapping */
  const handleAccept = async (row: WorkbenchLedgerRow) => {
    if (!data || !row.suggestedFSLIId) return;
    try {
      const update: BulkUpdateMappingItem = {
        ledgerId: row.ledgerId,
        mappedFSLIId: row.suggestedFSLIId,
        status: 'Mapped',
        mappingSource: row.mappingSource,
        confidenceScore: row.confidenceScore,
        approvedBy: 'User',
      };
      if (window.electronAPI?.bulkUpdateLedgerMappings) {
        await window.electronAPI.bulkUpdateLedgerMappings(data.activeFinancialYearId, [update]);
      } else {
        // Local state update for preview
        setData({
          ...data,
          rows: data.rows.map((r) =>
            r.ledgerId === row.ledgerId
              ? { ...r, status: 'Mapped', cyFSLIId: row.suggestedFSLIId, cyFSLIName: row.suggestedFSLIName }
              : r
          ),
        });
      }
      showToast(`Accepted mapping for "${row.ledgerName}" → ${row.suggestedFSLIName}`);
      if (window.electronAPI?.bulkUpdateLedgerMappings) {
        await loadData(data.activeFinancialYearId, selectedUnitId, selectedBatchId);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to accept mapping', 'error');
    }
  };

  /** Reject a single suggestion */
  const handleReject = async (row: WorkbenchLedgerRow) => {
    if (!data) return;
    try {
      const update: BulkUpdateMappingItem = {
        ledgerId: row.ledgerId,
        mappedFSLIId: null as string | null,
        status: 'Rejected' as MappingStatus,
        mappingSource: 'UserMapping' as const,
        confidenceScore: null,
        approvedBy: 'User',
      };
      if (window.electronAPI?.bulkUpdateLedgerMappings) {
        await window.electronAPI.bulkUpdateLedgerMappings(data.activeFinancialYearId, [update]);
      } else {
        setData({
          ...data,
          rows: data.rows.map((r) =>
            r.ledgerId === row.ledgerId ? { ...r, status: 'Rejected' } : r
          ),
        });
      }
      showToast(`Rejected suggestion for "${row.ledgerName}"`, 'info');
      if (window.electronAPI?.bulkUpdateLedgerMappings) {
        await loadData(data.activeFinancialYearId);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to reject mapping', 'error');
    }
  };


  /** Open FSLI picker to change / manually map a ledger */
  const handleOpenFSLIPicker = (row: WorkbenchLedgerRow) => {
    setFsliModalTarget({ type: 'single', row });
    setFsliSearch('');
    setFsliCategoryFilter('ALL');
    setFsliModalOpen(true);
  };

  /** Open FSLI picker for bulk mapping selected rows */
  const handleOpenBulkFSLIPicker = () => {
    if (selectedIds.size === 0) return;
    setFsliModalTarget({ type: 'bulk' });
    setFsliSearch('');
    setFsliCategoryFilter('ALL');
    setFsliModalOpen(true);
  };

  /** Confirm FSLI selection from picker modal */
  const handleConfirmFSLISelection = async (selectedFSLI: FSLIRecord) => {
    if (!data || !fsliModalTarget) return;

    try {
      if (fsliModalTarget.type === 'single') {
        const row = fsliModalTarget.row;
        const update: BulkUpdateMappingItem = {
          ledgerId: row.ledgerId,
          mappedFSLIId: selectedFSLI.id,
          status: 'Mapped',
          mappingSource: 'UserMapping',
          isManualOverride: true,
          confidenceScore: 1.0,
          approvedBy: 'User',
        };
        if (window.electronAPI?.bulkUpdateLedgerMappings) {
          await window.electronAPI.bulkUpdateLedgerMappings(data.activeFinancialYearId, [update]);
        } else {
          setData({
            ...data,
            rows: data.rows.map((r) =>
              r.ledgerId === row.ledgerId
                ? { ...r, status: 'Mapped', cyFSLIId: selectedFSLI.id, cyFSLIName: selectedFSLI.fsliName, isManualOverride: true }
                : r
            ),
          });
        }
        showToast(`Mapped "${row.ledgerName}" to "${selectedFSLI.fsliName}"`);
      } else {
        // Bulk Map
        const updates: BulkUpdateMappingItem[] = Array.from(selectedIds).map((id) => ({
          ledgerId: id,
          mappedFSLIId: selectedFSLI.id,
          status: 'Mapped',
          mappingSource: 'BulkMapping',
          isManualOverride: true,
          confidenceScore: 1.0,
          approvedBy: 'User (Bulk)',
        }));
        if (window.electronAPI?.bulkUpdateLedgerMappings) {
          await window.electronAPI.bulkUpdateLedgerMappings(data.activeFinancialYearId, updates);
        } else {
          setData({
            ...data,
            rows: data.rows.map((r) =>
              selectedIds.has(r.ledgerId)
                ? { ...r, status: 'Mapped', cyFSLIId: selectedFSLI.id, cyFSLIName: selectedFSLI.fsliName, isManualOverride: true }
                : r
            ),
          });
        }
        showToast(`Bulk mapped ${updates.length} ledgers to "${selectedFSLI.fsliName}"`);
      }

      setFsliModalOpen(false);
      setFsliModalTarget(null);
      if (window.electronAPI?.bulkUpdateLedgerMappings) {
        await loadData(data.activeFinancialYearId);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to update mapping', 'error');
    }
  };

  /** Accept all suggestions with high confidence (>= 85%) */
  const handleAcceptAllHighConfidence = async () => {
    if (!data) return;
    const highConfRows = data.rows.filter(
      (r) => r.status === 'Suggested' && r.confidenceScore >= 0.85 && r.suggestedFSLIId
    );

    if (highConfRows.length === 0) {
      showToast('No pending high-confidence suggestions found.', 'info');
      return;
    }

    try {
      const updates: BulkUpdateMappingItem[] = highConfRows.map((r) => ({
        ledgerId: r.ledgerId,
        mappedFSLIId: r.suggestedFSLIId!,
        status: 'Mapped',
        mappingSource: r.mappingSource,
        confidenceScore: r.confidenceScore,
        approvedBy: 'User (Bulk High Conf)',
      }));

      if (window.electronAPI?.bulkUpdateLedgerMappings) {
        await window.electronAPI.bulkUpdateLedgerMappings(data.activeFinancialYearId, updates);
      } else {
        setData({
          ...data,
          rows: data.rows.map((r) =>
            r.status === 'Suggested' && r.confidenceScore >= 0.85 && r.suggestedFSLIId
              ? { ...r, status: 'Mapped', cyFSLIId: r.suggestedFSLIId, cyFSLIName: r.suggestedFSLIName }
              : r
          ),
        });
      }
      showToast(`Accepted all ${updates.length} high-confidence suggestions!`);
      if (window.electronAPI?.bulkUpdateLedgerMappings) {
        await loadData(data.activeFinancialYearId);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to bulk accept suggestions', 'error');
    }
  };

  /** Bulk accept currently checked rows */
  const handleBulkAcceptSelected = async () => {
    if (!data || selectedIds.size === 0) return;
    const targetRows = data.rows.filter((r) => selectedIds.has(r.ledgerId) && r.suggestedFSLIId);

    if (targetRows.length === 0) {
      showToast('Selected ledgers do not have valid suggestions to accept.', 'error');
      return;
    }

    try {
      const updates: BulkUpdateMappingItem[] = targetRows.map((r) => ({
        ledgerId: r.ledgerId,
        mappedFSLIId: r.suggestedFSLIId!,
        status: 'Mapped',
        mappingSource: r.mappingSource,
        confidenceScore: r.confidenceScore,
        approvedBy: 'User (Bulk Selection)',
      }));

      if (window.electronAPI?.bulkUpdateLedgerMappings) {
        await window.electronAPI.bulkUpdateLedgerMappings(data.activeFinancialYearId, updates);
      } else {
        setData({
          ...data,
          rows: data.rows.map((r) =>
            selectedIds.has(r.ledgerId) && r.suggestedFSLIId
              ? { ...r, status: 'Mapped', cyFSLIId: r.suggestedFSLIId, cyFSLIName: r.suggestedFSLIName }
              : r
          ),
        });
      }
      showToast(`Accepted ${updates.length} selected mappings!`);
      if (window.electronAPI?.bulkUpdateLedgerMappings) {
        await loadData(data.activeFinancialYearId);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to bulk accept selected', 'error');
    }
  };

  /** Bulk reject currently checked rows */
  const handleBulkRejectSelected = async () => {
    if (!data || selectedIds.size === 0) return;
    try {
      const updates: BulkUpdateMappingItem[] = Array.from(selectedIds).map((id) => ({
        ledgerId: id,
        mappedFSLIId: null as string | null,
        status: 'Rejected' as MappingStatus,
        mappingSource: 'UserMapping' as const,
        approvedBy: 'User (Bulk Selection)',
      }));

      if (window.electronAPI?.bulkUpdateLedgerMappings) {
        await window.electronAPI.bulkUpdateLedgerMappings(data.activeFinancialYearId, updates);
      } else {
        setData({
          ...data,
          rows: data.rows.map((r) =>
            selectedIds.has(r.ledgerId) ? { ...r, status: 'Rejected' } : r
          ),
        });
      }
      showToast(`Rejected ${updates.length} selected mappings!`, 'info');
      if (window.electronAPI?.bulkUpdateLedgerMappings) {
        await loadData(data.activeFinancialYearId);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to bulk reject selected', 'error');
    }
  };

  /** Open Apply to Similar modal */
  const handleOpenApplySimilar = (row: WorkbenchLedgerRow) => {
    if (!data) return;
    const groupName = row.tallyGroupName || '';
    const affectedCount = data.rows.filter(
      (r) => (r.tallyGroupName || '').toLowerCase() === groupName.toLowerCase()
    ).length;

    setApplySimilarTarget({
      row,
      criteriaType: 'group',
      criteriaValue: groupName,
      affectedCount,
    });
    setApplySimilarModalOpen(true);
  };

  /** Execute Apply to Similar */
  const handleExecuteApplySimilar = async () => {
    if (!data || !applySimilarTarget || (!applySimilarTarget.row.cyFSLIId && !applySimilarTarget.row.suggestedFSLIId)) {
      return;
    }

    const targetFSLIId = applySimilarTarget.row.cyFSLIId || applySimilarTarget.row.suggestedFSLIId!;
    try {
      if (window.electronAPI?.applyMappingToSimilar) {
        const res = await window.electronAPI.applyMappingToSimilar(
          data.activeFinancialYearId,
          targetFSLIId,
          applySimilarTarget.criteriaType,
          applySimilarTarget.criteriaValue
        );
        showToast(`Applied mapping to ${res.updatedCount} similar ledgers!`);
      } else {
        showToast(`Applied mapping to ${applySimilarTarget.affectedCount} similar ledgers!`);
      }
      setApplySimilarModalOpen(false);
      setApplySimilarTarget(null);
      if (window.electronAPI?.applyMappingToSimilar) {
        await loadData(data.activeFinancialYearId);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to apply to similar ledgers', 'error');
    }
  };

  /** Open Rule Builder Modal prefilled from ledger */
  const handleOpenCreateRule = (row?: WorkbenchLedgerRow) => {
    if (row) {
      setRuleForm({
        ruleName: `Rule for ${row.tallyGroupName || row.ledgerName}`,
        priority: 10,
        field: row.tallyGroupName ? 'tally_group' : 'ledger_name',
        operator: 'equals',
        value: row.tallyGroupName || row.ledgerName,
        targetFSLIId: row.cyFSLIId || row.suggestedFSLIId || (data?.fslis[0]?.id || ''),
        scope: 'Global',
      });
    } else {
      setRuleForm({
        ruleName: 'Custom Mapping Rule',
        priority: 10,
        field: 'tally_group',
        operator: 'equals',
        value: '',
        targetFSLIId: data?.fslis[0]?.id || '',
        scope: 'Global',
      });
    }
    setRuleModalOpen(true);
  };

  /** Save new mapping rule */
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !ruleForm.ruleName || !ruleForm.value || !ruleForm.targetFSLIId) {
      showToast('Please fill in all required rule fields.', 'error');
      return;
    }

    try {
      if (window.electronAPI?.createMappingRule) {
        await window.electronAPI.createMappingRule({
          ruleName: ruleForm.ruleName,
          priority: Number(ruleForm.priority) || 10,
          conditions: {
            type: 'AND',
            rules: [{ field: ruleForm.field, operator: ruleForm.operator, value: ruleForm.value }],
          },
          action: 'map_to_fsli',
          targetFSLIId: ruleForm.targetFSLIId,
          confidence: 0.98,
          scope: ruleForm.scope,
          createdBy: 'User',
        });
      }

      showToast(`Created Rule "${ruleForm.ruleName}"! Auto-suggestions updated.`);
      setRuleModalOpen(false);
      if (window.electronAPI?.createMappingRule) {
        await loadData(data.activeFinancialYearId);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to create rule', 'error');
    }
  };


  // ── Selection Checkbox Helpers ────────────────────────────────────────────
  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredRows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRows.map((r) => r.ledgerId)));
    }
  };

  const handleToggleSelectRow = (ledgerId: string) => {
    const next = new Set(selectedIds);
    if (next.has(ledgerId)) next.delete(ledgerId);
    else next.add(ledgerId);
    setSelectedIds(next);
  };

  // ── Formatters ────────────────────────────────────────────────────────────
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

  const renderConfidenceBadge = (score: number) => {
    const pct = Math.round(score * 100);
    let colorClass = 'conf-low';
    if (score >= 0.85) colorClass = 'conf-high';
    else if (score >= 0.7) colorClass = 'conf-med';

    return (
      <span className={`confidence-pill ${colorClass}`} title={`Confidence: ${pct}%`}>
        {pct}%
      </span>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mapping-workbench-container">
      {/* Toast Notification */}
      {toast && (
        <div className={`toast-banner toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Header & FY / Unit / Import Batch Selectors */}
      <div className="workbench-header">
        <div className="workbench-title-area">
          <h1 className="workbench-title">Mapping Workbench</h1>
          <p className="workbench-subtitle">
            Map canonical Tally trial balance ledgers to standard Financial Statement Line Items (FSLIs).
          </p>
        </div>

        <div className="workbench-top-actions">
          {/* Financial Year Selector */}
          {data && data.financialYears.length > 0 && (
            <div className="fy-picker-wrapper">
              <label htmlFor="fy-select">Financial Year:</label>
              <select
                id="fy-select"
                className="fy-select"
                value={data.activeFinancialYearId}
                onChange={(e) => loadData(e.target.value, selectedUnitId, selectedBatchId)}
              >
                {data.financialYears.map((fy) => (
                  <option key={fy.id} value={fy.id}>
                    {fy.yearLabel}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Unit Selector */}
          {data && data.units && data.units.length > 0 && (
            <div className="fy-picker-wrapper">
              <label htmlFor="unit-select">Unit:</label>
              <select
                id="unit-select"
                className="fy-select"
                value={selectedUnitId}
                onChange={(e) => handleUnitChange(e.target.value)}
              >
                <option value="ALL">All Units ({data.units.length})</option>
                {data.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unitName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Import Batch Selector */}
          {data && availableBatchesForSelectedUnit.length > 0 && (
            <div className="fy-picker-wrapper">
              <label htmlFor="batch-select">Import Batch:</label>
              <select
                id="batch-select"
                className="fy-select"
                value={selectedBatchId}
                onChange={(e) => handleBatchChange(e.target.value)}
              >
                <option value="ALL">All Batches ({availableBatchesForSelectedUnit.length})</option>
                {availableBatchesForSelectedUnit.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.fileName} ({b.ledgerCount} ledgers)
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            className="btn btn-secondary"
            onClick={() => setFsliManagerOpen(true)}
            title="Manage authoritative Schedule III FSLI master line items"
          >
            📑 FSLI Master
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => setRulesManagerOpen(true)}
            title="Manage all user mapping rules"
          >
            ⚙️ Manage Rules
          </button>

          {onNavigateToUnmappedTracker && (
            <button
              className="btn btn-secondary"
              onClick={onNavigateToUnmappedTracker}
              title="Audit unmapped accounts & materiality"
            >
              📊 Unmapped Tracker
            </button>
          )}

          {/* Auto Map Button with Strict Safety Guardrail */}
          {selectedUnitId === 'ALL' ? (
            <button
              className="btn btn-secondary"
              disabled
              title="Safety Guardrail: Please select a specific Unit (e.g. SA Bioproducts) to run Auto-Mapping."
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
            >
              ⚡ Auto Map (Select a Unit)
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleAutoMap}
              disabled={isAutoMapping}
              title={`Execute Phase 5 Auto-Mapping rules on ${selectedUnitName || 'selected unit'}`}
            >
              {isAutoMapping ? '⏳ Auto-Mapping...' : `⚡ Auto Map (${selectedUnitName || 'Unit'})`}
            </button>
          )}

          <button
            className="btn btn-secondary"
            onClick={handleAcceptAllHighConfidence}
            title="Accept all suggestions with confidence >= 85%"
          >
            ✓ Accept High Conf (≥85%)
          </button>
        </div>
      </div>

      {/* Loading & Error Banners */}
      {loading && (
        <div className="workbench-loading-banner">
          <div className="spinner"></div>
          <span>Loading ledger mapping data...</span>
        </div>
      )}

      {error && (
        <div className="workbench-error-banner">
          <strong>Error:</strong> {error}
          <button className="btn btn-sm btn-secondary" onClick={() => loadData()}>
            Retry
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Summary KPI Ribbon (8 Distinct Categories) */}
          <div className="kpi-ribbon">
            <div className="kpi-card" onClick={() => setStatusFilter('ALL')} title="Total ledgers in selected population">
              <div className="kpi-label">Total Ledgers</div>
              <div className="kpi-value">{data.summary.totalLedgers}</div>
            </div>

            <div
              className={`kpi-card ${statusFilter === 'Mapped' ? 'kpi-active' : ''}`}
              onClick={() => setStatusFilter('Mapped')}
              title="Already saved/mapped ledgers"
            >
              <div className="kpi-label">Already Mapped</div>
              <div className="kpi-value kpi-green">{data.summary.mappedCount}</div>
            </div>

            <div
              className={`kpi-card ${statusFilter === 'Suggested' ? 'kpi-active' : ''}`}
              onClick={() => setStatusFilter('Suggested')}
              title="System-suggested mappings pending acceptance"
            >
              <div className="kpi-label">Suggested</div>
              <div className="kpi-value kpi-blue">{data.summary.suggestedCount}</div>
            </div>

            <div
              className={`kpi-card ${statusFilter === 'NeedsReview' ? 'kpi-active' : ''}`}
              onClick={() => setStatusFilter('NeedsReview')}
              title="Low confidence / flagged items requiring review"
            >
              <div className="kpi-label">Needs Review</div>
              <div className="kpi-value kpi-amber">{data.summary.needsReviewCount}</div>
            </div>

            <div
              className={`kpi-card ${statusFilter === 'Unmapped' ? 'kpi-active' : ''}`}
              onClick={() => setStatusFilter('Unmapped')}
              title="Ledgers with no mapped FSLI"
            >
              <div className="kpi-label">Unmapped</div>
              <div className="kpi-value kpi-gray">{data.summary.unmappedCount}</div>
            </div>

            <div
              className={`kpi-card ${statusFilter === 'Rejected' ? 'kpi-active' : ''}`}
              onClick={() => setStatusFilter('Rejected')}
              title="Explicitly rejected suggestions"
            >
              <div className="kpi-label">Rejected</div>
              <div className="kpi-value kpi-red">{data.summary.rejectedCount}</div>
            </div>

            <div
              className={`kpi-card ${confidenceFilter === 'HIGH' ? 'kpi-active' : ''}`}
              onClick={() => setConfidenceFilter(confidenceFilter === 'HIGH' ? 'ALL' : 'HIGH')}
              title="High confidence suggestions (>= 85%)"
            >
              <div className="kpi-label">High Confidence</div>
              <div className="kpi-value kpi-purple">{data.summary.highConfidenceCount}</div>
            </div>
          </div>

          {/* Filter Bar & View Toggle */}
          <div className="workbench-filter-bar">
            {/* Status Tabs */}
            <div className="status-tabs">
              {(['ALL', 'Suggested', 'Mapped', 'NeedsReview', 'Unmapped', 'Rejected'] as const).map((st) => (
                <button
                  key={st}
                  className={`status-tab ${statusFilter === st ? 'active' : ''}`}
                  onClick={() => setStatusFilter(st)}
                >
                  {st === 'ALL' ? 'All Ledgers' : st === 'NeedsReview' ? 'Needs Review' : st}
                </button>
              ))}
            </div>

            {/* View Mode Toggle */}
            <div className="view-mode-toggle" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                className={`btn btn-sm ${!auditMode ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setAuditMode(false)}
                title="Standard Workbench grid view"
              >
                📋 Standard View
              </button>
              <button
                className={`btn btn-sm ${auditMode ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setAuditMode(true)}
                title="Ledger-level Audit view: Ledger → Group → Balance → FSLI → Rule → Confidence"
              >
                🔍 Ledger-Level Audit
              </button>
            </div>

            {/* Controls */}
            <div className="filter-controls">
              {/* Tally Group Filter */}
              <select
                className="select-input"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <option value="ALL">All Tally Groups ({tallyGroups.length})</option>
                {tallyGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>

              {/* Confidence Filter */}
              <select
                className="select-input"
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value as any)}
              >
                <option value="ALL">All Confidence Levels</option>
                <option value="HIGH">High (≥ 85%)</option>
                <option value="MED">Medium (70% - 84%)</option>
                <option value="LOW">Low (&lt; 70%)</option>
              </select>

              {/* Search Bar */}
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search ledger, group, FSLI..."
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

          {/* Bulk Selection Floating Action Bar */}
          {selectedIds.size > 0 && !auditMode && (
            <div className="bulk-action-bar">
              <div className="bulk-selected-info">
                <strong>{selectedIds.size}</strong> of {filteredRows.length} ledgers selected
              </div>

              <div className="bulk-buttons">
                <button className="btn btn-sm btn-success" onClick={handleBulkAcceptSelected}>
                  ✓ Accept Selected
                </button>
                <button className="btn btn-sm btn-primary" onClick={handleOpenBulkFSLIPicker}>
                  📁 Map Selected to FSLI...
                </button>
                <button className="btn btn-sm btn-danger" onClick={handleBulkRejectSelected}>
                  ✕ Reject Selected
                </button>
                <button className="btn btn-sm btn-secondary" onClick={() => setSelectedIds(new Set())}>
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* Workbench Table / Ledger-Level Audit Table */}
          <div className="workbench-table-container">
            {auditMode ? (
              /* ── Ledger-Level Audit View Table ────────────────────────── */
              <table className="workbench-table audit-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th>Ledger Name</th>
                    <th>Unit / Batch</th>
                    <th>Tally Group</th>
                    <th style={{ textAlign: 'right' }}>Debit (Dr)</th>
                    <th style={{ textAlign: 'right' }}>Credit (Cr)</th>
                    <th style={{ textAlign: 'right' }}>Net Balance</th>
                    <th>Mapped / Suggested FSLI</th>
                    <th>Mapping Rule / Source</th>
                    <th style={{ textAlign: 'center' }}>Confidence</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="empty-table-cell">
                        No ledgers match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, idx) => {
                      const displayFSLIName = row.cyFSLIName || row.suggestedFSLIName || '— Unmapped —';
                      const displayFSLICode = row.cyFSLICode || row.suggestedFSLICode || '';
                      return (
                        <tr key={row.ledgerId}>
                          <td style={{ color: '#94a3b8', fontSize: '12px' }}>{idx + 1}</td>
                          <td>
                            <strong style={{ color: '#0f172a' }}>{row.ledgerName}</strong>
                          </td>
                          <td>
                            <div style={{ fontSize: '12px', color: '#475569' }}>
                              <span className="badge" style={{ background: '#f1f5f9', color: '#334155' }}>
                                {row.unitName || 'Default'}
                              </span>
                              {row.importBatchFileName && (
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                  {row.importBatchFileName}
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            <span style={{ color: '#334155' }}>{row.tallyGroupName || '—'}</span>
                            {row.parentGroupName && (
                              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>
                                ↳ {row.parentGroupName}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                            {row.debit > 0 ? `₹${formatCurrency(row.debit)}` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                            {row.credit > 0 ? `₹${formatCurrency(row.credit)}` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                            <span className={row.netBalance >= 0 ? 'balance-dr' : 'balance-cr'}>
                              ₹{formatCurrency(row.netBalance)}{' '}
                              <small>{row.netBalance >= 0 ? 'Dr' : 'Cr'}</small>
                            </span>
                          </td>
                          <td>
                            <div>
                              <strong style={{ color: '#1e293b' }}>{displayFSLIName}</strong>
                              {displayFSLICode && (
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', fontFamily: 'monospace' }}>
                                  [{displayFSLICode}]
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontSize: '12px' }}>
                              <span className="badge" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' }}>
                                {row.mappingSource}
                              </span>
                              <div style={{ color: '#64748b', fontSize: '11px', marginTop: '3px' }}>
                                {row.reason}
                              </div>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {renderConfidenceBadge(row.confidenceScore)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {renderStatusBadge(row.status)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              /* ── Standard Workbench View Table ────────────────────────── */
              <table className="workbench-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={filteredRows.length > 0 && selectedIds.size === filteredRows.length}
                        onChange={handleToggleSelectAll}
                        title="Select all"
                      />
                    </th>
                    <th>Ledger Name</th>
                    <th>Tally Group</th>
                    <th style={{ textAlign: 'right' }}>Net Balance</th>
                    <th>CY Classification</th>
                    <th>PY Classification</th>
                    <th>Suggested FSLI</th>
                    <th style={{ textAlign: 'center' }}>Confidence</th>
                    <th>Reason / Rule</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'right', minWidth: '160px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="empty-table-cell">
                        No ledgers match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const isSelected = selectedIds.has(row.ledgerId);
                      return (
                        <tr key={row.ledgerId} className={isSelected ? 'row-selected' : ''}>
                          {/* Checkbox */}
                          <td>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectRow(row.ledgerId)}
                            />
                          </td>

                          {/* Ledger Name */}
                          <td>
                            <div className="ledger-name-cell">
                              <span className="ledger-name-text">{row.ledgerName}</span>
                              <span className={`nature-tag nature-${row.balanceNature.toLowerCase()}`}>
                                {row.balanceNature === 'Debit' ? 'Dr' : row.balanceNature === 'Credit' ? 'Cr' : '0'}
                              </span>
                            </div>
                            {selectedUnitId === 'ALL' && row.unitName && (
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                🏢 {row.unitName}
                              </div>
                            )}
                          </td>

                          {/* Tally Group */}
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

                          {/* CY Classification */}
                          <td>
                            {row.cyFSLIName ? (
                              <div className="mapped-fsli-tag">
                                <span className="fsli-title">{row.cyFSLIName}</span>
                                {row.isManualOverride && <span className="manual-indicator" title="Manually overridden">✍️</span>}
                              </div>
                            ) : (
                              <span className="unmapped-placeholder">— Not Mapped —</span>
                            )}
                          </td>

                          {/* PY Classification */}
                          <td>
                            {row.pyFSLIName ? (
                              <span className="py-fsli-tag">{row.pyFSLIName}</span>
                            ) : (
                              <span className="py-placeholder">—</span>
                            )}
                          </td>

                          {/* Suggested FSLI */}
                          <td>
                            {row.suggestedFSLIName ? (
                              <div
                                className="suggested-fsli-box"
                                onClick={() => handleOpenFSLIPicker(row)}
                                title="Click to change FSLI"
                              >
                                <span className="sug-name">{row.suggestedFSLIName}</span>
                                {row.category && <span className="sug-cat">{row.category}</span>}
                              </div>
                            ) : (
                              <span className="unmapped-placeholder">No suggestion</span>
                            )}
                          </td>

                          {/* Confidence */}
                          <td style={{ textAlign: 'center' }}>
                            {renderConfidenceBadge(row.confidenceScore)}
                          </td>

                          {/* Reason */}
                          <td>
                            <div className="reason-cell" title={row.reason}>
                              {row.reason}
                            </div>
                          </td>

                          {/* Status */}
                          <td style={{ textAlign: 'center' }}>
                            {renderStatusBadge(row.status)}
                          </td>

                          {/* Actions */}
                          <td style={{ textAlign: 'right' }}>
                            <div className="action-button-group">
                              {row.status !== 'Mapped' && (
                                <button
                                  className="action-btn action-accept"
                                  onClick={() => handleAccept(row)}
                                  title="Accept Suggestion"
                                >
                                  ✓ Accept
                                </button>
                              )}

                              <button
                                className="action-btn action-change"
                                onClick={() => handleOpenFSLIPicker(row)}
                                title="Change / Manual Map"
                              >
                                Change
                              </button>

                              {row.status !== 'Rejected' && (
                                <button
                                  className="action-btn action-reject"
                                  onClick={() => handleReject(row)}
                                  title="Reject"
                                >
                                  ✕
                                </button>
                              )}

                              {/* Dropdown for More Actions */}
                              <div className="more-actions-dropdown">
                                <button
                                  className="action-btn action-more"
                                  onClick={() => handleOpenApplySimilar(row)}
                                  title="Apply to similar ledgers"
                                >
                                  Similar
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── FSLI Picker Modal ─────────────────────────────────────────────── */}
      {fsliModalOpen && (
        <div className="modal-overlay" onClick={() => setFsliModalOpen(false)}>
          <div className="modal-content fsli-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {fsliModalTarget?.type === 'single'
                  ? `Select FSLI for "${fsliModalTarget.row.ledgerName}"`
                  : `Bulk Map ${selectedIds.size} Selected Ledgers`}
              </h2>
              <button className="modal-close-btn" onClick={() => setFsliModalOpen(false)}>
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
              {data &&
                Object.entries(fslisByCategory).map(([cat, fList]) => {
                  if (fsliCategoryFilter !== 'ALL' && fsliCategoryFilter !== cat) return null;

                  const filteredFList = fList.filter((f) => {
                    if (!fsliSearch.trim()) return true;
                    const q = fsliSearch.toLowerCase();
                    return f.fsliName.toLowerCase().includes(q) || (f.subCategory || '').toLowerCase().includes(q);
                  });

                  if (filteredFList.length === 0) return null;

                  return (
                    <div key={cat} className="fsli-cat-group">
                      <div className="fsli-cat-title">{cat}</div>
                      <div className="fsli-grid">
                        {filteredFList.map((f) => (
                          <div
                            key={f.id}
                            className={`fsli-item-card ${f.parentFSLIId ? 'fsli-item-child' : ''}`}
                            onClick={() => handleConfirmFSLISelection(f)}
                          >
                            <div className="fsli-card-name">
                              {f.parentFSLIId && <span className="fsli-picker-indent">└─ </span>}
                              {f.fsliName}
                            </div>
                            {f.subCategory && <div className="fsli-card-sub">{f.subCategory}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setFsliModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Rule Modal ─────────────────────────────────────────────── */}
      {ruleModalOpen && (
        <div className="modal-overlay" onClick={() => setRuleModalOpen(false)}>
          <div className="modal-content rule-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Reusable Mapping Rule</h2>
              <button className="modal-close-btn" onClick={() => setRuleModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRule}>
              <div className="form-group">
                <label>Rule Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sundry Creditors → Trade Payables"
                  value={ruleForm.ruleName}
                  onChange={(e) => setRuleForm({ ...ruleForm, ruleName: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Priority (Higher = Evaluated First)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={ruleForm.priority}
                    onChange={(e) => setRuleForm({ ...ruleForm, priority: Number(e.target.value) })}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label>Scope</label>
                  <select
                    value={ruleForm.scope}
                    onChange={(e) => setRuleForm({ ...ruleForm, scope: e.target.value as any })}
                    className="form-input"
                  >
                    <option value="Global">Global (All Entities)</option>
                    <option value="Client">Client</option>
                    <option value="Entity">Entity Only</option>
                  </select>
                </div>
              </div>

              <div className="rule-condition-box">
                <div className="condition-box-title">Condition Definition</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Match Field</label>
                    <select
                      value={ruleForm.field}
                      onChange={(e) => setRuleForm({ ...ruleForm, field: e.target.value })}
                      className="form-input"
                    >
                      <option value="tally_group">Tally Group Name</option>
                      <option value="parent_group">Parent Group Name</option>
                      <option value="ledger_name">Ledger Name Keyword</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Operator</label>
                    <select
                      value={ruleForm.operator}
                      onChange={(e) => setRuleForm({ ...ruleForm, operator: e.target.value })}
                      className="form-input"
                    >
                      <option value="equals">Equals Exact</option>
                      <option value="contains">Contains Substring</option>
                      <option value="starts_with">Starts With</option>
                      <option value="matches_regex">Matches Regex Pattern</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ flex: 2 }}>
                    <label>Match Value *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sundry Creditors or Salary"
                      value={ruleForm.value}
                      onChange={(e) => setRuleForm({ ...ruleForm, value: e.target.value })}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <div className="fsli-label-action-row">
                  <label>Target FSLI Line Item *</label>
                  <button
                    type="button"
                    className="btn-link-action"
                    onClick={() => setFsliManagerOpen(true)}
                  >
                    ⚙ Manage / + Add FSLI
                  </button>
                </div>
                <select
                  value={ruleForm.targetFSLIId}
                  onChange={(e) => setRuleForm({ ...ruleForm, targetFSLIId: e.target.value })}
                  className="form-input"
                  required
                >
                  <option value="">-- Select Target FSLI --</option>
                  {data?.fslis.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.parentFSLIId ? '    └─ ' : ''}[{f.category}] {f.fsliName} ({f.fsliCode || 'N/A'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setRuleModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Rule & Re-evaluate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Apply to Similar Confirmation Modal ───────────────────────────── */}
      {applySimilarModalOpen && applySimilarTarget && (
        <div className="modal-overlay" onClick={() => setApplySimilarModalOpen(false)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Apply to Similar Ledgers</h2>
              <button className="modal-close-btn" onClick={() => setApplySimilarModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body-text">
              <p>
                Apply the mapping <strong>"{applySimilarTarget.row.cyFSLIName || applySimilarTarget.row.suggestedFSLIName}"</strong> to all ledgers in Tally Group <strong>"{applySimilarTarget.criteriaValue}"</strong>?
              </p>
              <div className="affected-badge">
                This will update <strong>{applySimilarTarget.affectedCount}</strong> ledgers in the current financial year.
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setApplySimilarModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleExecuteApplySimilar}>
                Confirm & Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rules Manager Modal ───────────────────────────────────────────── */}
      {data && (
        <RulesManagerModal
          isOpen={rulesManagerOpen}
          onClose={() => setRulesManagerOpen(false)}
          fslis={data.fslis}
          onRulesChanged={() => loadData(data.activeFinancialYearId)}
        />
      )}

      {/* ── FSLI Master Management Modal ─────────────────────────────────────── */}
      <FSLIManagerModal
        isOpen={fsliManagerOpen}
        onClose={() => setFsliManagerOpen(false)}
        onFSLIChanged={() => {
          if (data) {
            loadData(data.activeFinancialYearId);
          }
        }}
        onFSLICreated={(newFSLI) => {
          if (ruleModalOpen) {
            setRuleForm((prev) => ({ ...prev, targetFSLIId: newFSLI.id }));
          }
        }}
      />
    </div>
  );
}

