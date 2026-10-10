import React, { useMemo } from 'react';
import { AnimatedCounter } from './AnimatedCounter';
import { deriveZoneCapacity, deriveZoneStatus } from '../../config/crowdSafety';
import { AlertTriangle, Clock, Activity, Cpu, CheckCircle2 } from 'lucide-react';
import type { Alert, CameraState } from '../../types/crowdEvent';

interface TriageKpiBarProps {
  alerts: Alert[];
  unacknowledgedCount: number;
  cameras: CameraState[];
  activeFeedsCount: number;
  onAcknowledgeAll: () => void;
}

export const TriageKpiBar: React.FC<TriageKpiBarProps> = ({
  alerts,
  unacknowledgedCount,
  cameras,
  activeFeedsCount,
  onAcknowledgeAll,
}) => {
  const criticalCount = useMemo(() => alerts.filter((a) => a.severity === 'critical').length, [alerts]);
  const highCount = useMemo(() => alerts.filter((a) => a.severity === 'high').length, [alerts]);
  const warningCount = useMemo(() => alerts.filter((a) => a.severity === 'warning').length, [alerts]);

  // Compute highest capacity / hotspot zone
  const hotspot = useMemo(() => {
    let topCam: CameraState | undefined;
    let topRatio = 0;
    let topCap = 0;

    for (const c of cameras) {
      const cap = deriveZoneCapacity(c.areaSqM) || 50;
      const ratio = c.headcount / cap;
      if (!topCam || ratio > topRatio) {
        topRatio = ratio;
        topCam = c;
        topCap = cap;
      }
    }

    const status = topCam ? deriveZoneStatus(topCam.headcount, topCap) : 'low';
    return {
      camName: topCam?.zoneName || 'Monitoring All Zones',
      ratioPct: Math.round(topRatio * 100),
      headcount: topCam?.headcount ?? 0,
      capacity: topCap,
      status,
    };
  }, [cameras]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
      {/* 1. Active Incident Triage */}
      <div className="card p-4 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Active Anomaly Stream
          </span>
          <div className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="my-2.5 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono tracking-tight text-slate-900">
            <AnimatedCounter value={alerts.length} />
          </span>
          <span className="text-xs text-slate-400 font-medium">Total Events</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
          {criticalCount > 0 && (
            <span className="chip-critical px-2 py-0.5 rounded-full font-semibold">
              {criticalCount} Critical
            </span>
          )}
          {highCount > 0 && (
            <span className="chip-danger px-2 py-0.5 rounded-full font-semibold">
              {highCount} High
            </span>
          )}
          {warningCount > 0 && (
            <span className="chip-warn px-2 py-0.5 rounded-full font-semibold">
              {warningCount} Warning
            </span>
          )}
          {alerts.length === 0 && (
            <span className="text-emerald-600 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              All Zones Nominal
            </span>
          )}
        </div>
      </div>

      {/* 2. Pending Operator Triage */}
      <div className="card p-4 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Pending Operator Action
          </span>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
            unacknowledgedCount > 0
              ? 'bg-amber-50 border border-amber-200/80 text-amber-600'
              : 'bg-emerald-50 border border-emerald-200/80 text-emerald-600'
          }`}>
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="my-2.5 flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono tracking-tight ${
              unacknowledgedCount > 0 ? 'text-amber-600' : 'text-slate-900'
            }`}>
              <AnimatedCounter value={unacknowledgedCount} />
            </span>
            <span className="text-xs text-slate-400 font-medium">Unacknowledged</span>
          </div>
          {unacknowledgedCount > 0 && (
            <button
              type="button"
              onClick={onAcknowledgeAll}
              className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold underline underline-offset-2"
            >
              Acknowledge All
            </button>
          )}
        </div>

        <div className="text-[11px] text-slate-500 font-medium">
          {unacknowledgedCount > 0
            ? 'Requires operator review & triage'
            : 'All incidents triaged & signed off'}
        </div>
      </div>

      {/* 3. Peak Capacity Hotspot Zone */}
      <div className="card p-4 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Peak Capacity Zone
          </span>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
            hotspot.status === 'critical'
              ? 'bg-rose-50 border border-rose-200 text-rose-600'
              : hotspot.status === 'high'
              ? 'bg-amber-50 border border-amber-200 text-amber-600'
              : 'bg-blue-50 border border-blue-200 text-blue-600'
          }`}>
            <Activity className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="my-2.5">
          <div className="text-sm font-bold text-slate-900 truncate">
            {hotspot.camName}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-medium">
            <span className="font-mono font-semibold text-slate-800">
              {hotspot.ratioPct}% Load
            </span>
            <span>·</span>
            <span>{hotspot.headcount} / {hotspot.capacity} pax</span>
          </div>
        </div>

        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              hotspot.status === 'critical'
                ? 'bg-rose-600'
                : hotspot.status === 'high'
                ? 'bg-amber-500'
                : 'bg-blue-500'
            }`}
            style={{ width: `${Math.min(100, hotspot.ratioPct)}%` }}
          />
        </div>
      </div>

      {/* 4. Optical Pipeline Readiness */}
      <div className="card p-4 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            AI Inference Pipeline
          </span>
          <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600">
            <Cpu className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="my-2.5 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono tracking-tight text-slate-900">
            32ms
          </span>
          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 radar-pip" />
            YOLOv8s Live
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <span>Active RTSP Feeds</span>
          <span className="font-semibold text-slate-700">
            {activeFeedsCount} / {cameras.length} Online
          </span>
        </div>
      </div>
    </div>
  );
};

export default TriageKpiBar;
