import React from 'react';
import DashboardHeader from './DashboardHeader';
import ReportingNav, { type ReportingModuleTab } from './ReportingNav';
import ReportingContextBar from './ReportingContextBar';

interface DashboardLayoutProps {
  activeTab: ReportingModuleTab;
  onSelectTab: (tab: ReportingModuleTab) => void;
  headerTitle?: string;
  headerSubtitle?: string;
  children: React.ReactNode;
}

export default function DashboardLayout({
  activeTab,
  onSelectTab,
  headerTitle,
  headerSubtitle,
  children,
}: DashboardLayoutProps) {
  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <DashboardHeader activeTabTitle={headerTitle} subtitle={headerSubtitle} />

      {/* Top-Level Reporting Navigation */}
      <ReportingNav activeTab={activeTab} onSelectTab={onSelectTab} />

      {/* Unified Filter / Context Bar */}
      <ReportingContextBar />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        {children}
      </div>
    </div>
  );
}
