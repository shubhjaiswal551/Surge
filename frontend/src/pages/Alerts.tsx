import React, { useEffect, useState, useMemo } from 'react';
import Sidebar from '../components/dashboard/Sidebar';
import StatusBar from '../components/dashboard/StatusBar';
import AlertFeed from '../components/dashboard/AlertFeed';
import RubberSegment from '../components/ui/RubberSegment';
import { useAuth } from '../context/AuthContext';
import {
  startCrowdSimulator,
  stopCrowdSimulator,
  onAlert,
} from '../mocks/crowdSimulator';
import type { Alert } from '../types/crowdEvent';

const Alerts: React.FC = () => {
  const { profile } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');

  useEffect(() => {
    startCrowdSimulator();
    const off = onAlert((a) =>
      setAlerts((prev) => [a, ...prev].slice(0, 200)),
    );
    return () => {
      stopCrowdSimulator();
      off();
    };
  }, []);

  const handleAcknowledge = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              acknowledged: true,
              acknowledgedBy: profile?.displayName ?? 'Operator',
            }
          : a,
      ),
    );
  };

  const handleAcknowledgeAll = () => {
    setAlerts((prev) =>
      prev.map((a) => ({
        ...a,
        acknowledged: true,
        acknowledgedBy: profile?.displayName ?? 'Operator',
      })),
    );
  };

  const filteredAlerts = useMemo(() => {
    if (selectedSeverity === 'all') return alerts;
    return alerts.filter((a) => a.severity === selectedSeverity);
  }, [alerts, selectedSeverity]);

  const unacknowledged = alerts.filter((a) => !a.acknowledged).length;

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#f5f5f7]">
      <Sidebar alertCount={unacknowledged} />
      <div className="flex-1 flex flex-col min-w-0">
        <StatusBar activeAlertCount={unacknowledged} />

        <main className="flex-1 overflow-y-auto min-h-0">
          <div className="px-6 py-5 h-full flex flex-col min-h-0">
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
                    onClick={handleAcknowledgeAll}
                    className="btn-secondary text-xs"
                  >
                    Acknowledge All
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <AlertFeed
                alerts={filteredAlerts}
                onAcknowledge={handleAcknowledge}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Alerts;
