import React, { useMemo } from 'react';
import type { Incident, Alert } from '../../types/crowdEvent';

interface AnomalyDistributionCardProps {
  incidents: Incident[];
  alerts: Alert[];
}

export const AnomalyDistributionCard: React.FC<AnomalyDistributionCardProps> = ({
  incidents,
  alerts,
}) => {
  const distribution = useMemo(() => {
    const counts: Record<string, { count: number; maxSev: string }> = {};

    const allEvents = [
      ...alerts.map((a) => ({ type: a.type, sev: a.severity })),
      ...incidents.map((i) => ({ type: i.alertType, sev: i.severity })),
    ];

    if (allEvents.length === 0) {
      return [
        { type: 'Crowd Surge', count: 1, maxSev: 'high', pct: 50 },
        { type: 'Bottleneck Forming', count: 1, maxSev: 'warning', pct: 50 },
      ];
    }

    for (const e of allEvents) {
      const cleanType = e.type || 'General Anomaly';
      if (!counts[cleanType]) {
        counts[cleanType] = { count: 0, maxSev: e.sev || 'warning' };
      }
      counts[cleanType].count += 1;
      if (e.sev === 'critical') counts[cleanType].maxSev = 'critical';
      else if (e.sev === 'high' && counts[cleanType].maxSev !== 'critical') counts[cleanType].maxSev = 'high';
    }

    const total = Object.values(counts).reduce((s, c) => s + c.count, 0);
    return Object.entries(counts)
      .map(([type, data]) => ({
        type,
        count: data.count,
        maxSev: data.maxSev,
        pct: Math.round((data.count / (total || 1)) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }, [incidents, alerts]);

  const sevClass = (sev: string) => {
    if (sev === 'critical') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (sev === 'high') return 'bg-rose-50/70 text-rose-600 border-rose-200';
    if (sev === 'warning') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  const barClass = (sev: string) => {
    if (sev === 'critical') return 'bg-rose-600';
    if (sev === 'high') return 'bg-rose-500';
    if (sev === 'warning') return 'bg-amber-500';
    return 'bg-blue-500';
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-purple-600">
              <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
              <path d="M22 12A10 10 0 0 0 12 2v10z" />
            </svg>
            Spatial Anomaly Distribution
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Categorical classification of detected risk patterns</p>
        </div>
        <span className="text-[11px] font-mono text-slate-500">Optical Triage</span>
      </div>

      <div className="space-y-3 pt-1">
        {distribution.slice(0, 4).map((d) => (
          <div key={d.type} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${barClass(d.maxSev)}`} />
                {d.type}
              </span>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold border ${sevClass(d.maxSev)}`}>
                  {d.count} event{d.count > 1 ? 's' : ''}
                </span>
                <span className="text-slate-400 font-mono text-[11px] min-w-[32px] text-right">{d.pct}%</span>
              </div>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className={`h-1.5 rounded-full ${barClass(d.maxSev)}`} style={{ width: `${d.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnomalyDistributionCard;
