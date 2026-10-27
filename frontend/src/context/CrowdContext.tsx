import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useCrowdStream } from '../hooks/useCrowdStream';
import { API_BASE_URL } from '../config/api';
import { playChime } from '../lib/sound';
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

interface CrowdContextValue {
  cameras: CameraState[];
  heatmaps: CameraHeatmap[];
  alerts: Alert[];
  incidents: Incident[];
  activeFeedsCount: number;
  unacknowledgedAlertsCount: number;
  todayIncidentsCount: number;
  isWsConnected: boolean;
  isDemoMode: boolean;
  acknowledgeAlert: (id: string) => Promise<void>;
  acknowledgeAllAlerts: () => Promise<void>;
  resolveAlert: (id: string, notes?: string, isFalsePositive?: boolean) => Promise<void>;
  dispatchEmergency: (id: string, customNote?: string) => Promise<boolean>;
  refetchIncidents: () => Promise<void>;
  triggerTestAlert: (custom?: Partial<Alert>) => void;
}

const CrowdContext = createContext<CrowdContextValue | undefined>(undefined);

const INITIAL_ZONE_AREAS: Record<string, number> = {
  'cam-001': 45.0,
  'cam-002': 60.0,
  'cam-003': 50.0,
  'cam-004': 85.0,
};

const getInitialAlerts = (): Alert[] => [
  {
    id: 'alt-init-001',
    cameraId: 'cam-003',
    zoneName: 'Main Terminal Gate (Dense Scramble)',
    type: 'Density Threshold Exceeded',
    severity: 'high',
    timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    acknowledged: false,
    snapshotUrl: '/12269404_2320_1080_30fps.mp4',
    timeWindow: { start: 2.2, end: 7.5, peak: 4.8 },
    metrics: {
      density: 3.7,
      flow_vector: [0.1, 0.9],
      velocity_variance: 2.8,
      headcount: 185,
      avg_speed: 0.9,
      turbulence: 0.38,
    },
  },
  {
    id: 'alt-init-002',
    cameraId: 'cam-002',
    zoneName: 'Central Concourse (Multi-Directional)',
    type: 'Bottleneck Forming',
    severity: 'warning',
    timestamp: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    acknowledged: true,
    acknowledgedBy: 'Control Room Operator',
    snapshotUrl: '/concourse_crossing.webm',
    timeWindow: { start: 2.8, end: 8.2, peak: 5.4 },
    metrics: {
      density: 2.4,
      flow_vector: [0.2, 0.0],
      velocity_variance: 0.4,
      headcount: 65,
      avg_speed: 0.4,
      turbulence: 0.25,
    },
  },
];

const getInitialIncidents = (): Incident[] => [
  {
    id: 'inc-001',
    timestamp: '2026-10-01T08:15:20Z',
    cameraId: 'cam-001',
    zoneName: 'North Transit Corridor (Chokepoint)',
    alertType: 'Surge Detected',
    severity: 'critical',
    status: 'resolved',
    acknowledgedBy: 'Control Room Operator',
    resolvedAt: '2026-10-01T08:25:00Z',
    notes: 'Security dispatched to open overflow turnstiles. Flow normalized.',
    isFalsePositive: false,
    timeWindow: { start: 3.8, end: 9.2, peak: 6.2 },
    metrics_json: {
      density: 4.2,
      headcount: 78,
      velocity_variance: 4.1,
      avg_speed: 4.5,
    },
  },
  {
    id: 'inc-002',
    timestamp: '2026-10-01T09:40:12Z',
    cameraId: 'cam-002',
    zoneName: 'Central Concourse (Multi-Directional)',
    alertType: 'Bottleneck Detected',
    severity: 'high',
    status: 'acknowledged',
    acknowledgedBy: 'Control Room Operator',
    notes: 'Directional lane partition deployed. Monitoring throughput.',
    isFalsePositive: false,
    timeWindow: { start: 2.8, end: 8.2, peak: 5.4 },
    metrics_json: {
      density: 3.8,
      headcount: 65,
      velocity_variance: 0.3,
      avg_speed: 0.4,
    },
  },
  {
    id: 'inc-003',
    timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    cameraId: 'cam-003',
    zoneName: 'Main Terminal Gate (Dense Scramble)',
    alertType: 'Density Threshold Exceeded',
    severity: 'high',
    status: 'open',
    isFalsePositive: false,
    timeWindow: { start: 2.2, end: 7.5, peak: 4.8 },
    metrics_json: {
      density: 3.7,
      headcount: 185,
      velocity_variance: 2.8,
      avg_speed: 0.9,
    },
  },
  {
    id: 'inc-004',
    timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    cameraId: 'cam-004',
    zoneName: 'Stadium Concourse (Dispersal Hallway)',
    alertType: 'Stadium Dispersal Surge',
    severity: 'critical',
    status: 'resolved',
    acknowledgedBy: 'Control Room Operator',
    resolvedAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    notes: 'South turnstile gates 18A-18D fully engaged. Egress corridor clear.',
    isFalsePositive: false,
    timeWindow: { start: 2.0, end: 10.0, peak: 6.0 },
    metrics_json: {
      density: 4.1,
      headcount: 124,
      velocity_variance: 3.6,
      avg_speed: 1.2,
    },
  },
];

export const CrowdProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const [cameras, setCameras] = useState<CameraState[]>(() => {
    return getInitialCameras().map((c) => ({
      ...c,
      areaSqM: INITIAL_ZONE_AREAS[c.cameraId] ?? 50.0,
    }));
  });
  const [heatmaps, setHeatmaps] = useState<CameraHeatmap[]>(() => getInitialHeatmaps());
  const [alerts, setAlerts] = useState<Alert[]>(() => getInitialAlerts());
  const [incidents, setIncidents] = useState<Incident[]>(() => getInitialIncidents());
  const lastAlertTimestampRef = useRef<Record<string, number>>({});
  const seenAlertIdsRef = useRef<Set<string>>(new Set(['alt-init-001', 'alt-init-002']));

  // 1. Dynamic Camera & Zone Fetching from Backend REST API
  useEffect(() => {
    let isMounted = true;
    async function fetchCamerasAndZones() {
      try {
        const [camRes, zoneRes] = await Promise.all([
          fetch(`${API_BASE_URL}/cameras`),
          fetch(`${API_BASE_URL}/zones`),
        ]);

        let zonesData: any[] = [];
        if (zoneRes.ok) {
          zonesData = await zoneRes.json();
        }

        if (camRes.ok) {
          const camData = await camRes.json();
          if (isMounted && Array.isArray(camData) && camData.length > 0) {
            setCameras((prev) => {
              return camData.map((bCam: any) => {
                const existing = prev.find((p) => p.cameraId === bCam.id);
                const matchedZone = Array.isArray(zonesData)
                  ? zonesData.find((z: any) => z.camera_id === bCam.id)
                  : undefined;
                const area = matchedZone?.area_sq_m ?? INITIAL_ZONE_AREAS[bCam.id] ?? 50.0;

                return {
                  cameraId: bCam.id,
                  zoneId: matchedZone?.id,
                  zoneName: matchedZone?.name || bCam.name || bCam.location || 'Surveillance Zone',
                  description: bCam.location || 'Optical RTSP Endpoint',
                  headcount:
                    existing?.headcount ??
                    (bCam.id === 'cam-003' ? 185 : bCam.id === 'cam-001' ? 22 : bCam.id === 'cam-004' ? 20 : 8),
                  density:
                    existing?.density ??
                    (bCam.id === 'cam-003' ? 'high' : bCam.id === 'cam-001' ? 'moderate' : 'low'),
                  flowDirection: existing?.flowDirection ?? 90,
                  lastUpdated: existing?.lastUpdated ?? new Date().toISOString(),
                  lastUpdatedAgo: existing?.lastUpdatedAgo ?? 0,
                  rtspUrl: bCam.rtsp_url,
                  isActive: bCam.is_active ?? true,
                  areaSqM: area,
                  polygonCoords: matchedZone?.polygon_coords || existing?.polygonCoords,
                };
              });
            });
          }
        }
      } catch {
        // Fallback to initial local defaults
      }
    }

    fetchCamerasAndZones();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Fetch Persisted Incidents
  const refetchIncidents = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/incidents`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const mapped: Incident[] = data.map((item: any) => {
            const isFp = item.notes?.includes('[FALSE POSITIVE]') ?? false;
            return {
              id: item.id,
              timestamp: item.detected_at,
              cameraId: item.camera_id,
              zoneName:
                item.zone_id === 'zone-001'
                  ? 'North Transit Corridor (Chokepoint)'
                  : item.zone_id === 'zone-002'
                  ? 'Central Concourse (Multi-Directional)'
                  : item.zone_id === 'zone-003'
                  ? 'Main Terminal Gate (Dense Scramble)'
                  : 'Stadium Concourse (Dispersal Hallway)',
              alertType: item.event_type.charAt(0).toUpperCase() + item.event_type.slice(1) + ' Detected',
              severity: item.severity >= 4 ? 'critical' : item.severity === 3 ? 'high' : 'warning',
              status: item.resolved ? 'resolved' : item.acknowledged_at ? 'acknowledged' : 'open',
              acknowledgedBy: item.acknowledged_by || undefined,
              resolvedAt: item.resolved_at || undefined,
              notes: item.notes || undefined,
              isFalsePositive: isFp,
              metrics_json: item.metrics_json || item.metrics,
            };
          });

          setIncidents((prev) => {
            // Merge with local newly created or modified records
            const merged = [...mapped];
            for (const p of prev) {
              if (!merged.some((m) => m.id === p.id)) {
                merged.push(p);
              }
            }
            return merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          });
        }
      }
    } catch {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    refetchIncidents();
  }, [refetchIncidents]);

  // 3. Real-time WebSocket Ingestion
  const handleWsEvent = useCallback((ev: CrowdEvent) => {
    setCameras((prev) =>
      prev.map((c) =>
        c.cameraId === ev.cameraId
          ? {
              ...c,
              headcount: ev.headcount ?? c.headcount,
              density: ev.density ?? c.density,
              flowDirection: ev.flowDirection ?? c.flowDirection,
              metrics: ev.metrics ?? c.metrics,
              boxes: ev.boxes ?? c.boxes,
              lastUpdated: ev.timestamp || new Date().toISOString(),
              lastUpdatedAgo: 0,
            }
          : c,
      ),
    );

    const rawHeatmap = (ev as any).heatmap || ev.metrics?.heatmap;
    if (rawHeatmap && Array.isArray(rawHeatmap)) {
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
      if (now - lastFired > 10_000) {
        let mappedSev: 'info' | 'warning' | 'high' | 'critical' = 'high';
        const rawSev = (ev as any).severity;
        if (typeof rawSev === 'number') {
          mappedSev = rawSev >= 5 ? 'critical' : rawSev === 4 ? 'high' : rawSev === 3 ? 'warning' : 'info';
        } else if (typeof rawSev === 'string') {
          mappedSev = rawSev as any;
        }

        const anomalyType = ev.anomalyType || 'Crowd Anomaly Detected';

        setAlerts((prev) => {
          const hasUnackSame = prev.some(
            (a) => a.cameraId === ev.cameraId && a.type === anomalyType && !a.acknowledged,
          );
          if (hasUnackSame) {
            return prev.map((a) =>
              a.cameraId === ev.cameraId && a.type === anomalyType && !a.acknowledged
                ? { ...a, metrics: ev.metrics || a.metrics }
                : a,
            );
          }

          lastAlertTimestampRef.current[ev.cameraId] = now;
          const alertId = `alt-${now.toString(36)}`;
          seenAlertIdsRef.current.add(alertId);

          // Audio alarm triggers ONLY for genuine incoming alerts
          playChime(mappedSev);

          const calibratedWindow =
            ev.cameraId === 'cam-001'
              ? { start: 3.8, end: 9.2, peak: 6.2 }
              : ev.cameraId === 'cam-002'
              ? { start: 2.8, end: 8.2, peak: 5.4 }
              : ev.cameraId === 'cam-004'
              ? { start: 1.8, end: 6.2, peak: 3.8 }
              : { start: 2.2, end: 7.5, peak: 4.8 };

          const newAlert: Alert = {
            id: alertId,
            cameraId: ev.cameraId,
            zoneName: ev.zoneName,
            type: anomalyType,
            severity: mappedSev,
            timestamp: ev.timestamp || new Date().toISOString(),
            acknowledged: false,
            metrics: ev.metrics,
            timeWindow: calibratedWindow,
            snapshotUrl:
              ev.cameraId === 'cam-001'
                ? '/corridor_chokepoint.webm'
                : ev.cameraId === 'cam-002'
                ? '/concourse_crossing.webm'
                : ev.cameraId === 'cam-003'
                ? '/12269404_2320_1080_30fps.mp4'
                : '/stadium_hallway_dispersal.mp4',
          };

          // Also mirror into incidents queue
          const newIncident: Incident = {
            id: `inc-${now.toString(36)}`,
            timestamp: newAlert.timestamp,
            cameraId: ev.cameraId,
            zoneName: ev.zoneName,
            alertType: anomalyType,
            severity: mappedSev,
            status: 'open',
            isFalsePositive: false,
            metrics_json: ev.metrics,
            timeWindow: calibratedWindow,
          };
          setIncidents((incPrev) => [newIncident, ...incPrev].slice(0, 150));

          return [newAlert, ...prev].slice(0, 50);
        });
      }
    }
  }, []);

  const { isConnected: isWsConnected } = useCrowdStream(handleWsEvent);
  const isDemoMode = !isWsConnected;

  // 4. Fallback Simulator if WebSocket is disconnected
  useEffect(() => {
    if (!isDemoMode) {
      stopCrowdSimulator();
      return;
    }

    startCrowdSimulator();
    const offs: Array<() => void> = [];

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
                  metrics: ev.metrics ?? c.metrics,
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
          const hasUnackSame = prev.some(
            (a) => a.cameraId === alt.cameraId && a.type === alt.type && !a.acknowledged,
          );
          if (hasUnackSame) {
            return prev.map((a) =>
              a.cameraId === alt.cameraId && a.type === alt.type && !a.acknowledged
                ? { ...a, metrics: alt.metrics || a.metrics }
                : a,
            );
          }

          if (!seenAlertIdsRef.current.has(alt.id)) {
            seenAlertIdsRef.current.add(alt.id);
            playChime(alt.severity);
          }
          return [alt, ...prev].slice(0, 50);
        });
      }),
    );

    offs.push(
      onIncident((inc) => {
        setIncidents((prev) => {
          const hasSame = prev.some(
            (i) => i.cameraId === inc.cameraId && i.alertType === inc.alertType && i.status === 'open',
          );
          if (hasSame) return prev;
          return [inc, ...prev].slice(0, 150);
        });
      }),
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

    return () => {
      stopCrowdSimulator();
      offs.forEach((fn) => fn());
    };
  }, [isDemoMode]);

  // 5. Ticker for lastUpdatedAgo
  useEffect(() => {
    const ticker = window.setInterval(() => {
      setCameras((prev) =>
        prev.map((c) => ({ ...c, lastUpdatedAgo: c.lastUpdatedAgo + 1 })),
      );
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  // Alert & Incident Acknowledgement
  const acknowledgeAlert = useCallback(
    async (id: string) => {
      const opName = profile?.displayName ?? 'Operator';

      // Optimistic update for Alerts
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === id || a.id.includes(id) || id.includes(a.id)
            ? {
                ...a,
                acknowledged: true,
                acknowledgedBy: opName,
              }
            : a,
        ),
      );

      // Optimistic update for Incidents
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === id || inc.id.includes(id) || id.includes(inc.id)
            ? {
                ...inc,
                status: inc.status === 'open' ? 'acknowledged' : inc.status,
                acknowledgedBy: inc.acknowledgedBy || opName,
              }
            : inc,
        ),
      );

      playChime('info');

      // Async backend sync
      try {
        const token = localStorage.getItem('surge_token') || localStorage.getItem('safecrowd_token');
        await fetch(`${API_BASE_URL}/incidents/${id}/acknowledge`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            operator_id: profile?.uid || 'usr-op-001',
            operator_name: opName,
          }),
        });
      } catch {
        // Offline demo fallback
      }
    },
    [profile],
  );

  const acknowledgeAllAlerts = useCallback(async () => {
    const opName = profile?.displayName ?? 'Operator';

    setAlerts((prev) =>
      prev.map((a) => ({
        ...a,
        acknowledged: true,
        acknowledgedBy: opName,
      })),
    );

    setIncidents((prev) =>
      prev.map((inc) => ({
        ...inc,
        status: inc.status === 'open' ? 'acknowledged' : inc.status,
        acknowledgedBy: inc.acknowledgedBy || opName,
      })),
    );

    playChime('info');

    try {
      const token = localStorage.getItem('surge_token') || localStorage.getItem('safecrowd_token');
      await fetch(`${API_BASE_URL}/incidents/batch-acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          operator_id: profile?.uid || 'usr-op-001',
          operator_name: opName,
        }),
      });
    } catch {
      // Offline fallback
    }
  }, [profile]);

  // Alert & Incident Resolution
  const resolveAlert = useCallback(
    async (id: string, notes?: string, isFalsePositive?: boolean) => {
      const opName = profile?.displayName ?? 'Operator';
      const resolvedAt = new Date().toISOString();
      const defaultNote = isFalsePositive
        ? 'Marked as false positive by operator'
        : 'Resolved normal crowd flow.';
      const finalNote = notes ? notes.trim() : defaultNote;

      const targetAlert = alerts.find((a) => a.id === id || a.id.includes(id) || id.includes(a.id));
      const targetIncident = incidents.find((i) => i.id === id || i.id.includes(id) || id.includes(i.id));

      const resolvedInc: Incident = {
        id: targetIncident?.id || targetAlert?.id || id,
        cameraId: targetIncident?.cameraId || targetAlert?.cameraId || 'cam-001',
        zoneName: targetIncident?.zoneName || targetAlert?.zoneName || 'Surveillance Zone',
        alertType: targetIncident?.alertType || targetAlert?.type || 'Anomaly Detected',
        severity: targetIncident?.severity || targetAlert?.severity || 'warning',
        status: 'resolved',
        timestamp: targetIncident?.timestamp || targetAlert?.timestamp || resolvedAt,
        acknowledgedBy: opName,
        resolvedAt,
        notes: finalNote,
        isFalsePositive: !!isFalsePositive,
        metrics_json: targetAlert?.metrics || (targetIncident as any)?.metrics_json,
      };

      // 1. Remove from active triage alerts
      setAlerts((prev) => prev.filter((a) => a.id !== id && !a.id.includes(id) && !id.includes(a.id)));

      // 2. Add or update in incidents audit log
      setIncidents((prev) => {
        const exists = prev.some((i) => i.id === resolvedInc.id);
        if (exists) {
          return prev.map((i) => (i.id === resolvedInc.id ? resolvedInc : i));
        }
        return [resolvedInc, ...prev].slice(0, 150);
      });

      playChime('success');

      // 3. Async backend sync
      try {
        const token = localStorage.getItem('surge_token') || localStorage.getItem('safecrowd_token');
        await fetch(`${API_BASE_URL}/incidents/${id}/resolve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            operator_id: opName,
            notes: finalNote,
            is_false_positive: !!isFalsePositive,
          }),
        });
      } catch {
        // Offline demo fallback
      }
    },
    [alerts, incidents, profile],
  );

  // Emergency SOP Dispatch Action
  const dispatchEmergency = useCallback(
    async (id: string, customNote?: string): Promise<boolean> => {
      // Automatically acknowledge the incident first
      await acknowledgeAlert(id);

      try {
        const token = localStorage.getItem('surge_token') || localStorage.getItem('safecrowd_token');
        const res = await fetch(`${API_BASE_URL}/incidents/${id}/dispatch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            operator_id: profile?.uid || 'usr-op-001',
            custom_note: customNote || 'Physical security team emergency dispatch dispatched from Surge SOC.',
          }),
        });
        return res.ok;
      } catch {
        return true; // Graceful offline/demo fallback
      }
    },
    [acknowledgeAlert, profile],
  );

  const triggerTestAlert = useCallback(
    (custom?: Partial<Alert>) => {
      const now = Date.now();
      const targetCamId = custom?.cameraId || 'cam-003';
      const matchedCam = cameras.find((c) => c.cameraId === targetCamId);
      const newAlertId = `alt-${now.toString(36)}`;
      seenAlertIdsRef.current.add(newAlertId);

      const sev = custom?.severity || 'high';
      playChime(sev);

      const calibratedWindow =
        custom?.timeWindow ||
        (targetCamId === 'cam-001'
          ? { start: 3.8, end: 9.2, peak: 6.2 }
          : targetCamId === 'cam-002'
          ? { start: 2.8, end: 8.2, peak: 5.4 }
          : targetCamId === 'cam-004'
          ? { start: 1.8, end: 6.2, peak: 3.8 }
          : { start: 2.2, end: 7.5, peak: 4.8 });

      const newAlert: Alert = {
        id: newAlertId,
        cameraId: targetCamId,
        zoneName: custom?.zoneName || matchedCam?.zoneName || 'Main Terminal Gate (Dense Scramble)',
        type: custom?.type || 'Crowd Surge Detected',
        severity: sev,
        timestamp: new Date(now).toISOString(),
        acknowledged: false,
        timeWindow: calibratedWindow,
        snapshotUrl:
          custom?.snapshotUrl ||
          (targetCamId === 'cam-001'
            ? '/corridor_chokepoint.webm'
            : targetCamId === 'cam-002'
            ? '/concourse_crossing.webm'
            : targetCamId === 'cam-004'
            ? '/stadium_hallway_dispersal.mp4'
            : '/12269404_2320_1080_30fps.mp4'),
        metrics: custom?.metrics || {
          density: 4.1,
          flow_vector: [0.8, -0.2],
          velocity_variance: 3.9,
          headcount: matchedCam?.headcount ? matchedCam.headcount + 15 : 195,
          avg_speed: 1.8,
          turbulence: 0.45,
        },
      };

      setAlerts((prev) => [newAlert, ...prev].slice(0, 50));

      const newIncident: Incident = {
        id: `inc-${now.toString(36)}`,
        timestamp: newAlert.timestamp,
        cameraId: targetCamId,
        zoneName: newAlert.zoneName,
        alertType: newAlert.type,
        severity: sev,
        status: 'open',
        isFalsePositive: false,
        metrics_json: newAlert.metrics,
        timeWindow: calibratedWindow,
      };
      setIncidents((prev) => [newIncident, ...prev].slice(0, 150));
    },
    [cameras],
  );

  // Computed Derived Values
  const unacknowledgedAlertsCount = useMemo(
    () => alerts.filter((a) => !a.acknowledged).length,
    [alerts],
  );

  const activeFeedsCount = useMemo(
    () => cameras.filter((c) => c.isActive !== false).length,
    [cameras],
  );

  // Computed strictly by matching ISO date YYYY-MM-DD to UTC today
  const todayIncidentsCount = useMemo(() => {
    const todayUtc = new Date().toISOString().slice(0, 10);
    return incidents.filter((i) => i.timestamp && i.timestamp.slice(0, 10) === todayUtc).length;
  }, [incidents]);

  const value = useMemo(
    () => ({
      cameras,
      heatmaps,
      alerts,
      incidents,
      activeFeedsCount,
      unacknowledgedAlertsCount,
      todayIncidentsCount,
      isWsConnected,
      isDemoMode,
      acknowledgeAlert,
      acknowledgeAllAlerts,
      resolveAlert,
      dispatchEmergency,
      refetchIncidents,
      triggerTestAlert,
    }),
    [
      cameras,
      heatmaps,
      alerts,
      incidents,
      activeFeedsCount,
      unacknowledgedAlertsCount,
      todayIncidentsCount,
      isWsConnected,
      isDemoMode,
      acknowledgeAlert,
      acknowledgeAllAlerts,
      resolveAlert,
      dispatchEmergency,
      refetchIncidents,
      triggerTestAlert,
    ],
  );

  return <CrowdContext.Provider value={value}>{children}</CrowdContext.Provider>;
};

export const useCrowdContext = () => {
  const ctx = useContext(CrowdContext);
  if (!ctx) {
    throw new Error('useCrowdContext must be used within a CrowdProvider');
  }
  return ctx;
};
