import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/dashboard/Sidebar';
import StatusBar from '../components/dashboard/StatusBar';
import {
  IncidentFilters,
  IncidentTable,
} from '../components/incidents/IncidentTable';
import { useAuth } from '../context/AuthContext';
import {
  startCrowdSimulator,
  stopCrowdSimulator,
  onIncident,
  onAlert,
} from '../mocks/crowdSimulator';
import type { Incident, AlertSeverity, IncidentStatus } from '../types/crowdEvent';
import { API_BASE_URL } from '../config/api';

const ZONES = ['Main Entrance Gate', 'Central Courtyard'];

const IncidentLog: React.FC = () => {
  const { profile } = useAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [alerts, setAlerts] = useState<number>(0);
  const [selectedZone, setSelectedZone] = useState('all');
  const [selectedSeverity, setSelectedSeverity] =
    useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    // Fetch persisted incidents from backend API
    fetch(`${API_BASE_URL}/incidents/`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: any[]) => {
        if (Array.isArray(data) && data.length > 0) {
          const mapped: Incident[] = data.map((item) => ({
            id: item.id,
            timestamp: item.detected_at,
            cameraId: item.camera_id,
            zoneName: item.zone_id === 'zone-001' ? 'Main Entrance Gate' : 'Central Courtyard',
            alertType: item.event_type.charAt(0).toUpperCase() + item.event_type.slice(1) + ' Detected',
            severity: item.severity >= 4 ? 'critical' : item.severity === 3 ? 'high' : 'warning',
            status: item.resolved ? 'resolved' : item.acknowledged_at ? 'acknowledged' : 'open',
            acknowledgedBy: item.acknowledged_by || undefined,
            resolvedAt: item.resolved_at || undefined,
          }));
          setIncidents(mapped);
        }
      })
      .catch((err) => console.warn('Could not fetch backend incidents:', err));

    startCrowdSimulator();
    const off1 = onIncident((inc) =>
      setIncidents((prev) => {
        const hasOpenSameIncident = prev.some(
          (i) =>
            i.cameraId === inc.cameraId &&
            i.alertType === inc.alertType &&
            i.status === 'open',
        );
        if (hasOpenSameIncident) return prev;
        return [inc, ...prev].slice(0, 200);
      }),
    );
    const off2 = onAlert(() =>
      setAlerts((n) => n + 1),
    );
    return () => {
      stopCrowdSimulator();
      off1();
      off2();
    };
  }, []);

  const filtered = useMemo(() => {
    return incidents.filter((inc) => {
      if (selectedZone !== 'all' && inc.zoneName !== selectedZone) return false;
      if (selectedSeverity !== 'all' && inc.severity !== selectedSeverity)
        return false;
      if (selectedStatus !== 'all' && inc.status !== selectedStatus)
        return false;
      if (dateFrom) {
        const d = new Date(inc.timestamp).getTime();
        const f = new Date(dateFrom + 'T00:00:00').getTime();
        if (d < f) return false;
      }
      if (dateTo) {
        const d = new Date(inc.timestamp).getTime();
        const t = new Date(dateTo + 'T23:59:59').getTime();
        if (d > t) return false;
      }
      return true;
    });
  }, [incidents, selectedZone, selectedSeverity, selectedStatus, dateFrom, dateTo]);

  const handleReset = () => {
    setSelectedZone('all');
    setSelectedSeverity('all');
    setSelectedStatus('all');
    setDateFrom('');
    setDateTo('');
  };

  const handleAcknowledge = (id: string) => {
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === id
          ? {
              ...inc,
              status: 'acknowledged' as IncidentStatus,
              acknowledgedBy: profile?.displayName ?? 'Operator',
            }
          : inc,
      ),
    );
  };

  const handleResolve = (id: string) => {
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === id
          ? {
              ...inc,
              status: 'resolved' as IncidentStatus,
              resolvedAt: new Date().toISOString(),
            }
          : inc,
      ),
    );
  };

  const bySeverity = useMemo(() => {
    const s: Record<AlertSeverity, number> = {
      critical: 0,
      high: 0,
      warning: 0,
      info: 0,
    };
    incidents.forEach((i) => (s[i.severity] = (s[i.severity] || 0) + 1));
    return s;
  }, [incidents]);

  const handleExportCsv = () => {
    const headers = ['ID,Timestamp,Zone,AlertType,Severity,Status,Operator'];
    const rows = filtered.map(
      (i) =>
        `"${i.id}","${i.timestamp}","${i.zoneName}","${i.alertType}","${i.severity}","${i.status}","${i.acknowledgedBy ?? ''}"`,
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `safecrowd-incident-audit-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#f5f5f7]">
      <Sidebar alertCount={alerts} />
      <div className="flex-1 flex flex-col min-w-0">
        <StatusBar activeAlertCount={alerts} />

        <main className="flex-1 overflow-y-auto min-h-0">
          <div className="px-6 py-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200/70">
              <div>
                <h1 className="text-lg font-bold text-slate-900 tracking-tight font-sans">
                  Incident Audit Log
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cryptographically timestamped incident history, operator responses, and triage events.
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="btn-secondary text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export CSV
                </button>

                <div className="flex items-center gap-2">
                  {[
                    { k: 'Critical', v: bySeverity.critical, cls: 'chip-critical' },
                    { k: 'High', v: bySeverity.high, cls: 'chip-danger' },
                    { k: 'Warning', v: bySeverity.warning, cls: 'chip-warn' },
                    { k: 'Info', v: bySeverity.info, cls: 'chip-safe' },
                  ].map((s) => (
                    <div
                      key={s.k}
                      className="px-2.5 py-1 rounded-xl bg-white border border-slate-200/80 shadow-xs flex items-center gap-1.5 text-xs font-sans"
                    >
                      <span className={s.cls}>{s.k}</span>
                      <span className="text-slate-900 font-bold text-xs font-mono">
                        {s.v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <IncidentFilters
              zones={ZONES}
              selectedZone={selectedZone}
              onZoneChange={setSelectedZone}
              selectedSeverity={selectedSeverity}
              onSeverityChange={setSelectedSeverity}
              selectedStatus={selectedStatus}
              onStatusChange={setSelectedStatus}
              dateFrom={dateFrom}
              onDateFromChange={setDateFrom}
              dateTo={dateTo}
              onDateToChange={setDateTo}
              onReset={handleReset}
            />

            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>
                Showing{' '}
                <span className="font-semibold text-slate-800 tabular-nums font-mono">{filtered.length}</span>{' '}
                of{' '}
                <span className="font-semibold text-slate-800 tabular-nums font-mono">{incidents.length}</span>{' '}
                incidents
              </span>
              <span className="text-slate-400 font-sans">Sorted: Newest first</span>
            </div>

            <IncidentTable
              incidents={filtered}
              onAcknowledge={handleAcknowledge}
              onResolve={handleResolve}
            />
          </div>
        </main>
      </div>
    </div>
  );
};

export default IncidentLog;
