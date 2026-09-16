import React from 'react';
import type { AppPage } from '../App';

interface SidebarProps {
    activePage: AppPage;
    onPageChange: (page: AppPage) => void;
}

const NAV_ITEMS: { label: string; page: AppPage }[] = [
    { label: 'Dashboard', page: 'dashboard' },
    { label: 'Trial Balance', page: 'trial-balance' },
    { label: 'Account Mapping', page: 'mapping' },
    { label: 'Unmapped Tracker', page: 'unmapped-tracker' },
    { label: 'Classification', page: 'classification' },
    { label: 'Regrouping', page: 'regrouping' },
    { label: 'Adjustments', page: 'adjustments' },
    { label: 'Consolidation', page: 'consolidation' },
    { label: 'Reporting & FSLI', page: 'reporting-hierarchy' },
];

/** Sidebar items that are placeholders for future phases. */
const FUTURE_ITEMS = [
    'Export Engine',
    'Audit Trail',
];

export default function Sidebar({ activePage, onPageChange }: SidebarProps) {
    return (
        <aside className="sidebar">
            <div className="sidebar-title">
                Accounting
            </div>

            <nav>
                <ul className="sidebar-menu">
                    {NAV_ITEMS.map((item) => (
                        <li key={item.page}>
                            <button
                                className={activePage === item.page ? 'active' : ''}
                                onClick={() => onPageChange(item.page)}
                            >
                                {item.label}
                            </button>
                        </li>
                    ))}

                    {FUTURE_ITEMS.map((label) => (
                        <li key={label}>
                            <button
                                className="disabled"
                                disabled
                                title="Coming in a future phase"
                            >
                                {label}
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>
        </aside>
    );
}