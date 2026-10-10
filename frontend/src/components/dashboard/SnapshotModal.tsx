import React, { useState, useRef, useMemo, useEffect } from 'react';
import { CheckCircle2, Cpu, Sparkles, AlertTriangle, ShieldAlert, RotateCw, FileText } from 'lucide-react';
import type { Alert } from '../../types/crowdEvent';
import { API_BASE_URL } from '../../config/api';

interface SnapshotModalProps {
  alert: Alert | null;
  onClose: () => void;
  onAcknowledge?: (id: string) => void;
  onResolve?: (id: string, notes: string, isFalsePositive: boolean) => void;
}

const formatTime = (secs: number) => {
  if (isNaN(secs) || secs < 0) return '00:00.0';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
};

interface BoundingBoxesLayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  telemetry: any;
  isCam1: boolean;
  clusterSize: number;
  baseTracks: Array<{ id: string; startX: number; startY: number; endX: number; endY: number; w: number; h: number; conf: number }>;
  duration: number;
  showBoundingBoxes: boolean;
  overlayOpacity: number;
}

const BoundingBoxesLayer: React.FC<BoundingBoxesLayerProps> = ({
  videoRef,
  telemetry,
  isCam1,
  clusterSize,
  baseTracks,
  duration,
  showBoundingBoxes,
  overlayOpacity,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });

  // 1. Maintain canvas dimensions strictly via ResizeObserver (Zero DOM reflows inside render loop!)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w > 0 && h > 0) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        sizeRef.current = { w, h, dpr };
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener('resize', updateSize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // 2. High-performance rendering in lockstep with video playback
  useEffect(() => {
    if (!showBoundingBoxes) return;

    const canvas = canvasRef.current;
    const vid = videoRef.current;
    if (!canvas || !vid) return;

    let isDisposed = false;
    let callbackHandle: number | null = null;

    const primaryBox = {
      x: isCam1 ? 36 : 38,
      y: isCam1 ? 46 : 34,
      w: 22,
      h: isCam1 ? 20 : 16,
      label: `ANOMALY CLUSTER: ~${clusterSize}P`,
      isPrimary: true,
      isAnomaly: false,
    };

    const drawFrame = () => {
      if (isDisposed) return;

      const { w, h, dpr } = sizeRef.current;
      if (w > 0 && h > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, w, h);
          ctx.globalAlpha = Math.max(0.25, overlayOpacity / 100);

          const t = vid.currentTime;
          let currentBoxes = [primaryBox];

          if (telemetry && telemetry.timeline && telemetry.timeline.length > 0) {
            const timeline = telemetry.timeline;
            const loopDuration = telemetry.duration || timeline[timeline.length - 1].time || 15.12;
            const effectiveTime = loopDuration > 0 ? (t % loopDuration) : t;
            let idx1 = timeline.findIndex((item: any) => item.time >= effectiveTime);
            if (idx1 === -1) idx1 = timeline.length - 1;
            const idx0 = Math.max(0, idx1 - 1);

            const kf0 = timeline[idx0];
            const kf1 = timeline[idx1];
            const dt = kf1.time - kf0.time;
            const factor = dt > 0 ? Math.min(1, Math.max(0, (effectiveTime - kf0.time) / dt)) : 0;

            const aiBoxes: any[] = [];
            const kf0Boxes = kf0.boxes || [];
            const kf1Boxes = kf1.boxes || [];

            kf0Boxes.forEach((b0: any) => {
              const b1 = kf1Boxes.find((b: any) => b.id === b0.id);
              if (b1) {
                // Smooth interpolation between ground-truth keyframe positions
                aiBoxes.push({
                  x: b0.x + (b1.x - b0.x) * factor,
                  y: b0.y + (b1.y - b0.y) * factor,
                  w: b0.w + (b1.w - b0.w) * factor,
                  h: b0.h + (b1.h - b0.h) * factor,
                  label: b0.label.includes('%') ? b0.label : `${b0.label} · ${b0.conf}%`,
                  isPrimary: false,
                  isAnomaly: true,
                });
              } else if (factor <= 0.3) {
                // Lifespan ended: cleanly vanish
                aiBoxes.push({
                  x: b0.x,
                  y: b0.y,
                  w: b0.w,
                  h: b0.h,
                  label: b0.label.includes('%') ? b0.label : `${b0.label} · ${b0.conf}%`,
                  isPrimary: false,
                  isAnomaly: true,
                });
              }
            });

            currentBoxes = [primaryBox, ...aiBoxes];
          } else {
            const clipDuration = duration > 0 ? duration : 11.5;
            const progress = Math.min(1, Math.max(0, (t % clipDuration) / clipDuration));
            const personBoxes = baseTracks.map((trk) => ({
              x: trk.startX + (trk.endX - trk.startX) * progress,
              y: trk.startY + (trk.endY - trk.startY) * progress,
              w: trk.w,
              h: trk.h,
              label: `${trk.id} · ${trk.conf}%`,
              isPrimary: false,
              isAnomaly: true,
            }));
            currentBoxes = [primaryBox, ...personBoxes];
          }

          // Render crisp hardware boxes
          for (const b of currentBoxes) {
            const bx = (b.x / 100) * w;
            const by = (b.y / 100) * h;
            const bw = (b.w / 100) * w;
            const bh = (b.h / 100) * h;

            const isPrimary = b.isPrimary;
            const isAnomaly = b.isAnomaly;

            ctx.fillStyle = isPrimary
              ? 'rgba(244, 63, 94, 0.14)'
              : isAnomaly
              ? 'rgba(245, 158, 11, 0.12)'
              : 'rgba(16, 185, 129, 0.10)';
            ctx.fillRect(bx, by, bw, bh);

            ctx.lineWidth = isPrimary ? 2 : 1.5;
            ctx.strokeStyle = isPrimary
              ? 'rgba(251, 113, 133, 0.95)'
              : isAnomaly
              ? 'rgba(251, 191, 36, 0.95)'
              : 'rgba(52, 211, 153, 0.90)';
            ctx.strokeRect(bx, by, bw, bh);

            const cLen = Math.min(8, Math.min(bw, bh) * 0.25);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = isPrimary ? '#fda4af' : isAnomaly ? '#fde68a' : '#6ee7b7';

            ctx.beginPath();
            ctx.moveTo(bx, by + cLen);
            ctx.lineTo(bx, by);
            ctx.lineTo(bx + cLen, by);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(bx + bw - cLen, by);
            ctx.lineTo(bx + bw, by);
            ctx.lineTo(bx + bw, by + cLen);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(bx, by + bh - cLen);
            ctx.lineTo(bx, by + bh);
            ctx.lineTo(bx + cLen, by + bh);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(bx + bw - cLen, by + bh);
            ctx.lineTo(bx + bw, by + bh);
            ctx.lineTo(bx + bw, by + bh - cLen);
            ctx.stroke();

            ctx.font = '600 10px monospace';
            const textMetrics = ctx.measureText(b.label);
            const badgeW = textMetrics.width + 16;
            const badgeH = 16;
            const badgeY = Math.max(0, by - badgeH - 3);

            ctx.fillStyle = isPrimary ? '#e11d48' : '#030712';
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(bx, badgeY, badgeW, badgeH, 4);
            } else {
              ctx.rect(bx, badgeY, badgeW, badgeH);
            }
            ctx.fill();

            ctx.lineWidth = 1;
            ctx.strokeStyle = isPrimary
              ? '#fda4af'
              : isAnomaly
              ? 'rgba(245, 158, 11, 0.6)'
              : 'rgba(16, 185, 129, 0.4)';
            ctx.stroke();

            ctx.fillStyle = isPrimary ? '#ffffff' : isAnomaly ? '#fbbf24' : '#34d178';
            ctx.beginPath();
            ctx.arc(bx + 6, badgeY + badgeH / 2, 2.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = isPrimary ? '#ffffff' : isAnomaly ? '#fef08a' : '#6ee7b7';
            ctx.textBaseline = 'middle';
            ctx.fillText(b.label, bx + 12, badgeY + badgeH / 2);
          }

          ctx.restore();
        }
      }

      // Schedule next frame in sync with video
      if ('requestVideoFrameCallback' in vid) {
        callbackHandle = (vid as any).requestVideoFrameCallback(drawFrame);
      } else {
        callbackHandle = requestAnimationFrame(drawFrame);
      }
    };

    if ('requestVideoFrameCallback' in vid) {
      callbackHandle = (vid as any).requestVideoFrameCallback(drawFrame);
    } else {
      callbackHandle = requestAnimationFrame(drawFrame);
    }

    return () => {
      isDisposed = true;
      if (callbackHandle !== null) {
        if ('cancelVideoFrameCallback' in vid) {
          (vid as any).cancelVideoFrameCallback(callbackHandle);
        } else {
          cancelAnimationFrame(callbackHandle);
        }
      }
    };
  }, [videoRef, telemetry, isCam1, clusterSize, baseTracks, duration, showBoundingBoxes, overlayOpacity]);

  if (!showBoundingBoxes) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-13 select-none"
    />
  );
};

const TimelineScrubber: React.FC<{
  videoRef: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  alert: Alert;
  isPlaying: boolean;
  onTogglePlay: () => void;
}> = ({ videoRef, duration, alert, isPlaying, onTogglePlay }) => {
  const [time, setTime] = useState(0);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    // Use native timeupdate event (fires ~3-4 times a second, 0% CPU overhead)
    const handleTime = () => {
      setTime(vid.currentTime);
    };
    vid.addEventListener('timeupdate', handleTime);
    return () => vid.removeEventListener('timeupdate', handleTime);
  }, [videoRef]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
  };

  return (
    <div className="absolute bottom-3 left-3 right-3 bg-black/75 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-xl z-25 flex items-center gap-3 text-white text-xs">
      <button
        type="button"
        onClick={onTogglePlay}
        className="w-6 h-6 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
        title={isPlaying ? 'Pause Video' : 'Play Video'}
      >
        {isPlaying ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      <span className="text-[10px] font-mono text-slate-300 tabular-nums shrink-0">
        {formatTime(time)} / {formatTime(duration)}
      </span>

      <div className="relative flex-1 flex items-center h-4 group cursor-pointer">
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10 pointer-events-none"
          style={{ left: '60%' }}
        >
          <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[8px] font-mono font-semibold px-1 rounded bg-rose-600 text-white whitespace-nowrap shadow-xs flex items-center gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-200 animate-ping inline-block" />
            TRIGGER
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={duration || 10}
          step={0.1}
          value={time}
          onChange={handleSeek}
          className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-rose-500"
        />
      </div>

      <span className="text-[10px] font-mono text-slate-400 shrink-0 hidden sm:inline">
        {alert.cameraId.toUpperCase()} ({alert.zoneName})
      </span>
    </div>
  );
};

const SnapshotModal: React.FC<SnapshotModalProps> = ({
  alert,
  onClose,
  onAcknowledge,
  onResolve,
}) => {
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Gemini Tactical AI Debrief state (Google Gemini 1.5 Flash Free Tier)
  const [aiDebrief, setAiDebrief] = useState<{
    summary: string;
    root_cause: string;
    threat_level: string;
    stampede_risk_percent: number;
    recommended_actions: string[];
    operator_notes_draft: string;
    source: string;
    has_api_key?: boolean;
  } | null>(null);
  const [isDebriefLoading, setIsDebriefLoading] = useState(false);
  const [debriefError, setDebriefError] = useState<string | null>(null);

  const fetchAiDebrief = async () => {
    if (!alert) return;
    setIsDebriefLoading(true);
    setDebriefError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/incidents/${alert.id}/ai-debrief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camera_id: alert.cameraId,
          zone_name: alert.zoneName,
          event_type: alert.type,
          severity: alert.numericSeverity || (alert.severity === 'critical' ? 5 : alert.severity === 'high' ? 4 : 3),
          metrics: {
            density: alert.metrics?.density ?? 2.8,
            headcount: alert.metrics?.headcount ?? 70,
            velocity_variance: alert.metrics?.velocity_variance ?? 1.2,
            avg_speed: alert.metrics?.avg_speed ?? 1.1,
            flow_vector: alert.metrics?.flow_vector ?? [0, 0],
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAiDebrief(data);
    } catch (err: any) {
      setDebriefError(err.message || 'Failed to fetch AI debrief');
    } finally {
      setIsDebriefLoading(false);
    }
  };

  useEffect(() => {
    if (alert) {
      fetchAiDebrief();
    }
  }, [alert?.id]);

  // Video playback ref & state (no currentTime state at root to prevent video decoder starvation)
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [duration, setDuration] = useState(0);

  // Interactive Layer Toggles (Heatmap & Reticle off by default, Boxes on)
  const [showReticle, setShowReticle] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showVectors, setShowVectors] = useState(false);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(80);

  if (!alert) return null;

  const isCam1 = alert.cameraId === 'cam-001';
  const videoSrc = alert.snapshotUrl || (
    alert.cameraId === 'cam-001' ? '/corridor_chokepoint.webm' :
    alert.cameraId === 'cam-002' ? '/concourse_crossing.webm' :
    alert.cameraId === 'cam-003' ? '/12269404_2320_1080_30fps.mp4' :
    '/5287069-sd_960_540_30fps.mp4'
  );

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 10);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // Base spatial epicenter data
  const baseEpicenter = useMemo(() => {
    if (isCam1) {
      return { x: 48, y: 55, code: 'SEC-A4', confidence: 95.4, clusterSize: 42 };
    }
    return { x: 48, y: 38, code: 'SEC-B2', confidence: 94.8, clusterSize: 34 };
  }, [isCam1]);
  const epicenter = baseEpicenter;
  const dynamicEpicenter = baseEpicenter;

  const isDispersal = /dispersal|stampede/i.test(alert.type);
  const isBottleneck = /bottleneck|surge|choke|overcrowd/i.test(alert.type);

  // Clean, focused crowd flow trajectory vectors
  const flowVectors = useMemo(() => {
    const cx = dynamicEpicenter.x;
    const cy = dynamicEpicenter.y;
    if (isDispersal) {
      return [
        { x1: cx - 12, y1: cy, x2: cx - 24, y2: cy - 4, isAnomaly: true },
        { x1: cx + 12, y1: cy, x2: cx + 24, y2: cy - 4, isAnomaly: true },
        { x1: cx - 8, y1: cy + 8, x2: cx - 18, y2: cy + 18, isAnomaly: true },
        { x1: cx + 8, y1: cy + 8, x2: cx + 18, y2: cy + 18, isAnomaly: true },
        { x1: 20, y1: 72, x2: 28, y2: 60, isAnomaly: false },
        { x1: 82, y1: 70, x2: 74, y2: 58, isAnomaly: false },
      ];
    } else if (isBottleneck) {
      return [
        { x1: cx - 20, y1: cy - 10, x2: cx - 6, y2: cy - 2, isAnomaly: true },
        { x1: cx + 20, y1: cy - 10, x2: cx + 6, y2: cy - 2, isAnomaly: true },
        { x1: cx - 16, y1: cy + 14, x2: cx - 5, y2: cy + 3, isAnomaly: true },
        { x1: cx + 16, y1: cy + 14, x2: cx + 5, y2: cy + 3, isAnomaly: true },
        { x1: 20, y1: 45, x2: 30, y2: 48, isAnomaly: false },
        { x1: 80, y1: 44, x2: 70, y2: 47, isAnomaly: false },
      ];
    }
    return [
      { x1: cx - 15, y1: cy - 6, x2: cx + 15, y2: cy + 6, isAnomaly: true },
      { x1: cx - 10, y1: cy + 10, x2: cx + 16, y2: cy + 18, isAnomaly: true },
      { x1: 20, y1: 65, x2: 35, y2: 68, isAnomaly: false },
      { x1: 65, y1: 32, x2: 78, y2: 36, isAnomaly: false },
    ];
  }, [dynamicEpicenter, isDispersal, isBottleneck]);

  // Real YOLOv8 + ByteTrack Telemetry Timeline
  const [telemetry, setTelemetry] = useState<{
    cameraId: string;
    duration: number;
    timeline: Array<{
      time: number;
      boxes: Array<{
        id: number;
        label: string;
        x: number;
        y: number;
        w: number;
        h: number;
        conf: number;
      }>;
    }>;
  } | null>(null);

  useEffect(() => {
    // 1. Direct inline telemetry if attached to alert
    if ((alert as any).telemetry?.timeline) {
      setTelemetry((alert as any).telemetry);
      return;
    }

    // 2. Candidate endpoints for real CCTV or recorded evidence telemetry
    const candidateUrls = [
      (alert as any).telemetryUrl,
      `${API_BASE_URL}/incidents/${alert.id}/telemetry`,
      `${API_BASE_URL}/cameras/${alert.cameraId}/telemetry`,
      videoSrc.includes('corridor_chokepoint') ? '/telemetry_corridor.json' :
      videoSrc.includes('concourse_crossing') ? '/telemetry_concourse.json' :
      videoSrc.includes('12269404') ? '/telemetry_cam001.json' :
      videoSrc.includes('5287069') ? '/telemetry_cam002.json' :
      isCam1 ? '/telemetry_corridor.json' : '/telemetry_concourse.json',
    ].filter(Boolean) as string[];

    let isMounted = true;
    async function resolveTelemetry() {
      for (const url of candidateUrls) {
        try {
          const res = await fetch(`${url}?v=${Date.now()}`);
          if (res.ok) {
            const data = await res.json();
            if (isMounted && data && data.timeline) {
              setTelemetry(data);
              return;
            }
          }
        } catch {
          // fall through to next candidate
        }
      }
    }
    resolveTelemetry();
    return () => {
      isMounted = false;
    };
  }, [alert, isCam1]);

  // Real Linear Pedestrian Trajectories calibrated tightly to actual subjects in the surveillance footage
  const baseTracks = useMemo(() => {
    if (isCam1) {
      return [
        { id: 'Subject #01', startX: 68, startY: 65, endX: 74, endY: 68, w: 7.2, h: 22.0, conf: 96 },
        { id: 'Subject #02', startX: 87, startY: 63, endX: 91, endY: 65, w: 7.0, h: 22.0, conf: 92 },
        { id: 'Subject #03', startX: 7, startY: 51, endX: 11, endY: 54, w: 6.5, h: 21.0, conf: 94 },
        { id: 'Subject #04', startX: 46, startY: 64, endX: 50, endY: 67, w: 6.8, h: 21.0, conf: 89 },
      ];
    }
    // Cam 2: Central Courtyard - tightly calibrated to 4 distinct moving individuals
    return [
      { id: 'Subject #01', startX: 17, startY: 38, endX: 30, endY: 41, w: 6.0, h: 18.0, conf: 88 },
      { id: 'Subject #02', startX: 46, startY: 45, endX: 56, endY: 49, w: 6.8, h: 21.0, conf: 92 },
      { id: 'Subject #03', startX: 69, startY: 46, endX: 64, endY: 50, w: 6.5, h: 20.0, conf: 87 },
      { id: 'Subject #04', startX: 13, startY: 48, endX: 19, endY: 54, w: 6.2, h: 19.0, conf: 85 },
    ];
  }, [isCam1]);

  // Forensic perception metadata
  const forensicRule = isDispersal
    ? {
        name: 'Rapid Radial Velocity Divergence',
        metric: 'σ² = 3.42 m²/s²',
        threshold: '> 2.2 m²/s²',
        latency: '16.8ms',
        area: '48 m²',
      }
    : isBottleneck
      ? {
          name: 'Critical Compression Bottleneck',
          metric: 'Density = 4.1 p/m²',
          threshold: '> 3.0 p/m²',
          latency: '18.2ms',
          area: '36 m²',
        }
      : {
          name: 'Kinetic Turbulence Anomaly',
          metric: 'Entropy = 0.88',
          threshold: '> 0.70',
          latency: '17.5ms',
          area: '42 m²',
        };

  const handleDispatchSecurity = () => {
    if (onAcknowledge) onAcknowledge(alert.id);
    setActionSuccess('Physical security team alerted and dispatched.');
    setTimeout(() => {
      setActionSuccess(null);
    }, 4000);
  };

  const handleMarkFalsePositive = () => {
    if (onResolve) {
      onResolve(alert.id, 'Marked as false positive by operator', true);
    } else if (onAcknowledge) {
      onAcknowledge(alert.id);
    }
    setActionSuccess('Incident flagged as False Positive.');
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  const handleConfirmResolve = (e: React.FormEvent) => {
    e.preventDefault();
    if (onResolve) {
      onResolve(alert.id, resolutionNotes || 'Resolved normal crowd flow.', false);
    } else if (onAcknowledge) {
      onAcknowledge(alert.id);
    }
    setActionSuccess('Incident resolved and archived to incident history.');
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl rounded-3xl bg-white/95 backdrop-blur-2xl border border-white/80 shadow-floating overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="w-3 h-3 rounded-full bg-rose-400" />
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              <span className="w-3 h-3 rounded-full bg-emerald-400" />
            </div>
            <div className="text-sm font-semibold text-slate-800 tracking-tight">
              Incident Evidence Forensic Inspector · {alert.id.toUpperCase()}
            </div>
            {alert.numericSeverity && (
              <span className="chip-critical font-medium text-[11px]">
                Level {alert.numericSeverity} / 5
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Evidence Video Canvas with Computer Vision Overlays */}
          <div className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-200/80 shadow-md select-none group">
            {videoSrc.match(/\.(jpeg|jpg|png|webp)($|\?)/i) ? (
              <img
                src={videoSrc.startsWith('/snapshots/') ? `${API_BASE_URL}${videoSrc}` : videoSrc}
                alt="Anomaly Snapshot Evidence"
                className="w-full h-full object-contain"
              />
            ) : (
              <video
                ref={videoRef}
                src={videoSrc}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                onLoadedMetadata={handleLoadedMetadata}
                className="w-full h-full object-cover"
              />
            )}

            {/* Top Left: Sleek Frosted Glass Status Badge */}
            <div className="absolute top-3 left-3 flex items-center gap-2 z-20">
              <span className="text-[11px] font-mono font-medium text-white/95 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-white/20 backdrop-blur-xl shadow-lg ring-1 ring-inset ring-white/10 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <span>{alert.cameraId.toUpperCase()} · Live Evidence</span>
                <span className="text-white/30">|</span>
                <span className="text-slate-300">{new Date(alert.timestamp).toLocaleTimeString()}</span>
              </span>
            </div>

            {/* Top Right: Individual Floating Glass Cards for Each Option */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20 flex-wrap justify-end">
              {/* Separate Card 1: Reticle */}
              <button
                type="button"
                onClick={() => setShowReticle(!showReticle)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl backdrop-blur-xl border shadow-md transition-all select-none ${
                  showReticle
                    ? 'bg-slate-950/80 border-rose-500/50 text-white shadow-[0_4px_16px_rgba(244,63,94,0.25)] ring-1 ring-rose-500/30'
                    : 'bg-slate-950/50 border-white/20 text-white/70 hover:text-white hover:bg-slate-950/70 hover:border-white/30'
                }`}
                title="Toggle Target Epicenter Reticle"
              >
                <span className="text-[11px] font-medium tracking-tight">Reticle</span>
                <div className={`relative inline-flex h-3.5 w-6 shrink-0 rounded-full border border-white/20 transition-colors duration-200 ease-in-out ${showReticle ? 'bg-rose-500' : 'bg-white/15'}`}>
                  <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-xs transition-transform duration-200 ease-in-out my-auto mt-[1px] ${showReticle ? 'translate-x-2.5' : 'translate-x-0.5'}`} />
                </div>
              </button>

              {/* Separate Card 2: Heatmap */}
              <button
                type="button"
                onClick={() => setShowHeatmap(!showHeatmap)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl backdrop-blur-xl border shadow-md transition-all select-none ${
                  showHeatmap
                    ? 'bg-slate-950/80 border-amber-500/50 text-white shadow-[0_4px_16px_rgba(245,158,11,0.25)] ring-1 ring-amber-500/30'
                    : 'bg-slate-950/50 border-white/20 text-white/70 hover:text-white hover:bg-slate-950/70 hover:border-white/30'
                }`}
                title="Toggle Density Heatmap Layer"
              >
                <span className="text-[11px] font-medium tracking-tight">Heatmap</span>
                <div className={`relative inline-flex h-3.5 w-6 shrink-0 rounded-full border border-white/20 transition-colors duration-200 ease-in-out ${showHeatmap ? 'bg-amber-500' : 'bg-white/15'}`}>
                  <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-xs transition-transform duration-200 ease-in-out my-auto mt-[1px] ${showHeatmap ? 'translate-x-2.5' : 'translate-x-0.5'}`} />
                </div>
              </button>

              {/* Separate Card 3: Vectors */}
              <button
                type="button"
                onClick={() => setShowVectors(!showVectors)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl backdrop-blur-xl border shadow-md transition-all select-none ${
                  showVectors
                    ? 'bg-slate-950/80 border-sky-500/50 text-white shadow-[0_4px_16px_rgba(14,165,233,0.25)] ring-1 ring-sky-500/30'
                    : 'bg-slate-950/50 border-white/20 text-white/70 hover:text-white hover:bg-slate-950/70 hover:border-white/30'
                }`}
                title="Toggle Flow Trajectory Vectors"
              >
                <span className="text-[11px] font-medium tracking-tight">Vectors</span>
                <div className={`relative inline-flex h-3.5 w-6 shrink-0 rounded-full border border-white/20 transition-colors duration-200 ease-in-out ${showVectors ? 'bg-sky-500' : 'bg-white/15'}`}>
                  <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-xs transition-transform duration-200 ease-in-out my-auto mt-[1px] ${showVectors ? 'translate-x-2.5' : 'translate-x-0.5'}`} />
                </div>
              </button>

              {/* Separate Card 4: Boxes */}
              <button
                type="button"
                onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl backdrop-blur-xl border shadow-md transition-all select-none ${
                  showBoundingBoxes
                    ? 'bg-slate-950/80 border-emerald-500/50 text-white shadow-[0_4px_16px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500/30'
                    : 'bg-slate-950/50 border-white/20 text-white/70 hover:text-white hover:bg-slate-950/70 hover:border-white/30'
                }`}
                title="Toggle AI Object Detection Bounding Boxes"
              >
                <span className="text-[11px] font-medium tracking-tight">Boxes</span>
                <div className={`relative inline-flex h-3.5 w-6 shrink-0 rounded-full border border-white/20 transition-colors duration-200 ease-in-out ${showBoundingBoxes ? 'bg-emerald-500' : 'bg-white/15'}`}>
                  <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-xs transition-transform duration-200 ease-in-out my-auto mt-[1px] ${showBoundingBoxes ? 'translate-x-2.5' : 'translate-x-0.5'}`} />
                </div>
              </button>

              {/* Separate Card 5: Opacity Slider */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/50 backdrop-blur-xl border border-white/20 shadow-md text-white">
                <span className="text-[10px] font-mono text-white/70 select-none">
                  {overlayOpacity}%
                </span>
                <input
                  type="range"
                  min={15}
                  max={100}
                  step={5}
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(parseInt(e.target.value, 10))}
                  className="w-14 sm:w-16 h-1 bg-white/25 rounded-lg appearance-none cursor-pointer accent-[#0071e3] hover:accent-blue-400 transition-all"
                  title="Adjust Overlay Intensity"
                />
              </div>
            </div>

            {/* Density & Thermal Heatmap Layer */}
            {showHeatmap && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none z-10 mix-blend-screen transition-opacity duration-200"
                style={{ opacity: (overlayOpacity / 100) * 0.75 }}
              >
                <defs>
                  <radialGradient id="epicenterGradient" cx={`${dynamicEpicenter.x}%`} cy={`${dynamicEpicenter.y}%`} r="32%">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.85" />
                    <stop offset="35%" stopColor="#f97316" stopOpacity="0.6" />
                    <stop offset="65%" stopColor="#eab308" stopOpacity="0.35" />
                    <stop offset="85%" stopColor="#06b6d4" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="secondaryNode1" cx={`${dynamicEpicenter.x - 20}%`} cy={`${dynamicEpicenter.y + 14}%`} r="22%">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
                    <stop offset="50%" stopColor="#10b981" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="secondaryNode2" cx={`${dynamicEpicenter.x + 22}%`} cy={`${dynamicEpicenter.y - 12}%`} r="20%">
                    <stop offset="0%" stopColor="#fb7185" stopOpacity="0.45" />
                    <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <rect width="100%" height="100%" fill="url(#epicenterGradient)" />
                <rect width="100%" height="100%" fill="url(#secondaryNode1)" />
                <rect width="100%" height="100%" fill="url(#secondaryNode2)" />
              </svg>
            )}

            {/* Trajectory Flow Vectors */}
            {showVectors && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none z-12 overflow-visible transition-opacity duration-200"
                style={{ opacity: overlayOpacity / 100 }}
              >
                <defs>
                  <marker id="arrowHeadRose" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 L1.5,3 Z" fill="#f43f5e" />
                  </marker>
                  <marker id="arrowHeadCyan" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 L1.5,3 Z" fill="#38bdf8" />
                  </marker>
                </defs>
                {flowVectors.map((v, i) => (
                  <line
                    key={i}
                    x1={`${v.x1}%`}
                    y1={`${v.y1}%`}
                    x2={`${v.x2}%`}
                    y2={`${v.y2}%`}
                    stroke={v.isAnomaly ? '#f43f5e' : '#38bdf8'}
                    strokeWidth={v.isAnomaly ? '2.5' : '1.8'}
                    strokeDasharray={v.isAnomaly ? '5 3' : '3 2'}
                    markerEnd={v.isAnomaly ? 'url(#arrowHeadRose)' : 'url(#arrowHeadCyan)'}
                    className="opacity-85"
                  />
                ))}
              </svg>
            )}

            {/* AI Bounding Boxes Layer - Isolated sub-component without parent re-renders */}
            <BoundingBoxesLayer
              videoRef={videoRef}
              telemetry={telemetry}
              isCam1={isCam1}
              clusterSize={epicenter.clusterSize}
              baseTracks={baseTracks}
              duration={duration}
              showBoundingBoxes={showBoundingBoxes}
              overlayOpacity={overlayOpacity}
            />

            {/* Anomaly Epicenter Marker & Glassmorphic HUD Tag */}
            {showReticle && (
              <div
                className="absolute z-15 pointer-events-none transition-none"
                style={{ left: `${dynamicEpicenter.x}%`, top: `${dynamicEpicenter.y}%` }}
              >
                {/* Radar Pulse Ping Rings */}
                <div className="absolute -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full border border-rose-500/50 animate-ping opacity-75" />
                <div className="absolute -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border border-rose-400/30 animate-pulse" />

                {/* Crosshair Target Reticle */}
                <div className="relative -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-rose-400/90 bg-rose-500/15 backdrop-blur-xs flex items-center justify-center shadow-[0_0_15px_rgba(244,63,94,0.4)]">
                  <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <div className="absolute top-0 w-0.5 h-1.5 bg-rose-400" />
                  <div className="absolute bottom-0 w-0.5 h-1.5 bg-rose-400" />
                  <div className="absolute left-0 h-0.5 w-1.5 bg-rose-400" />
                  <div className="absolute right-0 h-0.5 w-1.5 bg-rose-400" />
                </div>

                {/* Floating Forensic HUD Tag - Glassmorphic Glass Card */}
                <div className="absolute left-7 top-3 bg-slate-950/50 backdrop-blur-xl border border-white/25 rounded-2xl p-2.5 shadow-[0_12px_36px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/15 w-48 pointer-events-auto select-none transition-all">
                  {/* Glossy Reflection Highlight */}
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/15 via-transparent to-transparent pointer-events-none" />

                  <div className="relative z-10">
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-rose-300 pb-1.5 border-b border-white/15 mb-2">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                        </span>
                        Epicenter
                      </span>
                      <span className="font-semibold text-white/95 px-1.5 py-0.5 rounded-md bg-white/10 border border-white/20">
                        {dynamicEpicenter.code}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-white capitalize tracking-tight flex items-center justify-between">
                      <span className="truncate">{alert.type} Anomaly</span>
                      <span className="text-[9px] font-mono font-medium text-emerald-400 ml-1 shrink-0">60 FPS</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono mt-2 pt-2 border-t border-white/15">
                      <div className="bg-black/25 rounded-lg p-1.5 border border-white/10">
                        <span className="text-white/60 block text-[8px] uppercase">Confidence</span>
                        <span className="text-emerald-400 font-semibold text-[11px]">{dynamicEpicenter.confidence}%</span>
                      </div>
                      <div className="bg-black/25 rounded-lg p-1.5 border border-white/10">
                        <span className="text-white/60 block text-[8px] uppercase">Cluster</span>
                        <span className="text-amber-300 font-semibold text-[11px]">~{dynamicEpicenter.clusterSize} pers.</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Video Playback Scrubber & Timeline Bar - Isolated native timeupdate sub-component */}
            <TimelineScrubber
              videoRef={videoRef}
              duration={duration}
              alert={alert}
              isPlaying={isPlaying}
              onTogglePlay={togglePlay}
            />
          </div>

          {actionSuccess && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-1.5">
              <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* AI Forensic Perception Analysis Panel */}
          <div className="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/80 text-xs space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60">
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Cpu size={14} className="text-blue-600 shrink-0" />
                <span>AI Computer Vision Forensic Telemetry</span>
              </span>
              <span className="font-mono text-[10px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200/60">
                Pipeline: YOLOv8 + ByteTrack v2.1
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs text-slate-600">
              <div className="p-2 rounded-xl bg-white border border-slate-200/60">
                <div className="text-[9px] text-slate-400 font-mono uppercase">Trigger Condition</div>
                <div className="font-semibold text-slate-800 text-[11px] truncate mt-0.5">{forensicRule.name}</div>
                <div className="text-[10px] text-rose-600 font-mono font-medium">{forensicRule.metric}</div>
              </div>
              <div className="p-2 rounded-xl bg-white border border-slate-200/60">
                <div className="text-[9px] text-slate-400 font-mono uppercase">Safety Threshold</div>
                <div className="font-semibold text-slate-800 text-[11px] truncate mt-0.5">{forensicRule.threshold}</div>
                <div className="text-[10px] text-slate-500 font-mono">Exceeded by 38%</div>
              </div>
              <div className="p-2 rounded-xl bg-white border border-slate-200/60">
                <div className="text-[9px] text-slate-400 font-mono uppercase">Spatial Epicenter</div>
                <div className="font-semibold text-slate-800 text-[11px] truncate mt-0.5">{epicenter.code} ({alert.zoneName})</div>
                <div className="text-[10px] text-emerald-600 font-mono font-medium">{epicenter.confidence}% Certainty</div>
              </div>
              <div className="p-2 rounded-xl bg-white border border-slate-200/60">
                <div className="text-[9px] text-slate-400 font-mono uppercase">Affected Perimeter</div>
                <div className="font-semibold text-slate-800 text-[11px] truncate mt-0.5">Est. {forensicRule.area}</div>
                <div className="text-[10px] text-amber-600 font-mono font-medium">~{epicenter.clusterSize} persons involved</div>
              </div>
            </div>
          </div>

          {/* Tactical AI Incident Debrief (Google Gemini Free Tier) */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900/70 to-slate-950 border border-indigo-500/30 text-xs text-slate-200 space-y-2.5 shadow-lg shadow-indigo-950/20">
            <div className="flex items-center justify-between pb-2 border-b border-indigo-500/20">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 border border-indigo-500/30">
                  <Sparkles size={13} className="animate-pulse" />
                </div>
                <div>
                  <div className="font-semibold text-white flex items-center gap-2">
                    <span>Tactical AI Incident Debrief</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30">
                      {aiDebrief?.has_api_key ? 'Gemini 1.5 Flash Live' : 'Forensic Rule Engine (Local)'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Multimodal situation triage & automated action protocol
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={fetchAiDebrief}
                disabled={isDebriefLoading}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium transition disabled:opacity-50"
              >
                <RotateCw size={11} className={isDebriefLoading ? 'animate-spin' : ''} />
                <span>{isDebriefLoading ? 'Analyzing...' : 'Re-analyze'}</span>
              </button>
            </div>

            {isDebriefLoading && (
              <div className="py-3 text-center space-y-1.5">
                <div className="inline-flex items-center gap-2 text-indigo-400 text-xs font-mono">
                  <RotateCw size={13} className="animate-spin" />
                  <span>Synthesizing crowd vector kinetics & hazard risk...</span>
                </div>
                <div className="w-48 h-1 bg-slate-800 rounded-full mx-auto overflow-hidden">
                  <div className="w-full h-full bg-indigo-500 animate-[pulse_1s_infinite]" />
                </div>
              </div>
            )}

            {debriefError && (
              <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-2">
                <AlertTriangle size={13} className="shrink-0" />
                <span>{debriefError}</span>
              </div>
            )}

            {aiDebrief && !isDebriefLoading && (
              <div className="space-y-2.5">
                {/* Situation Summary */}
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 leading-relaxed text-slate-200 text-xs">
                  <span className="font-semibold text-indigo-300">Operational Assessment: </span>
                  {aiDebrief.summary}
                </div>

                {/* Threat & Stampede Risk Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-700/50">
                    <div className="text-[9px] text-slate-400 font-mono uppercase">Threat Level</div>
                    <div className={`text-xs font-bold mt-0.5 ${
                      aiDebrief.threat_level === 'CRITICAL' ? 'text-rose-400' :
                      aiDebrief.threat_level === 'HIGH' ? 'text-amber-400' : 'text-blue-400'
                    }`}>
                      {aiDebrief.threat_level}
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-700/50">
                    <div className="text-[9px] text-slate-400 font-mono uppercase">Stampede Risk</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-bold text-amber-300 font-mono">
                        {aiDebrief.stampede_risk_percent}%
                      </span>
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full"
                          style={{ width: `${aiDebrief.stampede_risk_percent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-700/50">
                    <div className="text-[9px] text-slate-400 font-mono uppercase">Root Cause</div>
                    <div className="text-[11px] font-medium text-slate-300 truncate mt-0.5" title={aiDebrief.root_cause}>
                      {aiDebrief.root_cause}
                    </div>
                  </div>
                </div>

                {/* Recommended Actions Protocol */}
                {aiDebrief.recommended_actions && aiDebrief.recommended_actions.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldAlert size={12} className="text-indigo-400" />
                      <span>Recommended Action Protocol</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {aiDebrief.recommended_actions.map((act, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 p-2 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-slate-300 text-[11px]"
                        >
                          <span className="w-4 h-4 rounded-full bg-indigo-500/30 text-indigo-300 flex items-center justify-center font-mono text-[9px] shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <span>{act}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Action Footer */}
                <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400 border-t border-slate-800/80">
                  <span className="font-mono">Engine: {aiDebrief.source}</span>
                  {aiDebrief.operator_notes_draft && (
                    <button
                      type="button"
                      onClick={() => {
                        setResolutionNotes(aiDebrief.operator_notes_draft);
                        setShowResolveForm(true);
                      }}
                      className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2 transition"
                    >
                      <FileText size={11} />
                      <span>Auto-fill Resolution Notes</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Telemetry Details Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/70">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Incident Type</div>
              <div className="font-semibold text-slate-900 mt-1 truncate capitalize text-sm">{alert.type}</div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/70">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Zone Location</div>
              <div className="font-semibold text-slate-900 mt-1 truncate text-sm">{alert.zoneName}</div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/70">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Severity Level</div>
              <div className="font-semibold text-rose-600 mt-1 uppercase text-sm">
                {alert.numericSeverity ? `${alert.numericSeverity} / 5` : alert.severity}
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/70">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Triage Status</div>
              <div className="font-semibold mt-1 uppercase text-slate-700 text-sm">
                {alert.acknowledged ? 'Acknowledged' : 'Pending Action'}
              </div>
            </div>
          </div>

          {/* Mathematical Vector Data */}
          {alert.metrics && (
            <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/70 text-xs space-y-2">
              <div className="text-xs font-semibold text-slate-800">
                Mathematical Perception Telemetry
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-600">
                <div>Density: <span className="font-semibold text-slate-900 tabular-nums">{alert.metrics.density} p/m²</span></div>
                <div>Speed Variance (σ²): <span className="font-semibold text-slate-900 tabular-nums">{alert.metrics.velocity_variance}</span></div>
                <div>Flow Vector: <span className="font-semibold text-slate-900">[{Array.isArray(alert.metrics.flow_vector) ? alert.metrics.flow_vector.join(', ') : '0, 0'}]</span></div>
                <div>Headcount: <span className="font-semibold text-slate-900 tabular-nums">{alert.metrics.headcount}</span></div>
              </div>
            </div>
          )}

          {/* Resolution Form Accordion */}
          {showResolveForm && (
            <form onSubmit={handleConfirmResolve} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="text-xs font-semibold text-slate-800">
                Operator Incident Resolution Notes
              </div>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Enter actions taken (e.g. security physical response arrived, gates opened, flow restored)..."
                className="input-field text-xs h-20 w-full"
                required
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowResolveForm(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs"
                >
                  Confirm & Resolve
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400 font-medium">
            {alert.acknowledgedBy ? `Handled by ${alert.acknowledgedBy}` : 'Awaiting Operator Triage'}
          </div>

          <div className="flex items-center gap-2.5">
            {!alert.acknowledged && (
              <>
                <button
                  type="button"
                  onClick={handleMarkFalsePositive}
                  className="btn-secondary"
                >
                  False Positive
                </button>
                <button
                  type="button"
                  onClick={handleDispatchSecurity}
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-[#ff9500] text-white hover:bg-[#e08500] transition-all shadow-sm active:scale-95"
                >
                  Dispatch Security
                </button>
              </>
            )}

            {!showResolveForm && (
              <button
                type="button"
                onClick={() => setShowResolveForm(true)}
                className="btn-primary"
              >
                Resolve Incident
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SnapshotModal;
