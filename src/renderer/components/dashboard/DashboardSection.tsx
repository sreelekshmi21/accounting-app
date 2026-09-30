import React from 'react';

interface DashboardSectionProps {
  title: string;
  subtitle?: string;
  icon?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export default function DashboardSection({
  title,
  subtitle,
  icon,
  action,
  children,
  className = '',
}: DashboardSectionProps) {
  return (
    <div className={`mb-8 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          {icon && <span className="text-base">{icon}</span>}
          <div>
            <h3 className="text-sm font-bold text-slate-100 tracking-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-slate-400 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && <div>{action}</div>}
      </div>

      <div>{children}</div>
    </div>
  );
}
