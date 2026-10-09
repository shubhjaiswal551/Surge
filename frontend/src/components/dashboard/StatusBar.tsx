import React, { useEffect, useState } from 'react';
import { toggleSound, isSoundEnabled } from '../../lib/sound';

import { useCrowdContext } from '../../context/CrowdContext';

interface StatusBarProps {
  activeAlertCount?: number;
  onOpenNotifications?: () => void;
}

const StatusBar: React.FC<StatusBarProps> = ({
  activeAlertCount,
  onOpenNotifications,
}) => {
  const { cameras, activeFeedsCount, unacknowledgedAlertsCount, isDemoMode } = useCrowdContext();
  const [now, setNow] = useState(new Date());
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleToggleSound = () => {
    const next = toggleSound();
    setSoundOn(next);
  };

  const effectiveAlertCount = typeof activeAlertCount === 'number' ? activeAlertCount : unacknowledgedAlertsCount;
  const hasAlerts = effectiveAlertCount > 0;
  const systemStatusLabel = hasAlerts
    ? effectiveAlertCount === 1
      ? '1 Unresolved Incident'
      : `${effectiveAlertCount} Unresolved Incidents`
    : 'All Systems Nominal';

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-6 border-b border-slate-200/70 bg-white sticky top-0 z-30 shadow-xs">
      {/* Left: System Status Pill & Telemetry Pips */}
      <div className="flex items-center gap-3">
        <div
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-tight transition-all shadow-sm ${
            hasAlerts
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              hasAlerts ? 'bg-rose-500 animate-ping' : 'bg-emerald-500 radar-pip'
            }`}
          />
          <span>{systemStatusLabel}</span>
        </div>

        {isDemoMode && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            Demo data
          </span>
        )}

        <div className="hidden lg:flex items-center gap-2.5 text-xs text-slate-500 font-medium">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100/90 border border-slate-200/60 shadow-sm text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 radar-pip" />
            <span>{activeFeedsCount} / {cameras.length} Feeds Online</span>
          </span>
          <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100/90 border border-slate-200/60 shadow-sm text-[11px]">
            <span className="flex items-end gap-0.5 h-3">
              <span className="w-0.5 bg-emerald-500 rounded-full animate-eq-1" />
              <span className="w-0.5 bg-emerald-500 rounded-full animate-eq-2" />
              <span className="w-0.5 bg-emerald-500 rounded-full animate-eq-3" />
            </span>
            <span>YOLOv8s Pipeline · 32ms</span>
          </span>
        </div>
      </div>

      {/* Right: Controls & Time */}
      <div className="flex items-center gap-3.5">
        {/* Audio Alert Toggle */}
        <button
          type="button"
          onClick={handleToggleSound}
          title={soundOn ? 'Mute audible alarms' : 'Enable audible alarms'}
          className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm active:scale-[0.98] ${
            soundOn
              ? 'bg-slate-100/90 border-slate-200/70 text-slate-700 hover:bg-slate-200/80'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}
        >
          {soundOn ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              <span>Audio On</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
              <span>Muted</span>
            </>
          )}
        </button>

        <div className="h-4 w-px bg-slate-200" />

        {/* Apple Style Clock */}
        <div className="text-right tabular-nums">
          <div className="text-xs font-semibold text-slate-800 tracking-tight leading-tight">
            {timeStr}
          </div>
          <div className="text-[10px] text-slate-400 font-medium leading-tight">
            {dateStr}
          </div>
        </div>

        {/* Notifications Icon Button */}
        <button
          type="button"
          onClick={onOpenNotifications}
          className="relative w-9 h-9 rounded-xl flex items-center justify-center
                     border border-slate-200/70 bg-slate-100/80 text-slate-600
                     hover:text-slate-900 hover:bg-slate-200/70 transition-all shadow-sm active:scale-95"
          aria-label="Notifications"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {effectiveAlertCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center border-2 border-white shadow-sm">
              {effectiveAlertCount > 99 ? '99+' : effectiveAlertCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};

export default StatusBar;
