import React, { useMemo, useState } from 'react';
import Sidebar from '../components/dashboard/Sidebar';
import StatusBar from '../components/dashboard/StatusBar';
import {
  IncidentFilters,
  IncidentTable,
} from '../components/incidents/IncidentTable';
import { useAuth } from '../context/AuthContext';
import { useCrowdContext } from '../context/CrowdContext';
import {
  exportIncidentsToCsv,
  exportIncidentsToPdf,
  exportToJson,
} from '../lib/exportService';
import type { Incident, AlertSeverity } from '../types/crowdEvent';
import { FileDown, FileText, CheckCircle2, ShieldCheck, Printer } from 'lucide-react';

const IncidentLog: React.FC = () => {
  const { profile } = useAuth();
  const {
    incidents,
    unacknowledgedAlertsCount,
    acknowledgeAlert,
    resolveAlert,
    cameras,
  } = useCrowdContext();

  const [selectedZone, setSelectedZone] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Resolution Modal State
  const [resolvingIncident, setResolvingIncident] = useState<Incident | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isFalsePositive, setIsFalsePositive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Export Menu State
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 3500);
  };

  const zones = useMemo(() => {
    const list = cameras.map((c) => c.zoneName);
    const incZones = incidents.map((i) => i.zoneName);
    return Array.from(new Set([...list, ...incZones])).filter(Boolean);
  }, [cameras, incidents]);

  const filtered = useMemo(() => {
    return incidents.filter((inc) => {
      if (selectedZone !== 'all' && inc.zoneName !== selectedZone) return false;
      if (selectedSeverity !== 'all' && inc.severity !== selectedSeverity) return false;
      if (selectedStatus !== 'all' && inc.status !== selectedStatus) return false;
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

  const handleAcknowledge = async (id: string) => {
    await acknowledgeAlert(id);
    showToast(`Incident ${id.toUpperCase()} acknowledged by operator.`);
  };

  const handleOpenResolveModal = (id: string) => {
    const inc = incidents.find((i) => i.id === id);
    if (inc) {
      setResolvingIncident(inc);
      setResolutionNotes(
        inc.notes ||
          (inc.alertType.toLowerCase().includes('surge')
            ? 'Security dispatched to open overflow turnstiles. Flow normalized.'
            : inc.alertType.toLowerCase().includes('bottleneck')
            ? 'Auxiliary egress gates opened. Pedestrian metering enacted.'
            : 'Perimeter inspected. Crowd density within safe threshold.'),
      );
      setIsFalsePositive(inc.isFalsePositive || false);
    }
  };

  const handleConfirmResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingIncident) return;

    setIsSubmitting(true);
    await resolveAlert(resolvingIncident.id, resolutionNotes, isFalsePositive);
    setIsSubmitting(false);
    showToast(
      isFalsePositive
        ? `Incident ${resolvingIncident.id.toUpperCase()} marked as False Positive.`
        : `Incident ${resolvingIncident.id.toUpperCase()} resolved and logged to audit trail.`,
    );
    setResolvingIncident(null);
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
    setShowExportMenu(false);
    exportIncidentsToCsv(filtered);
    showToast('Exported Forensic CSV audit file.');
  };

  const handleExportJson = () => {
    setShowExportMenu(false);
    exportToJson(filtered, 'surge-incident-audit', {
      venueName: 'Surge Central Operations Command',
      operatorName: profile?.displayName || 'Lead Operator',
      filterDescription: `Zone: ${selectedZone} · Severity: ${selectedSeverity} · Status: ${selectedStatus}`,
    });
    showToast('Exported Forensic JSON sitrep.');
  };

  const handleExportPdf = () => {
    setShowExportMenu(false);
    exportIncidentsToPdf(filtered, {
      venueName: 'Surge Operations Command District',
      operatorName: profile?.displayName || 'Lead Operator',
      filterDescription: `Zone: ${selectedZone} · Severity: ${selectedSeverity} · Status: ${selectedStatus}`,
    });
    showToast('Generating print-ready PDF forensic audit report...');
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#f5f5f7]">
      <Sidebar alertCount={unacknowledgedAlertsCount} />
      <div className="flex-1 flex flex-col min-w-0">
        <StatusBar activeAlertCount={unacknowledgedAlertsCount} />

        <main className="flex-1 overflow-y-auto min-h-0 relative">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="fixed top-4 right-8 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-xs font-medium shadow-lg backdrop-blur-md border border-slate-700/60 animate-in fade-in slide-in-from-top-2 duration-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{toastMessage}</span>
            </div>
          )}

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
                {/* Export Dropdown Menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="btn-secondary text-xs flex items-center gap-1.5 shadow-xs bg-white hover:bg-slate-50 border border-slate-200"
                  >
                    <FileDown className="w-3.5 h-3.5 text-slate-600" />
                    <span>Export Audit Report</span>
                    <span className="text-[10px] text-slate-400">▾</span>
                  </button>

                  {showExportMenu && (
                    <div className="absolute right-0 mt-1.5 w-56 rounded-2xl bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-floating z-50 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                      <button
                        type="button"
                        onClick={handleExportPdf}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-slate-800 hover:bg-blue-50/70 hover:text-[#0071e3] transition-all flex items-center gap-2.5 group"
                      >
                        <Printer className="w-4 h-4 text-slate-400 group-hover:text-[#0071e3]" />
                        <div>
                          <div className="font-semibold">Official PDF Report</div>
                          <div className="text-[10px] text-slate-400">Print-ready ISO incident briefing</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportCsv}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-slate-800 hover:bg-slate-100/70 transition-all flex items-center gap-2.5 group"
                      >
                        <FileText className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
                        <div>
                          <div className="font-semibold">Export Spreadsheet (CSV)</div>
                          <div className="text-[10px] text-slate-400">Complete telemetry columns & notes</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportJson}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-slate-800 hover:bg-slate-100/70 transition-all flex items-center gap-2.5 group"
                      >
                        <ShieldCheck className="w-4 h-4 text-slate-400 group-hover:text-amber-600" />
                        <div>
                          <div className="font-semibold">Export JSON SitRep</div>
                          <div className="text-[10px] text-slate-400">Full telemetry structured payload</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {/* Severity Counters */}
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
              zones={zones}
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
              <span className="text-slate-400 font-sans">Sorted: Newest first · Unified Central Store</span>
            </div>

            <IncidentTable
              incidents={filtered}
              onAcknowledge={handleAcknowledge}
              onResolve={handleOpenResolveModal}
            />
          </div>
        </main>
      </div>

      {/* Operator Resolution Modal */}
      {resolvingIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-lg rounded-3xl bg-white/95 backdrop-blur-2xl border border-white/80 shadow-floating overflow-hidden flex flex-col p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/80">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Resolve Incident · {resolvingIncident.id.toUpperCase()}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {resolvingIncident.zoneName} · {resolvingIncident.alertType}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResolvingIncident(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmResolve} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Operator Resolution Log</span>
                  <span className="text-[11px] text-slate-400 font-normal">SOP verification notes</span>
                </label>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={3}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3] transition-all resize-none shadow-xs"
                  placeholder="Describe resolution action taken (e.g. security patrol dispatched, gates opened, flow normalized)..."
                  required
                />
              </div>

              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/80 border border-slate-200/80">
                <input
                  type="checkbox"
                  id="fpCheckbox"
                  checked={isFalsePositive}
                  onChange={(e) => setIsFalsePositive(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#0071e3] focus:ring-[#0071e3]/20 cursor-pointer"
                />
                <label htmlFor="fpCheckbox" className="text-xs text-slate-700 cursor-pointer select-none">
                  <span className="font-semibold">Flag as False Positive</span>
                  <div className="text-[11px] text-slate-400">Sensor artifact, normal operational surge, or drill</div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setResolvingIncident(null)}
                  className="btn-secondary text-xs"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm active:scale-95 transition-all"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Resolving...' : 'Confirm Resolution'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncidentLog;
