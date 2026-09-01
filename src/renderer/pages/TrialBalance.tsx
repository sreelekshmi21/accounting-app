import React, { useState, useMemo, useEffect } from 'react';
import type {
    TrialBalanceImportResult,
    LedgerEntry,
    TallyGroup,
    ImportBatchRecord,
    UnitRecord,
} from '../../electron-api';

interface TrialBalanceProps {
    importResult: TrialBalanceImportResult | null;
    onImportComplete: (result: TrialBalanceImportResult) => void;
}

type SortField = 'ledger_name' | 'debit' | 'credit' | 'net_balance' | 'group';
type SortDir = 'asc' | 'desc';

/**
 * Trial Balance page — displays the imported Trial Balance data
 * with summary cards, validation panel, SQLite persistence, and sortable table.
 */
export default function TrialBalance({
    importResult,
    onImportComplete,
}: TrialBalanceProps) {
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [sortField, setSortField] = useState<SortField>('ledger_name');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [showValidation, setShowValidation] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Phase 4: Persistence states
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string; batchId?: string } | null>(null);
    const [savedBatches, setSavedBatches] = useState<ImportBatchRecord[]>([]);
    const [isDuplicate, setIsDuplicate] = useState(false);
    const [isLoadingBatch, setIsLoadingBatch] = useState(false);

    // Unit selection state
    const [units, setUnits] = useState<UnitRecord[]>([]);
    const [selectedUnitId, setSelectedUnitId] = useState<string>('');
    const [showAddUnit, setShowAddUnit] = useState(false);
    const [newUnitName, setNewUnitName] = useState('');
    const [isCreatingUnit, setIsCreatingUnit] = useState(false);
    const [unitError, setUnitError] = useState<string | null>(null);

    const metadata = importResult?.import_metadata;
    const summary = importResult?.summary;
    const validation = importResult?.validation;
    const groups = importResult?.groups ?? [];
    const ledgers = importResult?.ledgers ?? [];

    // Load saved batches and units on component mount
    useEffect(() => {
        loadBatchesList();
        loadUnits();
    }, []);

    // Check duplicate status whenever importResult changes
    useEffect(() => {
        if (metadata?.file_path && metadata?.financial_year) {
            window.electronAPI.checkDuplicate(metadata.file_path, metadata.financial_year)
                .then((res) => setIsDuplicate(res.duplicate))
                .catch(() => setIsDuplicate(false));
        } else {
            setIsDuplicate(false);
        }
        setSaveMessage(null);
    }, [importResult]);

    const loadBatchesList = async () => {
        try {
            const batches = await window.electronAPI.listImportBatches();
            setSavedBatches(batches);
        } catch (err) {
            console.error('Failed to list import batches:', err);
        }
    };

    const loadUnits = async () => {
        try {
            const unitList = await window.electronAPI.listUnits();
            setUnits(unitList);
            // Auto-select if only one unit or previously selected
            if (unitList.length === 1) {
                setSelectedUnitId(unitList[0].id);
            }
        } catch (err) {
            console.error('Failed to list units:', err);
        }
    };

    const handleCreateUnit = async () => {
        const name = newUnitName.trim();
        if (!name) return;
        setIsCreatingUnit(true);
        setUnitError(null);
        try {
            const created = await window.electronAPI.createUnit(name);
            setNewUnitName('');
            setShowAddUnit(false);
            await loadUnits();
            setSelectedUnitId(created.id);
        } catch (err) {
            setUnitError(err instanceof Error ? err.message : 'Failed to create unit');
        } finally {
            setIsCreatingUnit(false);
        }
    };

    // Build group lookup for display
    const groupMap = useMemo(() => {
        const map: Record<string, TallyGroup> = {};
        for (const g of groups) {
            map[g.id] = g;
        }
        return map;
    }, [groups]);

    /**
     * Opens file dialog and runs the import engine.
     */
    const handleImport = async () => {
        if (isImporting) return;

        setImportError(null);
        const fileInfo = await window.electronAPI.openTrialBalanceFile();
        if (!fileInfo) return;

        setIsImporting(true);

        try {
            const result = await window.electronAPI.importTrialBalance(fileInfo.filePath);
            if (result.success) {
                onImportComplete(result);
            } else {
                setImportError(result.error || 'Import failed.');
            }
        } catch (err) {
            setImportError(err instanceof Error ? err.message : 'Unexpected error');
        } finally {
            setIsImporting(false);
        }
    };

    /**
     * Saves active Trial Balance to SQLite database.
     * Requires a unit to be selected when multiple units exist.
     */
    const handleSaveToDatabase = async () => {
        if (!importResult || isSaving) return;

        // Require unit selection when there are multiple units
        if (units.length > 1 && !selectedUnitId) {
            setSaveMessage({
                type: 'error',
                text: 'Please select a Unit before saving. Each Trial Balance must be associated with a specific unit.',
            });
            return;
        }

        setIsSaving(true);
        setSaveMessage(null);

        try {
            const unitToSave = selectedUnitId || undefined;
            const res = await window.electronAPI.saveTrialBalance(importResult, unitToSave);
            if (res.success && res.importBatchId) {
                const unitName = units.find(u => u.id === (unitToSave || 'default-unit'))?.unitName || 'Default Unit';
                setSaveMessage({
                    type: 'success',
                    text: `Saved successfully to SQLite database! (Unit: ${unitName})`,
                    batchId: res.importBatchId,
                });
                setIsDuplicate(true);
                await loadBatchesList();
            } else {
                setSaveMessage({
                    type: 'error',
                    text: res.error || 'Failed to save to database.',
                });
            }
        } catch (err) {
            setSaveMessage({
                type: 'error',
                text: err instanceof Error ? err.message : 'Error saving to database',
            });
        } finally {
            setIsSaving(false);
        }
    };

    /**
     * Load a saved batch from SQLite.
     */
    const handleLoadSavedBatch = async (batchId: string) => {
        setIsLoadingBatch(true);
        try {
            const loaded = await window.electronAPI.loadSavedTrialBalance(batchId);
            if (loaded && loaded.success) {
                onImportComplete(loaded);
                setSaveMessage({
                    type: 'success',
                    text: `Loaded saved import batch from database.`,
                    batchId,
                });
            } else {
                setImportError('Could not load selected import batch.');
            }
        } catch (err) {
            setImportError(err instanceof Error ? err.message : 'Failed to load batch');
        } finally {
            setIsLoadingBatch(false);
        }
    };

    /**
     * Toggle sort on a column header click.
     */
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    /**
     * Sort indicator arrow.
     */
    const sortArrow = (field: SortField) => {
        if (sortField !== field) return ' ↕';
        return sortDir === 'asc' ? ' ↑' : ' ↓';
    };

    /**
     * Filter and sort ledgers.
     */
    const displayedLedgers = useMemo(() => {
        let filtered = ledgers;

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter((l) => {
                const groupName = l.tally_group_id ? groupMap[l.tally_group_id]?.group_name : '';
                return (
                    l.ledger_name.toLowerCase().includes(q) ||
                    (groupName && groupName.toLowerCase().includes(q))
                );
            });
        }

        const sorted = [...filtered].sort((a, b) => {
            let cmp = 0;
            switch (sortField) {
                case 'ledger_name':
                    cmp = a.ledger_name.localeCompare(b.ledger_name);
                    break;
                case 'debit':
                    cmp = a.debit - b.debit;
                    break;
                case 'credit':
                    cmp = a.credit - b.credit;
                    break;
                case 'net_balance':
                    cmp = a.net_balance - b.net_balance;
                    break;
                case 'group': {
                    const gA = a.tally_group_id ? groupMap[a.tally_group_id]?.group_name || '' : '';
                    const gB = b.tally_group_id ? groupMap[b.tally_group_id]?.group_name || '' : '';
                    cmp = gA.localeCompare(gB);
                    break;
                }
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });

        return sorted;
    }, [ledgers, searchQuery, sortField, sortDir, groupMap]);

    /**
     * Format as Indian currency.
     */
    const fmt = (value: number | null | undefined): string => {
        if (value == null) return '—';
        return '₹' + value.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    // ── Saved Batches History Component ─────────────────────────────────────
    const renderSavedBatchesSection = () => {
        if (savedBatches.length === 0) return null;

        return (
            <div className="saved-batches-section">
                <h3 className="saved-batches-title">💾 Saved Import History ({savedBatches.length})</h3>
                <div className="saved-batches-grid">
                    {savedBatches.map((b) => (
                        <div key={b.id} className="saved-batch-card">
                            <div className="saved-batch-header">
                                <span className="saved-batch-name">{b.fileName}</span>
                                <span className="tb-fy-badge">FY {b.financialYear}</span>
                                {b.unitName && (
                                    <span className="tb-unit-badge">{b.unitName}</span>
                                )}
                            </div>
                            <div className="saved-batch-details">
                                <span>Ledgers: <strong>{b.ledgerCount}</strong></span>
                                <span>Total Debit: <strong>{fmt(b.totalDebit)}</strong></span>
                                <span className="saved-batch-time">
                                    {new Date(b.importTimestamp).toLocaleDateString()} {new Date(b.importTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            <button
                                className="secondary-button btn-sm"
                                onClick={() => handleLoadSavedBatch(b.id)}
                                disabled={isLoadingBatch}
                            >
                                {isLoadingBatch ? 'Loading…' : 'Load into View'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // ── No data yet — show import prompt ──────────────────────────────────
    if (!importResult) {
        return (
            <div className="tb-page">
                <h1 className="dashboard-title">Trial Balance</h1>
                <p className="dashboard-description">
                    Import a Tally-exported Trial Balance to get started, or select a saved import below.
                </p>

                <div className="tb-empty-state">
                    <div className="tb-empty-icon">📊</div>
                    <h2>No Trial Balance loaded</h2>
                    <p>Select an Excel file (.xlsx or .xls) exported from Tally.</p>

                    {importError && (
                        <div className="error-banner">
                            <span className="error-icon">⚠</span>
                            <span>{importError}</span>
                        </div>
                    )}

                    <button
                        className="primary-button"
                        onClick={handleImport}
                        disabled={isImporting}
                    >
                        {isImporting ? '⏳ Importing…' : 'Import Trial Balance'}
                    </button>
                </div>

                {renderSavedBatchesSection()}
            </div>
        );
    }

    // ── Import failed ──────────────────────────────────────────────────────
    if (!importResult.success) {
        return (
            <div className="tb-page">
                <h1 className="dashboard-title">Trial Balance</h1>

                <div className="error-banner" style={{ marginBottom: 20 }}>
                    <span className="error-icon">⚠</span>
                    <span>{importResult.error || 'Import failed.'}</span>
                </div>

                <button className="primary-button" onClick={handleImport} disabled={isImporting}>
                    {isImporting ? '⏳ Importing…' : 'Try Again'}
                </button>

                {renderSavedBatchesSection()}
            </div>
        );
    }

    // ── Successful import — full display ───────────────────────────────────
    const isBalanced = summary && Math.abs(summary.difference) < 0.01;
    const errorCount = validation?.errors.length ?? 0;
    const warningCount = validation?.warnings.length ?? 0;

    return (
        <div className="tb-page">
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="tb-header">
                <div>
                    <h1 className="dashboard-title">Trial Balance</h1>
                    <p className="dashboard-description">
                        {metadata?.file_name}
                        {metadata?.financial_year && (
                            <span className="tb-fy-badge">
                                FY {metadata.financial_year}
                            </span>
                        )}
                        {isDuplicate && (
                            <span className="status-badge status-success" style={{ marginLeft: 8 }}>
                                ✓ Saved in Database
                            </span>
                        )}
                    </p>
                </div>

                <div className="tb-header-actions">
                    {/* Unit Selector */}
                    <div className="unit-selector-container">
                        <label className="unit-selector-label">Unit:</label>
                        <select
                            className="unit-selector-dropdown"
                            value={selectedUnitId}
                            onChange={(e) => setSelectedUnitId(e.target.value)}
                        >
                            {units.length === 0 && (
                                <option value="">Loading units…</option>
                            )}
                            {units.length === 1 && (
                                <option value={units[0].id}>{units[0].unitName}</option>
                            )}
                            {units.length > 1 && (
                                <>
                                    <option value="">— Select Unit —</option>
                                    {units.map((u) => (
                                        <option key={u.id} value={u.id}>{u.unitName}</option>
                                    ))}
                                </>
                            )}
                        </select>
                        <button
                            className="unit-add-btn"
                            onClick={() => setShowAddUnit(!showAddUnit)}
                            title="Add a new unit"
                        >
                            +
                        </button>
                    </div>

                    {/* Inline Add Unit */}
                    {showAddUnit && (
                        <div className="unit-add-inline">
                            <input
                                type="text"
                                className="unit-add-input"
                                placeholder="New unit name…"
                                value={newUnitName}
                                onChange={(e) => setNewUnitName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateUnit()}
                                autoFocus
                            />
                            <button
                                className="secondary-button btn-sm"
                                onClick={handleCreateUnit}
                                disabled={isCreatingUnit || !newUnitName.trim()}
                            >
                                {isCreatingUnit ? '…' : 'Add'}
                            </button>
                            {unitError && <span className="unit-error-text">{unitError}</span>}
                        </div>
                    )}

                    <button
                        className={`save-db-button ${isDuplicate ? 'button-saved' : 'button-save'}`}
                        onClick={handleSaveToDatabase}
                        disabled={isSaving || (units.length > 1 && !selectedUnitId)}
                    >
                        {isSaving ? '⏳ Saving…' : isDuplicate ? '💾 Re-save to DB' : '💾 Save to Database'}
                    </button>

                    <button
                        className="primary-button"
                        onClick={handleImport}
                        disabled={isImporting}
                    >
                        {isImporting ? '⏳ Importing…' : 'Import New'}
                    </button>
                </div>
            </div>

            {/* Save Status Banner */}
            {saveMessage && (
                <div className={`save-banner save-banner-${saveMessage.type}`}>
                    <span>{saveMessage.type === 'success' ? '✓' : '⚠'} {saveMessage.text}</span>
                    {saveMessage.batchId && <code className="save-batch-code">Batch ID: {saveMessage.batchId}</code>}
                </div>
            )}

            {/* Duplicate Notice */}
            {isDuplicate && !saveMessage && (
                <div className="duplicate-info-banner">
                    ℹ️ This file content & FY combo is already stored in SQLite. Saving again will create a new import batch.
                </div>
            )}

            {/* ── Summary Cards ────────────────────────────────────────────── */}
            <div className="summary-grid tb-summary-grid">
                <div className="summary-card">
                    <p className="summary-card-title">Ledger Count</p>
                    <p className="summary-card-value">{summary?.ledger_count ?? 0}</p>
                </div>

                <div className="summary-card">
                    <p className="summary-card-title">Total Debit</p>
                    <p className="summary-card-value summary-debit">
                        {fmt(summary?.total_debit)}
                    </p>
                </div>

                <div className="summary-card">
                    <p className="summary-card-title">Total Credit</p>
                    <p className="summary-card-value summary-credit">
                        {fmt(summary?.total_credit)}
                    </p>
                </div>

                <div className={`summary-card ${isBalanced ? 'card-balanced' : 'card-unbalanced'}`}>
                    <p className="summary-card-title">Difference</p>
                    <p className="summary-card-value">
                        {fmt(summary?.difference)}
                    </p>
                    <span className={`status-badge ${isBalanced ? 'status-success' : 'status-error'}`}>
                        {isBalanced ? '✓ Balanced' : '✗ Unbalanced'}
                    </span>
                </div>
            </div>

            {/* ── Validation Panel ─────────────────────────────────────────── */}
            {(errorCount > 0 || warningCount > 0) && (
                <div className="validation-panel">
                    <button
                        className="validation-toggle"
                        onClick={() => setShowValidation(!showValidation)}
                    >
                        <span>
                            Validation
                            {errorCount > 0 && (
                                <span className="validation-count validation-count-error">
                                    {errorCount} error{errorCount !== 1 ? 's' : ''}
                                </span>
                            )}
                            {warningCount > 0 && (
                                <span className="validation-count validation-count-warning">
                                    {warningCount} warning{warningCount !== 1 ? 's' : ''}
                                </span>
                            )}
                        </span>
                        <span className="validation-chevron">
                            {showValidation ? '▲' : '▼'}
                        </span>
                    </button>

                    {showValidation && (
                        <div className="validation-body">
                            {validation?.errors.map((err, i) => (
                                <div key={`e-${i}`} className="validation-item validation-error">
                                    <span className="validation-item-icon">✗</span>
                                    <span className="validation-item-text">
                                        {err.message}
                                        {err.row && (
                                            <span className="validation-row"> (Row {err.row})</span>
                                        )}
                                    </span>
                                </div>
                            ))}
                            {validation?.warnings.map((warn, i) => (
                                <div key={`w-${i}`} className="validation-item validation-warning">
                                    <span className="validation-item-icon">⚠</span>
                                    <span className="validation-item-text">
                                        {warn.message}
                                        {warn.row && (
                                            <span className="validation-row"> (Row {warn.row})</span>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Search & Table ───────────────────────────────────────────── */}
            <div className="tb-table-section">
                <div className="tb-table-toolbar">
                    <input
                        type="text"
                        className="tb-search"
                        placeholder="Search ledgers or groups…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <span className="tb-row-count">
                        {displayedLedgers.length} of {ledgers.length} ledgers
                    </span>
                </div>

                <div className="tb-table-wrapper">
                    <table className="tb-table">
                        <thead>
                            <tr>
                                <th className="th-row">#</th>
                                <th
                                    className="th-sortable th-left"
                                    onClick={() => handleSort('ledger_name')}
                                >
                                    Particulars{sortArrow('ledger_name')}
                                </th>
                                <th
                                    className="th-sortable th-left"
                                    onClick={() => handleSort('group')}
                                >
                                    Group{sortArrow('group')}
                                </th>
                                <th
                                    className="th-sortable th-right"
                                    onClick={() => handleSort('debit')}
                                >
                                    Debit{sortArrow('debit')}
                                </th>
                                <th
                                    className="th-sortable th-right"
                                    onClick={() => handleSort('credit')}
                                >
                                    Credit{sortArrow('credit')}
                                </th>
                                <th
                                    className="th-sortable th-right"
                                    onClick={() => handleSort('net_balance')}
                                >
                                    Net Balance{sortArrow('net_balance')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedLedgers.map((ledger, idx) => {
                                const groupName = ledger.tally_group_id
                                    ? groupMap[ledger.tally_group_id]?.group_name ?? '—'
                                    : '—';

                                return (
                                    <tr key={ledger.id}>
                                        <td className="td-row">{idx + 1}</td>
                                        <td className="td-ledger">{ledger.ledger_name}</td>
                                        <td className="td-group">{groupName}</td>
                                        <td className="td-amount">
                                            {ledger.debit > 0 ? fmt(ledger.debit) : '—'}
                                        </td>
                                        <td className="td-amount">
                                            {ledger.credit > 0 ? fmt(ledger.credit) : '—'}
                                        </td>
                                        <td className={`td-amount ${ledger.net_balance < 0 ? 'amount-negative' : ''}`}>
                                            {fmt(ledger.net_balance)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="tb-total-row">
                                <td></td>
                                <td className="td-ledger"><strong>Total</strong></td>
                                <td></td>
                                <td className="td-amount"><strong>{fmt(summary?.total_debit)}</strong></td>
                                <td className="td-amount"><strong>{fmt(summary?.total_credit)}</strong></td>
                                <td className="td-amount"><strong>{fmt(summary?.difference)}</strong></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Saved Batches Section */}
            {renderSavedBatchesSection()}
        </div>
    );
}
