import React, { useState, useEffect, useMemo } from 'react';
import type {
  FSLIRecord,
  CreateFSLIInput,
  UpdateFSLIInput,
} from '../../electron-api';

interface FSLIManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFSLIChanged: () => void;
  onFSLICreated?: (newFSLI: FSLIRecord) => void;
  initialCreateMode?: boolean;
}

const CATEGORIES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'] as const;

/** Tree node wrapping an FSLI record with its children. */
interface FSLITreeNode {
  fsli: FSLIRecord;
  children: FSLITreeNode[];
}

export default function FSLIManagerModal({
  isOpen,
  onClose,
  onFSLIChanged,
  onFSLICreated,
  initialCreateMode = false,
}: FSLIManagerModalProps) {
  const [fslis, setFslis] = useState<FSLIRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'SYSTEM' | 'USER'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Form State
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [editingFSLI, setEditingFSLI] = useState<FSLIRecord | null>(null);
  const [parentFSLIForCreate, setParentFSLIForCreate] = useState<FSLIRecord | null>(null);
  const [form, setForm] = useState<{
    fsliName: string;
    fsliCode: string;
    category: string;
    subCategory: string;
    displayOrder: number;
    active: boolean;
  }>({
    fsliName: '',
    fsliCode: '',
    category: 'Asset',
    subCategory: '',
    displayOrder: 1000,
    active: true,
  });

  // Expand/collapse state for tree nodes
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadFSLIs = async () => {
    try {
      setLoading(true);
      if (window.electronAPI?.listAllFSLIs) {
        const res = await window.electronAPI.listAllFSLIs(true);
        setFslis(res);
      } else if (window.electronAPI?.listFSLIs) {
        const res = await window.electronAPI.listFSLIs();
        setFslis(res);
      } else {
        // Standalone preview fallback
        setFslis([]);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to load FSLIs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadFSLIs();
      if (initialCreateMode) {
        handleStartCreate();
      } else {
        setIsCreating(false);
        setEditingFSLI(null);
        setParentFSLIForCreate(null);
      }
    }
  }, [isOpen, initialCreateMode]);

  const handleStartCreate = (parentFSLI?: FSLIRecord) => {
    setIsCreating(true);
    setEditingFSLI(null);
    setParentFSLIForCreate(parentFSLI || null);
    setForm({
      fsliName: '',
      fsliCode: '',
      category: parentFSLI?.category || 'Asset',
      subCategory: parentFSLI?.subCategory || '',
      displayOrder: 1000,
      active: true,
    });
  };

  const handleStartEdit = (item: FSLIRecord) => {
    if (item.source === 'SYSTEM') {
      showToast('System-standard Schedule III FSLIs cannot be modified.', 'info');
      return;
    }
    setEditingFSLI(item);
    setIsCreating(false);
    setParentFSLIForCreate(null);
    setForm({
      fsliName: item.fsliName,
      fsliCode: item.fsliCode || '',
      category: item.category,
      subCategory: item.subCategory || '',
      displayOrder: item.displayOrder,
      active: item.active,
    });
  };

  const handleToggleActive = async (item: FSLIRecord) => {
    if (item.source === 'SYSTEM' && item.active) {
      showToast('System-standard Schedule III FSLIs cannot be deactivated.', 'info');
      return;
    }
    try {
      const nextActive = !item.active;
      if (window.electronAPI?.toggleFSLIActive) {
        await window.electronAPI.toggleFSLIActive(item.id, nextActive);
      }
      setFslis(fslis.map((f) => (f.id === item.id ? { ...f, active: nextActive } : f)));
      showToast(`FSLI "${item.fsliName}" ${nextActive ? 'activated' : 'deactivated'}.`);
      onFSLIChanged();
    } catch (err: any) {
      showToast(err?.message || 'Failed to toggle FSLI status', 'error');
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = form.fsliName.trim();
    const trimmedCode = form.fsliCode.trim().toUpperCase();

    if (!trimmedName) {
      showToast('FSLI Name is required.', 'error');
      return;
    }
    // Code is only required for top-level non-child creation
    if (isCreating && !parentFSLIForCreate && !trimmedCode) {
      showToast('FSLI Code is required.', 'error');
      return;
    }

    try {
      if (isCreating) {
        if (!window.electronAPI?.createFSLI) {
          showToast('Electron API unavailable in preview mode.', 'info');
          return;
        }

        const input: CreateFSLIInput = {
          fsliName: trimmedName,
          fsliCode: parentFSLIForCreate ? '' : trimmedCode, // code auto-generated for children
          category: parentFSLIForCreate ? parentFSLIForCreate.category : form.category,
          subCategory: form.subCategory.trim() || undefined,
          displayOrder: Number(form.displayOrder) || 1000,
          active: form.active,
          parentFSLIId: parentFSLIForCreate?.id,
        };

        const created = await window.electronAPI.createFSLI(input);
        showToast(`Created FSLI "${created.fsliName}" successfully.`);
        setIsCreating(false);
        setParentFSLIForCreate(null);
        // Auto-expand parent to show new child
        if (parentFSLIForCreate) {
          setExpandedIds((prev) => new Set([...prev, parentFSLIForCreate.id]));
        }
        await loadFSLIs();
        onFSLIChanged();
        if (onFSLICreated) {
          onFSLICreated(created);
        }
      } else if (editingFSLI) {
        if (!window.electronAPI?.updateFSLI) {
          showToast('Electron API unavailable in preview mode.', 'info');
          return;
        }

        const updateInput: UpdateFSLIInput = {
          fsliName: trimmedName,
          category: form.category,
          subCategory: form.subCategory.trim() || undefined,
          displayOrder: Number(form.displayOrder) || 1000,
          active: form.active,
        };

        const updated = await window.electronAPI.updateFSLI(editingFSLI.id, updateInput);
        showToast(`Updated FSLI "${updated.fsliName}" successfully.`);
        setEditingFSLI(null);
        await loadFSLIs();
        onFSLIChanged();
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to save FSLI', 'error');
    }
  };

  // ── Build tree structure from flat FSLI list ────────────────────────────

  const { filteredTree, flatFilteredIds } = useMemo(() => {
    // Step 1: Apply filters to get matching FSLIs
    const matchesFilter = (f: FSLIRecord): boolean => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = f.fsliName.toLowerCase().includes(q);
        const matchCode = (f.fsliCode || '').toLowerCase().includes(q);
        const matchSub = (f.subCategory || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchSub) return false;
      }
      if (categoryFilter !== 'ALL' && f.category !== categoryFilter) return false;
      if (sourceFilter !== 'ALL') {
        const fSource = f.source || 'SYSTEM';
        if (fSource !== sourceFilter) return false;
      }
      if (statusFilter === 'ACTIVE' && !f.active) return false;
      if (statusFilter === 'INACTIVE' && f.active) return false;
      return true;
    };

    // Build ID sets for fast lookup
    const allById = new Map<string, FSLIRecord>();
    for (const f of fslis) allById.set(f.id, f);

    // Find all FSLIs that match the filter OR have a descendant that matches
    const matchingIds = new Set<string>();
    const ancestorIds = new Set<string>();

    for (const f of fslis) {
      if (matchesFilter(f)) {
        matchingIds.add(f.id);
        // Walk up the parent chain to ensure ancestors are visible
        let current = f;
        while (current.parentFSLIId) {
          ancestorIds.add(current.parentFSLIId);
          const parent = allById.get(current.parentFSLIId);
          if (!parent) break;
          current = parent;
        }
      }
    }

    const visibleIds = new Set([...matchingIds, ...ancestorIds]);

    // Step 2: Build tree
    const childrenMap = new Map<string, FSLITreeNode[]>();
    const roots: FSLITreeNode[] = [];

    // First pass: create nodes for all visible FSLIs
    const nodeMap = new Map<string, FSLITreeNode>();
    for (const f of fslis) {
      if (!visibleIds.has(f.id)) continue;
      nodeMap.set(f.id, { fsli: f, children: [] });
    }

    // Second pass: link children to parents
    for (const [id, node] of nodeMap) {
      const parentId = node.fsli.parentFSLIId;
      if (parentId && nodeMap.has(parentId)) {
        nodeMap.get(parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return { filteredTree: roots, flatFilteredIds: visibleIds };
  }, [fslis, searchQuery, categoryFilter, sourceFilter, statusFilter]);

  const counts = useMemo(() => {
    let systemCount = 0;
    let userCount = 0;
    let activeCount = 0;
    let childCount = 0;
    for (const f of fslis) {
      if ((f.source || 'SYSTEM') === 'SYSTEM') systemCount++;
      else userCount++;
      if (f.active) activeCount++;
      if (f.parentFSLIId) childCount++;
    }
    return {
      total: fslis.length,
      systemCount,
      userCount,
      activeCount,
      inactiveCount: fslis.length - activeCount,
      childCount,
    };
  }, [fslis]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const allParentIds = new Set<string>();
    for (const f of fslis) {
      if (!f.parentFSLIId) {
        // Check if this FSLI has children
        if (fslis.some((c) => c.parentFSLIId === f.id)) {
          allParentIds.add(f.id);
        }
      }
      // Any FSLI that has children
      if (fslis.some((c) => c.parentFSLIId === f.id)) {
        allParentIds.add(f.id);
      }
    }
    setExpandedIds(allParentIds);
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  // ── Render tree row recursively ────────────────────────────────────────

  const renderTreeRow = (node: FSLITreeNode, depth: number, isLast: boolean): React.ReactNode[] => {
    const { fsli: item, children } = node;
    const isSystem = (item.source || 'SYSTEM') === 'SYSTEM';
    const hasChildren = children.length > 0 || fslis.some((f) => f.parentFSLIId === item.id && !flatFilteredIds.has(f.id));
    const actualChildrenInData = fslis.filter((f) => f.parentFSLIId === item.id);
    const hasAnyChildren = actualChildrenInData.length > 0;
    const isExpanded = expandedIds.has(item.id);
    const isChild = depth > 0;

    const rows: React.ReactNode[] = [];

    rows.push(
      <tr
        key={item.id}
        className={`${!item.active ? 'fsli-row-inactive' : ''} ${isChild ? 'fsli-child-row' : ''}`}
      >
        {/* Active Switch */}
        <td>
          <label
            className={`switch-toggle ${isSystem ? 'toggle-protected' : ''}`}
            title={
              isSystem
                ? 'System standard line item (Protected from deactivation)'
                : item.active
                ? 'Click to deactivate'
                : 'Click to activate'
            }
          >
            <input
              type="checkbox"
              checked={item.active}
              disabled={isSystem}
              onChange={() => handleToggleActive(item)}
            />
            <span className="slider-round"></span>
          </label>
        </td>

        {/* FSLI Name with tree visual */}
        <td>
          <div className="fsli-name-cell" style={{ paddingLeft: `${depth * 28}px` }}>
            {/* Tree connector for children */}
            {isChild && (
              <span className="fsli-tree-connector" title="Child FSLI">
                {isLast ? '└─' : '├─'}
              </span>
            )}
            {/* Expand/collapse toggle for parents */}
            {hasAnyChildren && (
              <button
                className="fsli-expand-btn"
                onClick={() => toggleExpand(item.id)}
                title={isExpanded ? 'Collapse children' : 'Expand children'}
              >
                {isExpanded ? '▾' : '▸'}
              </button>
            )}
            <span className="fsli-table-name">{item.fsliName}</span>
            {isChild && (
              <span className="fsli-child-badge" title="Child FSLI">child</span>
            )}
          </div>
        </td>

        {/* FSLI Code */}
        <td>
          <code className="fsli-code-pill">{item.fsliCode || '—'}</code>
        </td>

        {/* Category */}
        <td>
          <span className={`category-tag category-${item.category.toLowerCase()}`}>
            {item.category}
          </span>
        </td>

        {/* Sub-Category */}
        <td>
          <span className="fsli-subcat-text">{item.subCategory || '—'}</span>
        </td>

        {/* Display Order */}
        <td style={{ textAlign: 'center' }}>
          <span className="order-badge">{item.displayOrder}</span>
        </td>

        {/* Source */}
        <td>
          {isSystem ? (
            <span className="source-badge source-system" title="Schedule III System Standard">
              🔒 System
            </span>
          ) : (
            <span className="source-badge source-user" title="Custom User Defined FSLI">
              👤 User
            </span>
          )}
        </td>

        {/* Actions */}
        <td style={{ textAlign: 'right' }}>
          <div className="fsli-row-actions">
            {/* Add Child button — available for any FSLI (system or user) */}
            <button
              className="action-btn action-add-child"
              onClick={() => handleStartCreate(item)}
              title={`Add child FSLI under "${item.fsliName}"`}
            >
              + Child
            </button>
            {isSystem ? (
              <span className="fsli-protected-text" title="Standard Schedule III line item is locked">
                Standard
              </span>
            ) : (
              <button
                className="action-btn action-change"
                onClick={() => handleStartEdit(item)}
                title="Edit user FSLI"
              >
                ✎ Edit
              </button>
            )}
          </div>
        </td>
      </tr>
    );

    // Render children if expanded
    if (isExpanded && children.length > 0) {
      children.forEach((child, idx) => {
        const childIsLast = idx === children.length - 1;
        rows.push(...renderTreeRow(child, depth + 1, childIsLast));
      });
    }

    return rows;
  };

  if (!isOpen) return null;

  // Determine the parent name for the edit context
  const editingParentName = editingFSLI?.parentFSLIId
    ? fslis.find((f) => f.id === editingFSLI.parentFSLIId)?.fsliName || null
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content fsli-manager-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="fsli-modal-title-area">
            <div className="fsli-modal-title-row">
              <span className="fsli-modal-icon">📑</span>
              <h2>FSLI Master Management</h2>
              <span className="fsli-count-pill">{counts.total} items</span>
            </div>
            <span className="fsli-modal-sub">
              Authoritative Schedule III / Accounting Standard Financial Statement Line Items (FSLIs).
              Supports hierarchical parent-child structure.
            </span>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`fsli-manager-toast fsli-toast-${toast.type}`}>
            <span>{toast.message}</span>
          </div>
        )}

        {/* Body */}
        <div className="fsli-manager-body">
          {/* Top Summary & Action Bar */}
          {!isCreating && !editingFSLI && (
            <div className="fsli-top-toolbar">
              <div className="fsli-stat-chips">
                <span className="fsli-chip fsli-chip-sys">
                  <strong>{counts.systemCount}</strong> System Standard
                </span>
                <span className="fsli-chip fsli-chip-user">
                  <strong>{counts.userCount}</strong> User Defined
                </span>
                <span className="fsli-chip fsli-chip-active">
                  <strong>{counts.activeCount}</strong> Active
                </span>
                {counts.childCount > 0 && (
                  <span className="fsli-chip fsli-chip-child">
                    <strong>{counts.childCount}</strong> Child FSLIs
                  </span>
                )}
              </div>
              <div className="fsli-toolbar-actions">
                <button className="btn btn-secondary btn-sm" onClick={expandAll} title="Expand all parent FSLIs">
                  ▾ Expand All
                </button>
                <button className="btn btn-secondary btn-sm" onClick={collapseAll} title="Collapse all parent FSLIs">
                  ▸ Collapse All
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => handleStartCreate()}>
                  + Add New FSLI
                </button>
              </div>
            </div>
          )}

          {/* Form View (Create or Edit) */}
          {isCreating || editingFSLI ? (
            <form onSubmit={handleSaveForm} className="fsli-editor-form">
              <div className="form-legend">
                <div className="legend-title">
                  {isCreating
                    ? parentFSLIForCreate
                      ? `➕ Add Child FSLI under "${parentFSLIForCreate.fsliName}"`
                      : '➕ Add New Financial Statement Line Item (FSLI)'
                    : `✏️ Edit User FSLI: "${editingFSLI?.fsliName}"`}
                </div>
                <div className="legend-subtitle">
                  {isCreating
                    ? parentFSLIForCreate
                      ? 'Create a child line item. Category is inherited from the parent. Code is auto-generated.'
                      : 'Define a new Target FSLI line item. It will immediately become available in the Mapping Rule dropdowns.'
                    : 'Update line item details. Note: System standard FSLIs cannot be modified.'}
                </div>
              </div>

              {/* Parent context pill for child creation or editing */}
              {(parentFSLIForCreate || editingParentName) && (
                <div className="fsli-parent-context">
                  <span className="parent-context-label">Parent FSLI:</span>
                  <span className="parent-context-name">
                    {parentFSLIForCreate?.fsliName || editingParentName}
                  </span>
                  <span className="parent-context-category">
                    [{parentFSLIForCreate?.category || editingFSLI?.category}]
                  </span>
                </div>
              )}

              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label>FSLI Name *</label>
                  <input
                    type="text"
                    required
                    placeholder={
                      parentFSLIForCreate
                        ? 'e.g. Communication Expenses, Office Expenses'
                        : 'e.g. Other Financial Assets or CSR Expenses'
                    }
                    value={form.fsliName}
                    onChange={(e) => setForm({ ...form, fsliName: e.target.value })}
                    className="form-input"
                    autoFocus
                  />
                  <span className="form-hint">
                    {parentFSLIForCreate
                      ? 'Name for the child line item under the parent.'
                      : 'Canonical description used in financial statements.'}
                  </span>
                </div>

                {/* Code: hidden for child creation, read-only for edit */}
                {!parentFSLIForCreate && (
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>FSLI Code *</label>
                    <input
                      type="text"
                      required={!parentFSLIForCreate}
                      disabled={!isCreating}
                      placeholder="e.g. CA_OTH_FIN_ASSET"
                      value={form.fsliCode}
                      onChange={(e) => setForm({ ...form, fsliCode: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                      className={`form-input ${!isCreating ? 'input-disabled' : ''}`}
                    />
                    <span className="form-hint">Unique standard identifier code.</span>
                  </div>
                )}
                {parentFSLIForCreate && (
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>FSLI Code</label>
                    <input
                      type="text"
                      disabled
                      value="(auto-generated)"
                      className="form-input input-disabled"
                    />
                    <span className="form-hint">Auto-generated from parent code.</span>
                  </div>
                )}
              </div>

              <div className="form-row">
                {/* Category: inherited for child creation */}
                <div className="form-group">
                  <label>Category *</label>
                  {parentFSLIForCreate ? (
                    <input
                      type="text"
                      disabled
                      value={parentFSLIForCreate.category}
                      className="form-input input-disabled"
                    />
                  ) : (
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="form-input"
                      required
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="form-group">
                  <label>Sub-Category (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Current Assets or Operating Expenses"
                    value={form.subCategory}
                    onChange={(e) => setForm({ ...form, subCategory: e.target.value })}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ maxWidth: '140px' }}>
                  <label>Display Order</label>
                  <input
                    type="number"
                    min="1"
                    max="9999"
                    value={form.displayOrder}
                    onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })}
                    className="form-input"
                  />
                </div>

                <div className="form-group active-toggle-group" style={{ maxWidth: '110px' }}>
                  <label>Active Status</label>
                  <label className="switch-toggle" style={{ marginTop: '6px' }}>
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    />
                    <span className="slider-round"></span>
                  </label>
                </div>
              </div>

              <div className="form-actions-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingFSLI(null);
                    setParentFSLIForCreate(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {isCreating
                    ? parentFSLIForCreate
                      ? 'Create Child FSLI'
                      : 'Create FSLI'
                    : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            /* List View with Filters & Table */
            <div className="fsli-list-section">
              {/* Filter Bar */}
              <div className="fsli-filter-bar">
                <div className="search-input-wrapper">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search by FSLI name, code, or sub-category..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="fsli-search-input"
                  />
                  {searchQuery && (
                    <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                      ✕
                    </button>
                  )}
                </div>

                <div className="fsli-filter-group">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="fsli-filter-select"
                  >
                    <option value="ALL">All Categories</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value as any)}
                    className="fsli-filter-select"
                  >
                    <option value="ALL">All Sources</option>
                    <option value="SYSTEM">System Standard</option>
                    <option value="USER">User Created</option>
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="fsli-filter-select"
                  >
                    <option value="ALL">All Status</option>
                    <option value="ACTIVE">Active Only</option>
                    <option value="INACTIVE">Inactive Only</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="fsli-table-container">
                {loading ? (
                  <div className="fsli-empty-state">Loading FSLI Master data...</div>
                ) : filteredTree.length === 0 ? (
                  <div className="fsli-empty-state">
                    <p>No FSLI records match the current search or filters.</p>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setSearchQuery('');
                        setCategoryFilter('ALL');
                        setSourceFilter('ALL');
                        setStatusFilter('ALL');
                      }}
                    >
                      Reset Filters
                    </button>
                  </div>
                ) : (
                  <table className="fsli-master-table">
                    <thead>
                      <tr>
                        <th style={{ width: '55px' }}>Active</th>
                        <th>FSLI Name</th>
                        <th style={{ width: '160px' }}>Code</th>
                        <th style={{ width: '110px' }}>Category</th>
                        <th>Sub-Category</th>
                        <th style={{ width: '70px', textAlign: 'center' }}>Order</th>
                        <th style={{ width: '120px' }}>Source</th>
                        <th style={{ width: '140px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTree.map((node, idx) =>
                        renderTreeRow(node, 0, idx === filteredTree.length - 1)
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <div className="footer-left-info">
            <small>
              Showing {flatFilteredIds.size} of {fslis.length} FSLIs{counts.childCount > 0 ? ` (${counts.childCount} child items)` : ''}. User-created FSLIs are automatically synced across the app.
            </small>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
