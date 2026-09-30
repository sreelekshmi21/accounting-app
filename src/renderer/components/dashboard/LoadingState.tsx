import React from 'react';

interface LoadingStateProps {
  message?: string;
  subtext?: string;
}

export default function LoadingState({
  message = 'Loading reporting data…',
  subtext = 'Connecting to accounting engine and loading reporting dimensions…',
}: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="relative flex items-center justify-center w-12 h-12 mb-4">
        <div className="w-12 h-12 border-4 border-slate-700 border-t-teal-400 rounded-full animate-spin"></div>
        <div className="absolute text-sm">📊</div>
      </div>
      <h3 className="text-sm font-bold text-slate-200 tracking-tight mb-1">
        {message}
      </h3>
      <p className="text-xs text-slate-400 max-w-sm">
        {subtext}
      </p>
    </div>
  );
}
