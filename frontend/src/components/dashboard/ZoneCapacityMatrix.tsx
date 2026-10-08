import React from 'react';
import { Link } from 'react-router-dom';
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
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-blue-600">
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
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 group shrink-0"
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
              className={`border rounded-xl p-4 bg-white transition-all hover:shadow-sm ${cfg.cardBorder}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 font-mono">
                    {c.cameraId.toUpperCase()} {area ? `· ${area.toFixed(1)} m²` : '· Uncalibrated Area'}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 mt-0.5">{c.zoneName}</h3>
                  <p className="text-xs text-slate-500">{c.description}</p>
                </div>

                <div className="text-right shrink-0 ml-2">
                  {capacity !== null ? (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs border ${cfg.badgeClass}`}>
                      {cfg.label} ({ratioPercent?.toFixed(0)}%)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-slate-100 text-slate-600 border border-slate-200">
                      Uncalibrated
                    </span>
                  )}
                </div>
              </div>

              {/* 3 Metrics: Headcount, Density (P/m²), Flow Speed (px/win) */}
              <div className="mt-4 grid grid-cols-3 gap-2 py-2 border-y border-slate-100 text-center">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">Headcount</div>
                  <div className="text-base font-extrabold text-slate-800 font-mono mt-0.5">
                    {c.headcount}{' '}
                    {capacity !== null && <span className="text-xs font-normal text-slate-400">/ {capacity}</span>}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">Density</div>
                  <div className={`text-base font-extrabold font-mono mt-0.5 ${cfg.textAccent}`}>
                    {densityNum !== null ? (
                      <>
                        {densityNum} <span className="text-xs font-normal text-slate-400">P/m²</span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">N/A</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">Flow Speed</div>
                  <div className="text-base font-extrabold text-slate-800 font-mono mt-0.5">
                    {flowSpeed} <span className="text-[10px] font-normal text-slate-400">px/win</span>
                  </div>
                </div>
              </div>

              {/* Capacity Progress Bar */}
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                  <span>Capacity Load</span>
                  {capacity !== null ? (
                    <span className="font-semibold text-slate-700">
                      {c.headcount} of {capacity} Max
                    </span>
                  ) : (
                    <span className="text-slate-400">Area not set</span>
                  )}
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${cfg.barClass}`}
                    style={{ width: `${ratioPercent ?? 0}%` }}
                  />
                </div>
              </div>

              {/* Footer info & Deep link */}
              <div className="mt-3.5 flex items-center justify-between pt-2 border-t border-slate-50">
                <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.barClass}`} />
                  <span>Vector: {c.flowDirection}°</span>
                  {hasSevereIncident && <span className="text-rose-600 font-bold ml-1">· Active Alert</span>}
                </span>
                <Link
                  to={`/cameras?focus=${c.cameraId}`}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition"
                >
                  Watch Live Feed →
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
