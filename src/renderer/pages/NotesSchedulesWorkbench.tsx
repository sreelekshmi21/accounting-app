import React, { useState, useEffect, useCallback } from 'react';
import type {
  NotesDatasetResult,
  GeneratedNote,
  GeneratedNoteLineItem,
  NoteDrillDownResult,
  ImportBatchRecord,
} from '../../electron-api';

interface NotesSchedulesWorkbenchProps {
  onNavigateToReporting?: () => void;
  onNavigateToConsolidation?: () => void;
  onNavigateToAdjustments?: () => void;
  onNavigateToRegrouping?: () => void;
  onNavigateToClassification?: () => void;
  onNavigateToMapping?: () => void;
}

type StatementFilter = 'ALL' | 'BS' | 'IE';

export default function NotesSchedulesWorkbench({
  onNavigateToReporting,
  onNavigateToConsolidation,
  onNavigateToAdjustments,
  onNavigateToRegrouping,
  onNavigateToClassification,
  onNavigateToMapping,
}: NotesSchedulesWorkbenchProps) {
  // State: Selection & Scope
  const [financialYears, setFinancialYears] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedFyId, setSelectedFyId] = useState<string>('');
  const [scope, setScope] = useState<'UNIT' | 'CONSOLIDATED'>('UNIT');
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [consolidationRuns, setConsolidationRuns] = useState<Array<{ id: string; runNumber: string; status: string }>>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');

  // State: Notes Dataset
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notesData, setNotesData] = useState<NotesDatasetResult | null>(null);

  // State: Navigation & Selection
  const [selectedNoteNumber, setSelectedNoteNumber] = useState<number>(4);
  const [statementFilter, setStatementFilter] = useState<StatementFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // State: Drill-down Modal
  const [drillDownModalOpen, setDrillDownModalOpen] = useState<boolean>(false);
  const [drillDownLoading, setDrillDownLoading] = useState<boolean>(false);
  const [drillDownData, setDrillDownData] = useState<NoteDrillDownResult | null>(null);

  // Load initial FYs and Units
  useEffect(() => {
    const loadInit = async () => {
      try {
        setLoading(true);
        if (window.electronAPI.getConsolidationWorkbenchData) {
          const cData = await window.electronAPI.getConsolidationWorkbenchData();
          setFinancialYears(cData.financialYears.map((f: any) => ({ id: f.id, label: f.yearLabel || f.id })));
          setUnits(cData.units.map((u: any) => ({ id: u.id, name: u.unitName || u.name || u.id })));
          setConsolidationRuns(cData.runs.map(r => ({ id: r.id, runNumber: r.runNumber, status: r.status })));

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
        setError(err.message || 'Failed to initialize Notes & Schedules workbench.');
      } finally {
        setLoading(false);
      }
    };
    loadInit();
  }, []);

  // Fetch Notes dataset
  const fetchNotes = useCallback(async () => {
    if (!selectedFyId) return;
    try {
      setLoading(true);
      setError(null);

      const result = await window.electronAPI.getNotesData(selectedFyId, {
        scope,
        unitId: scope === 'UNIT' ? (selectedUnitId || undefined) : undefined,
        consolidationRunId: scope === 'CONSOLIDATED' ? (selectedRunId || undefined) : undefined,
      });

      setNotesData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load Notes and Schedules dataset.');
    } finally {
      setLoading(false);
    }
  }, [selectedFyId, scope, selectedUnitId, selectedRunId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Open drill-down modal for a note line
  const handleOpenDrillDown = async (noteNum: number, lineId: string) => {
    if (!selectedFyId) return;
    try {
      setDrillDownLoading(true);
      setDrillDownModalOpen(true);
      const res = await window.electronAPI.getNoteDrillDown(selectedFyId, noteNum, lineId);
      setDrillDownData(res);
    } catch (err: any) {
      alert(`Failed to load ledger drill-down: ${err.message}`);
    } finally {
      setDrillDownLoading(false);
    }
  };

  // Filter notes
  const filteredNotes = (notesData?.notes || []).filter(n => {
    if (statementFilter !== 'ALL' && n.statementCode !== statementFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNum = n.noteNumber.toString().includes(q);
      const matchTitle = n.title.toLowerCase().includes(q);
      const matchSch = n.scheduleCode.toLowerCase().includes(q);
      if (!matchNum && !matchTitle && !matchSch) return false;
    }
    return true;
  });

  const activeNote = notesData?.notes.find(n => n.noteNumber === selectedNoteNumber) || filteredNotes[0] || null;

  // Format currency helpers
  const formatCurrency = (val: number | null | undefined, showZero = true): string => {
    if (val === null || val === undefined) return '-';
    if (val === 0 && !showZero) return '-';
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(val);
  };

  const formatSignedCurrency = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return '-';
    const formatted = formatCurrency(Math.abs(val));
    if (val < -0.001) return `(${formatted})`;
    return formatted;
  };

  return (
    <div className="notes-workbench-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '16px', background: '#f8fafc' }}>
      {/* ── Top Header & KPI Summary ── */}
      <div style={{ background: '#ffffff', borderRadius: '8px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#0f172a' }}>
                Notes & Schedules Engine (Phase 11)
              </h2>
              <span style={{ fontSize: '12px', background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
                Authoritative Notes 4–33
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              Prescribed disclosure notes from official financial workbook with single-source movement schedules & statement reconciliation.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {onNavigateToReporting && (
              <button
                onClick={onNavigateToReporting}
                style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '6px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: '500' }}
              >
                ← Reporting Hierarchy
              </button>
            )}
            <button
              onClick={fetchNotes}
              disabled={loading}
              style={{ padding: '6px 14px', fontSize: '13px', borderRadius: '6px', background: '#2563eb', color: '#ffffff', border: 'none', cursor: 'pointer', fontWeight: '600' }}
            >
              {loading ? 'Refreshing...' : '🔄 Refresh Notes'}
            </button>
          </div>
        </div>

        {/* ── Controls Row ── */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '16px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
          {/* Financial Year */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>FY:</label>
            <select
              value={selectedFyId}
              onChange={e => setSelectedFyId(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#ffffff' }}
            >
              {financialYears.map(fy => (
                <option key={fy.id} value={fy.id}>{fy.label}</option>
              ))}
            </select>
          </div>

          {/* Scope Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Scope:</label>
            <div style={{ display: 'flex', borderRadius: '6px', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
              <button
                onClick={() => setScope('UNIT')}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: '600',
                  border: 'none',
                  background: scope === 'UNIT' ? '#2563eb' : '#ffffff',
                  color: scope === 'UNIT' ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                }}
              >
                Unit Level
              </button>
              <button
                onClick={() => setScope('CONSOLIDATED')}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: '600',
                  border: 'none',
                  background: scope === 'CONSOLIDATED' ? '#2563eb' : '#ffffff',
                  color: scope === 'CONSOLIDATED' ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                }}
              >
                Consolidated
              </button>
            </div>
          </div>

          {/* Unit / Run dropdown */}
          {scope === 'UNIT' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Unit:</label>
              <select
                value={selectedUnitId}
                onChange={e => setSelectedUnitId(e.target.value)}
                style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#ffffff' }}
              >
                {units.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}

          {scope === 'CONSOLIDATED' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Run:</label>
              <select
                value={selectedRunId}
                onChange={e => setSelectedRunId(e.target.value)}
                style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#ffffff' }}
              >
                {consolidationRuns.map(r => (
                  <option key={r.id} value={r.id}>{r.runNumber} ({r.status})</option>
                ))}
              </select>
            </div>
          )}

          {/* KPI Mini-Badges */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '12px', padding: '4px 10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              Total Notes: <strong>30</strong> (Notes 4–33)
            </div>
            <div style={{
              fontSize: '12px',
              padding: '4px 10px',
              borderRadius: '6px',
              background: notesData?.allReconciled ? '#dcfce7' : '#fee2e2',
              color: notesData?.allReconciled ? '#166534' : '#991b1b',
              border: `1px solid ${notesData?.allReconciled ? '#86efac' : '#fca5a5'}`,
              fontWeight: '600',
            }}>
              {notesData?.allReconciled ? '✓ All 30 Notes Reconciled with BS & I&E' : `⚠️ ${notesData?.unreconciledCount || 0} Unreconciled Note(s)`}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', border: '1px solid #f87171', fontSize: '13px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ── Main Layout: Left Sidebar for Note Index + Right Content for Note Display ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* ── Left Note Index ── */}
        <div style={{ background: '#ffffff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Search & Filter Header */}
          <div style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="text"
              placeholder="Search Note # or title..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['ALL', 'BS', 'IE'] as StatementFilter[]).map(st => (
                <button
                  key={st}
                  onClick={() => setStatementFilter(st)}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    fontSize: '11px',
                    fontWeight: '600',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: statementFilter === st ? '#1e293b' : '#f8fafc',
                    color: statementFilter === st ? '#ffffff' : '#64748b',
                    cursor: 'pointer',
                  }}
                >
                  {st === 'ALL' ? 'All (30)' : st === 'BS' ? 'BS (4-19)' : 'I&E (20-33)'}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Note List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
            {filteredNotes.map(n => {
              const isSelected = n.noteNumber === selectedNoteNumber;
              const isBS = n.statementCode === 'BS';
              return (
                <div
                  key={n.noteNumber}
                  onClick={() => setSelectedNoteNumber(n.noteNumber)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    marginBottom: '4px',
                    cursor: 'pointer',
                    background: isSelected ? '#eff6ff' : '#ffffff',
                    border: isSelected ? '1px solid #3b82f6' : '1px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: isBS ? '#e0f2fe' : '#fef3c7',
                        color: isBS ? '#0369a1' : '#92400e',
                      }}>
                        Note {n.noteNumber}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>
                        {n.scheduleCode}
                      </span>
                    </div>

                    {n.reconciliation && (
                      <span
                        title={n.reconciliation.isReconciledCY ? 'Reconciled with Statement line' : 'Discrepancy detected'}
                        style={{
                          fontSize: '11px',
                          color: n.reconciliation.isReconciledCY ? '#16a34a' : '#dc2626',
                          fontWeight: '700',
                        }}
                      >
                        {n.reconciliation.isReconciledCY ? '✓ Reconciled' : '⚠️ Unreconciled'}
                      </span>
                    )}
                  </div>

                  <div style={{
                    fontSize: '13px',
                    fontWeight: isSelected ? '600' : '500',
                    color: isSelected ? '#1d4ed8' : '#1e293b',
                    margin: '4px 0 2px 0',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {n.title}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    <span>CY: ₹{formatSignedCurrency(n.cyTotal)}</span>
                    {n.calculationMethod !== 'NODE_BALANCE' && (
                      <span style={{ color: '#6366f1', fontWeight: '600' }}>Calculated</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right Content: Selected Note Full View ── */}
        <div style={{ background: '#ffffff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeNote ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
              {/* Note Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#fafbfc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: '700',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: activeNote.statementCode === 'BS' ? '#0284c7' : '#d97706',
                        color: '#ffffff',
                      }}>
                        Note {activeNote.noteNumber}
                      </span>
                      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>
                        {activeNote.title}
                      </h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                      <span>Schedule: <strong>{activeNote.scheduleCode}</strong></span>
                      <span>•</span>
                      <span>Target Statement: <strong>{activeNote.statementCode === 'BS' ? 'Balance Sheet' : 'Income & Expenditure'}</strong></span>
                      <span>•</span>
                      <span>Method: <strong>{activeNote.calculationMethod}</strong></span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Note Total (CY)</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>
                      ₹{formatSignedCurrency(activeNote.cyTotal)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Note Body: Multi-column vs Standard Rendering */}
              <div style={{ padding: '20px', flex: 1 }}>
                {activeNote.calculationMethod === 'RESERVE_SURPLUS' ? (
                  /* ── Note 5: 4-Column Multi-Fund Table ── */
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: '#334155' }}>Particulars (Sub-Funds)</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Balance b/f (₹)</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Additions / Adjustments (₹)</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Closing Balance (₹)</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>PY Closing (₹)</th>
                          <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '700', color: '#334155', width: '60px' }}>Drill</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeNote.lines.map(line => {
                          const isTotal = line.lineType === 'TOTAL';
                          return (
                            <tr
                              key={line.lineId}
                              style={{
                                borderBottom: isTotal ? '2px solid #0f172a' : '1px solid #e2e8f0',
                                background: isTotal ? '#f8fafc' : 'transparent',
                                fontWeight: isTotal ? '700' : '400',
                              }}
                            >
                              <td style={{ padding: '10px 12px', color: '#0f172a' }}>
                                {line.lineLabel}
                                {line.footnote && (
                                  <span style={{ marginLeft: '4px', color: '#2563eb', fontWeight: '600' }}>{line.footnote}</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                                {formatCurrency(line.openingBalance)}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: (line.additions || 0) < 0 ? '#dc2626' : undefined }}>
                                {formatCurrency(line.additions)}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: isTotal ? '700' : '600' }}>
                                {formatCurrency(line.closingBalance)}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>
                                {formatCurrency(line.pyClosingBalance)}
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                {!isTotal && (
                                  <button
                                    onClick={() => handleOpenDrillDown(activeNote.noteNumber, line.lineId)}
                                    title="View contributing ledgers"
                                    style={{ padding: '2px 6px', fontSize: '11px', borderRadius: '4px', background: '#f1f5f9', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                                  >
                                    🔍
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : activeNote.calculationMethod === 'TANGIBLE_ASSETS' ? (
                  /* ── Note 11: Tangible Assets Gross Block & Depreciation Table ── */
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#334155' }}>Particulars</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Gross Opening</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Additions</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Disposals</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Grant/Subsidy</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Gross Closing</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Depreciation</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Net CY</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Net PY</th>
                          <th style={{ padding: '8px 6px', textAlign: 'center', width: '40px' }}>Drill</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeNote.lines.map(line => {
                          const isTotal = line.lineType === 'TOTAL';
                          return (
                            <tr
                              key={line.lineId}
                              style={{
                                borderBottom: isTotal ? '2px solid #0f172a' : '1px solid #e2e8f0',
                                background: isTotal ? '#f8fafc' : 'transparent',
                                fontWeight: isTotal ? '700' : '400',
                              }}
                            >
                              <td style={{ padding: '8px 10px', color: '#0f172a' }}>{line.lineLabel}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(line.openingBalance)}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(line.additions)}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(line.disposals)}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(line.grantSubsidy)}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(line.closingBalance)}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#dc2626' }}>{formatCurrency(line.depreciation)}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: isTotal ? '700' : '600', color: '#0f172a' }}>{formatCurrency(line.cyAmount)}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>{formatCurrency(line.pyAmount)}</td>
                              <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                {!isTotal && (
                                  <button
                                    onClick={() => handleOpenDrillDown(activeNote.noteNumber, line.lineId)}
                                    title="View contributing ledgers"
                                    style={{ padding: '2px 4px', fontSize: '10px', borderRadius: '4px', background: '#f1f5f9', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                                  >
                                    🔍
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : activeNote.calculationMethod === 'CWIP' || activeNote.calculationMethod === 'LIVE_STOCK' ? (
                  /* ── Note 12 & 13: Dedicated CWIP & Live Stock Movement Schedule ── */
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: '#334155' }}>Category / Item</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Opening Balance (₹)</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Additions during the year (₹)</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Deductions / Adjustments (₹)</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Closing Balance (₹)</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>PY Closing (₹)</th>
                          <th style={{ padding: '10px 8px', textAlign: 'center', width: '60px' }}>Drill</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeNote.lines.map(line => {
                          const isTotal = line.lineType === 'TOTAL';
                          return (
                            <tr
                              key={line.lineId}
                              style={{
                                borderBottom: isTotal ? '2px solid #0f172a' : '1px solid #e2e8f0',
                                background: isTotal ? '#f8fafc' : 'transparent',
                                fontWeight: isTotal ? '700' : '400',
                              }}
                            >
                              <td style={{ padding: '10px 12px', color: '#0f172a' }}>
                                {line.lineLabel}
                                {line.footnote && (
                                  <span style={{ marginLeft: '4px', color: '#2563eb', fontWeight: '600' }}>{line.footnote}</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(line.openingBalance)}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(line.additions)}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(line.adjustments)}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: isTotal ? '700' : '600' }}>{formatCurrency(line.closingBalance)}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>{formatCurrency(line.pyClosingBalance)}</td>
                              <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                {!isTotal && (
                                  <button
                                    onClick={() => handleOpenDrillDown(activeNote.noteNumber, line.lineId)}
                                    title="View contributing ledgers"
                                    style={{ padding: '2px 6px', fontSize: '11px', borderRadius: '4px', background: '#f1f5f9', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                                  >
                                    🔍
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* ── Standard Note Table (Hierarchical Line Items) ── */
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: '#334155' }}>Particulars</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#334155', width: '180px' }}>Current Year (₹)</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#334155', width: '180px' }}>Previous Year (₹)</th>
                          <th style={{ padding: '10px 8px', textAlign: 'center', width: '60px' }}>Drill</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeNote.lines.map(line => {
                          const isHeader = line.lineType === 'HEADER';
                          const isTotal = line.lineType === 'TOTAL';
                          const isSubtotal = line.lineType === 'SUBTOTAL';
                          const isDeduction = line.lineType === 'DEDUCTION';
                          const indent = line.depth * 20;

                          return (
                            <tr
                              key={line.lineId}
                              style={{
                                borderBottom: isTotal ? '2px solid #0f172a' : isSubtotal ? '1px solid #94a3b8' : '1px solid #f1f5f9',
                                background: isHeader ? '#f8fafc' : isTotal ? '#f1f5f9' : 'transparent',
                                fontWeight: isHeader || isTotal ? '700' : isSubtotal ? '600' : '400',
                              }}
                            >
                              <td style={{ padding: '9px 12px', paddingLeft: `${12 + indent}px`, color: isHeader ? '#475569' : '#0f172a' }}>
                                {line.lineLabel}
                                {line.footnote && (
                                  <span style={{ marginLeft: '6px', color: '#2563eb', fontWeight: '600' }}>{line.footnote}</span>
                                )}
                              </td>
                              <td style={{
                                padding: '9px 12px',
                                textAlign: 'right',
                                fontFamily: 'monospace',
                                fontWeight: isTotal ? '700' : isSubtotal ? '600' : '400',
                                color: isDeduction || (line.cyAmount || 0) < 0 ? '#dc2626' : undefined,
                              }}>
                                {isHeader ? '' : isDeduction ? `(${formatCurrency(Math.abs(line.cyAmount || 0))})` : formatSignedCurrency(line.cyAmount)}
                              </td>
                              <td style={{
                                padding: '9px 12px',
                                textAlign: 'right',
                                fontFamily: 'monospace',
                                color: '#64748b',
                              }}>
                                {isHeader ? '' : formatSignedCurrency(line.pyAmount)}
                              </td>
                              <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                                {!isHeader && !isTotal && !isSubtotal && (
                                  <button
                                    onClick={() => handleOpenDrillDown(activeNote.noteNumber, line.lineId)}
                                    title="View contributing ledgers"
                                    style={{ padding: '2px 6px', fontSize: '11px', borderRadius: '4px', background: '#f1f5f9', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                                  >
                                    🔍
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ── Exact Footnotes Callout ── */}
                {activeNote.footnotes.length > 0 && (
                  <div style={{ marginTop: '24px', padding: '14px 16px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Footnotes & References (From Authoritative Workbook)
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#334155', lineHeight: '1.5' }}>
                      {activeNote.footnotes.map((fn, idx) => (
                        <li key={idx}>{fn}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* ── Statement Reconciliation Card ── */}
                {activeNote.reconciliation && (
                  <div style={{
                    marginTop: '20px',
                    padding: '12px 16px',
                    borderRadius: '6px',
                    background: activeNote.reconciliation.isReconciledCY ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${activeNote.reconciliation.isReconciledCY ? '#bbf7d0' : '#fecaca'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: activeNote.reconciliation.isReconciledCY ? '#166534' : '#991b1b' }}>
                        {activeNote.reconciliation.isReconciledCY ? '✓ Statement Line Item Reconciled' : '⚠️ Discrepancy with Statement Line'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                        Linked Line: <strong>{activeNote.reconciliation.statementLineTitle}</strong> on {activeNote.reconciliation.statementCode === 'BS' ? 'Balance Sheet' : 'Income & Expenditure'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
                      <div>Statement Amt: <strong>₹{formatSignedCurrency(activeNote.reconciliation.statementAmountCY)}</strong></div>
                      <div>Note Total: <strong>₹{formatSignedCurrency(activeNote.reconciliation.noteAmountCY)}</strong></div>
                      <div>Difference: <strong style={{ color: activeNote.reconciliation.differenceCY > 0.01 ? '#dc2626' : '#166534' }}>₹{formatCurrency(activeNote.reconciliation.differenceCY)}</strong></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
              Select a note from the left index to view disclosure schedules.
            </div>
          )}
        </div>
      </div>

      {/* ── Interactive Drill-down Modal ── */}
      {drillDownModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(2px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            width: '100%',
            maxWidth: '850px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#fafbfc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>
                  Note {drillDownData?.noteNumber || ''}: {drillDownData?.noteTitle || ''}
                </div>
                <h4 style={{ margin: '2px 0 0 0', fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>
                  Drill-Down: {drillDownData?.lineLabel || 'Contributing Ledgers'}
                </h4>
              </div>
              <button
                onClick={() => setDrillDownModalOpen(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
              {drillDownLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  Loading contributing ledger accounts...
                </div>
              ) : drillDownData ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '12px', color: '#475569' }}>
                    <span>Contributing Ledgers: <strong>{drillDownData.ledgerCount}</strong></span>
                    <span>Total Net Amount: <strong>₹{formatSignedCurrency(drillDownData.totalCYNet)}</strong></span>
                  </div>

                  {drillDownData.ledgers.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '6px' }}>
                      No individual ledger mappings contributing to this line item for the selected scope.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#334155' }}>Ledger Name</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#334155' }}>Unit</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#334155' }}>Node</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', color: '#334155' }}>Debit (₹)</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', color: '#334155' }}>Credit (₹)</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', color: '#334155' }}>Net (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drillDownData.ledgers.map(l => (
                          <tr key={l.ledgerId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 10px', fontWeight: '600', color: '#0f172a' }}>{l.ledgerName}</td>
                            <td style={{ padding: '8px 10px', color: '#64748b' }}>{l.unitName}</td>
                            <td style={{ padding: '8px 10px', color: '#64748b' }}>{l.nodeCode}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(l.cyDebit)}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(l.cyCredit)}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: '600' }}>{formatCurrency(l.cyNet)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#fafbfc', textAlign: 'right' }}>
              <button
                onClick={() => setDrillDownModalOpen(false)}
                style={{ padding: '6px 16px', fontSize: '13px', borderRadius: '6px', background: '#334155', color: '#ffffff', border: 'none', cursor: 'pointer', fontWeight: '600' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
