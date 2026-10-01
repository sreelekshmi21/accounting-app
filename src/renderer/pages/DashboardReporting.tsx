import React, { useState } from 'react';
import { ReportingProvider, useReportingContext } from '../context/ReportingContext';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import type { ReportingModuleTab } from '../components/dashboard/ReportingNav';
import DashboardSection from '../components/dashboard/DashboardSection';
import DashboardCard from '../components/dashboard/DashboardCard';
import LoadingState from '../components/dashboard/LoadingState';
import ErrorState from '../components/dashboard/ErrorState';
import EmptyState from '../components/dashboard/EmptyState';
import ModulePlaceholderCard, { type ModulePlaceholderCardProps } from '../components/dashboard/ModulePlaceholderCard';
import ExecutiveKPIGrid from '../components/dashboard/ExecutiveKPIGrid';
import IncomeVsExpenditureComparison from '../components/dashboard/IncomeVsExpenditureComparison';
import FinancialPositionComparison from '../components/dashboard/FinancialPositionComparison';
import KeyFinancialIndicators from '../components/dashboard/KeyFinancialIndicators';
import ValidationGateStatusBadge from '../components/dashboard/ValidationGateStatusBadge';

interface DashboardReportingProps {
  onNavigateToFinancialStatements?: () => void;
  onNavigateToValidation?: () => void;
  onNavigateToConsolidation?: () => void;
  onNavigateToExport?: () => void;
}

const PHASE_15_ROADMAP: ModulePlaceholderCardProps[] = [
  {
    phase: '15.3',
    title: 'Income & Expenditure Presentation',
    icon: '📑',
    description: 'Authoritative presentation of Schedule III Income & Expenditure statement with drill-down links.',
    keyFeatures: ['Operational income breakdowns', 'Expenditure categories', 'Note 20-33 line item expansion', 'Authoritative Phase 12 statement sync'],
    status: 'Planned',
    targetRelease: 'Coming in Phase 15.3',
  },
  {
    phase: '15.4',
    title: 'Balance Sheet Presentation',
    icon: '🏛️',
    description: 'Schedule III compliant Balance Sheet presentation with Corpus, Reserves, Loans, and Assets.',
    keyFeatures: ['Equities & Liabilities breakdown', 'Assets & Applications classification', 'Note 4-19 schedules linkage', 'Real-time statement balancing check'],
    status: 'Planned',
    targetRelease: 'Coming in Phase 15.4',
  },
  {
    phase: '15.5',
    title: 'Comparative Reporting & Trend Analysis',
    icon: '📈',
    description: 'Current Year vs Previous Year comparative tables, absolute variance (₹), and percentage shifts.',
    keyFeatures: ['CY vs PY financial statement comparison', 'Material variance highlighting', 'Note-by-note comparative shifts', 'Zero-difference verification'],
    status: 'Planned',
    targetRelease: 'Coming in Phase 15.5',
  },
  {
    phase: '15.6',
    title: 'Unit & Consolidated Reports',
    icon: '🏢',
    description: 'Detailed unit-level reporting matrices and side-by-side unit comparison grids across all branches.',
    keyFeatures: ['Multi-unit trial balance matrix', 'Unit contribution breakdown', 'Branch-wise revenue & cost ranking', 'Unit financial statement isolation'],
    status: 'Planned',
    targetRelease: 'Coming in Phase 15.6',
  },
  {
    phase: '15.7',
    title: 'Reconciliation Dashboard',
    icon: '⚖️',
    description: 'Interbranch elimination tracking, internal balance reconciliation, and opening balance verification.',
    keyFeatures: ['Branch/Division reciprocal balance status', 'Inter-unit elimination tracking', 'Trial balance to statement reconciliation', 'Ledger balance provenance audits'],
    status: 'Planned',
    targetRelease: 'Coming in Phase 15.7',
  },
  {
    phase: '15.8',
    title: 'Validation & Integrity Dashboard',
    icon: '✅',
    description: 'Phase 13 validation gate status, pipeline completeness metrics, and integrity checkpoints.',
    keyFeatures: ['Validation gate status (PASS / WARN / ERROR)', 'Pipeline blocker diagnostics', 'Unmapped ledger materiality alerts', 'Pre-publishing audit checks'],
    status: 'Planned',
    targetRelease: 'Coming in Phase 15.8',
  },
  {
    phase: '15.9',
    title: 'Drill-down Financial Intelligence',
    icon: '🔍',
    description: 'Deep ledger-level drill-down from statement lines to Notes, FSLIs, and original Tally transactions.',
    keyFeatures: ['Interactive statement-to-ledger trace', 'FSLI grouping exploration', 'Provenance audit trail inspect', 'Transaction voucher breakdown'],
    status: 'Planned',
    targetRelease: 'Coming in Phase 15.9',
  },
  {
    phase: '15.10',
    title: 'Custom Financial Reports & Exports',
    icon: '📋',
    description: 'Configurable management reports, schedule packs, and seamless Phase 14 Excel/PDF publishing.',
    keyFeatures: ['Management reporting pack', 'Schedule 4-33 standalone books', 'One-click Phase 14 PDF & Excel exports', 'Batch report generation'],
    status: 'Planned',
    targetRelease: 'Coming in Phase 15.10',
  },
];

function DashboardReportingContent({
  onNavigateToFinancialStatements,
  onNavigateToValidation,
  onNavigateToConsolidation,
  onNavigateToExport,
}: DashboardReportingProps) {
  const {
    financialYearId,
    financialYearLabel,
    scope,
    entityName,
    unitName,
    financialYears,
    units,
    overviewData,
    pipelineSummary,
    isLoading,
    error,
    refresh,
  } = useReportingContext();

  const [activeTab, setActiveTab] = useState<ReportingModuleTab>('dashboard');
  const [runningTests, setRunningTests] = useState<'foundation' | 'executive' | null>(null);
  const [testResults, setTestResults] = useState<{
    suite: '15.1' | '15.2';
    allPassed: boolean;
    totalTests: number;
    passedTests: number;
    results: Array<{ name: string; passed: boolean; message: string }>;
  } | null>(null);

  const handleRunFoundationTests = async () => {
    try {
      setRunningTests('foundation');
      if (window.electronAPI?.runDashboardFoundationTests) {
        const res = await window.electronAPI.runDashboardFoundationTests();
        setTestResults({ suite: '15.1', ...res });
      }
    } catch (err: unknown) {
      console.error('Foundation test execution failed:', err);
    } finally {
      setRunningTests(null);
    }
  };

  const handleRunExecutiveTests = async () => {
    try {
      setRunningTests('executive');
      if (window.electronAPI?.runDashboardExecutiveTests) {
        const res = await window.electronAPI.runDashboardExecutiveTests();
        setTestResults({ suite: '15.2', ...res });
      }
    } catch (err: unknown) {
      console.error('Executive test execution failed:', err);
    } finally {
      setRunningTests(null);
    }
  };

  // Render placeholder view for non-dashboard tabs
  const renderModulePlaceholder = (tab: ReportingModuleTab) => {
    const tabTitles: Record<ReportingModuleTab, { title: string; phase: string; desc: string; icon: string; linkWorkbench?: () => void; linkText?: string }> = {
      'dashboard': { title: 'Dashboard', phase: '15.2', desc: 'Main Executive Financial Dashboard', icon: '📊' },
      'financial-statements': {
        title: 'Financial Statements Presentation',
        phase: '15.3 & 15.4',
        desc: 'Interactive Schedule III Balance Sheet and Income & Expenditure statement presentation with authoritative Phase 12 engine synchronization.',
        icon: '📑',
        linkWorkbench: onNavigateToFinancialStatements,
        linkText: 'Open Financial Statements Workbench →',
      },
      'comparative-reports': {
        title: 'Comparative Financial Reports',
        phase: '15.5',
        desc: 'Multi-period comparative financial statements, variance analysis, and historical performance tracking across reporting cycles.',
        icon: '📈',
      },
      'unit-reports': {
        title: 'Unit Level Financial Reports',
        phase: '15.6',
        desc: 'Branch-wise financial reporting, unit profitability analysis, and isolated unit statement schedules.',
        icon: '🏢',
      },
      'consolidated-reports': {
        title: 'Consolidated Financial Reports',
        phase: '15.6',
        desc: 'Organization-wide consolidated statements with full interbranch elimination and multi-unit reconciliation.',
        icon: '🌐',
        linkWorkbench: onNavigateToConsolidation,
        linkText: 'Open Consolidation Workbench →',
      },
      'reconciliation': {
        title: 'Financial Reconciliation',
        phase: '15.7',
        desc: 'Interbranch account reconciliations, trial balance integrity checks, and ledger provenance verification.',
        icon: '⚖️',
      },
      'validation': {
        title: 'Validation & Integrity Dashboard',
        phase: '15.8',
        desc: 'Centralized validation gate, financial statement cross-checks, and pipeline completeness diagnostics.',
        icon: '✅',
        linkWorkbench: onNavigateToValidation,
        linkText: 'Open Phase 13 Validation Workbench →',
      },
    };

    const info = tabTitles[tab];

    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-10 shadow-lg flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-teal-950/60 border border-teal-800/60 flex items-center justify-center text-3xl mb-4">
            {info.icon}
          </div>
          <span className="text-xs font-bold tracking-widest text-teal-400 uppercase bg-teal-950/70 border border-teal-800/60 px-3 py-1 rounded-full mb-3 font-mono">
            Phase {info.phase}
          </span>
          <h2 className="text-2xl font-extrabold text-white tracking-tight mb-2">
            {info.title}
          </h2>
          <p className="text-sm text-slate-400 max-w-lg mb-6 leading-relaxed">
            {info.desc}
          </p>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 w-full max-w-md text-left mb-6">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Active Reporting Context
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500">Financial Year:</span>
                <p className="font-bold text-slate-200">{financialYearLabel || '—'}</p>
              </div>
              <div>
                <span className="text-slate-500">Reporting Scope:</span>
                <p className="font-bold text-teal-300">
                  {scope === 'UNIT' ? (unitName || 'Unit') : 'Consolidated'}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Entity:</span>
                <p className="font-bold text-slate-200">{entityName}</p>
              </div>
              <div>
                <span className="text-slate-500">Status:</span>
                <p className="font-bold text-amber-400">Coming in Phase {info.phase}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setActiveTab('dashboard')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all flex items-center gap-2"
            >
              <span>← Back to Financial Dashboard</span>
            </button>

            {info.linkWorkbench && info.linkText && (
              <button
                onClick={info.linkWorkbench}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-2"
              >
                <span>{info.linkText}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (isLoading && financialYears.length === 0) {
    return (
      <DashboardLayout activeTab={activeTab} onSelectTab={setActiveTab}>
        <LoadingState message="Initializing Executive Financial Dashboard…" />
      </DashboardLayout>
    );
  }

  if (error && financialYears.length === 0) {
    return (
      <DashboardLayout activeTab={activeTab} onSelectTab={setActiveTab}>
        <ErrorState
          title="Reporting Initialization Error"
          message={error}
          onRetry={() => refresh()}
        />
      </DashboardLayout>
    );
  }

  const execSummary = overviewData?.executiveSummary;
  const hasExecutiveData = Boolean(execSummary && execSummary.hasData);

  return (
    <DashboardLayout
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      headerTitle="Executive Financial Dashboard"
      headerSubtitle="Authoritative financial intelligence, operational KPIs, and balance sheet health (Phases 9–14)"
    >
      {activeTab !== 'dashboard' ? (
        renderModulePlaceholder(activeTab)
      ) : (
        <div className="max-w-7xl mx-auto space-y-8">
          {error && (
            <ErrorState
              title="Reporting Notice"
              message={error}
              onRetry={() => refresh()}
            />
          )}

          {/* ── Section 1: Active Context & Integrity Banner ── */}
          <DashboardSection
            title="Reporting Context & Validation Gate"
            subtitle="Centralized reporting parameters and Phase 13 validation gate status"
            icon="🎯"
            action={
              <div className="flex items-center gap-2">
                <ValidationGateStatusBadge
                  validation={execSummary?.validation}
                  onNavigateToValidation={onNavigateToValidation}
                />
                {onNavigateToExport && (
                  <button
                    onClick={onNavigateToExport}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <span>📊</span>
                    <span>Export Reports →</span>
                  </button>
                )}
              </div>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <DashboardCard
                title="Financial Year"
                value={financialYearLabel || 'Not Selected'}
                subtitle={financialYearId ? `ID: ${financialYearId}` : 'No FY loaded'}
                icon="📅"
                badge={financialYearId ? 'Active FY' : 'Missing'}
                badgeColor={financialYearId ? 'teal' : 'amber'}
              />

              <DashboardCard
                title="Reporting Scope"
                value={scope === 'UNIT' ? 'Individual Unit' : 'Consolidated'}
                subtitle={scope === 'UNIT' ? 'Single unit reporting context' : 'All units combined reporting'}
                icon="🌐"
                badge={scope}
                badgeColor="indigo"
              />

              <DashboardCard
                title="Reporting Unit"
                value={scope === 'UNIT' ? (unitName || 'Select Unit') : 'All Units (Consolidated)'}
                subtitle={scope === 'UNIT' ? 'Isolated unit reporting entity' : `${units.length} units consolidated`}
                icon="🏢"
                badge={scope === 'UNIT' ? 'Unit Scope' : 'Consolidated'}
                badgeColor={scope === 'UNIT' ? 'emerald' : 'slate'}
              />

              <DashboardCard
                title="Entity / Organisation"
                value={entityName || 'Santhigiri Ashram'}
                subtitle="Primary reporting entity"
                icon="🏛️"
                badge="Client"
                badgeColor="slate"
              />
            </div>
          </DashboardSection>

          {/* ── Section 2: Executive Financial Dashboard (Phase 15.2) ── */}
          {isLoading ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8">
              <LoadingState message="Fetching authoritative Phase 12 financial statement totals…" />
            </div>
          ) : hasExecutiveData && execSummary ? (
            <div className="space-y-6">
              {/* Primary KPI Grid (Income, Expenditure, Surplus/Deficit, Assets, Liabilities, Reserves) */}
              <ExecutiveKPIGrid
                summary={execSummary}
                onNavigateToFinancialStatements={onNavigateToFinancialStatements}
              />

              {/* Visual Comparisons: Income vs Expenditure & Balance Sheet Position */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <IncomeVsExpenditureComparison summary={execSummary} />
                <FinancialPositionComparison summary={execSummary} />
              </div>

              {/* Key Financial Position Indicators (Cash & Bank, Investments, Inventory, Receivables, Loans, Creditors) */}
              <KeyFinancialIndicators
                summary={execSummary}
                onNavigateToFinancialStatements={onNavigateToFinancialStatements}
              />
            </div>
          ) : (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6">
              <EmptyState
                title="No Financial Statement Data Available"
                message={
                  pipelineSummary?.activeBatchesCount === 0
                    ? 'No Trial Balance data available for this reporting context. Import a Trial Balance batch to generate authoritative statements.'
                    : pipelineSummary?.unmappedLedgersCount && pipelineSummary.unmappedLedgersCount > 0
                      ? `Complete FSLI mappings for ${pipelineSummary.unmappedLedgersCount} pending accounts to view authoritative financial statements.`
                      : 'No financial statement data is currently available for the selected Financial Year and scope.'
                }
                actionLabel={onNavigateToFinancialStatements ? 'Open Financial Statements Workbench →' : undefined}
                onAction={onNavigateToFinancialStatements}
              />
            </div>
          )}

          {/* ── Section 3: Accounting Preparation Pipeline Status (Read-Only) ── */}
          <DashboardSection
            title="Accounting Pipeline Readiness"
            subtitle="Authoritative engine preparation status for the selected Financial Year"
            icon="⚡"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <DashboardCard
                title="Trial Balance Batches"
                value={pipelineSummary?.activeBatchesCount ?? 0}
                subtitle="Imported trial balance batches"
                icon="📥"
                badge={pipelineSummary && pipelineSummary.activeBatchesCount > 0 ? 'Loaded' : 'No Data'}
                badgeColor={pipelineSummary && pipelineSummary.activeBatchesCount > 0 ? 'emerald' : 'amber'}
              />

              <DashboardCard
                title="Mapped Accounts"
                value={pipelineSummary?.mappedLedgersCount ?? 0}
                subtitle={
                  pipelineSummary && pipelineSummary.unmappedLedgersCount > 0
                    ? `${pipelineSummary.unmappedLedgersCount} accounts pending mapping`
                    : pipelineSummary && pipelineSummary.mappedLedgersCount > 0
                      ? 'All active accounts mapped to FSLIs'
                      : 'No accounts mapped'
                }
                icon="🔗"
                badge={
                  pipelineSummary && pipelineSummary.unmappedLedgersCount > 0
                    ? `${pipelineSummary.unmappedLedgersCount} Unmapped`
                    : pipelineSummary && pipelineSummary.mappedLedgersCount > 0
                      ? '100% Mapped'
                      : 'Pending'
                }
                badgeColor={
                  pipelineSummary && pipelineSummary.unmappedLedgersCount > 0
                    ? 'amber'
                    : pipelineSummary && pipelineSummary.mappedLedgersCount > 0
                      ? 'emerald'
                      : 'slate'
                }
              />

              <DashboardCard
                title="Applied Adjustments"
                value={pipelineSummary?.adjustmentsCount ?? 0}
                subtitle="Active journal adjustments"
                icon="⚖️"
                badge={pipelineSummary && pipelineSummary.adjustmentsCount > 0 ? 'Applied' : 'None'}
                badgeColor={pipelineSummary && pipelineSummary.adjustmentsCount > 0 ? 'teal' : 'slate'}
              />

              <DashboardCard
                title="Reporting Readiness"
                value={
                  pipelineSummary?.activeBatchesCount === 0
                    ? 'Pending TB Import'
                    : pipelineSummary?.unmappedLedgersCount && pipelineSummary.unmappedLedgersCount > 0
                      ? 'Unmapped Accounts'
                      : pipelineSummary?.isReadyForReporting
                        ? 'Ready for Reports'
                        : 'Review Required'
                }
                subtitle={
                  pipelineSummary?.activeBatchesCount === 0
                    ? 'Import Trial Balance to begin'
                    : pipelineSummary?.unmappedLedgersCount && pipelineSummary.unmappedLedgersCount > 0
                      ? `${pipelineSummary.unmappedLedgersCount} accounts require FSLI mapping`
                      : pipelineSummary?.isReadyForReporting
                        ? 'Trial balance & mappings ready for reporting'
                        : 'Preparation in progress'
                }
                icon="🚀"
                badge={
                  pipelineSummary?.activeBatchesCount === 0
                    ? 'No TB'
                    : pipelineSummary?.unmappedLedgersCount && pipelineSummary.unmappedLedgersCount > 0
                      ? 'Action Required'
                      : pipelineSummary?.isReadyForReporting
                        ? 'Ready'
                        : 'Pending'
                }
                badgeColor={
                  pipelineSummary?.isReadyForReporting
                    ? 'emerald'
                    : pipelineSummary?.unmappedLedgersCount && pipelineSummary.unmappedLedgersCount > 0
                      ? 'amber'
                      : 'slate'
                }
              />
            </div>
          </DashboardSection>

          {/* ── Section 4: Phase 15 Reporting Roadmap ── */}
          <DashboardSection
            title="Phase 15 Upcoming Reporting Modules"
            subtitle="Upcoming presentation, comparative reporting, and analytical intelligence modules (Phases 15.3–15.10)"
            icon="🗺️"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {PHASE_15_ROADMAP.map((mod) => (
                <ModulePlaceholderCard key={mod.phase} {...mod} />
              ))}
            </div>
          </DashboardSection>

          {/* ── Section 5: Automated Verification Test Suites ── */}
          <DashboardSection
            title="Automated Verification Test Suites"
            subtitle="Automated tests verifying Phase 15.1 foundation and Phase 15.2 executive financial intelligence"
            icon="🧪"
            action={
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunFoundationTests}
                  disabled={runningTests !== null}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <span>{runningTests === 'foundation' ? '⏳' : '🧪'}</span>
                  <span>{runningTests === 'foundation' ? 'Running…' : 'Run Phase 15.1 Tests'}</span>
                </button>

                <button
                  onClick={handleRunExecutiveTests}
                  disabled={runningTests !== null}
                  className="px-3 py-1.5 bg-teal-800/80 hover:bg-teal-700 text-teal-100 text-xs font-bold rounded-lg border border-teal-600/70 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <span>{runningTests === 'executive' ? '⏳' : '📊'}</span>
                  <span>{runningTests === 'executive' ? 'Running…' : 'Run Phase 15.2 Tests'}</span>
                </button>
              </div>
            }
          >
            {testResults ? (
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-extrabold ${testResults.allPassed ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {testResults.allPassed ? `✓ ALL ${testResults.totalTests} TESTS PASSED` : '⚠ SOME TESTS FAILED'}
                    </span>
                    <span className="text-xs text-slate-400">
                      ({testResults.passedTests} / {testResults.totalTests} passed)
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    Phase {testResults.suite} Verification Suite
                  </span>
                </div>

                <div className="space-y-2">
                  {testResults.results.map((res, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg text-xs flex items-start gap-2.5 ${
                        res.passed ? 'bg-slate-950/40 text-slate-300' : 'bg-rose-950/30 text-rose-200 border border-rose-900/50'
                      }`}
                    >
                      <span className={res.passed ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {res.passed ? '✓' : '✗'}
                      </span>
                      <div className="flex-1">
                        <span className="font-bold text-slate-200">{res.name}: </span>
                        <span className="text-slate-400">{res.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-xl p-6 text-center text-xs text-slate-400">
                Click <strong>"Run Phase 15.2 Tests"</strong> or <strong>"Run Phase 15.1 Tests"</strong> above to execute the automated verification test suite.
              </div>
            )}
          </DashboardSection>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function DashboardReporting(props: DashboardReportingProps) {
  return (
    <ReportingProvider>
      <DashboardReportingContent {...props} />
    </ReportingProvider>
  );
}
