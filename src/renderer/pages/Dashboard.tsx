import React, { useState } from 'react';
import type { TrialBalanceFileInfo, TrialBalanceImportResult } from '../../electron-api';

interface DashboardProps {
    importResult: TrialBalanceImportResult | null;
    onNavigateToTrialBalance: () => void;
    onImportComplete: (result: TrialBalanceImportResult) => void;
}

/**
 * Dashboard page – the main landing view of the application.
 *
 * Displays summary cards and the Trial Balance import card.
 * When the user clicks "Import Trial Balance", the native Windows
 * file dialog opens to select a Tally-exported Excel file,
 * then the Python import engine processes it.
 */
export default function Dashboard({
    importResult,
    onNavigateToTrialBalance,
    onImportComplete,
}: DashboardProps) {
    const [selectedFile, setSelectedFile] = useState<TrialBalanceFileInfo | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    const summary = importResult?.summary;

    /**
     * Opens the native file selection dialog, then immediately
     * runs the Python import engine on the selected file.
     */
    const handleImportClick = async () => {
        if (isSelecting || isImporting) return;

        setIsSelecting(true);
        setImportError(null);

        try {
            const fileInfo = await window.electronAPI.openTrialBalanceFile();

            if (!fileInfo) {
                // User cancelled
                setIsSelecting(false);
                return;
            }

            setSelectedFile(fileInfo);
            setIsSelecting(false);
            setIsImporting(true);

            // Run the Python import engine
            const result = await window.electronAPI.importTrialBalance(fileInfo.filePath);

            if (result.success) {
                onImportComplete(result);
            } else {
                setImportError(result.error || 'Import failed. Check the file format.');
            }
        } catch (error) {
            console.error('Failed to import Trial Balance:', error);
            setImportError(
                error instanceof Error ? error.message : 'An unexpected error occurred.',
            );
        } finally {
            setIsSelecting(false);
            setIsImporting(false);
        }
    };

    /**
     * Formats a number as Indian currency (₹).
     */
    const formatCurrency = (value: number): string => {
        return '₹' + value.toLocaleString('en-IN', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        });
    };

    /**
     * Formats a byte count into a human-readable string
     * (e.g. "1.24 MB", "256 KB").
     */
    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    return (
        <div>
            <h1 className="dashboard-title">
                Dashboard
            </h1>

            <p className="dashboard-description">
                Import a Trial Balance to begin generating
                financial statements.
            </p>

            <div className="summary-grid">

                <div className="summary-card">
                    <p className="summary-card-title">
                        Accounts
                    </p>

                    <p className="summary-card-value">
                        {summary?.ledger_count ?? 0}
                    </p>
                </div>

                <div className="summary-card">
                    <p className="summary-card-title">
                        Total Debit
                    </p>

                    <p className="summary-card-value">
                        {summary ? formatCurrency(summary.total_debit) : '₹0'}
                    </p>
                </div>

                <div className="summary-card">
                    <p className="summary-card-title">
                        Total Credit
                    </p>

                    <p className="summary-card-value">
                        {summary ? formatCurrency(summary.total_credit) : '₹0'}
                    </p>
                </div>

            </div>

            {/* Show link to Trial Balance if import exists */}
            {importResult?.success && (
                <div className="import-card" style={{ marginBottom: 16 }}>
                    <div className="tb-imported-banner">
                        <span className="status-badge status-success">
                            ✓ Imported
                        </span>
                        <span className="tb-imported-text">
                            Trial Balance loaded —
                            {' '}
                            <button
                                className="link-button"
                                onClick={onNavigateToTrialBalance}
                            >
                                View Trial Balance →
                            </button>
                        </span>
                    </div>
                </div>
            )}

            <div className="import-card">

                <h2>
                    Import Trial Balance
                </h2>

                <p>
                    Select an Excel file (.xlsx or .xls) exported from Tally
                    containing your Trial Balance.
                </p>

                {selectedFile && (
                    <div className="selected-file-info">
                        <div className="selected-file-icon">📄</div>
                        <div className="selected-file-details">
                            <p className="selected-file-name">
                                {selectedFile.fileName}
                            </p>
                            <p className="selected-file-meta">
                                {formatFileSize(selectedFile.fileSize)}
                                {' · '}
                                Modified {new Date(selectedFile.lastModified).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                })}
                            </p>
                        </div>
                    </div>
                )}

                {importError && (
                    <div className="error-banner">
                        <span className="error-icon">⚠</span>
                        <span>{importError}</span>
                    </div>
                )}

                <button
                    className="primary-button"
                    onClick={handleImportClick}
                    disabled={isSelecting || isImporting}
                >
                    {isImporting
                        ? '⏳ Importing…'
                        : isSelecting
                            ? 'Opening…'
                            : importResult?.success
                                ? 'Re-import Trial Balance'
                                : 'Import Trial Balance'}
                </button>

            </div>
        </div>
    );
}
