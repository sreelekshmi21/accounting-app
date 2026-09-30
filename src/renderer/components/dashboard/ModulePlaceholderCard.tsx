import React from 'react';

export interface ModulePlaceholderCardProps {
  phase: string;
  title: string;
  icon: string;
  description: string;
  keyFeatures: string[];
  status?: string;
  targetRelease?: string;
}

export default function ModulePlaceholderCard({
  phase,
  title,
  icon,
  description,
  keyFeatures,
  status = 'Planned',
  targetRelease,
}: ModulePlaceholderCardProps) {
  return (
    <div className="bg-slate-900/70 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-5 transition-all flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl p-2 bg-slate-800/80 border border-slate-700/60 rounded-lg">
              {icon}
            </span>
            <div>
              <span className="text-[10px] font-bold text-teal-400 font-mono uppercase tracking-wider">
                Phase {phase}
              </span>
              <h4 className="text-sm font-bold text-white tracking-tight">
                {title}
              </h4>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            {targetRelease || `Coming in ${phase}`}
          </span>
        </div>

        <p className="text-xs text-slate-400 mb-3 leading-relaxed">
          {description}
        </p>

        <div className="space-y-1 my-3">
          {keyFeatures.map((feat, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs text-slate-300">
              <span className="text-teal-400 text-[10px]">▹</span>
              <span>{feat}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
        <span>Status: <strong className="text-slate-400 font-medium">{status}</strong></span>
        <span className="italic text-slate-500">Architecture Foundation Active</span>
      </div>
    </div>
  );
}
