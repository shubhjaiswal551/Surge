import React, { useState, useMemo, useRef } from 'react';
import Sidebar from '../components/dashboard/Sidebar';
import StatusBar from '../components/dashboard/StatusBar';
import AlertFeed from '../components/dashboard/AlertFeed';
import RubberSegment from '../components/ui/RubberSegment';
import TriageKpiBar from '../components/dashboard/TriageKpiBar';
import MonitoredZoneStrip from '../components/dashboard/MonitoredZoneStrip';
import TriageFilterBar, { type TriageStatusFilter, type TriageSortOrder } from '../components/dashboard/TriageFilterBar';
import { useCrowdContext } from '../context/CrowdContext';
import { playChime } from '../lib/sound';
import { Volume2, CheckCircle2 } from 'lucide-react';

const Alerts: React.FC = () => {
  const {
    alerts,
    cameras,
    incidents,
    activeFeedsCount,
    acknowledgeAlert,
    acknowledgeAllAlerts,
    resolveAlert,
    unacknowledgedAlertsCount,
  } = useCrowdContext();

  const lastResolvedIncident = useMemo(() => {
    return incidents.find((i) => i.status === 'resolved') || null;
  }, [incidents]);

  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<TriageStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<TriageSortOrder>('newest');

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleTestAlarm = () => {
    playChime('critical');
    showToast('Audible Alarm Test: Tactical chime sounded');
  };

  const isFiltered = useMemo(() => {
    return (
      selectedSeverity !== 'all' ||
      selectedCameraId !== null ||
      selectedStatus !== 'all' ||
      searchQuery.trim().length > 0
    );
  }, [selectedSeverity, selectedCameraId, selectedStatus, searchQuery]);

  const handleResetFilters = () => {
    setSelectedSeverity('all');
    setSelectedCameraId(null);
    setSelectedStatus('all');
    setSearchQuery('');
    setSortBy('newest');
  };

  const filteredAlerts = useMemo(() => {
    const list = alerts.filter((a) => {
      // 1. Severity filter
      if (selectedSeverity !== 'all' && a.severity !== selectedSeverity) return false;
      // 2. Camera / Zone filter
      if (selectedCameraId && a.cameraId !== selectedCameraId) return false;
      // 3. Status filter
      if (selectedStatus === 'unack' && a.acknowledged) return false;
      if (selectedStatus === 'ack' && !a.acknowledged) return false;
      // 4. Keyword search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchType = a.type.toLowerCase().includes(q);
        const matchZone = a.zoneName.toLowerCase().includes(q);
        const matchCam = a.cameraId.toLowerCase().includes(q);
        if (!matchType && !matchZone && !matchCam) return false;
      }
      return true;
    });

    // 5. Stable Sorting
    if (sortBy === 'severity') {
      const weight: Record<string, number> = { critical: 4, high: 3, warning: 2, info: 1 };
      list.sort((a, b) => {
        const diff = (weight[b.severity] || 0) - (weight[a.severity] || 0);
        if (diff !== 0) return diff;
        const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      });
    } else if (sortBy === 'oldest') {
      list.sort((a, b) => {
        const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      });
    } else {
      // newest
      list.sort((a, b) => {
        const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      });
    }

    return list;
  }, [alerts, selectedSeverity, selectedCameraId, selectedStatus, searchQuery, sortBy]);

  const unacknowledged = unacknowledgedAlertsCount;

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#f5f5f7]">
      <Sidebar alertCount={unacknowledged} />
      <div className="flex-1 flex flex-col min-w-0">
        <StatusBar activeAlertCount={unacknowledged} />

        <main className="flex-1 overflow-y-auto min-h-0 relative">
          {/* Toast Notification Banner */}
          {toastMessage && (
            <div className="absolute top-4 right-8 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-xs font-medium shadow-lg backdrop-blur-md border border-slate-700/60 animate-in fade-in slide-in-from-top-2 duration-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{toastMessage}</span>
            </div>
          )}

          <div className="px-6 py-5 min-h-full flex flex-col">
            {/* Header with Title and Global Triage Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 shrink-0 pb-3 border-b border-slate-200/70">
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-lg font-bold text-slate-900 tracking-tight font-sans">
                    Incident Alert Triage
                  </h1>
                  {unacknowledged > 0 ? (
                    <span className="chip-danger">
                      {unacknowledged} Unacknowledged
                    </span>
                  ) : (
                    <span className="chip-safe">
                      All Clear
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time spatial anomaly stream and automated threshold violation triage.
                </p>
              </div>

              {/* Triage action controls */}
              <div className="flex items-center gap-3">
                {/* Tactical Alarm Audio Test Button */}
                <button
                  type="button"
                  onClick={handleTestAlarm}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:scale-95 transition-all shadow-xs"
                  title="Test audible tactical alarm sound"
                >
                  <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Test Alarm</span>
                </button>

                {/* macOS Segmented Severity filter buttons */}
                <RubberSegment
                  items={[
                    { value: 'all', label: 'All' },
                    { value: 'critical', label: 'Critical' },
                    { value: 'high', label: 'High' },
                    { value: 'warning', label: 'Warning' },
                    { value: 'info', label: 'Info' },
                  ]}
                  value={selectedSeverity}
                  onChange={(val) => setSelectedSeverity(val)}
                  size="sm"
                  trackColor="#e2e8f0"
                  thumbColor="#ffffff"
                  textColor="#64748b"
                  activeTextColor="#0f172a"
                  radius={10}
                  inset={2.5}
                  speed={1}
                  aria-label="Incident severity filter"
                />

                {unacknowledged > 0 && (
                  <button
                    type="button"
                    onClick={acknowledgeAllAlerts}
                    className="btn-secondary text-xs"
                  >
                    Acknowledge All
                  </button>
                )}
              </div>
            </div>

            {/* 1. Triage KPI Metric Bar */}
            <TriageKpiBar
              alerts={alerts}
              unacknowledgedCount={unacknowledged}
              cameras={cameras}
              activeFeedsCount={activeFeedsCount}
              onAcknowledgeAll={acknowledgeAllAlerts}
            />

            {/* 2. Monitored Zone Surveillance Strip */}
            <MonitoredZoneStrip
              cameras={cameras}
              alerts={alerts}
              selectedCameraId={selectedCameraId}
              onSelectCamera={setSelectedCameraId}
            />

            {/* 3. Multi-Attribute Filter & Search Toolbar */}
            <TriageFilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedStatus={selectedStatus}
              onStatusChange={setSelectedStatus}
              selectedCameraId={selectedCameraId}
              onCameraChange={setSelectedCameraId}
              cameras={cameras}
              sortBy={sortBy}
              onSortChange={setSortBy}
              totalAlertsCount={alerts.length}
              filteredCount={filteredAlerts.length}
              onResetFilters={handleResetFilters}
              isFiltered={isFiltered}
            />

            {/* 4. Real-time Incident Feed Stream */}
            <div className="flex-1 min-h-[420px]">
              <AlertFeed
                alerts={filteredAlerts}
                onAcknowledge={acknowledgeAlert}
                onResolve={resolveAlert}
                isFiltered={isFiltered}
                onResetFilters={handleResetFilters}
                cameras={cameras}
                lastResolvedIncident={lastResolvedIncident}
                onTestAlarm={handleTestAlarm}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Alerts;
