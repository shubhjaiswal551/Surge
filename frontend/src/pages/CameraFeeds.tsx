import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Sidebar from '../components/dashboard/Sidebar';
import StatusBar from '../components/dashboard/StatusBar';
import CameraPanel from '../components/dashboard/CameraPanel';
import SnapshotModal from '../components/dashboard/SnapshotModal';
import ZoneCalibrationModal from '../components/dashboard/ZoneCalibrationModal';
import FlagIncidentModal from '../components/dashboard/FlagIncidentModal';
import { useCrowdStream } from '../hooks/useCrowdStream';
import { API_BASE_URL } from '../config/api';
import { playChime, isSoundEnabled, setSoundEnabled } from '../lib/sound';
import {
  startCrowdSimulator,
  stopCrowdSimulator,
  onCrowdEvent,
  onHeatmap,
  onAlert,
  getInitialCameras,
  getInitialHeatmaps,
} from '../mocks/crowdSimulator';
import type { CameraState, CameraHeatmap, Alert, CrowdEvent } from '../types/crowdEvent';

type LayoutMode = 'grid' | 'hero' | 'focus' | 'dense';
type FilterStatus = 'all' | 'anomaly' | 'high_critical' | 'normal';
type SortOption = 'default' | 'headcount_desc' | 'headcount_asc' | 'name';

function cleanVideoUrl(url?: string, _cameraId?: string): string {
  if (!url) return '';
  let cleaned = url.replace(/^frontend\/public\//, '/').replace(/^public\//, '/');
  if (cleaned.startsWith('rtsp://') || cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    return cleaned;
  }
  if (!cleaned.startsWith('/')) {
    cleaned = '/' + cleaned;
  }
  return cleaned;
}

const getCameraArea = (cid: string): number => {
  if (cid === 'cam-001') return 45.0;
  if (cid === 'cam-002') return 60.0;
  if (cid === 'cam-003') return 50.0;
  return 70.0;
};

const CameraFeeds: React.FC = () => {
  const [cameras, setCameras] = useState<CameraState[]>(() => getInitialCameras());
  const [heatmaps, setHeatmaps] = useState<CameraHeatmap[]>(() => getInitialHeatmaps());
  const [alerts, setAlerts] = useState<Alert[]>([]);
  
  const [searchParams] = useSearchParams();
  const paramFocus = searchParams.get('focus');

  // Layout and Display Controls
  const [layout, setLayout] = useState<LayoutMode>(paramFocus ? 'focus' : 'grid');
  const [focusId, setFocusId] = useState<string>(paramFocus || 'cam-001');
  const [heroId, setHeroId] = useState<string>(paramFocus || 'cam-001');
  const [isWallMode, setIsWallMode] = useState<boolean>(false);
  const [isSocDark, setIsSocDark] = useState<boolean>(false);

  useEffect(() => {
    const target = searchParams.get('focus');
    if (target) {
      setFocusId(target);
      setHeroId(target);
      setLayout('focus');
    }
  }, [searchParams]);

  // Audio Alarm Dispatcher State
  const [soundActive, setSoundActive] = useState<boolean>(() => isSoundEnabled());
  const [isAlarmSounding, setIsAlarmSounding] = useState<boolean>(false);
  const lastSoundTimeRef = useRef<number>(0);

  // Search, Filter and Sorting
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<SortOption>('default');

  // Auto-Tour Surveillance Mode
  const [isAutoTour, setIsAutoTour] = useState<boolean>(false);
  const [tourSecondsLeft, setTourSecondsLeft] = useState<number>(15);

  // Modals & User Action State
  const [calibratingCamera, setCalibratingCamera] = useState<CameraState | null>(null);
  const [selectedAlertForModal, setSelectedAlertForModal] = useState<Alert | null>(null);
  const [flaggingCamera, setFlaggingCamera] = useState<CameraState | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  // 1. Dynamic Camera Fetching from Backend REST API
  useEffect(() => {
    let isMounted = true;
    async function fetchCameras() {
      try {
        const res = await fetch(`${API_BASE_URL}/cameras`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data) && data.length > 0) {
            setCameras((prev) => {
              return data.map((bCam: any) => {
                const existing = prev.find((p) => p.cameraId === bCam.id);
                return {
                  cameraId: bCam.id,
                  zoneName: bCam.name || bCam.location || 'Surveillance Zone',
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
                  rtspUrl: cleanVideoUrl(bCam.rtsp_url, bCam.id),
                  isActive: bCam.is_active ?? true,
                  polygonCoords: existing?.polygonCoords,
                };
              });
            });
          }
        }
      } catch {
        // Fallback to initial state
      }
    }
    fetchCameras();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Fetch Calibrated Zones from Backend API
  const fetchZones = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/zones`);
      if (res.ok) {
        const zoneList = await res.json();
        if (Array.isArray(zoneList) && zoneList.length > 0) {
          setCameras((prev) =>
            prev.map((cam) => {
              const matched = zoneList.find((z: any) => z.camera_id === cam.cameraId);
              if (matched && Array.isArray(matched.polygon_coords)) {
                return {
                  ...cam,
                  zoneId: matched.id,
                  zoneName: matched.name || cam.zoneName,
                  polygonCoords: matched.polygon_coords,
                };
              }
              return cam;
            }),
          );
        }
      }
    } catch {
      // Offline fallback: keep default camera polygon
    }
  }, []);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

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

      setHeatmaps((prev) => {
        const hm: CameraHeatmap = { cameraId: ev.cameraId, grid: parsedGrid };
        const exists = prev.some((p) => p.cameraId === ev.cameraId);
        if (exists) return prev.map((p) => (p.cameraId === ev.cameraId ? hm : p));
        return [...prev, hm];
      });
    }

    if (ev.anomaly) {
      const anomalyType = ev.anomalyType || 'Crowd Surge Detected';
      setAlerts((prev) => {
        const hasUnacknowledgedSameAlert = prev.some(
          (a) =>
            a.cameraId === ev.cameraId &&
            a.type === anomalyType &&
            !a.acknowledged,
        );
        if (hasUnacknowledgedSameAlert) {
          return prev.map((a) =>
            a.cameraId === ev.cameraId && a.type === anomalyType && !a.acknowledged
              ? { ...a, timestamp: ev.timestamp || new Date().toISOString() }
              : a,
          );
        }
        const newAlert: Alert = {
          id: `alt-${Date.now().toString(36)}`,
          cameraId: ev.cameraId,
          zoneName: ev.zoneName,
          type: anomalyType,
          severity: ev.severity || 'high',
          timestamp: ev.timestamp || new Date().toISOString(),
          acknowledged: false,
        };
        return [newAlert, ...prev].slice(0, 50);
      });
    }
  }, []);

  const { isConnected: isWsConnected } = useCrowdStream(handleWsEvent);

  // 4. Fallback to Local Simulator if WebSocket is disconnected
  useEffect(() => {
    if (isWsConnected) {
      stopCrowdSimulator();
      return;
    }

    startCrowdSimulator();
    const off1 = onCrowdEvent((ev) => {
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
    });

    const off2 = onHeatmap((hm) => {
      setHeatmaps((prev) => {
        const exists = prev.some((p) => p.cameraId === hm.cameraId);
        if (exists) return prev.map((p) => (p.cameraId === hm.cameraId ? hm : p));
        return [...prev, hm];
      });
    });

    const off3 = onAlert((a) => {
      setAlerts((prev) => [a, ...prev].slice(0, 50));
    });

    const ticker = window.setInterval(() => {
      setCameras((prev) =>
        prev.map((c) => ({ ...c, lastUpdatedAgo: c.lastUpdatedAgo + 1 })),
      );
    }, 1000);

    return () => {
      stopCrowdSimulator();
      off1();
      off2();
      off3();
      clearInterval(ticker);
    };
  }, [isWsConnected]);

  // 5. Audio Alarm Dispatcher (Monitors Surges & Alerts)
  useEffect(() => {
    if (!soundActive) return;
    const hasCritical = cameras.some((c) => c.density === 'critical');
    const hasHigh = cameras.some((c) => c.density === 'high');
    const hasUnackAnomaly = alerts.some((a) => !a.acknowledged && (a.severity === 'critical' || a.severity === 'high'));

    if (hasCritical || hasHigh || hasUnackAnomaly) {
      const now = Date.now();
      // Throttle audio chimes to at most once every 6.5s
      if (now - lastSoundTimeRef.current >= 6500) {
        lastSoundTimeRef.current = now;
        playChime(hasCritical ? 'critical' : 'high');
        setIsAlarmSounding(true);
        setTimeout(() => setIsAlarmSounding(false), 2200);
      }
    }
  }, [cameras, alerts, soundActive]);

  // 6. Auto-Tour Surveillance Carousel Timer
  useEffect(() => {
    if (!isAutoTour) {
      setTourSecondsLeft(15);
      return;
    }

    const interval = window.setInterval(() => {
      setTourSecondsLeft((prev) => {
        if (prev <= 1) {
          // Advance to next camera
          setCameras((currentCameras) => {
            if (currentCameras.length <= 1) return currentCameras;
            const currentActiveId = layout === 'focus' ? focusId : heroId;
            const curIdx = currentCameras.findIndex((c) => c.cameraId === currentActiveId);
            const nextIdx = (curIdx + 1) % currentCameras.length;
            const nextId = currentCameras[nextIdx].cameraId;
            if (layout === 'focus') setFocusId(nextId);
            else setHeroId(nextId);
            return currentCameras;
          });
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isAutoTour, layout, focusId, heroId]);

  // Aggregate Metrics
  const totalHeadcount = useMemo(
    () => cameras.reduce((sum, c) => sum + (c.headcount || 0), 0),
    [cameras],
  );

  const activeCamerasCount = useMemo(
    () => cameras.filter((c) => c.isActive !== false).length,
    [cameras],
  );

  const unacknowledged = alerts.filter((a) => !a.acknowledged).length;

  // Filter & Search & Sort Logic
  const filteredCameras = useMemo(() => {
    let list = [...cameras];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.zoneName.toLowerCase().includes(q) ||
          c.cameraId.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q),
      );
    }

    // Status / Density Filter
    if (filterStatus === 'anomaly') {
      const anomalyIds = new Set(
        alerts.filter((a) => !a.acknowledged).map((a) => a.cameraId),
      );
      list = list.filter((c) => anomalyIds.has(c.cameraId));
    } else if (filterStatus === 'high_critical') {
      list = list.filter((c) => c.density === 'critical' || c.density === 'high');
    } else if (filterStatus === 'normal') {
      list = list.filter((c) => c.density === 'low' || c.density === 'moderate');
    }

    // Sorting
    if (sortBy === 'headcount_desc') {
      list.sort((a, b) => (b.headcount || 0) - (a.headcount || 0));
    } else if (sortBy === 'headcount_asc') {
      list.sort((a, b) => (a.headcount || 0) - (b.headcount || 0));
    } else if (sortBy === 'name') {
      list.sort((a, b) => a.zoneName.localeCompare(b.zoneName));
    }

    return list;
  }, [cameras, searchQuery, filterStatus, sortBy, alerts]);

  // Cycle focus camera navigation
  const handleStepFocus = (direction: 'prev' | 'next') => {
    if (filteredCameras.length === 0) return;
    const curIdx = filteredCameras.findIndex((c) => c.cameraId === focusId);
    let nextIdx = direction === 'next' ? curIdx + 1 : curIdx - 1;
    if (nextIdx < 0) nextIdx = filteredCameras.length - 1;
    if (nextIdx >= filteredCameras.length) nextIdx = 0;
    setFocusId(filteredCameras[nextIdx].cameraId);
  };

  // Launch Forensic Evidence Inspector Modal for a camera
  const handleInspectCameraAnomaly = (camera: CameraState) => {
    const existingAlert = alerts.find((a) => a.cameraId === camera.cameraId && !a.acknowledged);
    if (existingAlert) {
      setSelectedAlertForModal(existingAlert);
      return;
    }

    const onDemandAlert: Alert = {
      id: `forensic-${camera.cameraId}-${Date.now().toString(36)}`,
      cameraId: camera.cameraId,
      zoneName: camera.zoneName,
      type: 'Live Surveillance Forensic Inspection',
      severity: camera.density === 'critical' ? 'critical' : camera.density === 'high' ? 'high' : 'info',
      timestamp: new Date().toISOString(),
      acknowledged: false,
      snapshotUrl: cleanVideoUrl(camera.rtspUrl, camera.cameraId),
    };
    setSelectedAlertForModal(onDemandAlert);
  };

  const handleAcknowledgeAlert = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
    );
  };

  const handleResolveAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setSelectedAlertForModal(null);
  };

  // 1+5 Hero Grid: Primary camera and auxiliary cameras
  const heroCam = useMemo(() => {
    return filteredCameras.find((c) => c.cameraId === heroId) || filteredCameras[0];
  }, [filteredCameras, heroId]);

  const auxCameras = useMemo(() => {
    if (!heroCam) return [];
    return filteredCameras.filter((c) => c.cameraId !== heroCam.cameraId);
  }, [filteredCameras, heroCam]);

  return (
    <div className={`h-screen w-screen flex overflow-hidden transition-colors duration-300 ${isSocDark ? 'bg-[#0B0F19] text-slate-100' : 'bg-[#f5f5f7] text-slate-900'}`}>
      {!isWallMode && <Sidebar alertCount={unacknowledged} />}

      <div className="flex-1 flex flex-col min-w-0">
        {!isWallMode && <StatusBar activeAlertCount={unacknowledged} />}

        <main className="flex-1 overflow-y-auto min-h-0">
          <div className="px-6 md:px-8 py-6 space-y-6 max-w-[1800px] mx-auto">
            {/* Operator Toast Notification */}
            {toastMessage && (
              <div className="fixed top-16 right-8 z-50 bg-slate-900/95 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-white/20 backdrop-blur-md flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="font-medium">{toastMessage}</span>
              </div>
            )}

            {/* Command Header */}
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b ${isSocDark ? 'border-slate-800' : 'border-slate-200/70'}`}>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className={`text-lg font-bold tracking-tight ${isSocDark ? 'text-white' : 'text-slate-900'}`}>
                    Live Camera Feeds
                  </h1>
                  <span className="chip-safe font-sans font-medium text-[11px]">
                    {activeCamerasCount} / {cameras.length} Active Feeds
                  </span>
                  <span className={`hidden md:inline-flex px-2 py-0.5 rounded-full border text-[11px] font-mono ${isSocDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200/80 text-slate-600'}`}>
                    Total Monitored: {totalHeadcount.toLocaleString()} People
                  </span>
                  {isWsConnected && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live Stream Connected
                    </span>
                  )}
                </div>
                <p className={`text-xs mt-0.5 ${isSocDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Real-time video surveillance with AI crowd detection, heatmaps, and movement analysis.
                </p>
              </div>

              {/* Top Action Cluster: Sound, SOC Dark Mode, Auto-Tour, Video Wall */}
              <div className="flex items-center gap-2.5 flex-wrap">
                {/* Audio Surge Alarm Dispatcher */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !soundActive;
                    setSoundActive(next);
                    setSoundEnabled(next);
                    showToast(next ? 'Audible crowd alarms enabled' : 'Audible crowd alarms muted');
                  }}
                  title={soundActive ? 'Audible crowd surge alarms active (Click to mute)' : 'Audible crowd surge alarms muted (Click to enable)'}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border shadow-xs transition-all ${
                    isAlarmSounding
                      ? 'bg-rose-600 text-white border-rose-600 animate-pulse ring-2 ring-rose-500/50'
                      : soundActive
                        ? isSocDark
                          ? 'bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-750'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/70'
                        : isSocDark
                          ? 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750'
                          : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {soundActive ? (
                      <>
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                      </>
                    ) : (
                      <>
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <line x1="23" y1="9" x2="17" y2="15" />
                        <line x1="17" y1="9" x2="23" y2="15" />
                      </>
                    )}
                  </svg>
                  <span>{soundActive ? (isAlarmSounding ? 'SURGE ALARM' : 'Audio Alert ON') : 'Audio Muted'}</span>
                </button>

                {/* Dark Room Mode Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !isSocDark;
                    setIsSocDark(next);
                    showToast(next ? 'Dark Room Mode enabled' : 'Day Light Mode enabled');
                  }}
                  title={isSocDark ? 'Switch to Standard Day Light Mode' : 'Switch to Low-Light Dark Room Mode'}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border shadow-xs transition-all ${
                    isSocDark
                      ? 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-750'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/80'
                  }`}
                >
                  {isSocDark ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="5" />
                        <line x1="12" y1="1" x2="12" y2="3" />
                        <line x1="12" y1="21" x2="12" y2="23" />
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                        <line x1="1" y1="12" x2="3" y2="12" />
                        <line x1="21" y1="12" x2="23" y2="12" />
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                      </svg>
                      <span>Day Light</span>
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                      <span>Dark Room</span>
                    </>
                  )}
                </button>

                {/* Auto-Tour Surveillance Loop */}
                <button
                  type="button"
                  onClick={() => setIsAutoTour(!isAutoTour)}
                  title={
                    isAutoTour
                      ? `Surveillance Tour active: rotating cameras every 15s (next in ${tourSecondsLeft}s)`
                      : 'Enable Auto-Tour Surveillance Loop (15s rotation)'
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border shadow-xs transition-all ${
                    isAutoTour
                      ? 'bg-emerald-600 text-white border-emerald-600 animate-pulse'
                      : isSocDark
                        ? 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-750'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/80'
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                  <span>{isAutoTour ? `Tour (${tourSecondsLeft}s)` : 'Auto-Tour'}</span>
                </button>

                {/* Video Wall / Theatre Mode Toggle */}
                <button
                  type="button"
                  onClick={() => setIsWallMode(!isWallMode)}
                  title={isWallMode ? 'Exit Video Wall Mode' : 'Enter Theatre Video Wall Mode (Hide Sidebars)'}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border shadow-xs transition-all ${
                    isWallMode
                      ? 'bg-[#0071e3] text-white border-[#0071e3]'
                      : isSocDark
                        ? 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-750'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/80'
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  <span>{isWallMode ? 'Exit Wall' : 'Video Wall'}</span>
                </button>
              </div>
            </div>

            {/* VMS Operational Toolbar: Search, Filters, Sorting & Layouts */}
            <div className={`backdrop-blur-md border rounded-2xl p-3 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 flex-wrap transition-colors duration-200 ${
              isSocDark ? 'bg-slate-900/90 border-slate-800 text-white' : 'card'
            }`}>
              {/* Left: Search Bar & Density Status Filter Pills */}
              <div className="flex items-center gap-2.5 flex-wrap flex-1 min-w-[280px]">
                {/* Search Input */}
                <div className="relative min-w-[200px] flex-1 max-w-xs">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search camera or zone..."
                    className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans ${
                      isSocDark
                        ? 'bg-slate-800/90 border-slate-700 text-white placeholder:text-slate-500 focus:bg-slate-800'
                        : 'bg-slate-50 hover:bg-slate-100/80 focus:bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'
                    }`}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Pills with macOS Segmented Control */}
                <div className="mac-segmented flex items-center">
                  {(['all', 'anomaly', 'high_critical', 'normal'] as const).map((status) => {
                    const labels = {
                      all: `All (${cameras.length})`,
                      anomaly: `Anomalies (${alerts.filter((a) => !a.acknowledged).length})`,
                      high_critical: 'Surge / High',
                      normal: 'Normal',
                    };
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setFilterStatus(status)}
                        className={`px-2.5 py-1 text-xs transition-all ${
                          filterStatus === status
                            ? 'mac-pill-active'
                            : isSocDark
                              ? 'text-slate-400 hover:text-white font-medium'
                              : 'text-slate-600 hover:text-slate-900 font-medium'
                        }`}
                      >
                        {labels[status]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: Sort and Layout Mode Selectors */}
              <div className="flex items-center gap-2.5 flex-wrap justify-end">
                {/* Sort dropdown */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={`hidden xl:inline text-[11px] ${isSocDark ? 'text-slate-400' : 'text-slate-500'}`}>Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className={`rounded-xl px-2.5 py-1 text-xs font-medium focus:outline-none border ${
                      isSocDark
                        ? 'bg-slate-800 border-slate-700 text-slate-200 focus:ring-1 focus:ring-blue-500'
                        : 'bg-slate-50 border-slate-200/80 text-slate-700 focus:ring-1 focus:ring-blue-500'
                    }`}
                  >
                    <option value="default">Default Order</option>
                    <option value="headcount_desc">Headcount (High → Low)</option>
                    <option value="headcount_asc">Headcount (Low → High)</option>
                    <option value="name">Zone Name (A → Z)</option>
                  </select>
                </div>

                {/* Layout Mode Segmented Control */}
                <div className="mac-segmented flex items-center">
                  {([
                    { id: 'grid', label: 'Grid View' },
                    { id: 'hero', label: 'Main Feed' },
                    { id: 'dense', label: 'All Cameras' },
                    { id: 'focus', label: 'Single View' },
                  ] as const).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLayout(item.id)}
                      className={`px-2.5 py-1 text-xs transition-all ${
                        layout === item.id
                          ? 'mac-pill-active'
                          : isSocDark
                            ? 'text-slate-400 hover:text-white font-medium'
                            : 'text-slate-600 hover:text-slate-900 font-medium'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Layout Mode Content Renders */}
            {filteredCameras.length === 0 ? (
              <div className={`card p-12 text-center rounded-2xl border ${isSocDark ? 'bg-slate-900/80 border-slate-800 text-slate-300' : 'bg-white/60 border-slate-200 text-slate-500'}`}>
                <div className="text-3xl mb-2">🔍</div>
                <div className={`text-sm font-semibold ${isSocDark ? 'text-white' : 'text-slate-700'}`}>No camera channels match criteria</div>
                <div className="text-xs text-slate-400 mt-1">Try clearing the search query or changing your status filter.</div>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterStatus('all');
                  }}
                  className="mt-3 px-3 py-1.5 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl font-medium"
                >
                  Reset Filters
                </button>
              </div>
            ) : layout === 'hero' ? (
              /* 1+5 HERO GRID MODE */
              <div className="flex flex-col lg:flex-row gap-6 items-start">
                {/* Primary Hero Stage (Takes prominent 68% width on desktop) */}
                <div className="w-full lg:flex-1 min-w-0">
                  {heroCam && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-semibold text-blue-500 flex items-center gap-1.5 uppercase tracking-wider">
                          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          Main Monitor · {heroCam.zoneName}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Click any feed on the right to set as main view
                        </span>
                      </div>
                      <CameraPanel
                        key={heroCam.cameraId}
                        cameraId={heroCam.cameraId}
                        zoneName={heroCam.zoneName}
                        description={heroCam.description}
                        headcount={heroCam.headcount}
                        density={heroCam.density}
                        flowDirection={heroCam.flowDirection}
                        lastUpdatedAgo={heroCam.lastUpdatedAgo}
                        videoSrc={cleanVideoUrl(heroCam.rtspUrl, heroCam.cameraId)}
                        heatmapGrid={heatmaps.find((h) => h.cameraId === heroCam.cameraId)?.grid}
                        polygonCoords={heroCam.polygonCoords}
                        areaSqM={getCameraArea(heroCam.cameraId)}
                        isDark={isSocDark}
                        anomaly={!!alerts.find((a) => !a.acknowledged && a.cameraId === heroCam.cameraId)}
                        anomalyType={alerts.find((a) => !a.acknowledged && a.cameraId === heroCam.cameraId)?.type}
                        onCalibrateZone={() => setCalibratingCamera(heroCam)}
                        onInspectAnomaly={() => handleInspectCameraAnomaly(heroCam)}
                        onFlagIncident={() => setFlaggingCamera(heroCam)}
                      />
                    </div>
                  )}
                </div>

                {/* Auxiliary Channel Strip */}
                {auxCameras.length > 0 && (
                  <div className="w-full lg:w-96 flex flex-col gap-3.5 max-h-[820px] overflow-y-auto pr-1">
                    <div className={`text-xs font-semibold uppercase tracking-wider px-1 flex items-center justify-between ${isSocDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      <span>Auxiliary Channels ({auxCameras.length})</span>
                      <span className="text-[10px] text-slate-400">Click to swap</span>
                    </div>
                    {auxCameras.map((auxCam) => {
                      const hasActiveAnomaly = alerts.find(
                        (a) => !a.acknowledged && a.cameraId === auxCam.cameraId,
                      );
                      const hm = heatmaps.find((h) => h.cameraId === auxCam.cameraId);

                      return (
                        <div
                          key={auxCam.cameraId}
                          className={`group relative cursor-pointer border rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all ${
                            isSocDark
                              ? 'border-slate-800 hover:border-blue-500'
                              : 'border-slate-200/90 hover:border-blue-500'
                          }`}
                          onClick={() => setHeroId(auxCam.cameraId)}
                        >
                          <CameraPanel
                            cameraId={auxCam.cameraId}
                            zoneName={auxCam.zoneName}
                            description={auxCam.description}
                            headcount={auxCam.headcount}
                            density={auxCam.density}
                            flowDirection={auxCam.flowDirection}
                            lastUpdatedAgo={auxCam.lastUpdatedAgo}
                            videoSrc={cleanVideoUrl(auxCam.rtspUrl, auxCam.cameraId)}
                            heatmapGrid={hm?.grid}
                            polygonCoords={auxCam.polygonCoords}
                            areaSqM={getCameraArea(auxCam.cameraId)}
                            isDark={isSocDark}
                            anomaly={!!hasActiveAnomaly}
                            anomalyType={hasActiveAnomaly?.type}
                            onCalibrateZone={() => setCalibratingCamera(auxCam)}
                            onInspectAnomaly={() => handleInspectCameraAnomaly(auxCam)}
                            onFlagIncident={() => setFlaggingCamera(auxCam)}
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setHeroId(auxCam.cameraId);
                            }}
                            className="absolute top-2 left-2 z-30 px-2 py-0.5 rounded-md bg-slate-900/85 hover:bg-blue-600 text-white text-[10px] font-medium backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          >
                            Set as Main View ↗
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : layout === 'focus' ? (
              /* FOCUS SINGLE CHANNEL MODE */
              <div className="max-w-4xl mx-auto space-y-3">
                {/* Quick Navigation Stepper */}
                <div className={`flex items-center justify-between px-4 py-2.5 rounded-2xl border shadow-xs ${
                  isSocDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200/80'
                }`}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleStepFocus('prev')}
                      className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-colors ${
                        isSocDark
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      ← Previous Feed
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStepFocus('next')}
                      className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-colors ${
                        isSocDark
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      Next Feed →
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${isSocDark ? 'text-slate-400' : 'text-slate-500'}`}>Channel:</span>
                    <select
                      value={focusId}
                      onChange={(e) => setFocusId(e.target.value)}
                      className={`text-xs py-1 px-3 w-auto rounded-xl border focus:outline-none ${
                        isSocDark
                          ? 'bg-slate-800 border-slate-700 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-900'
                      }`}
                    >
                      {filteredCameras.map((c) => (
                        <option key={c.cameraId} value={c.cameraId}>
                          {c.zoneName} ({c.cameraId.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Focused Camera Panel */}
                {(() => {
                  const focusedCam =
                    filteredCameras.find((c) => c.cameraId === focusId) || filteredCameras[0];
                  if (!focusedCam) return null;
                  const hm = heatmaps.find((h) => h.cameraId === focusedCam.cameraId);
                  const hasActiveAnomaly = alerts.find(
                    (a) => !a.acknowledged && a.cameraId === focusedCam.cameraId,
                  );

                  return (
                    <CameraPanel
                      key={focusedCam.cameraId}
                      cameraId={focusedCam.cameraId}
                      zoneName={focusedCam.zoneName}
                      description={focusedCam.description}
                      headcount={focusedCam.headcount}
                      density={focusedCam.density}
                      flowDirection={focusedCam.flowDirection}
                      lastUpdatedAgo={focusedCam.lastUpdatedAgo}
                      videoSrc={cleanVideoUrl(focusedCam.rtspUrl, focusedCam.cameraId)}
                      heatmapGrid={hm?.grid}
                      polygonCoords={focusedCam.polygonCoords}
                      areaSqM={getCameraArea(focusedCam.cameraId)}
                      isDark={isSocDark}
                      anomaly={!!hasActiveAnomaly}
                      anomalyType={hasActiveAnomaly?.type}
                      onCalibrateZone={() => setCalibratingCamera(focusedCam)}
                      onInspectAnomaly={() => handleInspectCameraAnomaly(focusedCam)}
                      onFlagIncident={() => setFlaggingCamera(focusedCam)}
                    />
                  );
                })()}
              </div>
            ) : (
              /* MATRIX 2X2 OR DENSE 3X3 GRID MODE */
              <div
                className={`grid gap-6 ${
                  layout === 'dense'
                    ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                    : 'grid-cols-1 lg:grid-cols-2'
                }`}
              >
                {filteredCameras.map((cam) => {
                  const hm = heatmaps.find((h) => h.cameraId === cam.cameraId);
                  const hasActiveAnomaly = alerts.find(
                    (a) => !a.acknowledged && a.cameraId === cam.cameraId,
                  );

                  return (
                    <CameraPanel
                      key={cam.cameraId}
                      cameraId={cam.cameraId}
                      zoneName={cam.zoneName}
                      description={cam.description}
                      headcount={cam.headcount}
                      density={cam.density}
                      flowDirection={cam.flowDirection}
                      lastUpdatedAgo={cam.lastUpdatedAgo}
                      videoSrc={cleanVideoUrl(cam.rtspUrl, cam.cameraId)}
                      heatmapGrid={hm?.grid}
                      polygonCoords={cam.polygonCoords}
                      areaSqM={getCameraArea(cam.cameraId)}
                      isDark={isSocDark}
                      anomaly={!!hasActiveAnomaly}
                      anomalyType={hasActiveAnomaly?.type}
                      onCalibrateZone={() => setCalibratingCamera(cam)}
                      onInspectAnomaly={() => handleInspectCameraAnomaly(cam)}
                      onFlagIncident={() => setFlaggingCamera(cam)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Zone Calibration Modal */}
      {calibratingCamera && (
        <ZoneCalibrationModal
          cameraId={calibratingCamera.cameraId}
          cameraName={calibratingCamera.zoneName}
          videoSrc={cleanVideoUrl(calibratingCamera.rtspUrl, calibratingCamera.cameraId)}
          onClose={() => setCalibratingCamera(null)}
          onZoneCreated={(newZone) => {
            fetchZones();
            setCameras((prev) =>
              prev.map((c) =>
                c.cameraId === newZone.camera_id
                  ? {
                      ...c,
                      zoneName: newZone.name,
                      polygonCoords: newZone.polygon_coords,
                    }
                  : c,
              ),
            );
            showToast(`Calibrated zone "${newZone.name}" applied successfully.`);
          }}
        />
      )}

      {/* Forensic Evidence Inspector Modal */}
      {selectedAlertForModal && (
        <SnapshotModal
          alert={selectedAlertForModal}
          onClose={() => setSelectedAlertForModal(null)}
          onAcknowledge={handleAcknowledgeAlert}
          onResolve={handleResolveAlert}
        />
      )}

      {/* Flag Incident / Bookmark Audit Logger Modal */}
      {flaggingCamera && (
        <FlagIncidentModal
          cameraId={flaggingCamera.cameraId}
          zoneName={flaggingCamera.zoneName}
          headcount={flaggingCamera.headcount}
          density={flaggingCamera.density}
          flowDirection={flaggingCamera.flowDirection}
          videoSrc={cleanVideoUrl(flaggingCamera.rtspUrl, flaggingCamera.cameraId)}
          onClose={() => setFlaggingCamera(null)}
          onIncidentCreated={(newInc) => {
            showToast(`Security incident bookmark #${newInc.id || 'CREATED'} recorded.`);
          }}
        />
      )}
    </div>
  );
};

export default CameraFeeds;
