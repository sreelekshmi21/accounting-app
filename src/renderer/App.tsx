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
import type { TrialBalanceImportResult } from '../electron-api';

/** Pages available in the app. */
export type AppPage = 'dashboard' | 'trial-balance' | 'mapping' | 'unmapped-tracker' | 'classification' | 'regrouping' | 'adjustments';

export default function App() {
    const [activePage, setActivePage] = useState<AppPage>('dashboard');
    const [importResult, setImportResult] = useState<TrialBalanceImportResult | null>(null);

    /**
     * Called after a successful import — stores the result and
     * navigates to the Trial Balance view.
     */
    const handleImportComplete = (result: TrialBalanceImportResult) => {
        setImportResult(result);
        setActivePage('trial-balance');
    };

    const renderPage = () => {
        switch (activePage) {
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