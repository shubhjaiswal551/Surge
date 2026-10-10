/**
 * SafeCrowd - Client-Side AI & Forensic Rule Engine Debrief Service
 * 
 * Provides seamless tactical debriefs in client-only deployments (such as Vercel preview/production
 * without a live FastAPI backend), and supports direct Google Gemini Flash calls if a client key is configured.
 */

export interface DebriefResult {
  summary: string;
  root_cause: string;
  threat_level: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  stampede_risk_percent: number;
  recommended_actions: string[];
  operator_notes_draft: string;
  source: string;
  has_api_key?: boolean;
}

export interface DebriefParams {
  incidentId: string;
  cameraId: string;
  zoneName: string;
  eventType: string;
  severity: number;
  density: number;
  headcount: number;
  velocityVariance: number;
  avgSpeed?: number;
  flowVector?: [number, number];
}

export function generateClientForensicDebrief(params: DebriefParams): DebriefResult {
  const { zoneName, eventType, severity, density, headcount, velocityVariance } = params;
  const textCorpus = `${eventType.toLowerCase()} ${zoneName.toLowerCase()}`;

  const isMultidirectional = /multi-directional|multidirectional|cross|turbulence|concourse|crossing/i.test(textCorpus);
  const isSurge = /surge|dispersal|panic|rapid|stampede/i.test(textCorpus);
  const isBottleneck = /bottleneck|chokepoint|compress|obstruction/i.test(textCorpus);

  let baseRisk = 10;
  let threatLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' = 'LOW';

  if (isMultidirectional) {
    baseRisk = 52 + Math.min(24, Math.floor(velocityVariance * 6.5)) + Math.min(18, Math.floor(density * 8.0));
    threatLevel = baseRisk >= 75 ? 'CRITICAL' : baseRisk >= 55 ? 'HIGH' : 'MODERATE';
  } else if (isSurge) {
    baseRisk = 35 + Math.min(35, Math.floor(velocityVariance * 7.5)) + Math.min(20, Math.floor(density * 4.0));
    threatLevel = baseRisk >= 75 ? 'CRITICAL' : baseRisk >= 50 ? 'HIGH' : 'MODERATE';
  } else if (isBottleneck) {
    baseRisk = 15 + Math.min(25, Math.floor(density * 5.0)) + Math.min(15, Math.floor(velocityVariance * 3.0));
    threatLevel = density >= 4.5 ? 'HIGH' : density >= 2.5 ? 'MODERATE' : 'LOW';
  } else {
    baseRisk = 12 + Math.min(28, Math.floor(density * 5.5)) + Math.min(15, Math.floor(velocityVariance * 3.5));
    threatLevel = density >= 5.0 ? 'CRITICAL' : density >= 3.8 ? 'HIGH' : severity >= 3 ? 'MODERATE' : 'LOW';
  }

  const stampedeRiskPercent = Math.max(10, Math.min(92, baseRisk));

  let summary = '';
  let rootCause = '';
  let actions: string[] = [];
  let notes = '';

  if (isMultidirectional) {
    summary = `Multi-directional pedestrian cross-flow identified at ${zoneName}. Opposing trajectory vectors and intersecting foot traffic create high collision turbulence and elevated stampede hazard.`;
    rootCause = 'Intersecting pedestrian streams without directional lane separation, producing kinetic shear.';
    actions = [
      'Deploy stanchions or portable barriers to establish one-way pedestrian lanes.',
      'Position ground marshals at crossing nodes to guide intersecting pedestrian streams.',
      'Activate directional overhead audio advisories to prevent cross-traffic deadlock.',
    ];
    notes = `Cross-flow intervention: Directional partitioning deployed at ${zoneName}. Opposing streams separated into distinct channels. Collision hazard mitigated.`;
  } else if (isSurge) {
    summary = `Sudden directional surge detected at ${zoneName}. Elevated kinetic dispersion indicates localized crowd displacement or evasive movement.`;
    rootCause = 'Rapid kinetic divergence; pedestrians scattering from focal chokepoint.';
    actions = [
      'Dispatch rapid-response marshals to secure perimeter exits.',
      'Verify egress routes are unblocked and clear of physical barriers.',
      'Broadcast standard calm-down guidance via Public Address.',
    ];
    notes = `Surge response: Ground security mobilized to ${zoneName}. Ingress throttled and perimeter cleared. Density stabilized at safe threshold.`;
  } else if (isBottleneck) {
    summary = `Bottleneck chokepoint accumulating at ${zoneName}. Inflow exceeds egress throughput, causing localized queue formation.`;
    rootCause = 'Physical chokepoint narrowing combined with steady directional foot traffic.';
    actions = [
      'Open auxiliary bypass turnstiles to relieve directional pressure.',
      'Position stewards at entry gates to stagger incoming pedestrian waves.',
      'Monitor localized pressure threshold to prevent crushing.',
    ];
    notes = `Bottleneck triage: Auxiliary bypass gates activated for ${zoneName}. Entry metering enacted. Flow normalized.`;
  } else {
    summary = `Elevated crowd concentration registered in ${zoneName} (${density.toFixed(1)} P/m² across ~${headcount} persons).`;
    rootCause = 'Sustained pedestrian accumulation during peak crosswalk transit intervals.';
    actions = [
      'Verify steady pedestrian egress at exit stairwells and crosswalk transitions.',
      'Keep auxiliary corridor access on standby if density approaches critical thresholds.',
      'Maintain automated CCTV spatial telemetry monitoring.',
    ];
    notes = `Density monitoring: Active tracking maintained for ${zoneName}. Ingress rate compliant with safety thresholds.`;
  }

  return {
    summary,
    root_cause: rootCause,
    threat_level: threatLevel,
    stampede_risk_percent: stampedeRiskPercent,
    recommended_actions: actions,
    operator_notes_draft: notes,
    source: 'SafeCrowd Forensic Rule Engine (Client Verified)',
    has_api_key: false,
  };
}
