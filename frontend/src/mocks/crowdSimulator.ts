import type {
  CrowdEvent,
  DensityLevel,
  Alert,
  AlertSeverity,
  Incident,
  CameraHeatmap,
  CameraState,
} from '../types/crowdEvent';

const CAMERAS = [
  {
    cameraId: 'cam-001',
    zoneName: 'North Transit Corridor (Chokepoint)',
    description: 'High-density corridor funnel',
    rtspUrl: '/corridor_chokepoint.webm',
    areaSqM: 45.0,
  },
  {
    cameraId: 'cam-002',
    zoneName: 'Central Concourse (Multi-Directional)',
    description: 'Open scramble concourse hub',
    rtspUrl: '/concourse_crossing.webm',
    areaSqM: 60.0,
  },
  {
    cameraId: 'cam-003',
    zoneName: 'Main Terminal Gate (Dense Scramble)',
    description: 'High-throughput terminal entrance',
    rtspUrl: '/12269404_2320_1080_30fps.mp4',
    areaSqM: 50.0,
  },
  {
    cameraId: 'cam-004',
    zoneName: 'Central Plaza Courtyard',
    description: 'Outdoor courtyard convergence',
    rtspUrl: '/5287069-sd_960_540_30fps.mp4',
    areaSqM: 70.0,
  },
];

export const ANOMALY_TYPES: Array<{ type: string; severity: AlertSeverity }> = [
  { type: 'Rapid Converging Flow Detected', severity: 'high' },
  { type: 'Bottleneck Forming', severity: 'warning' },
  { type: 'Sudden Dispersal Pattern', severity: 'warning' },
  { type: 'Density Threshold Exceeded', severity: 'critical' },
  { type: 'Abnormal Flow Direction Shift', severity: 'high' },
  { type: 'Stationary Crowd Build-up', severity: 'warning' },
  { type: 'Potential Stampede Risk', severity: 'critical' },
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function densityFromCameraHeadcount(cameraId: string, hc: number): DensityLevel {
  if (cameraId === 'cam-003') {
    if (hc < 80) return 'low';
    if (hc < 140) return 'moderate';
    if (hc < 185) return 'high';
    return 'critical';
  }
  if (cameraId === 'cam-001') {
    if (hc < 15) return 'low';
    if (hc < 24) return 'moderate';
    if (hc < 32) return 'high';
    return 'critical';
  }
  if (cameraId === 'cam-002') {
    if (hc < 8) return 'low';
    if (hc < 15) return 'moderate';
    if (hc < 25) return 'high';
    return 'critical';
  }
  // cam-004 default
  if (hc < 15) return 'low';
  if (hc < 25) return 'moderate';
  if (hc < 35) return 'high';
  return 'critical';
}

function generateHeatmap(base: number, size = 5): number[][] {
  const center = Math.floor(size / 2);
  const grid: number[][] = [];
  for (let y = 0; y < size; y++) {
    const row: number[] = [];
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - center, y - center);
      const centerBias = Math.max(0, 1 - dist / (size * 0.75));
      const noise = Math.random() * 0.35;
      const val = clamp(base * (0.4 + centerBias * 0.6) + noise, 0, 1);
      row.push(val);
    }
    grid.push(row);
  }
  return grid;
}

function uid(prefix = ''): string {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7)
  );
}

interface SimulatorState {
  headcounts: Record<string, number>;
  flows: Record<string, number>;
  nextAnomalyAt: number;
  activeAnomalyCamera: string | null;
  activeAnomalyEndsAt: number;
  activeAnomalyType: string | null;
  activeAnomalySeverity: AlertSeverity | null;
  activeAnomalyAlertFired: boolean;
  listeners: Set<(event: CrowdEvent) => void>;
  alertListeners: Set<(alert: Alert) => void>;
  incidentListeners: Set<(incident: Incident) => void>;
  heatmapListeners: Set<(heatmap: CameraHeatmap) => void>;
}

const state: SimulatorState = {
  headcounts: { 'cam-001': 22, 'cam-002': 8, 'cam-003': 185, 'cam-004': 20 },
  flows: { 'cam-001': 85, 'cam-002': 260, 'cam-003': 110, 'cam-004': 195 },
  nextAnomalyAt: Date.now() + 20_000 + Math.random() * 20_000,
  activeAnomalyCamera: null,
  activeAnomalyEndsAt: 0,
  activeAnomalyType: null,
  activeAnomalySeverity: null,
  activeAnomalyAlertFired: false,
  listeners: new Set(),
  alertListeners: new Set(),
  incidentListeners: new Set(),
  heatmapListeners: new Set(),
};

let intervalId: number | null = null;
let tickCount = 0;

function tick() {
  const now = Date.now();
  tickCount++;

  CAMERAS.forEach((cam) => {
    const isAnomalyActive = state.activeAnomalyCamera === cam.cameraId;
    const cid = cam.cameraId;

    let drift = (Math.random() - 0.5) * (cid === 'cam-003' ? 4 : 2);
    if (isAnomalyActive && state.activeAnomalyType === 'Crowd Surge') {
      drift += 6 * Math.sin(tickCount / 2) + 2;
    }
    const prev = state.headcounts[cid] ?? 20;
    let minCount = 15;
    let maxCount = 28;
    if (cid === 'cam-001') {
      minCount = 16;
      maxCount = 28;
    } else if (cid === 'cam-002') {
      minCount = 3;
      maxCount = 14;
    } else if (cid === 'cam-003') {
      minCount = 165;
      maxCount = 215;
    } else if (cid === 'cam-004') {
      minCount = 15;
      maxCount = 26;
    }

    let next = clamp(prev + drift, minCount, maxCount);
    state.headcounts[cid] = Math.round(next);

    let flowDrift = (Math.random() - 0.5) * 20;
    if (isAnomalyActive) flowDrift += (Math.random() - 0.3) * 60;
    state.flows[cid] =
      ((state.flows[cid] ?? 90) + flowDrift + 360) % 360;

    const density = densityFromCameraHeadcount(cid, state.headcounts[cid]);
    let anomalyType: string | undefined;
    let severity: AlertSeverity | undefined;

    // Strict rule compliance: Anomaly metrics must match ml/analytics/anomaly.py
    let currentSpeed = cid === 'cam-003' ? 0.9 : cid === 'cam-001' ? 1.2 : 1.1;
    let currentVariance = 1.2;
    let currentTurbulence = 0.15;

    if (isAnomalyActive && state.activeAnomalyType) {
      anomalyType = state.activeAnomalyType;
      severity = state.activeAnomalySeverity || 'high';

      if (anomalyType === 'Crowd Surge') {
        currentVariance = 4.2; // >= 3.5 variance threshold
        currentTurbulence = 0.52; // >= 0.40 turbulence threshold
      } else if (anomalyType === 'Bottleneck Forming') {
        currentSpeed = 0.3; // <= 0.8 bottleneck speed max
        currentTurbulence = 0.55;
      } else if (anomalyType === 'Sudden Dispersal Pattern') {
        currentSpeed = 16.5; // >= 15.0 px/window dispersal threshold
        currentVariance = 3.8;
      }
    }

    const calculatedDensityNum = parseFloat((state.headcounts[cam.cameraId] / cam.areaSqM).toFixed(2));
    const flowRad = ((state.flows[cam.cameraId] || 0) * Math.PI) / 180;
    const flowVector: [number, number] = [
      parseFloat(Math.cos(flowRad).toFixed(2)),
      parseFloat(Math.sin(flowRad).toFixed(2)),
    ];

    const metricsData = {
      density: calculatedDensityNum,
      flow_vector: flowVector,
      velocity_variance: currentVariance,
      headcount: state.headcounts[cam.cameraId],
      avg_speed: currentSpeed,
      turbulence: currentTurbulence,
    };

    const event: CrowdEvent = {
      cameraId: cam.cameraId,
      zoneName: cam.zoneName,
      headcount: state.headcounts[cam.cameraId],
      density,
      flowDirection: Math.round(state.flows[cam.cameraId]),
      anomaly: !!anomalyType,
      anomalyType,
      severity,
      timestamp: new Date(now).toISOString(),
      metrics: metricsData,
    };
    state.listeners.forEach((l) => l(event));

    // Emit alert only once per unique anomaly episode, rather than repeating every tick
    if (event.anomaly && event.anomalyType && event.severity) {
      const shouldFireAlert = isAnomalyActive ? !state.activeAnomalyAlertFired : true;
      if (shouldFireAlert) {
        if (isAnomalyActive) {
          state.activeAnomalyAlertFired = true;
        }
        const alert: Alert = {
          id: uid('alt_'),
          cameraId: cam.cameraId,
          zoneName: cam.zoneName,
          type: event.anomalyType,
          severity: event.severity,
          timestamp: event.timestamp,
          acknowledged: false,
          snapshotFrame: Math.floor(Math.random() * 100),
          metrics: metricsData,
        };
        state.alertListeners.forEach((l) => l(alert));

        const incident: Incident = {
          id: uid('inc_'),
          timestamp: event.timestamp,
          cameraId: cam.cameraId,
          zoneName: cam.zoneName,
          alertType: event.anomalyType,
          severity: event.severity,
          status: 'open',
        };
        state.incidentListeners.forEach((l) => l(incident));
      }
    }

    if (tickCount % 2 === 0) {
      const base = clamp(state.headcounts[cam.cameraId] / 220, 0, 1);
      const heatmap: CameraHeatmap = {
        cameraId: cam.cameraId,
        grid: generateHeatmap(base),
      };
      state.heatmapListeners.forEach((l) => l(heatmap));
    }
  });

  if (state.activeAnomalyCamera && now >= state.activeAnomalyEndsAt) {
    state.activeAnomalyCamera = null;
    state.activeAnomalyType = null;
    state.activeAnomalySeverity = null;
    state.activeAnomalyAlertFired = false;
  }

  // Periodic anomaly triggers constrained to plausible zones:
  // Surge only triggers on cam-003 (high density), bottleneck on cam-003 or cam-001
  if (!state.activeAnomalyCamera && now >= state.nextAnomalyAt) {
    state.activeAnomalyCamera = 'cam-003';
    state.activeAnomalyType = 'Crowd Surge';
    state.activeAnomalySeverity = 'high';
    state.activeAnomalyAlertFired = false;
    state.activeAnomalyEndsAt = now + 12000;
    state.nextAnomalyAt = now + 45_000 + Math.random() * 30_000;
  }
}

export function startCrowdSimulator(): void {
  if (intervalId !== null) return;
  tick();
  intervalId = window.setInterval(tick, 2500);
}

export function stopCrowdSimulator(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function onCrowdEvent(fn: (event: CrowdEvent) => void): () => void {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

export function onAlert(fn: (alert: Alert) => void): () => void {
  state.alertListeners.add(fn);
  return () => state.alertListeners.delete(fn);
}

export function onIncident(fn: (incident: Incident) => void): () => void {
  state.incidentListeners.add(fn);
  return () => state.incidentListeners.delete(fn);
}

export function onHeatmap(fn: (heatmap: CameraHeatmap) => void): () => void {
  state.heatmapListeners.add(fn);
  return () => state.heatmapListeners.delete(fn);
}

export function getInitialCameras(): CameraState[] {
  const now = Date.now();
  return CAMERAS.map((cam) => ({
    cameraId: cam.cameraId,
    zoneName: cam.zoneName,
    description: cam.description,
    headcount: state.headcounts[cam.cameraId] ?? 20,
    density: densityFromCameraHeadcount(cam.cameraId, state.headcounts[cam.cameraId] ?? 20),
    flowDirection: Math.round(state.flows[cam.cameraId] ?? 90),
    lastUpdated: new Date(now).toISOString(),
    lastUpdatedAgo: 0,
    rtspUrl: cam.rtspUrl,
  }));
}

export function getInitialHeatmaps(): CameraHeatmap[] {
  return CAMERAS.map((cam) => {
    const divisor = cam.cameraId === 'cam-003' ? 220 : 35;
    const base = clamp((state.headcounts[cam.cameraId] ?? 20) / divisor, 0, 1);
    return {
      cameraId: cam.cameraId,
      grid: generateHeatmap(base),
    };
  });
}
