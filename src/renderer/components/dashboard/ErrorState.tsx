import React from 'react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({
  title = 'Reporting Error',
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-6 my-4 text-slate-200">
      <div className="flex items-start gap-3">
        <div className="text-xl text-rose-400 mt-0.5">⚠️</div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-rose-300 mb-1">
            {title}
          </h3>
          <p className="text-xs text-rose-200/80 leading-relaxed font-mono bg-rose-950/60 p-2.5 rounded-lg border border-rose-900/50 my-2">
            {message}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 px-3.5 py-1.5 bg-rose-800/80 hover:bg-rose-700 text-white text-xs font-bold rounded-lg border border-rose-700 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span>🔄</span>
              <span>Retry</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
