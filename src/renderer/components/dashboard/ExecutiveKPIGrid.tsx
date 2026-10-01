import React from 'react';
import type { ExecutiveFinancialSummary } from '../../../electron-api';

interface ExecutiveKPIGridProps {
  summary: ExecutiveFinancialSummary;
  onNavigateToFinancialStatements?: () => void;
}

export function formatINR(val: number | null | undefined, options?: { showSign?: boolean }): string {
  if (val === null || val === undefined) return '—';
  const isNegative = val < 0;
  const abs = Math.abs(val);
  const formatted = abs.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (isNegative) return `-₹ ${formatted}`;
  if (options?.showSign && val > 0) return `+₹ ${formatted}`;
  return `₹ ${formatted}`;
}

export interface KPICardProps {
  icon: string;
  iconColor: 'emerald' | 'indigo' | 'rose' | 'teal' | 'cyan' | 'amber';
  title: string;
  category: string;
  badge: string;
  badgeColor: 'emerald' | 'indigo' | 'rose' | 'teal' | 'cyan' | 'amber';
  value: string;
  valueColor?: 'default' | 'surplus' | 'deficit';
  pyAvailable: boolean;
  pyFormatted?: string;
  pyChangeBadge?: React.ReactNode;
  themeClass: 'kpi-income' | 'kpi-expenditure' | 'kpi-surplus' | 'kpi-deficit' | 'kpi-assets' | 'kpi-liabilities' | 'kpi-funds';
}

export function KPICard({
  icon,
  iconColor,
  title,
  category,
  badge,
  badgeColor,
  value,
  valueColor = 'default',
  pyAvailable,
  pyFormatted,
  pyChangeBadge,
  themeClass,
}: KPICardProps) {
  return (
    <div className={`exec-kpi-card ${themeClass}`}>
      <div>
        <div className="exec-kpi-top">
          <div className="exec-kpi-title-row">
            <div className={`exec-kpi-icon-wrap icon-wrap-${iconColor}`}>
              {icon}
            </div>
            <div className="exec-kpi-title-meta">
              <h4 className="exec-kpi-title">{title}</h4>
              <span className="exec-kpi-category">{category}</span>
            </div>
          </div>
          <span className={`exec-kpi-pill pill-${badgeColor}`}>{badge}</span>
        </div>

        <div
          className={`exec-kpi-amount ${
            valueColor === 'surplus'
              ? 'amount-surplus'
              : valueColor === 'deficit'
              ? 'amount-deficit'
              : ''
          }`}
        >
          {value}
        </div>
      </div>

      <div className="exec-kpi-bottom">
        <span className="exec-kpi-py-title">Previous Year:</span>
        <span className="exec-kpi-py-text">
          {pyAvailable && pyFormatted ? (
            <span>
              {pyFormatted}
              {pyChangeBadge}
            </span>
          ) : (
            <span className="exec-kpi-py-empty">PY: Unavailable</span>
          )}
        </span>
      </div>
    </div>
  );
}

export default function ExecutiveKPIGrid({
  summary,
  onNavigateToFinancialStatements,
}: ExecutiveKPIGridProps) {
  const {
    totalIncome,
    totalExpenditure,
    surplusDeficit,
    totalAssets,
    totalLiabilities,
    fundsReserves,
    isBalanced,
    balanceDifferenceCY,
  } = summary;

  const isNetSurplus = (surplusDeficit.cyAmount ?? 0) >= 0;

  return (
    <div className="space-y-4">
      {/* ── Section Header ── */}
      <div className="exec-section-header">
        <span className="exec-section-label">
          Primary Financial KPIs (Phase 12)
        </span>
        {onNavigateToFinancialStatements && (
          <button
            onClick={onNavigateToFinancialStatements}
            className="exec-section-link"
          >
            <span>View Financial Statements</span>
            <span>→</span>
          </button>
        )}
      </div>

      {/* ── 6 Primary KPI Cards in a Dedicated Grid Container (Desktop: 3x2, Tablet: 2x3, Mobile: 1x6) ── */}
      <div className="exec-kpi-grid">
        {/* Card 1: Total Income (Row 1, Col 1) */}
        <KPICard
          icon="📈"
          iconColor="emerald"
          title="Total Income"
          category="Revenue"
          badge="P&L Inflow"
          badgeColor="emerald"
          value={formatINR(totalIncome.cyAmount)}
          pyAvailable={totalIncome.hasPY && totalIncome.pyAmount !== null}
          pyFormatted={totalIncome.pyAmount !== null ? formatINR(totalIncome.pyAmount) : undefined}
          pyChangeBadge={
            totalIncome.changeAmount !== null ? (
              <span style={{ marginLeft: 6, fontWeight: 700, color: totalIncome.changeAmount >= 0 ? '#34d399' : '#fb7185' }}>
                ({totalIncome.changeAmount >= 0 ? '+' : ''}{formatINR(totalIncome.changeAmount)})
              </span>
            ) : undefined
          }
          themeClass="kpi-income"
        />

        {/* Card 2: Total Expenditure (Row 1, Col 2) */}
        <KPICard
          icon="📤"
          iconColor="indigo"
          title="Total Expenditure"
          category="Expenses"
          badge="P&L Outflow"
          badgeColor="indigo"
          value={formatINR(totalExpenditure.cyAmount)}
          pyAvailable={totalExpenditure.hasPY && totalExpenditure.pyAmount !== null}
          pyFormatted={totalExpenditure.pyAmount !== null ? formatINR(totalExpenditure.pyAmount) : undefined}
          pyChangeBadge={
            totalExpenditure.changeAmount !== null ? (
              <span style={{ marginLeft: 6, fontWeight: 700, color: totalExpenditure.changeAmount <= 0 ? '#34d399' : '#fcd34d' }}>
                ({totalExpenditure.changeAmount > 0 ? '+' : ''}{formatINR(totalExpenditure.changeAmount)})
              </span>
            ) : undefined
          }
          themeClass="kpi-expenditure"
        />

        {/* Card 3: Net Surplus / Deficit (Row 1, Col 3) */}
        <KPICard
          icon={isNetSurplus ? '💎' : '📉'}
          iconColor={isNetSurplus ? 'emerald' : 'rose'}
          title={isNetSurplus ? 'Net Surplus' : 'Net Deficit'}
          category="Operational Result"
          badge={isNetSurplus ? 'Surplus' : 'Deficit'}
          badgeColor={isNetSurplus ? 'emerald' : 'rose'}
          value={formatINR(surplusDeficit.cyAmount)}
          valueColor={isNetSurplus ? 'surplus' : 'deficit'}
          pyAvailable={surplusDeficit.hasPY && surplusDeficit.pyAmount !== null}
          pyFormatted={surplusDeficit.pyAmount !== null ? formatINR(surplusDeficit.pyAmount) : undefined}
          themeClass={isNetSurplus ? 'kpi-surplus' : 'kpi-deficit'}
        />

        {/* Card 4: Total Assets (Row 2, Col 1) */}
        <KPICard
          icon="🏛️"
          iconColor="teal"
          title="Total Assets"
          category="Applications of Funds"
          badge="Balance Sheet"
          badgeColor="teal"
          value={formatINR(totalAssets.cyAmount)}
          pyAvailable={totalAssets.hasPY && totalAssets.pyAmount !== null}
          pyFormatted={totalAssets.pyAmount !== null ? formatINR(totalAssets.pyAmount) : undefined}
          themeClass="kpi-assets"
        />

        {/* Card 5: Total Liabilities (Row 2, Col 2) */}
        <KPICard
          icon="⚖️"
          iconColor="cyan"
          title="Total Liabilities"
          category="Sources of Funds"
          badge={isBalanced ? '✓ Balanced' : `Diff: ${formatINR(balanceDifferenceCY)}`}
          badgeColor={isBalanced ? 'emerald' : 'amber'}
          value={formatINR(totalLiabilities.cyAmount)}
          pyAvailable={totalLiabilities.hasPY && totalLiabilities.pyAmount !== null}
          pyFormatted={totalLiabilities.pyAmount !== null ? formatINR(totalLiabilities.pyAmount) : undefined}
          themeClass="kpi-liabilities"
        />

        {/* Card 6: Funds & Reserves (Row 2, Col 3) */}
        <KPICard
          icon="🛡️"
          iconColor="amber"
          title="Funds & Reserves"
          category="Corpus & Reserves"
          badge="Notes 4 & 5"
          badgeColor="amber"
          value={formatINR(fundsReserves.cyAmount)}
          pyAvailable={fundsReserves.hasPY && fundsReserves.pyAmount !== null}
          pyFormatted={fundsReserves.pyAmount !== null ? formatINR(fundsReserves.pyAmount) : undefined}
          themeClass="kpi-funds"
        />
      </div>
    </div>
  );
}
