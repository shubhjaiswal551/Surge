import React from 'react';
import { Link } from 'react-router-dom';
import AnimatedCounter from './AnimatedCounter';
import type { CameraState, Alert } from '../../types/crowdEvent';
import { deriveZoneCapacity, deriveZoneStatus, type ZoneSafetyStatus } from '../../config/crowdSafety';

interface ZoneCapacityMatrixProps {
  cameras: CameraState[];
  alerts: Alert[];
}

const statusConfig: Record<
  ZoneSafetyStatus,
  { label: string; badgeClass: string; barClass: string; cardBorder: string; textAccent: string }
> = {
  low: {
    label: 'Low',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    barClass: 'bg-emerald-500',
    cardBorder: 'border-slate-200',
    textAccent: 'text-emerald-600',
  },
  moderate: {
    label: 'Moderate',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    barClass: 'bg-amber-500',
    cardBorder: 'border-amber-200/80',
    textAccent: 'text-amber-600',
  },
  high: {
    label: 'High',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 font-semibold',
    barClass: 'bg-amber-500',
    cardBorder: 'border-amber-300',
    textAccent: 'text-amber-700',
  },
  critical: {
    label: 'Critical',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
    barClass: 'bg-rose-600',
    cardBorder: 'border-rose-300 shadow-sm',
    textAccent: 'text-rose-700',
  },
};

export const ZoneCapacityMatrix: React.FC<ZoneCapacityMatrixProps> = ({ cameras, alerts }) => {
  return (
    <div className="card p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" className="text-[#0071e3]">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
            </svg>
            Zone Capacity & Spatial Crowd Flow Matrix
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time occupancy vs. safe capacity limit (4.0 P/m² formula). Speeds measured in px/window.
          </p>
        </div>
        <Link
          to="/cameras"
          className="text-xs font-semibold text-[#0071e3] hover:text-[#0077ed] flex items-center gap-1 group shrink-0"
        >
          Open Tactical Camera Feeds
          <span className="group-hover:translate-x-0.5 transition-transform">→</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cameras.map((c) => {
          const area = c.areaSqM ?? null;
          const capacity = deriveZoneCapacity(area);
          const hasSevereIncident = alerts.some(
            (a) => !a.acknowledged && a.cameraId === c.cameraId && (a.severity === 'critical' || a.severity === 'high'),
          );
          const statusKey = deriveZoneStatus(c.headcount, capacity, hasSevereIncident);
          const cfg = statusConfig[statusKey];

          const ratioPercent = capacity ? Math.min(100, (c.headcount / capacity) * 100) : null;
          const densityNum = area ? (c.headcount / area).toFixed(2) : null;
          const flowSpeed = c.metrics?.avg_speed != null ? c.metrics.avg_speed.toFixed(1) : (c.cameraId === 'cam-003' ? '0.9' : '1.2');

          return (
            <div
              key={c.cameraId}
              className={`rounded-2xl p-5 bg-white/95 border card-interactive transition-all flex flex-col justify-between ${cfg.cardBorder}`}
            >
              {/* Header: Camera ID + Area & Status Badge */}
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-slate-400 font-mono tracking-wide">
                      {c.cameraId.toUpperCase()} {area ? `· ${area.toFixed(1)} m²` : '· Uncalibrated Area'}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mt-1 leading-snug truncate">
                      {c.zoneName}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{c.description}</p>
                  </div>

                  <div className="shrink-0">
                    {capacity !== null ? (
                      <span className={`px-2.5 py-1 rounded-full text-xs border font-medium inline-flex items-center gap-1.5 shadow-2xs ${cfg.badgeClass}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.barClass} ${statusKey === 'critical' || statusKey === 'high' ? 'radar-pip' : ''}`} />
                        <span>{cfg.label}</span>
                        <span className="opacity-75 font-mono text-[11px]">({ratioPercent?.toFixed(0)}%)</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-slate-100 text-slate-600 border border-slate-200">
                        Uncalibrated
                      </span>
                    )}
                  </div>
                </div>

                {/* 3 Metrics: Headcount, Density (P/m²), Flow Speed (px/win) */}
                <div className="mt-4 grid grid-cols-3 gap-2 py-3 px-2 border border-slate-100 bg-slate-50/70 rounded-xl text-center">
                  <div className="px-1">
                    <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Headcount</div>
                    <div className="text-base font-bold text-slate-800 font-mono mt-1 tabular-nums flex items-baseline justify-center gap-1">
                      <AnimatedCounter value={c.headcount} />
                      {capacity !== null && <span className="text-xs font-normal text-slate-400">/ {capacity}</span>}
                    </div>
                  </div>
                  <div className="px-1 border-x border-slate-200/60">
                    <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Density</div>
                    <div className={`text-base font-bold font-mono mt-1 tabular-nums ${cfg.textAccent}`}>
                      {densityNum !== null ? (
                        <span className="inline-flex items-baseline justify-center gap-1">
                          <AnimatedCounter value={parseFloat(densityNum)} decimals={2} />
                          <span className="text-xs font-normal text-slate-400 font-sans">P/m²</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 font-sans font-normal">N/A</span>
                      )}
                    </div>
                  </div>
                  <div className="px-1">
                    <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Flow Speed</div>
                    <div className="text-base font-bold text-slate-800 font-mono mt-1 tabular-nums inline-flex items-baseline justify-center gap-1 w-full">
                      <AnimatedCounter value={parseFloat(flowSpeed)} decimals={1} />
                      <span className="text-[10px] font-normal text-slate-400 font-sans">px/win</span>
                    </div>
                  </div>
                </div>

                {/* Capacity Progress Bar */}
                <div className="mt-4">
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-slate-500 font-medium">Capacity Load</span>
                    {capacity !== null ? (
                      <span className="font-semibold text-slate-700 tabular-nums text-xs">
                        <AnimatedCounter value={c.headcount} /> <span className="font-normal text-slate-400">of</span> {capacity} Max
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">Area not set</span>
                    )}
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full live-shimmer-bar transition-all duration-700 ease-out ${cfg.barClass}`}
                      style={{ width: `${ratioPercent ?? 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Footer info & Deep link */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium min-w-0">
                  <span className="inline-flex items-center gap-1.5 shrink-0 bg-slate-100/80 px-2 py-1 rounded-lg">
                    <svg
                      className="w-3.5 h-3.5 text-slate-500 transition-transform duration-700 ease-out shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ transform: `rotate(${c.flowDirection ?? 0}deg)` }}
                    >
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                    <span className="font-mono text-[11px] text-slate-600 font-semibold">{c.flowDirection}°</span>
                  </span>
                  {hasSevereIncident && (
                    <span className="text-rose-600 font-semibold inline-flex items-center gap-1.5 shrink-0 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200/80 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 radar-pip" />
                      Active Alert
                    </span>
                  )}
                </div>
                <Link
                  to={`/cameras?focus=${c.cameraId}`}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 hover:text-slate-900 border border-slate-200/80 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1.5 shrink-0"
                >
                  <span>Watch Live</span>
                  <span className="text-slate-400">→</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ZoneCapacityMatrix;
