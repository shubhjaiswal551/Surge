import React, { useRef, useEffect, useState } from 'react';
import AlertCard from './AlertCard';
import SnapshotModal from './SnapshotModal';
import { playChime } from '../../lib/sound';
import { Link } from 'react-router-dom';
import type { Alert, CameraState, Incident } from '../../types/crowdEvent';

interface AlertFeedProps {
  alerts: Alert[];
  onAcknowledge?: (id: string) => void;
  onViewSnapshot?: (id: string) => void;
  onResolve?: (id: string, notes: string, isFalsePositive: boolean) => void;
  isFiltered?: boolean;
  onResetFilters?: () => void;
  cameras?: CameraState[];
  lastResolvedIncident?: Incident | null;
  onTestAlarm?: () => void;
}

interface EnrichedEmptyStateProps {
  cameras?: CameraState[];
  lastResolvedIncident?: Incident | null;
  onTestAlarm?: () => void;
}

const EnrichedEmptyState: React.FC<EnrichedEmptyStateProps> = ({
  cameras,
  lastResolvedIncident,
  onTestAlarm,
}) => (
  <div className="flex flex-col items-center justify-center py-8 px-6 max-w-2xl mx-auto text-center">
    <div className="relative mb-3.5">
      <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200/90 flex items-center justify-center shadow-xs">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-emerald-600"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </div>
      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white radar-pip" />
    </div>

    <h3 className="text-base font-bold text-slate-900 tracking-tight">
      All Monitored Spatial Zones Clear
    </h3>
    <p className="text-xs text-slate-500 mt-1 max-w-md leading-relaxed font-medium">
      Optical perception active across all surveillance RTSP channels. Automated YOLOv8s crowd flow tracking has detected zero active threshold violations.
    </p>

    {/* Optical Sensor Heartbeat Strip */}
    {cameras && cameras.length > 0 && (
      <div className="w-full mt-5 p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 text-left">
        <div className="flex items-center justify-between mb-2 px-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Sensor Telemetry
          </span>
          <span>{cameras.filter(c => c.isActive !== false).length} / {cameras.length} Feeds Online</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {cameras.map((cam) => (
            <div
              key={cam.cameraId}
              className="p-2 rounded-xl bg-white border border-slate-200/70 shadow-2xs text-[11px]"
            >
              <div className="font-mono font-bold text-slate-700 uppercase">
                {cam.cameraId}
              </div>
              <div className="text-slate-500 truncate text-[10px] mt-0.5" title={cam.zoneName}>
                {cam.zoneName}
              </div>
              <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-100 text-[10px]">
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-emerald-500" />
                  Nominal
                </span>
                <span className="font-mono text-slate-500">{cam.headcount}p</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Last Resolved Incident Callout */}
    {lastResolvedIncident && (
      <div className="w-full mt-3 p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs text-left flex items-start gap-2.5">
        <div className="mt-0.5 w-5 h-5 rounded-md bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="min-w-0 flex-1 text-xs">
          <div className="font-semibold text-slate-800">
            Last Resolved Event: {lastResolvedIncident.alertType}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
            {lastResolvedIncident.zoneName} · Resolved by {lastResolvedIncident.acknowledgedBy || 'Operator'}{' '}
            {lastResolvedIncident.notes ? `(${lastResolvedIncident.notes})` : ''}
          </div>
        </div>
      </div>
    )}

    {/* Operator Action Shortcuts */}
    <div className="flex items-center gap-2.5 mt-5">
      <Link
        to="/incidents"
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-all shadow-xs"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <span>View Incident History</span>
      </Link>
      {onTestAlarm && (
        <button
          type="button"
          onClick={onTestAlarm}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-xs"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
          <span>Test Alarm Sound</span>
        </button>
      )}
    </div>
  </div>
);

const FilteredEmptyState: React.FC<{ onReset?: () => void }> = ({ onReset }) => (
  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
    <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-3 shadow-xs text-slate-400">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
    </div>
    <div className="text-sm font-semibold text-slate-800 tracking-tight">
      No Incidents Match Active Filters
    </div>
    <div className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed font-medium">
      No alerts match your current search query, severity, status, or camera selection.
    </div>
    {onReset && (
      <button
        type="button"
        onClick={onReset}
        className="mt-4 px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-blue-600 hover:bg-slate-50 transition-all shadow-xs"
      >
        Reset All Filters
      </button>
    )}
  </div>
);

const AlertFeed: React.FC<AlertFeedProps> = ({
  alerts,
  onAcknowledge,
  onViewSnapshot,
  onResolve,
  isFiltered,
  onResetFilters,
  cameras,
  lastResolvedIncident,
  onTestAlarm,
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(alerts.length);
  const [snapshotAlert, setSnapshotAlert] = useState<Alert | null>(null);

  useEffect(() => {
    if (alerts.length > prevCount.current) {
      if (scrollerRef.current) {
        scrollerRef.current.scrollTop = 0;
      }
      const newest = alerts[0];
      if (newest && !newest.acknowledged) {
        playChime(newest.severity);
      }
    }
    prevCount.current = alerts.length;
  }, [alerts]);

  const handleSnapshotClick = (id: string) => {
    if (onViewSnapshot) {
      onViewSnapshot(id);
    }
    const target = alerts.find((a) => a.id === id);
    if (target) {
      setSnapshotAlert(target);
    }
  };

  const unacknowledged = alerts.filter((a) => !a.acknowledged).length;
  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;

  return (
    <>
      <div className="card flex flex-col h-full min-h-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-white/70 backdrop-blur-md">
          <div>
            <div className="text-sm font-semibold text-slate-800 tracking-tight">
              Active Incident Stream
            </div>
            <div className="text-xs text-slate-400 font-medium mt-0.5">
              Real-time anomaly triage & alerts
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {criticalCount > 0 && (
              <span className="chip-critical font-medium text-[11px]">
                {criticalCount} Critical
              </span>
            )}
            {unacknowledged > 0 && (
              <span className="chip-danger font-medium text-[11px]">
                {unacknowledged} Pending
              </span>
            )}
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium text-[11px]">
              {alerts.length} Total
            </span>
          </div>
        </div>

        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0"
        >
          {alerts.length === 0 ? (
            isFiltered ? (
              <FilteredEmptyState onReset={onResetFilters} />
            ) : (
              <EnrichedEmptyState
                cameras={cameras}
                lastResolvedIncident={lastResolvedIncident}
                onTestAlarm={onTestAlarm}
              />
            )
          ) : (
            alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAcknowledge={onAcknowledge}
                onViewSnapshot={handleSnapshotClick}
              />
            ))
          )}
        </div>
      </div>

      {snapshotAlert && (
        <SnapshotModal
          alert={snapshotAlert}
          onClose={() => setSnapshotAlert(null)}
          onAcknowledge={onAcknowledge}
          onResolve={onResolve}
        />
      )}
    </>
  );
};

export default AlertFeed;
