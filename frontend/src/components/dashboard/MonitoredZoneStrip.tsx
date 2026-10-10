import React from 'react';
import { deriveZoneCapacity, deriveZoneStatus } from '../../config/crowdSafety';
import { Video, AlertCircle, ChevronRight } from 'lucide-react';
import type { CameraState, Alert } from '../../types/crowdEvent';

interface MonitoredZoneStripProps {
  cameras: CameraState[];
  alerts: Alert[];
  selectedCameraId: string | null;
  onSelectCamera: (cameraId: string | null) => void;
}

const statusBadgeConfig = {
  low: {
    label: 'Nominal',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    barClass: 'bg-emerald-500',
  },
  moderate: {
    label: 'Moderate',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    barClass: 'bg-amber-500',
  },
  high: {
    label: 'High Density',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 font-semibold',
    barClass: 'bg-amber-500',
  },
  critical: {
    label: 'Critical Load',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
    barClass: 'bg-rose-600',
  },
};

export const MonitoredZoneStrip: React.FC<MonitoredZoneStripProps> = ({
  cameras,
  alerts,
  selectedCameraId,
  onSelectCamera,
}) => {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5 text-blue-600" />
            Monitored Spatial Zones
          </span>
          <span className="text-[11px] text-slate-400 font-medium">
            (Click a zone to filter incident feed)
          </span>
        </div>

        {selectedCameraId && (
          <button
            type="button"
            onClick={() => onSelectCamera(null)}
            className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
          >
            <span>Show All Zones</span>
            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full font-mono">
              ✕
            </span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cameras.map((cam) => {
          const cap = deriveZoneCapacity(cam.areaSqM) || 50;
          const statusKey = deriveZoneStatus(cam.headcount, cap);
          const cfg = statusBadgeConfig[statusKey];
          const unackAlerts = alerts.filter(
            (a) => a.cameraId === cam.cameraId && !a.acknowledged
          );
          const isSelected = selectedCameraId === cam.cameraId;
          const pct = Math.min(100, Math.round((cam.headcount / cap) * 100));

          return (
            <button
              key={cam.cameraId}
              type="button"
              onClick={() => onSelectCamera(isSelected ? null : cam.cameraId)}
              className={`p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer relative ${
                isSelected
                  ? 'bg-blue-50/60 border-blue-400 ring-2 ring-blue-500/20 shadow-sm'
                  : 'bg-white/90 border-slate-200/80 hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              {/* Top row: Camera ID & Status */}
              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <span className="font-mono text-[11px] font-bold text-slate-700 uppercase tracking-tight flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    unackAlerts.length > 0 ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'
                  }`} />
                  {cam.cameraId.toUpperCase()}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cfg.badgeClass}`}>
                  {cfg.label}
                </span>
              </div>

              {/* Zone Name */}
              <div className="text-xs font-semibold text-slate-900 truncate mb-2" title={cam.zoneName}>
                {cam.zoneName}
              </div>

              {/* Headcount vs Capacity */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium mb-1.5">
                <span>{cam.headcount} occupants</span>
                <span className="font-mono font-semibold text-slate-700">{pct}%</span>
              </div>

              {/* Capacity Progress Bar */}
              <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${cfg.barClass}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Alert Badge Indicator if active */}
              {unackAlerts.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-rose-600 font-semibold">
                  <span className="flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {unackAlerts.length} Unresolved Incident{unackAlerts.length > 1 ? 's' : ''}
                  </span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MonitoredZoneStrip;
