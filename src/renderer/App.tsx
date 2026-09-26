import React, { useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import TrialBalance from './pages/TrialBalance';
import MappingWorkbench from './pages/MappingWorkbench';
import UnmappedTracker from './pages/UnmappedTracker';
import ClassificationEngine from './pages/ClassificationEngine';
import RegroupingWorkbench from './pages/RegroupingWorkbench';
import AdjustmentsWorkbench from './pages/AdjustmentsWorkbench';
import ConsolidationWorkbench from './pages/ConsolidationWorkbench';
import ReportingHierarchyWorkbench from './pages/ReportingHierarchyWorkbench';
import NotesSchedulesWorkbench from './pages/NotesSchedulesWorkbench';
import FinancialStatementsWorkbench from './pages/FinancialStatementsWorkbench';
import FinalValidationWorkbench from './pages/FinalValidationWorkbench';
import type { TrialBalanceImportResult } from '../electron-api';

/** Pages available in the app. */
export type AppPage = 'dashboard' | 'trial-balance' | 'mapping' | 'unmapped-tracker' | 'classification' | 'regrouping' | 'adjustments' | 'consolidation' | 'reporting-hierarchy' | 'notes-schedules' | 'financial-statements' | 'final-validation';

export default function App() {
    const [activePage, setActivePage] = useState<AppPage>('dashboard');
    const [importResult, setImportResult] = useState<TrialBalanceImportResult | null>(null);

    /**
     * Called after import or batch load/delete — stores the result and
     * navigates to the Trial Balance view.
     */
    const handleImportComplete = (result: TrialBalanceImportResult | null) => {
        setImportResult(result);
        setActivePage('trial-balance');
    };

    const renderPage = () => {
        switch (activePage) {
            case 'final-validation':
                return (
                    <FinalValidationWorkbench
                        onNavigateToFinancialStatements={() => setActivePage('financial-statements')}
                        onNavigateToNotes={() => setActivePage('notes-schedules')}
                        onNavigateToReporting={() => setActivePage('reporting-hierarchy')}
                        onNavigateToConsolidation={() => setActivePage('consolidation')}
                        onNavigateToAdjustments={() => setActivePage('adjustments')}
                        onNavigateToMapping={() => setActivePage('mapping')}
                    />
                );
            case 'financial-statements':
                return (
                    <FinancialStatementsWorkbench
                        onNavigateToNotes={() => setActivePage('notes-schedules')}
                        onNavigateToReporting={() => setActivePage('reporting-hierarchy')}
                        onNavigateToConsolidation={() => setActivePage('consolidation')}
                        onNavigateToAdjustments={() => setActivePage('adjustments')}
                        onNavigateToMapping={() => setActivePage('mapping')}
                    />
                );
            case 'notes-schedules':
                return (
                    <NotesSchedulesWorkbench
                        onNavigateToReporting={() => setActivePage('reporting-hierarchy')}
                        onNavigateToConsolidation={() => setActivePage('consolidation')}
                        onNavigateToAdjustments={() => setActivePage('adjustments')}
                        onNavigateToRegrouping={() => setActivePage('regrouping')}
                        onNavigateToClassification={() => setActivePage('classification')}
                        onNavigateToMapping={() => setActivePage('mapping')}
                    />
                );
            case 'reporting-hierarchy':
                return (
                    <ReportingHierarchyWorkbench
                        onNavigateToNotesSchedules={() => setActivePage('notes-schedules')}
                        onNavigateToConsolidation={() => setActivePage('consolidation')}
                        onNavigateToAdjustments={() => setActivePage('adjustments')}
                        onNavigateToRegrouping={() => setActivePage('regrouping')}
                        onNavigateToClassification={() => setActivePage('classification')}
                        onNavigateToMapping={() => setActivePage('mapping')}
                    />
                );
            case 'consolidation':
                return (
                    <ConsolidationWorkbench
                        onNavigateToAdjustments={() => setActivePage('adjustments')}
                        onNavigateToRegrouping={() => setActivePage('regrouping')}
                        onNavigateToClassification={() => setActivePage('classification')}
                        onNavigateToMapping={() => setActivePage('mapping')}
                    />
                );
            case 'adjustments':
                return (
                    <AdjustmentsWorkbench
                        onNavigateToRegrouping={() => setActivePage('regrouping')}
                        onNavigateToClassification={() => setActivePage('classification')}
                        onNavigateToMapping={() => setActivePage('mapping')}
                    />
                );
            case 'regrouping':
                return (
                    <RegroupingWorkbench
                        onNavigateToClassification={() => setActivePage('classification')}
                        onNavigateToMapping={() => setActivePage('mapping')}
                    />
                );
            case 'unmapped-tracker':
                return (
                    <UnmappedTracker
                        onNavigateToWorkbench={() => setActivePage('mapping')}
                    />
                );
            case 'classification':
                return (
                    <ClassificationEngine
                        onNavigateToWorkbench={() => setActivePage('mapping')}
                    />
                );
            case 'mapping':
                return (
                    <MappingWorkbench
                        onNavigateToTrialBalance={() => setActivePage('trial-balance')}
                        onNavigateToUnmappedTracker={() => setActivePage('unmapped-tracker')}
                    />
                );
            case 'trial-balance':
                return (
                    <TrialBalance
                        importResult={importResult}
                        onImportComplete={handleImportComplete}
                    />
                );
            case 'dashboard':
            default:
                return (
                    <Dashboard
                        importResult={importResult}
                        onNavigateToTrialBalance={() => setActivePage('trial-balance')}
                        onImportComplete={handleImportComplete}
                    />
                );
        }
    };

    return (
        <div className="app">
            <Header />

            <div className="app-body">
                <Sidebar
                    activePage={activePage}
                    onPageChange={setActivePage}
                />

                <div className="main-content">
                    {renderPage()}
                </div>
            </div>
        </div>
    );
}