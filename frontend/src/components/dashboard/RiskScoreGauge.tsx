import React from 'react';
import type { RiskScoreResult } from '../../config/crowdSafety';

interface RiskScoreGaugeProps {
  risk: RiskScoreResult;
  ruleRecommendation?: string;
  onExecuteRecommendation?: () => void;
}

const bandStyles = {
  safe: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    number: 'text-emerald-600',
    bar: 'bg-emerald-500',
    border: 'border-slate-200',
    label: 'Safe (Nominal)',
  },
  elevated: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    number: 'text-amber-600',
    bar: 'bg-amber-500',
    border: 'border-amber-200/90',
    label: 'Elevated Pressure',
  },
  critical: {
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    number: 'text-rose-600',
    bar: 'bg-rose-600',
    border: 'border-rose-200',
    label: 'Critical Risk',
  },
};

export const RiskScoreGauge: React.FC<RiskScoreGaugeProps> = ({
  risk,
  ruleRecommendation,
  onExecuteRecommendation,
}) => {
  const style = bandStyles[risk.band] || bandStyles.safe;

  return (
    <div className="space-y-4">
      <div className={`p-3.5 rounded-2xl border ${style.border} bg-white/50 backdrop-blur-xs flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style.badge}`}>
            {style.label}
          </span>
          <span className="text-xs text-slate-500">{risk.topContributor}</span>
        </div>
        <div className={`text-xl font-bold font-mono ${style.number}`}>
          {risk.score} / 100
        </div>
      </div>

      {/* Rule-based operational recommendation banner if present */}
      {ruleRecommendation && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
          <div className="flex items-center gap-2.5">
            <span className="text-base shrink-0">⚠️</span>
            <div>
              <span className="font-bold">Rule-based recommendation: </span>
              {ruleRecommendation}
            </div>
          </div>
          {onExecuteRecommendation && (
            <button
              type="button"
              onClick={onExecuteRecommendation}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold transition shrink-0 self-start sm:self-auto text-xs"
            >
              Execute SOP (Simulated)
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default RiskScoreGauge;
