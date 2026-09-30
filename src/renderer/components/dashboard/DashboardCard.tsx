import React from 'react';

interface DashboardCardProps {
  title: string;
  value?: string | number | React.ReactNode;
  subtitle?: string;
  icon?: string;
  badge?: string;
  badgeColor?: 'teal' | 'emerald' | 'amber' | 'slate' | 'rose' | 'indigo';
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
}

const BADGE_STYLES: Record<string, string> = {
  teal: 'bg-teal-950/80 text-teal-300 border-teal-800/60',
  emerald: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
  amber: 'bg-amber-950/80 text-amber-300 border-amber-800/60',
  rose: 'bg-rose-950/80 text-rose-300 border-rose-800/60',
  slate: 'bg-slate-800 text-slate-300 border-slate-700',
  indigo: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/60',
};

export default function DashboardCard({
  title,
  value,
  subtitle,
  icon,
  badge,
  badgeColor = 'slate',
  onClick,
  children,
  className = '',
}: DashboardCardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-slate-900/90 border border-slate-800/90 rounded-xl p-5 transition-all shadow-sm ${
        onClick ? 'cursor-pointer hover:border-slate-700 hover:bg-slate-850/80' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          {icon && <span className="text-base">{icon}</span>}
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {title}
          </h4>
        </div>
        {badge && (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              BADGE_STYLES[badgeColor] || BADGE_STYLES.slate
            }`}
          >
            {badge}
          </span>
        )}
      </div>

      {value !== undefined && (
        <div className="text-xl font-extrabold text-white tracking-tight my-1">
          {value}
        </div>
      )}

      {subtitle && (
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          {subtitle}
        </p>
      )}

      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
