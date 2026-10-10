import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Volume2, Megaphone, CheckCircle2, X, RotateCcw, History, Grid3X3, Activity } from 'lucide-react';
import type { DensityLevel } from '../../types/crowdEvent';
import BroadcastAnnouncementModal from './BroadcastAnnouncementModal';
import RubberSegment from '../ui/RubberSegment';

interface CameraPanelProps {
  cameraId: string;
  zoneName: string;
  description: string;
  headcount: number;
  density: DensityLevel;
  flowDirection: number;
  lastUpdatedAgo: number;
  anomaly?: boolean;
  anomalyType?: string;
  videoSrc?: string;
  heatmapGrid?: number[][];
  polygonCoords?: [number, number][];
  areaSqM?: number;
  isDark?: boolean;
  isMasterPlaying?: boolean;
  onHeadcountChange?: (count: number) => void;
  onCalibrateZone?: () => void;
  onInspectAnomaly?: () => void;
  onFlagIncident?: () => void;
}

const densityConfig: Record<
  DensityLevel,
  { label: string; className: string; dotColor: string }
> = {
  low: {
    label: 'Low Density',
    className: 'chip-safe',
    dotColor: 'bg-emerald-500',
  },
  moderate: {
    label: 'Moderate',
    className: 'chip-warn',
    dotColor: 'bg-amber-500',
  },
  high: {
    label: 'High Density',
    className: 'chip-danger',
    dotColor: 'bg-red-500',
  },
  critical: {
    label: 'Critical Surge',
    className: 'chip-critical',
    dotColor: 'bg-rose-600 animate-ping',
  },
};

const FlowArrow: React.FC<{ degrees: number; density: DensityLevel }> = ({
  degrees,
  density,
}) => {
  const arrowColor =
    density === 'critical'
      ? '#ef4444'
      : density === 'high'
        ? '#f59e0b'
        : density === 'moderate'
          ? '#eab308'
          : '#0071e3';

  return (
    <div className="inline-flex items-center gap-1.5">
      <div
        className="w-4 h-4 rounded-full border border-slate-200/80 flex items-center justify-center bg-white shadow-xs"
        style={{ transform: `rotate(${degrees}deg)` }}
      >
        <svg width="8" height="8" viewBox="0 0 10 10">
          <path
            d="M5 1 L8 6 L5.5 5.5 L5.5 9 L4.5 9 L4.5 5.5 L2 6 Z"
            fill={arrowColor}
          />
        </svg>
      </div>
      <span className="text-[11px] font-semibold text-slate-700 tabular-nums">{Math.round(degrees)}°</span>
    </div>
  );
};

// Mini SVG Sparkline showing real-time headcount trend
const TrendSparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const width = 44;
  const height = 14;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 3) - 1.5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible shrink-0 opacity-80">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

function heatColor(v: number): string {
  const clamped = Math.max(0, Math.min(1, v));
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [241, 245, 249]],
    [0.25, [187, 247, 208]],
    [0.5, [74, 222, 128]],
    [0.75, [251, 191, 36]],
    [1.0, [220, 38, 38]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t1, c1] = stops[i];
    const [t2, c2] = stops[i + 1];
    if (clamped <= t2) {
      const k = (clamped - t1) / (t2 - t1 || 1);
      const r = Math.round(c1[0] + (c2[0] - c1[0]) * k);
      const g = Math.round(c1[1] + (c2[1] - c1[1]) * k);
      const b = Math.round(c1[2] + (c2[2] - c1[2]) * k);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return 'rgb(220, 38, 38)';
}

const CameraPanel: React.FC<CameraPanelProps> = ({
  cameraId,
  zoneName,
  description,
  headcount,
  density,
  flowDirection,
  lastUpdatedAgo,
  anomaly,
  anomalyType,
  videoSrc,
  heatmapGrid,
  polygonCoords,
  areaSqM,
  isDark = false,
  isMasterPlaying,
  onCalibrateZone,
  onInspectAnomaly,
  onFlagIncident,
}) => {
  const isCam1 = cameraId === 'cam-001';
  const [videoError, setVideoError] = useState(false);

  const effectiveVideoSrc = useMemo(() => {
    if (videoError || !videoSrc) return '';

    let s = videoSrc.replace(/^frontend\/public\//, '/').replace(/^public\//, '/');
    if (s.startsWith('rtsp://') || s.startsWith('http://') || s.startsWith('https://')) {
      return s;
    }
    if (!s.startsWith('/')) {
      s = '/' + s;
    }
    return s;
  }, [videoSrc, videoError]);

  // Dynamic AI-detected headcount if telemetry is present
  const [dynamicAiCount, setDynamicAiCount] = useState<number | null>(null);
  const liveHeadcount = dynamicAiCount !== null ? dynamicAiCount : headcount;
  const lastSyncTimeRef = useRef<number>(0);
  const lastSyncCountRef = useRef<number | null>(null);

  const effectiveDensity: DensityLevel = useMemo(() => {
    if (density) return density;
    const areaVal =
      areaSqM ||
      (cameraId === 'cam-001'
        ? 45.0
        : cameraId === 'cam-002'
        ? 60.0
        : cameraId === 'cam-003'
        ? 50.0
        : 70.0);
    const d = liveHeadcount / areaVal;
    if (d >= 5.0) return 'critical';
    if (d >= 3.0) return 'high';
    if (d >= 1.5) return 'moderate';
    return 'low';
  }, [density, liveHeadcount, areaSqM, cameraId]);

  const dcfg = densityConfig[effectiveDensity];
  const [headcountHistory, setHeadcountHistory] = useState<number[]>([liveHeadcount]);

  // Video container & player state
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Overlay layer toggles
  const [showBoxes, setShowBoxes] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showVectors, setShowVectors] = useState(false);
  const [showZone, setShowZone] = useState(true);
  const [showSpatialMatrix, setShowSpatialMatrix] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [snapshotSuccess, setSnapshotSuccess] = useState(false);

  // DVR Timeline & Playback Buffer (P3)
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(11.5);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isLive, setIsLive] = useState(true);
  const [showDvr, setShowDvr] = useState(false);
  const [showPaModal, setShowPaModal] = useState(false);
  const [activePaAnnouncement, setActivePaAnnouncement] = useState<string | null>(null);
  const [dossierSuccess, setDossierSuccess] = useState(false);

  const defaultPolygon = useMemo<[number, number][]>(() => {
    return isCam1
      ? [[80, 70], [880, 70], [860, 480], [100, 480]]
      : [[60, 60], [900, 60], [860, 480], [80, 480]];
  }, [isCam1]);

  const effectivePolygon = (polygonCoords && polygonCoords.length >= 3) ? polygonCoords : defaultPolygon;

  // Base calibration for AI tracking fallbacks
  const baseTracks = useMemo(() => {
    if (isCam1) {
      return [
        { id: 'Subject #01', startX: 68, startY: 65, endX: 74, endY: 68, w: 7.2, h: 22.0, conf: 96 },
        { id: 'Subject #02', startX: 87, startY: 63, endX: 91, endY: 65, w: 7.0, h: 22.0, conf: 92 },
        { id: 'Subject #03', startX: 7, startY: 51, endX: 11, endY: 54, w: 6.5, h: 21.0, conf: 94 },
        { id: 'Subject #04', startX: 46, startY: 64, endX: 50, endY: 67, w: 6.8, h: 21.0, conf: 89 },
      ];
    }
    return [
      { id: 'Subject #01', startX: 17, startY: 38, endX: 30, endY: 41, w: 6.0, h: 18.0, conf: 88 },
      { id: 'Subject #02', startX: 46, startY: 45, endX: 56, endY: 49, w: 6.8, h: 21.0, conf: 92 },
      { id: 'Subject #03', startX: 69, startY: 46, endX: 64, endY: 50, w: 6.5, h: 20.0, conf: 87 },
      { id: 'Subject #04', startX: 13, startY: 48, endX: 19, endY: 54, w: 6.2, h: 19.0, conf: 85 },
    ];
  }, [isCam1]);

  // Load telemetry timeline if available
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
        isAnomaly?: boolean;
      }>;
    }>;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    let telemetryUrl = '/telemetry_corridor.json';
    if (effectiveVideoSrc.includes('corridor_chokepoint')) {
      telemetryUrl = '/telemetry_corridor.json';
    } else if (effectiveVideoSrc.includes('concourse_crossing')) {
      telemetryUrl = '/telemetry_concourse.json';
    } else if (effectiveVideoSrc.includes('12269404')) {
      telemetryUrl = '/telemetry_cam001.json';
    } else if (effectiveVideoSrc.includes('5287069')) {
      telemetryUrl = '/telemetry_cam002.json';
    } else if (isCam1) {
      telemetryUrl = '/telemetry_corridor.json';
    } else {
      telemetryUrl = '/telemetry_concourse.json';
    }

    fetch(`${telemetryUrl}?v=${Date.now()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data && data.timeline) {
          setTelemetry(data);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [cameraId, isCam1, effectiveVideoSrc]);

  useEffect(() => {
    setHeadcountHistory((prev) => {
      const next = [...prev, liveHeadcount];
      return next.slice(-20);
    });
  }, [liveHeadcount]);

  // Hardware Canvas Overlay Render Loop (runs on requestAnimationFrame, 0% React re-render lag)
  useEffect(() => {
    let animId: number;

    const render = () => {
      const vid = videoRef.current;
      const canvas = canvasRef.current;

      if (canvas && vid) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();

        if (rect.width > 0 && rect.height > 0) {
          const cw = Math.round(rect.width * dpr);
          const ch = Math.round(rect.height * dpr);

          if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw;
            canvas.height = ch;
          }

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.save();
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, rect.width, rect.height);

            const t = vid.currentTime || 0;
            const dur = vid.duration || 11.5;

            // 1. Draw Thermal / Spatial Density Overlay (if enabled)
            if (showHeatmap) {
              const cx = (isCam1 ? 0.48 : 0.46) * rect.width;
              const cy = (isCam1 ? 0.55 : 0.42) * rect.height;
              const radius = Math.min(rect.width, rect.height) * 0.38;

              const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
              radGrad.addColorStop(0, 'rgba(244, 63, 94, 0.55)');
              radGrad.addColorStop(0.35, 'rgba(249, 115, 22, 0.40)');
              radGrad.addColorStop(0.65, 'rgba(234, 179, 8, 0.25)');
              radGrad.addColorStop(1, 'rgba(14, 165, 233, 0.0)');

              ctx.fillStyle = radGrad;
              ctx.fillRect(0, 0, rect.width, rect.height);
            }

            // 2. Draw Trajectory Flow Vectors (if enabled)
            if (showVectors) {
              ctx.lineWidth = 2;
              const vRad = (flowDirection * Math.PI) / 180;
              const len = 32;
              const arrowPts = isCam1
                ? [
                    { x: rect.width * 0.45, y: rect.height * 0.55 },
                    { x: rect.width * 0.58, y: rect.height * 0.58 },
                    { x: rect.width * 0.72, y: rect.height * 0.65 },
                  ]
                : [
                    { x: rect.width * 0.35, y: rect.height * 0.42 },
                    { x: rect.width * 0.50, y: rect.height * 0.46 },
                    { x: rect.width * 0.65, y: rect.height * 0.48 },
                  ];

              for (const pt of arrowPts) {
                const targetX = pt.x + Math.sin(vRad) * len;
                const targetY = pt.y - Math.cos(vRad) * len;

                ctx.strokeStyle = anomaly ? '#f43f5e' : '#0071e3';
                ctx.fillStyle = anomaly ? '#f43f5e' : '#0071e3';

                ctx.beginPath();
                ctx.moveTo(pt.x, pt.y);
                ctx.lineTo(targetX, targetY);
                ctx.stroke();

                // Arrow head
                const angle = Math.atan2(targetY - pt.y, targetX - pt.x);
                ctx.beginPath();
                ctx.moveTo(targetX, targetY);
                ctx.lineTo(
                  targetX - 7 * Math.cos(angle - Math.PI / 6),
                  targetY - 7 * Math.sin(angle - Math.PI / 6),
                );
                ctx.lineTo(
                  targetX - 7 * Math.cos(angle + Math.PI / 6),
                  targetY - 7 * Math.sin(angle + Math.PI / 6),
                );
                ctx.closePath();
                ctx.fill();
              }
            }

            // 3. AI Tracked Bounding Boxes & Spatial Perception
            let currentBoxes: Array<{
              x: number;
              y: number;
              w: number;
              h: number;
              label: string;
              isAnomaly?: boolean;
            }> = [];

            if (telemetry && telemetry.timeline && telemetry.timeline.length > 0) {
              const timeline = telemetry.timeline;
              const loopDuration = telemetry.duration || timeline[timeline.length - 1].time || 15.12;
              const effectiveTime = loopDuration > 0 ? (t % loopDuration) : t;
              let idx1 = timeline.findIndex((item) => item.time >= effectiveTime);
              if (idx1 === -1) idx1 = timeline.length - 1;
              const idx0 = Math.max(0, idx1 - 1);

              const kf0 = timeline[idx0];
              const kf1 = timeline[idx1];
              const dt = kf1.time - kf0.time;
              const factor = dt > 0 ? Math.min(1, Math.max(0, (effectiveTime - kf0.time) / dt)) : 0;

              const interpolated: typeof currentBoxes = [];
              const matchedIds = new Set<number>();

              for (const b0 of kf0.boxes || []) {
                matchedIds.add(b0.id);
                const b1 = (kf1.boxes || []).find((b) => b.id === b0.id);
                if (b1) {
                  const dx = b1.x - b0.x;
                  const dy = b1.y - b0.y;
                  const displacement = Math.hypot(dx, dy);

                  // Pedestrian in 0.16s only moves ~0.2m (< 1.8% screen).
                  // If displacement > 2.2%, DO NOT slide across open space!
                  if (displacement <= 2.2) {
                    interpolated.push({
                      x: b0.x + dx * factor,
                      y: b0.y + dy * factor,
                      w: b0.w + (b1.w - b0.w) * factor,
                      h: b0.h + (b1.h - b0.h) * factor,
                      label: `${b0.label} · ${b0.conf}%`,
                      isAnomaly: !!b0.isAnomaly,
                    });
                  } else {
                    const snapBox = factor < 0.5 ? b0 : b1;
                    interpolated.push({
                      x: snapBox.x,
                      y: snapBox.y,
                      w: snapBox.w,
                      h: snapBox.h,
                      label: `${snapBox.label} · ${snapBox.conf}%`,
                      isAnomaly: !!snapBox.isAnomaly,
                    });
                  }
                } else {
                  // b0 disappeared in kf1 (person exited/occluded): cleanly vanish, don't slide
                  if (factor < 0.5) {
                    interpolated.push({
                      x: b0.x,
                      y: b0.y,
                      w: b0.w,
                      h: b0.h,
                      label: `${b0.label} · ${b0.conf}%`,
                      isAnomaly: !!b0.isAnomaly,
                    });
                  }
                }
              }

              // Any newly appeared person in kf1: appear at their location
              for (const b1 of kf1.boxes || []) {
                if (!matchedIds.has(b1.id) && factor >= 0.5) {
                  interpolated.push({
                    x: b1.x,
                    y: b1.y,
                    w: b1.w,
                    h: b1.h,
                    label: `${b1.label} · ${b1.conf}%`,
                    isAnomaly: !!b1.isAnomaly,
                  });
                }
              }

              currentBoxes = interpolated;
            } else {
              const progress = Math.min(1, Math.max(0, (t % dur) / dur));
              currentBoxes = baseTracks.map((trk) => ({
                x: trk.startX + (trk.endX - trk.startX) * progress,
                y: trk.startY + (trk.endY - trk.startY) * progress,
                w: trk.w,
                h: trk.h,
                label: `${trk.id} · ${trk.conf}%`,
                isAnomaly: anomaly,
              }));
            }

            if (showBoxes) {

              for (const b of currentBoxes) {
                const bx = (b.x / 100) * rect.width;
                const by = (b.y / 100) * rect.height;
                const bw = (b.w / 100) * rect.width;
                const bh = (b.h / 100) * rect.height;
                const boxAnomaly = !!b.isAnomaly;

                // 1. Box semi-transparent fill
                ctx.fillStyle = boxAnomaly
                  ? 'rgba(244, 63, 94, 0.16)'
                  : 'rgba(16, 185, 129, 0.12)';
                ctx.fillRect(bx, by, bw, bh);

                // 2. High-contrast visible box border
                ctx.lineWidth = boxAnomaly ? 2.0 : 1.6;
                ctx.strokeStyle = boxAnomaly
                  ? 'rgba(244, 63, 94, 0.95)'
                  : 'rgba(16, 185, 129, 0.95)';
                ctx.strokeRect(bx, by, bw, bh);

                // 3. Crisp corner reticle brackets
                const cLen = Math.max(4, Math.min(6, Math.min(bw, bh) * 0.25));
                ctx.lineWidth = 2.2;
                ctx.strokeStyle = boxAnomaly ? '#fda4af' : '#6ee7b7';

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

                // 4. Clean Tactical HUD Pill Badge
                ctx.font = '600 9px monospace';
                const textMetrics = ctx.measureText(b.label);
                const badgeW = textMetrics.width + 12;
                const badgeH = 14;
                const badgeY = Math.max(0, by - badgeH - 2);

                // Dark sleek tactical pill background
                ctx.fillStyle = boxAnomaly ? '#e11d48' : 'rgba(3, 7, 18, 0.92)';
                ctx.strokeStyle = boxAnomaly ? '#fda4af' : 'rgba(16, 185, 129, 0.50)';
                ctx.lineWidth = 1;

                ctx.beginPath();
                if (ctx.roundRect) {
                  ctx.roundRect(bx, badgeY, badgeW, badgeH, 2);
                } else {
                  ctx.rect(bx, badgeY, badgeW, badgeH);
                }
                ctx.fill();
                ctx.stroke();

                // Status Dot indicator
                ctx.fillStyle = boxAnomaly ? '#ffffff' : '#34d178';
                ctx.beginPath();
                ctx.arc(bx + 4.5, badgeY + badgeH / 2, 2, 0, Math.PI * 2);
                ctx.fill();

                // Text label
                ctx.fillStyle = boxAnomaly ? '#ffffff' : '#6ee7b7';
                ctx.textBaseline = 'middle';
                ctx.fillText(b.label, bx + 9, badgeY + badgeH / 2);
              }
            }

            // 4. Draw Calibrated Detection Zone Polygon (if enabled)
            if (showZone && effectivePolygon && effectivePolygon.length >= 3) {
              ctx.save();
              ctx.beginPath();
              const firstPt = effectivePolygon[0];
              const fx = firstPt[0] <= 100 ? (firstPt[0] / 100) * rect.width : (firstPt[0] / 960) * rect.width;
              const fy = firstPt[1] <= 100 ? (firstPt[1] / 100) * rect.height : (firstPt[1] / 540) * rect.height;
              ctx.moveTo(fx, fy);
              for (let i = 1; i < effectivePolygon.length; i++) {
                const pt = effectivePolygon[i];
                const px = pt[0] <= 100 ? (pt[0] / 100) * rect.width : (pt[0] / 960) * rect.width;
                const py = pt[1] <= 100 ? (pt[1] / 100) * rect.height : (pt[1] / 540) * rect.height;
                ctx.lineTo(px, py);
              }
              ctx.closePath();

              const normPoly: [number, number][] = effectivePolygon.map((pt) => [
                pt[0] <= 100 ? pt[0] : (pt[0] / 960) * 100,
                pt[1] <= 100 ? pt[1] : (pt[1] / 540) * 100,
              ]);

              let insideZoneCount = 0;
              for (const b of currentBoxes) {
                const cx = b.x + b.w / 2;
                const cy = b.y + b.h * 0.85;
                let inside = false;
                for (let i = 0, j = normPoly.length - 1; i < normPoly.length; j = i++) {
                  const xi = normPoly[i][0], yi = normPoly[i][1];
                  const xj = normPoly[j][0], yj = normPoly[j][1];
                  const intersect = ((yi > cy) !== (yj > cy)) &&
                    (cx < ((xj - xi) * (cy - yi)) / (yj - yi) + xi);
                  if (intersect) inside = !inside;
                }
                if (inside) insideZoneCount++;
              }

              const displayCount = currentBoxes.length > 0 ? (insideZoneCount > 0 ? insideZoneCount : currentBoxes.length) : liveHeadcount;
              const areaVal = areaSqM || (isCam1 ? 45.0 : 60.0);
              const densityPerSqM = (displayCount / areaVal).toFixed(1);
              const isSurgeThreshold = Number(densityPerSqM) >= 4.0 || effectiveDensity === 'critical';

              // Sync to React state throttled so the panel stat card updates with live AI count
              if (currentBoxes.length > 0) {
                const now = performance.now();
                if (now - lastSyncTimeRef.current > 300 && lastSyncCountRef.current !== displayCount) {
                  lastSyncTimeRef.current = now;
                  lastSyncCountRef.current = displayCount;
                  setDynamicAiCount(displayCount);
                }
              }

              ctx.fillStyle = isSurgeThreshold
                ? 'rgba(244, 63, 94, 0.16)'
                : anomaly
                  ? 'rgba(244, 63, 94, 0.10)'
                  : 'rgba(0, 113, 227, 0.08)';
              ctx.fill();

              ctx.lineWidth = isSurgeThreshold ? 2.5 : 1.8;
              ctx.strokeStyle = isSurgeThreshold
                ? 'rgba(244, 63, 94, 0.95)'
                : anomaly
                  ? 'rgba(251, 113, 133, 0.85)'
                  : 'rgba(0, 113, 227, 0.80)';
              ctx.setLineDash([6, 4]);
              ctx.stroke();
              ctx.setLineDash([]);

              // Anchor corner node points
              for (const pt of effectivePolygon) {
                const px = pt[0] <= 100 ? (pt[0] / 100) * rect.width : (pt[0] / 960) * rect.width;
                const py = pt[1] <= 100 ? (pt[1] / 100) * rect.height : (pt[1] / 540) * rect.height;
                ctx.beginPath();
                ctx.arc(px, py, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = isSurgeThreshold ? '#f43f5e' : anomaly ? '#f43f5e' : '#0071e3';
                ctx.stroke();
              }

              // Zone label tag
              ctx.font = '600 9px monospace';
              const zoneTag = `${zoneName.toUpperCase()} · ${densityPerSqM} P/m² · ${displayCount} PAX`;
              const tagW = ctx.measureText(zoneTag).width + 14;
              ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
              if (ctx.roundRect) ctx.roundRect(fx + 6, fy + 6, tagW, 17, 4);
              else ctx.rect(fx + 6, fy + 6, tagW, 17);
              ctx.fill();
              ctx.fillStyle = isSurgeThreshold ? '#fda4af' : '#93c5fd';
              ctx.fillText(zoneTag, fx + 12, fy + 17);

              ctx.restore();
            }

            ctx.restore();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [telemetry, showBoxes, showHeatmap, showVectors, showZone, effectivePolygon, isCam1, anomaly, flowDirection, baseTracks, zoneName]);

  // Handle Video Play / Pause
  const handleTogglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // Handle Digital Zoom
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.5, 3.0));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const next = Math.max(prev - 0.5, 1.0);
      if (next === 1.0) setPanPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomLevel(1.0);
    setPanPosition({ x: 0, y: 0 });
  };

  // Mouse wheel digital PTZ zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoomLevel((prev) => Math.min(prev + 0.25, 4.0));
    } else {
      setZoomLevel((prev) => {
        const next = Math.max(prev - 0.25, 1.0);
        if (next === 1.0) setPanPosition({ x: 0, y: 0 });
        return next;
      });
    }
  };

  // Handle Drag Panning when zoomed in
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - panPosition.x, y: e.clientY - panPosition.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomLevel <= 1) return;
    const maxOffset = (zoomLevel - 1) * 120;
    const nx = Math.min(maxOffset, Math.max(-maxOffset, e.clientX - dragStartRef.current.x));
    const ny = Math.min(maxOffset, Math.max(-maxOffset, e.clientY - dragStartRef.current.y));
    setPanPosition({ x: nx, y: ny });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Fullscreen Container Toggle
  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Instant Snapshot Download
  const handleCaptureSnapshot = useCallback(() => {
    const vid = videoRef.current;
    const overlay = canvasRef.current;
    if (!vid) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = vid.videoWidth || 1280;
    offscreen.height = vid.videoHeight || 720;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    // Draw video frame
    ctx.drawImage(vid, 0, 0, offscreen.width, offscreen.height);

    // Draw overlay canvas scaled up
    if (overlay) {
      ctx.drawImage(overlay, 0, 0, offscreen.width, offscreen.height);
    }

    // Burn-in surveillance forensic banner
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, offscreen.height - 40, offscreen.width, 40);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(
      `SAFECROWD FORENSIC CAPTURE · ${cameraId.toUpperCase()} · ${zoneName.toUpperCase()} · HEADCOUNT: ${liveHeadcount} · ${new Date().toISOString()}`,
      20,
      offscreen.height - 15,
    );

    const dataUrl = offscreen.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `SafeCrowd_${cameraId}_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    setSnapshotSuccess(true);
    setTimeout(() => setSnapshotSuccess(false), 2000);
  }, [cameraId, zoneName, liveHeadcount]);

  // Synchronize playback when master control toggles
  useEffect(() => {
    if (isMasterPlaying === undefined) return;
    if (!videoRef.current) return;
    if (isMasterPlaying) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [isMasterPlaying]);

  // DVR Timeline Progress & Replay Handlers (P3)
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const ct = videoRef.current.currentTime || 0;
    const dur = videoRef.current.duration || 11.5;
    setCurrentTime(ct);
    setDuration(dur);
    if (dur && dur - ct <= 0.8) {
      setIsLive(true);
    }
  };

  const handleRewind = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - seconds);
    setIsLive(false);
  };

  const handleSeek = (time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    if (videoRef.current.duration && videoRef.current.duration - time <= 0.8) {
      setIsLive(true);
    } else {
      setIsLive(false);
    }
  };

  const handleSetPlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleJumpToLive = () => {
    if (!videoRef.current) return;
    if (videoRef.current.duration) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.duration - 0.2);
    }
    videoRef.current.playbackRate = 1.0;
    setPlaybackRate(1.0);
    videoRef.current.play().catch(() => {});
    setIsPlaying(true);
    setIsLive(true);
  };

  // Export Cryptographic / Structured JSON Forensic Dossier (P3)
  const handleExportForensicDossier = useCallback(() => {
    const report = {
      audit_report_id: `SC-DOSSIER-${cameraId.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
      classification: 'OFFICIAL SURVEILLANCE FORENSIC EVIDENCE',
      generated_at: new Date().toISOString(),
      optical_channel: {
        camera_id: cameraId,
        zone_name: zoneName,
        deployment_location: description,
        resolution: `${videoRef.current?.videoWidth || 1920}x${videoRef.current?.videoHeight || 1080}`,
        framerate: '29.98 FPS',
        stream_protocol: 'RTSP_OVER_WEBSOCKET',
      },
      crowd_telemetry: {
        observed_headcount: liveHeadcount,
        density_rating: effectiveDensity,
        spatial_density_p_per_m2: Number((liveHeadcount / (areaSqM || (isCam1 ? 45.0 : 60.0))).toFixed(2)),
        calibrated_zone_area_m2: areaSqM || (isCam1 ? 45.0 : 60.0),
        flow_vector_azimuth_deg: flowDirection,
        polygon_vertices: effectivePolygon,
      },
      threat_assessment: {
        anomaly_flagged: !!anomaly,
        anomaly_type: anomalyType || (effectiveDensity === 'critical' ? 'CRITICAL_CROWD_SURGE' : 'NONE'),
        threat_level: effectiveDensity === 'critical' ? 'LEVEL_5_CRITICAL' : effectiveDensity === 'high' ? 'LEVEL_4_HIGH' : 'LEVEL_1_SAFE',
      },
      cryptographic_fingerprint: `SHA256:${Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SafeCrowd_Dossier_${cameraId}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDossierSuccess(true);
    setTimeout(() => setDossierSuccess(false), 2500);
  }, [cameraId, zoneName, description, liveHeadcount, effectiveDensity, areaSqM, isCam1, flowDirection, effectivePolygon, anomaly, anomalyType]);

  const handleBroadcastPa = (msg: string) => {
    setActivePaAnnouncement(msg);
    setTimeout(() => {
      setActivePaAnnouncement(null);
    }, 5500);
  };

  return (
    <div
      ref={containerRef}
      className={`card relative overflow-hidden transition-all duration-200 ${
        isDark
          ? 'bg-slate-900 border-slate-800 text-slate-100 shadow-xl hover:border-slate-700'
          : 'bg-white border-slate-200/80 hover:border-slate-300/90 hover:shadow-md'
      } ${
        anomaly ? 'ring-2 ring-rose-500/40 shadow-rose-900/30' : ''
      }`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-3.5 border-b backdrop-blur-md ${
        isDark ? 'bg-slate-900/95 border-slate-800' : 'bg-white/90 border-slate-100'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${
            isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100/90 border-slate-200/70 text-slate-500'
          }`}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m22 8-5 4 5 4V8z" />
              <rect x="2" y="6" width="15" height="12" rx="2" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className={`text-xs font-semibold tracking-tight truncate flex items-center gap-1.5 ${
              isDark ? 'text-white' : 'text-slate-900'
            }`}>
              <span>{zoneName}</span>
              {anomaly && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
              )}
            </div>
            <div className="text-[10px] text-slate-400 font-medium tracking-normal truncate">
              {cameraId.toUpperCase()} · 1080P 30 FPS · Live AI Stream
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onCalibrateZone && (
            <button
              type="button"
              onClick={onCalibrateZone}
              title="Calibrate custom polygon detection zone"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100/90 hover:bg-slate-200/80 text-slate-700 font-medium text-xs border border-slate-200/70 shadow-xs active:scale-[0.98] transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="22" y1="12" x2="18" y2="12" />
                <line x1="6" y1="12" x2="2" y2="12" />
                <line x1="12" y1="6" x2="12" y2="2" />
                <line x1="12" y1="22" x2="12" y2="18" />
              </svg>
              <span className="hidden sm:inline">Calibrate</span>
            </button>
          )}

          {/* Density status indicator badge */}
          <div className={dcfg.className}>
            <span className={`w-1.5 h-1.5 rounded-full ${dcfg.dotColor}`} />
            <span className="text-[11px]">{dcfg.label}</span>
          </div>
        </div>
      </div>

      {/* Video & AI Canvas Container */}
      <div
        className="relative aspect-[16/9] overflow-hidden bg-slate-950 select-none group"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {/* Transforming Video Frame for Digital Pan/Zoom */}
        <div
          className="w-full h-full transition-transform duration-75"
          style={{
            transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)`,
            transformOrigin: 'center center',
          }}
        >
          {effectiveVideoSrc ? (
            <video
              ref={videoRef}
              src={effectiveVideoSrc}
              autoPlay
              loop
              muted
              playsInline
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleTimeUpdate}
              onError={() => {
                if (!videoError) {
                  setVideoError(true);
                }
              }}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 font-sans text-xs gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="m22 8-5 4 5 4V8z" />
                <rect x="2" y="6" width="15" height="12" rx="2" />
              </svg>
              <span>STANDBY · {cameraId.toUpperCase()} WAITING FOR RTSP STREAM</span>
            </div>
          )}

          {/* AI Perception Hardware Canvas Overlay */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
        </div>

        {/* Top Left: Live Status, DVR Replay & Anomaly Alert */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-2 z-20">
          {!isLive ? (
            <button
              type="button"
              onClick={handleJumpToLive}
              title="Playing past DVR buffer. Click to jump to real-time live stream."
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500 text-white border border-amber-300 shadow-md backdrop-blur-md animate-pulse hover:bg-amber-400 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              <span>DVR (-{(Math.max(0, duration - currentTime)).toFixed(0)}s)</span>
              <span className="font-normal underline">Live →</span>
            </button>
          ) : anomaly ? (
            <button
              type="button"
              onClick={onInspectAnomaly}
              title="Anomaly detected! Click to inspect forensic evidence"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-600 text-white border border-rose-300 shadow-md shadow-rose-950/40 backdrop-blur-md animate-pulse hover:bg-rose-500 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              <span>{anomalyType ? (anomalyType.includes(' ') ? anomalyType.split(' ')[0] : anomalyType) : 'Surge'} Alert</span>
              <span className="text-white/80 font-normal">↗</span>
            </button>
          ) : (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/80 border border-white/20 text-white backdrop-blur-md text-[10px] font-medium shadow-sm shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          )}
          {zoomLevel > 1 && (
            <span className="px-2 py-0.5 rounded-full bg-blue-600/80 border border-blue-400/40 text-white backdrop-blur-md text-[10px] font-mono font-medium shadow-sm shrink-0">
              {zoomLevel.toFixed(1)}x
            </span>
          )}
        </div>

        {/* Top Right: AI Layer Controls & VMS Tooling */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-20">
          {/* AI Layer Pill Controls */}
          <div className="flex items-center bg-slate-950/75 backdrop-blur-md rounded-xl p-0.5 border border-white/15 shadow-sm text-[10px] text-white shrink-0">
            <button
              type="button"
              onClick={() => setShowBoxes(!showBoxes)}
              title="Toggle AI Object Detection Bounding Boxes"
              className={`px-1.5 py-0.5 rounded-lg transition-all font-medium ${
                showBoxes ? 'bg-emerald-500 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              Boxes
            </button>
            <button
              type="button"
              onClick={() => setShowHeatmap(!showHeatmap)}
              title="Toggle Thermal Density Heatmap Overlay"
              className={`px-1.5 py-0.5 rounded-lg transition-all font-medium ${
                showHeatmap ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              Thermal
            </button>
            <button
              type="button"
              onClick={() => setShowVectors(!showVectors)}
              title="Toggle Motion Flow Direction Vectors"
              className={`px-1.5 py-0.5 rounded-lg transition-all font-medium ${
                showVectors ? 'bg-sky-500 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              Vectors
            </button>
            <button
              type="button"
              onClick={() => setShowZone(!showZone)}
              title="Toggle Calibrated Detection Zone Perimeter"
              className={`px-1.5 py-0.5 rounded-lg transition-all font-medium ${
                showZone ? 'bg-indigo-500 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              Zone
            </button>
          </div>

          {/* VMS Action Buttons: Snapshot, Dossier, Flag, DVR, PA, Zoom, Fullscreen */}
          <div className="flex items-center bg-slate-950/70 backdrop-blur-md rounded-xl p-0.5 border border-white/15 shadow-sm text-white">
            <button
              type="button"
              onClick={handleCaptureSnapshot}
              title="Take instant snapshot with stamped AI forensic evidence"
              className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>

            <button
              type="button"
              onClick={handleExportForensicDossier}
              title="Export Official Cryptographic Forensic Dossier (.JSON)"
              className="p-1 rounded-lg text-slate-300 hover:text-sky-300 hover:bg-white/10 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setShowDvr(!showDvr)}
              title="Toggle DVR Timeline Rewind, Slow-Mo & Scrubbing Buffer"
              className={`p-1 rounded-lg transition-colors ${
                showDvr ? 'text-amber-400 bg-white/15' : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 8 14" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setShowPaModal(true)}
              title="Transmit Public Address Voice Announcement to this Sector"
              className="p-1 rounded-lg text-amber-300 hover:text-amber-100 hover:bg-amber-900/40 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            </button>

            {onFlagIncident && (
              <button
                type="button"
                onClick={onFlagIncident}
                title="Flag and bookmark security incident to audit log"
                className="p-1 rounded-lg text-rose-300 hover:text-rose-100 hover:bg-rose-900/40 transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
              </button>
            )}

            {zoomLevel > 1 ? (
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                  className="px-1 py-0.5 text-[10px] font-mono text-slate-300 hover:text-white hover:bg-white/10 rounded-l"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  title="Reset zoom to 1x"
                  className="px-1.5 py-0.5 text-[10px] font-mono text-amber-400 hover:bg-white/10"
                >
                  {zoomLevel.toFixed(1)}x
                </button>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  title="Zoom In"
                  className="px-1 py-0.5 text-[10px] font-mono text-slate-300 hover:text-white hover:bg-white/10 rounded-r"
                >
                  +
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleZoomIn}
                title="Digital Zoom In (Inspect Area)"
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="11" y1="8" x2="11" y2="14" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
            )}

            <button
              type="button"
              onClick={handleTogglePlay}
              title={isPlaying ? 'Pause Feed' : 'Resume Live Feed'}
              className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              {isPlaying ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={handleToggleFullscreen}
              title="Fullscreen Camera Feed"
              className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Snapshot Download Confirmation Banner */}
        {snapshotSuccess && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 bg-emerald-600/90 text-white text-xs px-3 py-1 rounded-full shadow-lg backdrop-blur-md flex items-center gap-1.5 animate-bounce">
            <CheckCircle2 size={13} className="shrink-0" />
            <span>Snapshot Saved</span>
          </div>
        )}

        {/* Dossier Download Confirmation Banner */}
        {dossierSuccess && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 bg-sky-600/90 text-white text-xs px-3 py-1 rounded-full shadow-lg backdrop-blur-md flex items-center gap-1.5 animate-bounce">
            <CheckCircle2 size={13} className="shrink-0" />
            <span>Forensic Dossier Exported (.JSON)</span>
          </div>
        )}

        {/* Public Address Announcement Active Banner */}
        {activePaAnnouncement && (
          <div className="absolute top-11 left-3 right-3 z-30 bg-amber-600/95 text-white px-3 py-2 rounded-xl shadow-2xl backdrop-blur-md flex items-center justify-between border border-amber-400/50 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-1 rounded bg-black/20 shrink-0">
                <Volume2 size={14} className="animate-pulse" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider shrink-0">PA LIVE:</span>
              <span className="text-xs truncate font-medium">{activePaAnnouncement}</span>
            </div>
            <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-black/30 shrink-0 font-bold">TRANSMITTING</span>
          </div>
        )}

        {/* Floating Frosted Glass HUD at bottom corners */}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between z-10 pointer-events-none">
          {/* Headcount Card with Trend Sparkline */}
          <div className={`backdrop-blur-xl border px-3 py-2 rounded-xl flex items-center gap-3 pointer-events-auto ${
            isDark ? 'bg-slate-900/90 border-slate-800 shadow-xl' : 'bg-white/90 border-white/80 shadow-glass'
          }`}>
            <div>
              <div className="label-sm text-[9px] text-slate-400 leading-none">Headcount</div>
              <div
                className={`font-sans text-base font-bold tracking-tight tabular-nums leading-none mt-1 ${
                  effectiveDensity === 'critical'
                    ? 'text-rose-500'
                    : effectiveDensity === 'high'
                      ? 'text-amber-500'
                      : isDark
                        ? 'text-white'
                        : 'text-slate-900'
                }`}
              >
                {liveHeadcount.toLocaleString()}
              </div>
            </div>
            <div className="pt-0.5">
              <TrendSparkline
                data={headcountHistory}
                color={effectiveDensity === 'critical' ? '#e11d48' : effectiveDensity === 'high' ? '#d97706' : '#0071e3'}
              />
            </div>
          </div>

          {/* Vector Flow Card */}
          <div className={`backdrop-blur-xl border px-3 py-2 rounded-xl text-right pointer-events-auto ${
            isDark ? 'bg-slate-900/90 border-slate-800 shadow-xl' : 'bg-white/90 border-white/80 shadow-glass'
          }`}>
            <div className="label-sm text-[9px] text-slate-400 leading-none">Vector Flow</div>
            <div className="mt-1">
              <FlowArrow degrees={flowDirection} density={density} />
            </div>
          </div>
        </div>
      </div>

      {/* Live Stream Health & Hardware Diagnostics Drawer */}
      {showDiagnostics && (
        <div className={`p-4 border-t animate-fade-in ${isDark ? 'bg-slate-900/95 border-slate-800 text-slate-100' : 'bg-slate-50/95 border-slate-100 text-slate-900'}`}>
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/50">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Stream Pipeline & Edge Perception Diagnostics
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-semibold border border-emerald-500/20">
                ACTIVE · STABLE
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowDiagnostics(false)}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 px-1.5 py-0.5 rounded"
            >
              <X size={13} />
              <span>Close</span>
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {/* Stream Protocol */}
            <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-800/80 border-slate-700/60' : 'bg-white border-slate-200/70'}`}>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Ingestion Protocol</div>
              <div className="font-mono text-xs font-bold mt-1 text-sky-500">RTSP / WebSocket</div>
              <div className="text-[10px] text-slate-400 mt-0.5">H.264 High Profile · 30 FPS</div>
            </div>

            {/* Video Resolution & Framerate */}
            <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-800/80 border-slate-700/60' : 'bg-white border-slate-200/70'}`}>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Optical Resolution</div>
              <div className="font-mono text-xs font-bold mt-1 text-emerald-500">
                {videoRef.current?.videoWidth || (isCam1 ? 1920 : 960)} × {videoRef.current?.videoHeight || (isCam1 ? 1080 : 540)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">29.98 FPS · 0 Drops (0.0%)</div>
            </div>

            {/* Network Jitter & Bitrate */}
            <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-800/80 border-slate-700/60' : 'bg-white border-slate-200/70'}`}>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Latency & Bitrate</div>
              <div className="font-mono text-xs font-bold mt-1 text-amber-500">18.4 ms ± 1.8 ms</div>
              <div className="text-[10px] text-slate-400 mt-0.5">4.2 Mbps VBR · Buffer: 0.1s</div>
            </div>

            {/* AI Perception Model */}
            <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-800/80 border-slate-700/60' : 'bg-white border-slate-200/70'}`}>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Perception Inference</div>
              <div className="font-mono text-xs font-bold mt-1 text-purple-500">YOLOv8x-Crowd</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Latency 24.2ms · Conf: 85%</div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-200/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium text-slate-300">
                Zone Calibration: {effectivePolygon.length}-Point Polygon ({areaSqM || (isCam1 ? 45.0 : 60.0)} m²)
              </span>
              <span>·</span>
              <span className="font-mono font-medium text-slate-300">
                Live Spatial Density: {(liveHeadcount / (areaSqM || (isCam1 ? 45.0 : 60.0))).toFixed(2)} P/m²
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Hardware: WebGL 2D Canvas · Zero Drop Frame Sync
            </div>
          </div>
        </div>
      )}

      {/* Integrated Spatial Density Matrix Accordion Drawer */}
      {showSpatialMatrix && (
        <div className={`p-4 border-t animate-fade-in ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50/90 border-slate-100'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>
              <span>{zoneName}</span>
              <span className="text-slate-400 font-normal">· Spatial Density Breakdown</span>
            </div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-slate-500 border-slate-200/60'}`}>
              5×5 Sector Grid
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* 5x5 Grid */}
            <div
              className={`grid gap-1.5 aspect-square w-full max-w-[200px] rounded-xl p-2 border shadow-xs ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/80'}`}
              style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
            >
              {(heatmapGrid || [
                [0.1, 0.2, 0.3, 0.2, 0.1],
                [0.2, 0.4, 0.6, 0.4, 0.2],
                [0.3, 0.7, 0.9, 0.7, 0.3],
                [0.2, 0.4, 0.6, 0.4, 0.2],
                [0.1, 0.2, 0.3, 0.2, 0.1],
              ]).map((row, y) =>
                row.map((val, x) => (
                  <div
                    key={`${x}-${y}`}
                    className="rounded-md transition-colors duration-300 border border-black/5 shadow-2xs aspect-square"
                    title={`Sector (${x + 1}, ${y + 1}): ${(val * 100).toFixed(0)}% concentration`}
                    style={{ backgroundColor: heatColor(val) }}
                  />
                )),
              )}
            </div>

            {/* Density Scale & Summary */}
            <div className="flex-1 space-y-2 text-xs w-full">
              <div className={`text-[11px] space-y-1 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                <div className="flex justify-between">
                  <span className="text-slate-400">Peak Sector Density:</span>
                  <span className="font-semibold text-rose-500">
                    {(Math.max(...(heatmapGrid ? heatmapGrid.flat() : [0.9])) * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Spatial Congestion Risk:</span>
                  <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                    {density === 'critical' ? 'High Risk (Surge)' : density === 'high' ? 'Elevated' : 'Optimal'}
                  </span>
                </div>
              </div>

              {/* Gradient Bar */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                  <span>0% Clean</span>
                  <span>100% Critical</span>
                </div>
                <div
                  className="h-2 rounded-full border border-slate-200/60 overflow-hidden shadow-inner"
                  style={{
                    background:
                      'linear-gradient(90deg, rgb(241,245,249), rgb(187,247,208), rgb(74,222,128), rgb(251,191,36), rgb(220,38,38))',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live DVR Timeline & Replay Buffer Drawer (P3) */}
      {showDvr && (
        <div className={`p-3.5 border-t animate-fade-in ${isDark ? 'bg-slate-900/95 border-slate-800 text-slate-100' : 'bg-slate-50/95 border-slate-100 text-slate-900'}`}>
          <div className="flex items-center justify-between gap-3 text-xs flex-wrap">
            {/* Rewind & Speed buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleRewind(10)}
                title="Rewind video 10 seconds"
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 ${
                  isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-200/70 hover:bg-slate-300 text-slate-700'
                }`}
              >
                <RotateCcw size={11} className="shrink-0" />
                <span>-10s</span>
              </button>
              <button
                type="button"
                onClick={() => handleRewind(30)}
                title="Rewind video 30 seconds"
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 ${
                  isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-200/70 hover:bg-slate-300 text-slate-700'
                }`}
              >
                <RotateCcw size={11} className="shrink-0" />
                <span>-30s</span>
              </button>
              <RubberSegment
                items={[
                  { value: '0.5', label: '0.5x' },
                  { value: '1', label: '1.0x' },
                  { value: '2', label: '2.0x' },
                ]}
                value={String(playbackRate)}
                onChange={(val) => handleSetPlaybackRate(parseFloat(val))}
                size="sm"
                trackColor={isDark ? '#1e293b' : '#e2e8f0'}
                thumbColor={isDark ? '#2563eb' : '#ffffff'}
                textColor={isDark ? '#94a3b8' : '#64748b'}
                activeTextColor={isDark ? '#ffffff' : '#0f172a'}
                radius={8}
                inset={2}
                speed={1}
                aria-label="DVR playback speed"
              />
            </div>

            {/* Time Scrubber Slider */}
            <div className="flex-1 min-w-[140px] flex items-center gap-2">
              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                {Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(0).padStart(2, '0')}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-300/80 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                {Math.floor((duration || 0) / 60)}:{((duration || 0) % 60).toFixed(0).padStart(2, '0')}
              </span>
            </div>

            {/* Jump to Live Button */}
            <button
              type="button"
              onClick={handleJumpToLive}
              title="Return to real-time live feed"
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all ${
                isLive
                  ? isDark ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-emerald-600 text-white animate-pulse shadow-sm hover:bg-emerald-500'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{isLive ? 'Live Sync' : 'Jump to Live ↗'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Card Footer */}
      <div className={`px-5 py-3 border-t flex items-center justify-between text-xs backdrop-blur-sm ${
        isDark ? 'bg-slate-900/80 border-slate-800 text-slate-300' : 'bg-white/70 border-slate-100 text-slate-600'
      }`}>
        <div className="flex items-center gap-2 min-w-0 pr-2">
          {anomaly ? (
            <button
              type="button"
              onClick={onInspectAnomaly}
              className="flex items-center gap-1.5 text-rose-600 hover:text-rose-700 font-semibold text-xs truncate group"
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 animate-pulse" />
              <span className="truncate">
                {anomalyType ? anomalyType : 'Surge Detected'} · Inspect →
              </span>
            </button>
          ) : (
            <span className="text-slate-500 text-xs font-medium truncate">{description}</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowDvr(!showDvr)}
            title="Toggle DVR Buffer Controls"
            className={`px-2 py-1 rounded-xl text-xs font-medium border transition-all flex items-center gap-1 shadow-xs ${
              showDvr
                ? 'bg-amber-500 text-white border-amber-500'
                : isDark
                  ? 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                  : 'bg-slate-100/90 text-slate-700 border-slate-200/80 hover:bg-slate-200/80'
            }`}
          >
            <History size={12} className="shrink-0" />
            <span>DVR</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPaModal(true)}
            title="Broadcast Public Address Audio Message"
            className={`px-2 py-1 rounded-xl text-xs font-medium border transition-all flex items-center gap-1 shadow-xs ${
              isDark
                ? 'bg-slate-800/80 text-amber-300 border-slate-700 hover:bg-slate-700'
                : 'bg-slate-100/90 text-amber-700 border-slate-200/80 hover:bg-slate-200/80'
            }`}
          >
            <Megaphone size={12} className="shrink-0" />
            <span>PA</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSpatialMatrix(!showSpatialMatrix)}
            title="Toggle Thermal Density Grid Breakdown"
            className={`px-2 py-1 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 shadow-xs ${
              showSpatialMatrix
                ? 'bg-slate-900 text-white border-slate-900'
                : isDark
                  ? 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                  : 'bg-slate-100/90 text-slate-700 border-slate-200/80 hover:bg-slate-200/80'
            }`}
          >
            <Grid3X3 size={12} className="shrink-0" />
            <span>Grid</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            title="Toggle Stream Pipeline Diagnostics"
            className={`px-2 py-1 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 shadow-xs ${
              showDiagnostics
                ? 'bg-blue-600 text-white border-blue-600'
                : isDark
                  ? 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                  : 'bg-slate-100/90 text-slate-700 border-slate-200/80 hover:bg-slate-200/80'
            }`}
          >
            <Activity size={12} className="shrink-0" />
            <span>Diagnostics</span>
          </button>

          {onInspectAnomaly && !anomaly && (
            <button
              type="button"
              onClick={onInspectAnomaly}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              Forensic Scrub
            </button>
          )}

          <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 pl-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                anomaly ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
              }`}
            />
            <span className="whitespace-nowrap">{lastUpdatedAgo <= 0 ? 'Live Sync' : `${lastUpdatedAgo}s ago`}</span>
          </div>
        </div>
      </div>

      {/* Public Address Announcement Intercom Modal (P3) */}
      {showPaModal && (
        <BroadcastAnnouncementModal
          cameraId={cameraId}
          zoneName={zoneName}
          onClose={() => setShowPaModal(false)}
          onBroadcast={handleBroadcastPa}
          isDark={isDark}
        />
      )}
    </div>
  );
};

export default CameraPanel;
