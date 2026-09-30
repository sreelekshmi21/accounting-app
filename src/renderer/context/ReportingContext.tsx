import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type {
  DashboardFinancialYearOption,
  DashboardUnitOption,
  DashboardConsolidationRunOption,
  DashboardPipelineSummary,
  DashboardOverviewData,
} from '../../electron-api';

export interface ReportingContextValue {
  // Active Reporting Context
  financialYearId: string;
  financialYearLabel: string;
  scope: 'CONSOLIDATED' | 'UNIT';
  entityId: string;
  entityName: string;
  unitId: string;
  unitName: string;
  consolidationRunId: string;

  // Available Dimensions & Options
  financialYears: DashboardFinancialYearOption[];
  units: DashboardUnitOption[];
  consolidationRuns: DashboardConsolidationRunOption[];
  pipelineSummary: DashboardPipelineSummary | null;
  overviewData: DashboardOverviewData | null;

  // Status
  isLoading: boolean;
  error: string | null;

  // Actions
  setFinancialYearId: (id: string) => void;
  setScope: (scope: 'CONSOLIDATED' | 'UNIT') => void;
  setUnitId: (id: string) => void;
  setConsolidationRunId: (id: string) => void;
  refresh: () => Promise<void>;
}

const ReportingContext = createContext<ReportingContextValue | null>(null);

export interface ReportingProviderProps {
  children: React.ReactNode;
}

export function ReportingProvider({ children }: ReportingProviderProps) {
  const [financialYears, setFinancialYears] = useState<DashboardFinancialYearOption[]>([]);
  const [units, setUnits] = useState<DashboardUnitOption[]>([]);
  const [consolidationRuns, setConsolidationRuns] = useState<DashboardConsolidationRunOption[]>([]);
  
  const [financialYearId, setFinancialYearIdState] = useState<string>('');
  const [financialYearLabel, setFinancialYearLabel] = useState<string>('');
  const [scope, setScopeState] = useState<'CONSOLIDATED' | 'UNIT'>('CONSOLIDATED');
  const [entityId, setEntityId] = useState<string>('default-entity');
  const [entityName, setEntityName] = useState<string>('Santhigiri Ashram');
  const [unitId, setUnitIdState] = useState<string>('');
  const [unitName, setUnitName] = useState<string>('');
  const [consolidationRunId, setConsolidationRunIdState] = useState<string>('');

  const [pipelineSummary, setPipelineSummary] = useState<DashboardPipelineSummary | null>(null);
  const [overviewData, setOverviewData] = useState<DashboardOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Loads reporting overview and dimension metadata from main process via IPC.
   */
  const loadOverview = useCallback(async (targetFyId?: string, targetScope?: 'CONSOLIDATED' | 'UNIT', targetUnitId?: string, targetRunId?: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const effectiveFy = targetFyId !== undefined ? targetFyId : financialYearId;
      const effectiveScope = targetScope !== undefined ? targetScope : scope;
      const effectiveUnit = targetUnitId !== undefined ? targetUnitId : unitId;
      const effectiveRun = targetRunId !== undefined ? targetRunId : consolidationRunId;

      if (window.electronAPI?.getDashboardOverview) {
        const data: DashboardOverviewData = await window.electronAPI.getDashboardOverview(effectiveFy || undefined, {
          scope: effectiveScope,
          unitId: effectiveScope === 'UNIT' ? (effectiveUnit || undefined) : undefined,
          consolidationRunId: effectiveScope === 'CONSOLIDATED' ? (effectiveRun || undefined) : undefined,
        });

        setOverviewData(data);
        setFinancialYears(data.financialYears);
        setUnits(data.units);
        setConsolidationRuns(data.consolidationRuns);
        setPipelineSummary(data.pipelineSummary);
        setEntityId(data.entityId);
        setEntityName(data.entityName);

        const ctx = data.selectedContext;
        setFinancialYearIdState(ctx.financialYearId);
        setFinancialYearLabel(ctx.financialYearLabel);
        setScopeState(ctx.scope === 'UNIT' ? 'UNIT' : 'CONSOLIDATED');
        
        if (ctx.unitId) {
          setUnitIdState(ctx.unitId);
          setUnitName(ctx.unitName || '');
        } else if (data.units.length > 0) {
          setUnitIdState(data.units[0].id);
          setUnitName(data.units[0].name);
        }

        if (ctx.consolidationRunId) {
          setConsolidationRunIdState(ctx.consolidationRunId);
        } else if (data.consolidationRuns.length > 0) {
          setConsolidationRunIdState(data.consolidationRuns[0].id);
        }
      } else {
        // Fallback if electronAPI not available (e.g. unit test environment)
        setError('Reporting bridge is unavailable.');
      }
    } catch (err: any) {
      console.error('Failed to load reporting overview:', err);
      setError(err?.message || 'Failed to initialize reporting context.');
    } finally {
      setIsLoading(false);
    }
  }, [financialYearId, scope, unitId, consolidationRunId]);

  // Initial load
  useEffect(() => {
    loadOverview();
  }, []); // Run once on mount

  // Actions
  const setFinancialYearId = (id: string) => {
    setFinancialYearIdState(id);
    const targetFy = financialYears.find((f) => f.id === id);
    if (targetFy) {
      setFinancialYearLabel(targetFy.label);
    }
    loadOverview(id, scope, unitId, consolidationRunId);
  };

  const setScope = (newScope: 'CONSOLIDATED' | 'UNIT') => {
    setScopeState(newScope);
    loadOverview(financialYearId, newScope, unitId, consolidationRunId);
  };

  const setUnitId = (newUnitId: string) => {
    setUnitIdState(newUnitId);
    const targetUnit = units.find((u) => u.id === newUnitId);
    if (targetUnit) {
      setUnitName(targetUnit.name);
    }
    loadOverview(financialYearId, 'UNIT', newUnitId, consolidationRunId);
  };

  const setConsolidationRunId = (newRunId: string) => {
    setConsolidationRunIdState(newRunId);
    loadOverview(financialYearId, 'CONSOLIDATED', unitId, newRunId);
  };

  const refresh = async () => {
    await loadOverview(financialYearId, scope, unitId, consolidationRunId);
  };

  const value: ReportingContextValue = {
    financialYearId,
    financialYearLabel,
    scope,
    entityId,
    entityName,
    unitId,
    unitName,
    consolidationRunId,
    financialYears,
    units,
    consolidationRuns,
    pipelineSummary,
    overviewData,
    isLoading,
    error,
    setFinancialYearId,
    setScope,
    setUnitId,
    setConsolidationRunId,
    refresh,
  };

  return (
    <ReportingContext.Provider value={value}>
      {children}
    </ReportingContext.Provider>
  );
}

/**
 * Hook to consume authoritative Phase 15 reporting context.
 */
export function useReportingContext(): ReportingContextValue {
  const ctx = useContext(ReportingContext);
  if (!ctx) {
    throw new Error('useReportingContext must be used within a ReportingProvider');
  }
  return ctx;
}
