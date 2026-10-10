import React from 'react';
import RubberSegment from '../ui/RubberSegment';
import type {
  Incident,
  IncidentStatus,
  AlertSeverity,
} from '../../types/crowdEvent';

interface IncidentFiltersProps {
  zones: string[];
  selectedZone: string;
  onZoneChange: (v: string) => void;
  selectedSeverity: string;
  onSeverityChange: (v: string) => void;
  selectedStatus: string;
  onStatusChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  onReset: () => void;
}

const severityChipClass = (s: AlertSeverity | 'all'): string => {
  if (s === 'critical') return 'chip-critical';
  if (s === 'high') return 'chip-danger';
  if (s === 'warning') return 'chip-warn';
  if (s === 'info') return 'chip-safe';
  return 'chip bg-slate-100 text-slate-600 border-slate-200';
};

const statusChipClass = (s: IncidentStatus): string => {
  if (s === 'resolved') return 'chip-safe';
  if (s === 'acknowledged') return 'chip-warn';
  return 'chip-danger';
};

export const IncidentFilters: React.FC<IncidentFiltersProps> = ({
  zones,
  selectedZone,
  onZoneChange,
  selectedSeverity,
  onSeverityChange,
  selectedStatus,
  onStatusChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onReset,
}) => {
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900 tracking-tight">Search & Filters</div>
          <div className="text-xs text-slate-500 mt-0.5">
            Filter incident records by zone, severity tier, or status
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-xs font-semibold text-[#0071e3] hover:text-[#0077ed] transition-colors"
        >
          Reset All Filters
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500">Zone / Sensor</label>
          <div className="relative">
            <select
              className="w-full appearance-none px-3.5 py-2 pr-8 rounded-xl bg-slate-50/80 hover:bg-slate-100/60 focus:bg-white border border-slate-200/90 text-slate-800 text-xs font-sans focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 transition-all cursor-pointer shadow-xs"
              value={selectedZone}
              onChange={(e) => onZoneChange(e.target.value)}
            >
              <option value="all">All Zones</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-slate-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m7 15 5 5 5-5" />
                <path d="m7 9 5-5 5 5" />
              </svg>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500">Severity Tier</label>
          <div className="relative">
            <select
              className="w-full appearance-none px-3.5 py-2 pr-8 rounded-xl bg-slate-50/80 hover:bg-slate-100/60 focus:bg-white border border-slate-200/90 text-slate-800 text-xs font-sans focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 transition-all cursor-pointer shadow-xs"
              value={selectedSeverity}
              onChange={(e) => onSeverityChange(e.target.value)}
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-slate-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m7 15 5 5 5-5" />
                <path d="m7 9 5-5 5 5" />
              </svg>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500">Triage Status</label>
          <div className="pt-0.5">
            <RubberSegment
              items={[
                { value: 'all', label: 'All' },
                { value: 'open', label: 'Open' },
                { value: 'acknowledged', label: 'Ack' },
                { value: 'resolved', label: 'Resolved' },
              ]}
              value={selectedStatus}
              onChange={(val) => onStatusChange(val)}
              size="sm"
              equalSlots
              trackColor="#e2e8f0"
              thumbColor={
                selectedStatus === 'open'
                  ? '#f43f5e'
                  : selectedStatus === 'acknowledged'
                    ? '#f59e0b'
                    : selectedStatus === 'resolved'
                      ? '#10b981'
                      : '#ffffff'
              }
              textColor="#64748b"
              activeTextColor={selectedStatus !== 'all' ? '#ffffff' : '#0f172a'}
              radius={10}
              inset={2.5}
              speed={1}
              aria-label="Triage status filter"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500">Date From</label>
          <input
            type="date"
            className="input-field text-xs rounded-xl shadow-xs"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500">Date To</label>
          <input
            type="date"
            className="input-field text-xs rounded-xl shadow-xs"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};

interface IncidentTableProps {
  incidents: Incident[];
  onAcknowledge?: (id: string) => void;
  onResolve?: (id: string) => void;
}

export const IncidentTable: React.FC<IncidentTableProps> = ({
  incidents,
  onAcknowledge,
  onResolve,
}) => {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80 text-left">
              <th className="px-4 py-3 text-[11px] uppercase text-slate-400 font-semibold tracking-wider">Timestamp</th>
              <th className="px-4 py-3 text-[11px] uppercase text-slate-400 font-semibold tracking-wider">Zone</th>
              <th className="px-4 py-3 text-[11px] uppercase text-slate-400 font-semibold tracking-wider">Anomaly Type</th>
              <th className="px-4 py-3 text-[11px] uppercase text-slate-400 font-semibold tracking-wider">Severity</th>
              <th className="px-4 py-3 text-[11px] uppercase text-slate-400 font-semibold tracking-wider">Status</th>
              <th className="px-4 py-3 text-[11px] uppercase text-slate-400 font-semibold tracking-wider">Handled By</th>
              <th className="px-4 py-3 text-[11px] uppercase text-slate-400 font-semibold tracking-wider text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {incidents.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-slate-400 font-medium text-xs"
                >
                  No recorded incidents match criteria
                </td>
              </tr>
            ) : (
              incidents.map((inc) => (
                <tr
                  key={inc.id}
                  className="hover:bg-slate-50/70 transition-colors"
                >
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap tabular-nums">
                    {new Date(inc.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-900 font-semibold whitespace-nowrap">
                    {inc.zoneName}
                  </td>
                  <td className="px-4 py-3 text-slate-700 capitalize max-w-xs truncate font-medium">
                    {inc.alertType}
                  </td>
                  <td className="px-4 py-3">
                    <span className={severityChipClass(inc.severity)}>
                      {inc.severity.charAt(0).toUpperCase() + inc.severity.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={statusChipClass(inc.status)}>
                      {inc.status.charAt(0).toUpperCase() + inc.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {inc.acknowledgedBy ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {inc.status === 'open' && onAcknowledge && (
                        <button
                          type="button"
                          onClick={() => onAcknowledge(inc.id)}
                          className="btn-primary py-1 px-3 shadow-xs"
                        >
                          Acknowledge
                        </button>
                      )}
                      {(inc.status === 'open' || inc.status === 'acknowledged') && onResolve && (
                        <button
                          type="button"
                          onClick={() => onResolve(inc.id)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-600 text-white font-medium text-xs hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-xs"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
