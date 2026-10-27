import React from 'react';
import type { Alert, AlertSeverity } from '../../types/crowdEvent';

interface AlertCardProps {
  alert: Alert;
  onAcknowledge?: (id: string) => void;
  onViewSnapshot?: (id: string) => void;
  onResolve?: (id: string) => void;
}

const severityConfig: Record<
  AlertSeverity,
  {
    label: string;
    chipClass: string;
    dotColor: string;
  }
> = {
  info: {
    label: 'Information',
    chipClass: 'chip-safe',
    dotColor: 'bg-emerald-500',
  },
  warning: {
    label: 'Warning',
    chipClass: 'chip-warn',
    dotColor: 'bg-amber-500',
  },
  high: {
    label: 'High Severity',
    chipClass: 'chip-danger',
    dotColor: 'bg-red-500',
  },
  critical: {
    label: 'Critical Alert',
    chipClass: 'chip-critical',
    dotColor: 'bg-rose-600 animate-ping',
  },
};

const formatRelative = (iso: string): string => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  const m = diff / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  return `${Math.floor(h)}h ago`;
};

const AlertCard: React.FC<AlertCardProps> = ({
  alert,
  onAcknowledge,
  onViewSnapshot,
  onResolve,
}) => {
  const cfg = severityConfig[alert.severity];

  return (
    <article
      className="relative p-3.5 rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-md shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className={`mt-1.5 w-2 h-2 shrink-0 rounded-full ${cfg.dotColor}`} />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-900 tracking-tight truncate">
              {alert.type}
            </span>
            <span className={`${cfg.chipClass} text-[10px] shrink-0 font-medium`}>
              {cfg.label}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
            <span className="inline-flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 7 16 12l-5-3-8 6v2h18V7z" />
              </svg>
              <span className="truncate">{alert.zoneName}</span>
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{formatRelative(alert.timestamp)}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button
              type="button"
              onClick={() => onViewSnapshot?.(alert.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium
                         bg-white border border-slate-200/80 text-slate-700 shadow-sm
                         hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-5-5L5 21" />
              </svg>
              View Evidence
            </button>
            {!alert.acknowledged && onAcknowledge && (
              <button
                type="button"
                onClick={() => onAcknowledge(alert.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium
                           bg-[#0071e3] text-white hover:bg-[#0077ed] shadow-sm active:scale-95 transition-all"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Acknowledge
              </button>
            )}
            {alert.acknowledged && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Acknowledged
              </span>
            )}
            {onResolve && (
              <button
                type="button"
                onClick={() => onResolve(alert.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium
                           bg-emerald-50 text-emerald-700 border border-emerald-200/90 hover:bg-emerald-100/80 shadow-2xs active:scale-95 transition-all"
                title="Resolve and archive incident"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Resolve
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

export default AlertCard;
