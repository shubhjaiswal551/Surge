import React, { useEffect, useState, useCallback, useRef } from 'react';
import Sidebar from '../components/dashboard/Sidebar';
import StatusBar from '../components/dashboard/StatusBar';
import CameraPanel from '../components/dashboard/CameraPanel';
import HeatmapGrid from '../components/dashboard/HeatmapGrid';
import AlertFeed from '../components/dashboard/AlertFeed';
import { useAuth } from '../context/AuthContext';
import { useCrowdStream } from '../hooks/useCrowdStream';
import {
  startCrowdSimulator,
  stopCrowdSimulator,
  onCrowdEvent,
  onAlert,
  onIncident,
  onHeatmap,
  getInitialCameras,
  getInitialHeatmaps,
} from '../mocks/crowdSimulator';
import type {
  CameraState,
  Alert,
  Incident,
  CameraHeatmap,
  CrowdEvent,
} from '../types/crowdEvent';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type HeadcountPoint = { t: string; cam001: number; cam002: number };

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const [cameras, setCameras] = useState<CameraState[]>(() => getInitialCameras());
  const [heatmaps, setHeatmaps] = useState<CameraHeatmap[]>(() =>
    getInitialHeatmaps(),
  );
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [history, setHistory] = useState<HeadcountPoint[]>(() => {
    const arr: HeadcountPoint[] = [];
    const now = Date.now();
    for (let i = 11; i >= 0; i--) {
      const t = new Date(now - i * 30_000);
      const hh = t.getHours().toString().padStart(2, '0');
      const mm = t.getMinutes().toString().padStart(2, '0');
      const ss = t.getSeconds().toString().padStart(2, '0');
      arr.push({
        t: `${hh}:${mm}:${ss}`,
        cam001: 22 + Math.round(Math.random() * 8),
        cam002: 95 + Math.round(Math.random() * 20),
      });
    }
    return arr;
  });

  const lastAlertTimestampRef = useRef<Record<string, number>>({});

  const handleWsEvent = useCallback((ev: CrowdEvent) => {
    setCameras((prev) =>
      prev.map((c) =>
        c.cameraId === ev.cameraId
          ? {
              ...c,
              headcount: ev.headcount ?? c.headcount,
              density: ev.density ?? c.density,
              flowDirection: ev.flowDirection ?? c.flowDirection,
              lastUpdated: ev.timestamp || new Date().toISOString(),
              lastUpdatedAgo: 0,
            }
          : c,
      ),
    );

    const rawHeatmap = (ev as any).heatmap || ev.metrics?.heatmap;
    if (rawHeatmap && Array.isArray(rawHeatmap)) {
      // Normalize heatmap grid: ensure numbers in 2D array
      const parsedGrid: number[][] = rawHeatmap.map((row: any) => {
        if (typeof row === 'string') {
          return row.split(' ').map((n: string) => parseFloat(n) || 0);
        }
        if (Array.isArray(row)) {
          return row.map((val: any) => (typeof val === 'number' ? val : parseFloat(val) || 0));
        }
        return [0, 0, 0, 0, 0];
      });

      setHeatmaps((prev) =>
        prev.map((h) =>
          h.cameraId === ev.cameraId ? { ...h, grid: parsedGrid } : h,
        ),
      );
    }

    if (ev.anomaly) {
      const now = Date.now();
      const lastFired = lastAlertTimestampRef.current[ev.cameraId] || 0;
      // 10-second debounce window per camera
      if (now - lastFired > 10_000) {
        // Convert numeric severity (1-5) to string ('info' | 'warning' | 'high' | 'critical')
        let mappedSev: 'info' | 'warning' | 'high' | 'critical' = 'high';
        const rawSev = (ev as any).severity;
        if (typeof rawSev === 'number') {
          mappedSev = rawSev >= 5 ? 'critical' : rawSev === 4 ? 'high' : rawSev === 3 ? 'warning' : 'info';
        } else if (typeof rawSev === 'string') {
          mappedSev = (rawSev as any);
        }

        const anomalyType = ev.anomalyType || 'Crowd Anomaly Detected';

        setAlerts((prev) => {
          // Check if exact same alert is already active and unacknowledged/unfixed
          const hasUnacknowledgedSameAlert = prev.some(
            (a) =>
              a.cameraId === ev.cameraId &&
              a.type === anomalyType &&
              !a.acknowledged,
          );
          if (hasUnacknowledgedSameAlert) {
            // Do not repeat: keep original alert, simply refresh timestamp & metrics
            return prev.map((a) =>
              a.cameraId === ev.cameraId && a.type === anomalyType && !a.acknowledged
                ? { ...a, timestamp: ev.timestamp || new Date().toISOString(), metrics: ev.metrics || a.metrics }
                : a,
            );
          }

          lastAlertTimestampRef.current[ev.cameraId] = now;
          const newAlert: Alert = {
            id: `alt-${now.toString(36)}`,
            cameraId: ev.cameraId,
            zoneName: ev.zoneName,
            type: anomalyType,
            severity: mappedSev,
            timestamp: ev.timestamp || new Date().toISOString(),
            acknowledged: false,
            metrics: ev.metrics,
            snapshotUrl: ev.cameraId === 'cam-001' ? '/corridor_chokepoint.webm' : '/concourse_crossing.webm',
          };
          return [newAlert, ...prev].slice(0, 50);
        });
      }
    }
  }, []);

  const { isConnected: isWsConnected } = useCrowdStream(handleWsEvent);

  useEffect(() => {
    // Only run mock generator if WebSocket backend is not connected
    if (!isWsConnected) {
      startCrowdSimulator();
    } else {
      stopCrowdSimulator();
    }

    const offs: Array<() => void> = [];
    if (!isWsConnected) {
      offs.push(
        onCrowdEvent((ev) => {
          setCameras((prev) =>
            prev.map((c) =>
              c.cameraId === ev.cameraId
                ? {
                    ...c,
                    headcount: ev.headcount,
                    density: ev.density,
                    flowDirection: ev.flowDirection,
                    lastUpdated: ev.timestamp,
                    lastUpdatedAgo: 0,
                  }
                : c,
            ),
          );
        }),
      );

      offs.push(
        onAlert((alt) => {
          setAlerts((prev) => {
            // Check if exact same alert is already active and unacknowledged/unfixed
            const hasUnacknowledgedSameAlert = prev.some(
              (a) =>
                a.cameraId === alt.cameraId &&
                a.type === alt.type &&
                !a.acknowledged,
            );
            if (hasUnacknowledgedSameAlert) {
              // Do not repeat duplicate alert card
              return prev.map((a) =>
                a.cameraId === alt.cameraId && a.type === alt.type && !a.acknowledged
                  ? { ...a, timestamp: alt.timestamp, metrics: alt.metrics || a.metrics }
                  : a,
              );
            }
            return [alt, ...prev].slice(0, 50);
          });
        }),
      );
      offs.push(
        onIncident((inc) =>
          setIncidents((prev) => {
            const hasOpenSameIncident = prev.some(
              (i) =>
                i.cameraId === inc.cameraId &&
                i.alertType === inc.alertType &&
                i.status === 'open',
            );
            if (hasOpenSameIncident) return prev;
            return [inc, ...prev].slice(0, 100);
          }),
        ),
      );
      offs.push(
        onHeatmap((hm) => {
          setHeatmaps((prev) => {
            const exists = prev.some((p) => p.cameraId === hm.cameraId);
            if (exists) return prev.map((p) => (p.cameraId === hm.cameraId ? hm : p));
            return [...prev, hm];
          });
        }),
      );
    }

    const ticker = window.setInterval(() => {
      setCameras((prev) =>
        prev.map((c) => ({ ...c, lastUpdatedAgo: c.lastUpdatedAgo + 1 })),
      );
    }, 1000);

    const historyTicker = window.setInterval(() => {
      setHistory((prev) => {
        const t = new Date();
        const hh = t.getHours().toString().padStart(2, '0');
        const mm = t.getMinutes().toString().padStart(2, '0');
        const ss = t.getSeconds().toString().padStart(2, '0');
        setCameras((cs) => {
          const c1 = cs.find((c) => c.cameraId === 'cam-001')?.headcount ?? 50;
          const c2 = cs.find((c) => c.cameraId === 'cam-002')?.headcount ?? 60;
          const next: HeadcountPoint = {
            t: `${hh}:${mm}:${ss}`,
            cam001: c1,
            cam002: c2,
          };
          setHistory((prev2) => [...prev2.slice(1), next]);
          return cs;
        });
        return prev;
      });
    }, 15_000);

    return () => {
      stopCrowdSimulator();
      offs.forEach((fn) => fn());
      clearInterval(ticker);
      clearInterval(historyTicker);
    };
  }, [isWsConnected]);

  const handleAcknowledgeAlert = (id: string) => {
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

  const handleResolveAlert = (id: string, notes: string, isFalsePositive: boolean) => {
    const target = alerts.find((a) => a.id === id);
    if (target) {
      const resolvedIncident: Incident = {
        id: `inc-${Date.now().toString(36)}`,
        cameraId: target.cameraId,
        zoneName: target.zoneName,
        alertType: target.type,
        severity: target.severity,
        status: 'resolved',
        timestamp: target.timestamp,
        acknowledgedBy: profile?.displayName ?? 'Operator',
        resolvedAt: new Date().toISOString(),
        notes: notes,
        isFalsePositive: isFalsePositive,
      };
      setIncidents((prev) => [resolvedIncident, ...prev].slice(0, 100));
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }
  };

  const unacknowledged = alerts.filter((a) => !a.acknowledged).length;

  const cam1 = cameras.find((c) => c.cameraId === 'cam-001');
  const cam2 = cameras.find((c) => c.cameraId === 'cam-002');
  const hm1 = heatmaps.find((h) => h.cameraId === 'cam-001');
  const hm2 = heatmaps.find((h) => h.cameraId === 'cam-002');

  const totalHeadcount = cameras.reduce((a, b) => a + b.headcount, 0);
  const criticalCameras = cameras.filter((c) => c.density === 'critical').length;
  const highCameras = cameras.filter((c) => c.density === 'high').length;

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-bg-primary">
      <Sidebar alertCount={unacknowledged} />
      <div className="flex-1 flex flex-col min-w-0">
        <StatusBar activeAlertCount={unacknowledged} />

        <main className="flex-1 overflow-y-auto min-h-0">
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: 'People Tracked',
                  value: totalHeadcount.toLocaleString(),
                  sub: 'Total detected across zones',
                  accent: 'text-slate-900',
                  chipClass: isWsConnected
                    ? 'chip-safe'
                    : 'chip bg-blue-50 text-[#0071e3] border-blue-200/80',
                  chipText: isWsConnected ? 'Live Backend' : 'Live Sync',
                },
                {
                  label: 'Active Alerts',
                  value: String(unacknowledged),
                  sub: `${incidents.length} incidents logged today`,
                  accent: unacknowledged > 0 ? 'text-rose-600' : 'text-emerald-600',
                  chipClass: unacknowledged > 0 ? 'chip-danger' : 'chip-safe',
                  chipText: unacknowledged > 0 ? 'Action Required' : 'All Clear',
                },
                {
                  label: 'Critical Density',
                  value: String(criticalCameras),
                  sub: `${highCameras} high density warnings`,
                  accent: criticalCameras > 0 ? 'text-rose-600' : 'text-emerald-600',
                  chipClass: criticalCameras > 0 ? 'chip-critical' : 'chip-safe',
                  chipText: criticalCameras > 0 ? 'Watch Zone' : 'Nominal',
                },
                {
                  label: 'Cameras Online',
                  value: `${cameras.length} / ${cameras.length}`,
                  sub: 'Optical nodes transmitting',
                  accent: 'text-emerald-600',
                  chipClass: 'chip-safe',
                  chipText: '100% Health',
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="card group relative p-4 flex flex-col justify-between cursor-default transition-all duration-200 ease-out hover:-translate-y-1 hover:bg-white hover:border-slate-300 hover:shadow-[0_12px_28px_-4px_rgba(15,23,42,0.07),0_2px_6px_rgba(15,23,42,0.03)]"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-slate-700 transition-colors duration-150">
                      {s.label}
                    </span>
                    <span className={s.chipClass}>{s.chipText}</span>
                  </div>
                  <div
                    className={`font-sans text-3xl font-extrabold my-2 tracking-tight tabular-nums transition-transform duration-200 origin-left group-hover:scale-[1.015] ${s.accent}`}
                  >
                    {s.value}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium group-hover:text-slate-500 transition-colors duration-150">
                    {s.sub}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <div className="xl:col-span-2 space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {cam1 && (
                    <CameraPanel
                      cameraId={cam1.cameraId}
                      zoneName={cam1.zoneName}
                      description={cam1.description}
                      headcount={cam1.headcount}
                      density={cam1.density}
                      flowDirection={cam1.flowDirection}
                      lastUpdatedAgo={cam1.lastUpdatedAgo}
                      videoSrc="/corridor_chokepoint.webm"
                      anomaly={alerts.find(
                        (a) =>
                          !a.acknowledged && a.cameraId === cam1.cameraId,
                      )
                        ? true
                        : false}
                      anomalyType={
                        alerts.find(
                          (a) =>
                            !a.acknowledged && a.cameraId === cam1.cameraId,
                        )?.type
                      }
                    />
                  )}
                  {cam2 && (
                    <CameraPanel
                      cameraId={cam2.cameraId}
                      zoneName={cam2.zoneName}
                      description={cam2.description}
                      headcount={cam2.headcount}
                      density={cam2.density}
                      flowDirection={cam2.flowDirection}
                      lastUpdatedAgo={cam2.lastUpdatedAgo}
                      videoSrc="/concourse_crossing.webm"
                      anomaly={alerts.find(
                        (a) =>
                          !a.acknowledged && a.cameraId === cam2.cameraId,
                      )
                        ? true
                        : false}
                      anomalyType={
                        alerts.find(
                          (a) =>
                            !a.acknowledged && a.cameraId === cam2.cameraId,
                        )?.type
                      }
                    />
                  )}
                </div>

                <div className="card p-3.5 bg-bg-card border border-border">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div>
                      <div className="text-xs font-semibold text-text-primary font-mono uppercase tracking-wider">
                        Headcount Telemetry Trend
                      </div>
                      <div className="text-[10px] text-text-muted mt-0.5 font-mono">
                        Rolling 3-minute vector window per node
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-text-secondary">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm bg-accent" />
                        Main Entrance
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm bg-warn" />
                        Central Courtyard
                      </span>
                    </div>
                  </div>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={history}
                        margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.15} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.15} />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="2 2"
                          stroke="#e2e8f0"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="t"
                          stroke="#64748b"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          fontFamily="JetBrains Mono, ui-monospace, Consolas, monospace"
                        />
                        <YAxis
                          stroke="#64748b"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          fontFamily="JetBrains Mono, ui-monospace, Consolas, monospace"
                        />
                        <Tooltip
                          contentStyle={{
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: 6,
                            fontSize: 11,
                            color: '#0f172a',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.08)',
                          }}
                          labelStyle={{
                            color: '#475569',
                            fontFamily: 'JetBrains Mono, ui-monospace, Consolas, monospace',
                          }}
                          itemStyle={{
                            fontFamily: 'JetBrains Mono, ui-monospace, Consolas, monospace',
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="cam001"
                          name="Main Entrance"
                          stroke="#3b82f6"
                          strokeWidth={1.5}
                          fill="url(#g1)"
                        />
                        <Area
                          type="monotone"
                          dataKey="cam002"
                          name="Central Courtyard"
                          stroke="#f59e0b"
                          strokeWidth={1.5}
                          fill="url(#g2)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {hm1 && cam1 && (
                    <HeatmapGrid
                      title={`${cam1.zoneName} · Density`}
                      subtitle="Real-time concentration heatmap"
                      grid={hm1.grid}
                    />
                  )}
                  {hm2 && cam2 && (
                    <HeatmapGrid
                      title={`${cam2.zoneName} · Density`}
                      subtitle="Real-time concentration heatmap"
                      grid={hm2.grid}
                    />
                  )}
                </div>
              </div>

              <div className="h-[800px] xl:h-auto">
                <AlertFeed
                  alerts={alerts}
                  onAcknowledge={handleAcknowledgeAlert}
                  onResolve={handleResolveAlert}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
