import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon = '📭',
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-10 my-4 text-center flex flex-col items-center justify-center">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-sm font-bold text-slate-200 tracking-tight mb-1">
        {title}
      </h3>
      <p className="text-xs text-slate-400 max-w-md mb-4 leading-relaxed">
        {message}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5"
        >
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
}
