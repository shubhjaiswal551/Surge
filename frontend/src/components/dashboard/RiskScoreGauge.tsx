import React from 'react';
import type { RiskScoreResult } from '../../config/crowdSafety';

interface RiskScoreGaugeProps {
  risk?: RiskScoreResult;
  ruleRecommendation?: string;
  onExecuteRecommendation?: () => void;
}

export const RiskScoreGauge: React.FC<RiskScoreGaugeProps> = ({
  ruleRecommendation,
  onExecuteRecommendation,
}) => {
  if (!ruleRecommendation) return null;

  return (
    <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-glass animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-600 flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div>
          <span className="font-semibold text-amber-900">Rule-Based Action Advisory: </span>
          <span className="text-amber-800">{ruleRecommendation}</span>
        </div>
      </div>
      {onExecuteRecommendation && (
        <button
          type="button"
          onClick={onExecuteRecommendation}
          className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs shadow-sm transition active:scale-[0.98] shrink-0 self-start sm:self-auto"
        >
          Execute SOP (Simulated)
        </button>
      )}
    </div>
  );
};

export default RiskScoreGauge;
