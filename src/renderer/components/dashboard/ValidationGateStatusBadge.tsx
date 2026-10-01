import React from 'react';
import type { ExecutiveValidationSummary } from '../../../electron-api';

interface ValidationGateStatusBadgeProps {
  validation?: ExecutiveValidationSummary;
  onNavigateToValidation?: () => void;
}

export default function ValidationGateStatusBadge({
  validation,
  onNavigateToValidation,
}: ValidationGateStatusBadgeProps) {
  if (!validation || validation.status === 'NOT_RUN') {
    return (
      <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
        <span className="w-2 h-2 rounded-full bg-slate-500"></span>
        <span className="text-slate-400">Validation:</span>
        <span className="font-bold text-slate-300">Not Run</span>
        {onNavigateToValidation && (
          <button
            onClick={onNavigateToValidation}
            className="text-[11px] text-teal-400 hover:underline ml-1 font-medium"
          >
            Run Checks →
          </button>
        )}
      </div>
    );
  }

  const { status, totalChecks, passed, warnings, errors } = validation;

  const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string; dot: string; label: string }> = {
    PASS: {
      bg: 'bg-emerald-950/70',
      border: 'border-emerald-800/60',
      text: 'text-emerald-300',
      dot: 'bg-emerald-400',
      label: 'PASS',
    },
    WARNING: {
      bg: 'bg-amber-950/70',
      border: 'border-amber-800/60',
      text: 'text-amber-300',
      dot: 'bg-amber-400',
      label: 'WARNING',
    },
    ERROR: {
      bg: 'bg-rose-950/70',
      border: 'border-rose-800/60',
      text: 'text-rose-300',
      dot: 'bg-rose-400',
      label: 'ERROR',
    },
    BLOCKED: {
      bg: 'bg-purple-950/70',
      border: 'border-purple-800/60',
      text: 'text-purple-300',
      dot: 'bg-purple-400',
      label: 'BLOCKED',
    },
  };

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.WARNING;

  return (
    <div
      onClick={onNavigateToValidation}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border ${config.bg} ${config.border} ${
        onNavigateToValidation ? 'cursor-pointer hover:opacity-90' : ''
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${config.dot} animate-pulse`}></span>
      <span className="text-slate-400 font-medium">Phase 13 Validation:</span>
      <span className={`font-bold font-mono ${config.text}`}>
        {config.label}
      </span>
      <span className="text-[11px] text-slate-400 font-mono">
        ({passed}/{totalChecks} passed{warnings > 0 ? `, ${warnings}w` : ''}{errors > 0 ? `, ${errors}e` : ''})
      </span>
      {onNavigateToValidation && (
        <span className="text-[10px] text-slate-400 ml-1">→</span>
      )}
    </div>
  );
}
