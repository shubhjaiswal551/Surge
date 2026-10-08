export type DensityLevel = 'low' | 'moderate' | 'high' | 'critical';

export type AlertSeverity = 'info' | 'warning' | 'high' | 'critical';

export type IncidentStatus = 'open' | 'acknowledged' | 'resolved';

/**
 * Raw Metrics shape matching docs/schema.md
 */
export interface MetricsData {
  density: number;
  flow_vector: [number, number];
  velocity_variance: number;
  headcount: number;
  avg_speed: number;
  heatmap?: number[][];
}

/**
 * Redis Live Alert payload shape matching docs/schema.md
 */
export interface LiveAlertPayload {
  camera_id: string;
  zone_id?: string;
  event_type: 'surge' | 'bottleneck' | 'dispersal' | string;
  severity: 1 | 2 | 3 | 4 | 5;
  detected_at: string;
  metrics: MetricsData;
  snapshot_url?: string;
}

export type CrowdEvent = {
  cameraId: string;
  zoneName: string;
  headcount: number;
  density: DensityLevel;
  flowDirection: number;
  anomaly: boolean;
  anomalyType?: string;
  severity?: AlertSeverity;
  timestamp: string;
  // schema.md fields
  camera_id?: string;
  zone_id?: string;
  event_type?: string;
  metrics?: MetricsData;
};

export type HeatmapCell = {
  value: number;
};

export type CameraHeatmap = {
  cameraId: string;
  grid: number[][];
};

export type Alert = {
  id: string;
  cameraId: string;
  zoneName: string;
  type: string;
  severity: AlertSeverity;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  snapshotFrame?: number;
  snapshotUrl?: string;
  // schema.md fields
  numericSeverity?: number;
  metrics?: MetricsData;
};

export type Incident = {
  id: string;
  timestamp: string;
  cameraId: string;
  zoneName: string;
  alertType: string;
  severity: AlertSeverity;
  status: IncidentStatus;
  acknowledgedBy?: string;
  resolvedAt?: string;
  notes?: string;
  isFalsePositive?: boolean;
};

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'operator' | 'admin';
  createdAt: string;
  twoFactorEnabled?: boolean;
};

export type ZoneDefinition = {
  id: string;
  camera_id: string;
  name: string;
  polygon_coords: [number, number][];
  area_sq_m?: number;
  thresholds?: Record<string, number>;
};

export type CameraState = {
  cameraId: string;
  zoneName: string;
  description: string;
  headcount: number;
  density: DensityLevel;
  flowDirection: number;
  lastUpdated: string;
  lastUpdatedAgo: number;
  rtspUrl?: string;
  isActive?: boolean;
  zoneId?: string;
  polygonCoords?: [number, number][];
};
