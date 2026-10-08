/**
 * SafeCrowd - Shared Crowd Safety Constants & Pure Mathematical Rule Engines
 * Enforces docs/rules.md, schema.md, and AppFlow.md standards.
 */

export const SAFE_DENSITY = 4.0; // People per m^2 (calibrated threshold)

export type ZoneSafetyStatus = 'low' | 'moderate' | 'high' | 'critical';
export type RiskScoreBand = 'safe' | 'elevated' | 'critical';

export interface RiskScoreResult {
  score: number;
  band: RiskScoreBand;
  topContributor: string;
  components: {
    capacityContribution: number;
    severityContribution: number;
    turbulenceContribution: number;
  };
}

/**
 * 1. Single rule for zone capacity:
 * Capacity = area_sq_m * SAFE_DENSITY (4.0 P/m^2).
 * If area_sq_m is null/undefined/0, returns null ("Uncalibrated").
 */
export function deriveZoneCapacity(areaSqM?: number | null): number | null {
  if (typeof areaSqM !== 'number' || areaSqM <= 0) {
    return null;
  }
  return Math.round(areaSqM * SAFE_DENSITY);
}

/**
 * 2. Single rule for Zone Status:
 * Capacity %:
 *   Low: < 50%
 *   Moderate: 50% - 70%
 *   High: 70% - 85%
 *   Critical: >= 85%
 * Override: forced to at least 'high' when an unresolved severity >= 4 incident exists for that zone.
 */
export function deriveZoneStatus(
  headcount: number,
  capacity: number | null,
  hasSevereIncident: boolean = false
): ZoneSafetyStatus {
  if (capacity === null || capacity <= 0) {
    return hasSevereIncident ? 'high' : 'low';
  }

  const ratio = (headcount / capacity) * 100;

  let baseStatus: ZoneSafetyStatus = 'low';
  if (ratio >= 85) {
    baseStatus = 'critical';
  } else if (ratio >= 70) {
    baseStatus = 'high';
  } else if (ratio >= 50) {
    baseStatus = 'moderate';
  } else {
    baseStatus = 'low';
  }

  if (hasSevereIncident && (baseStatus === 'low' || baseStatus === 'moderate')) {
    return 'high';
  }

  return baseStatus;
}

/**
 * 3. Pure, Explainable Risk Score (0 - 100)
 * Weighted blend of:
 *   - max zone capacity ratio (0.40) [clamped to 0..1]
 *   - highest unresolved incident severity / 5 (0.35) [0..1]
 *   - highest zone turbulence (0.25) [0..1]
 *
 * Bands:
 *   0 - 35: Safe (emerald)
 *   36 - 69: Elevated (amber)
 *   70 - 100: Critical (rose)
 */
export function computeRiskScore(
  maxCapacityRatio: number,
  highestUnresolvedSeverity: number,
  highestTurbulence: number,
  maxCapacityZoneName?: string
): RiskScoreResult {
  const capClamped = Math.max(0, Math.min(1.0, maxCapacityRatio));
  const sevClamped = Math.max(0, Math.min(1.0, highestUnresolvedSeverity / 5.0));
  const turbClamped = Math.max(0, Math.min(1.0, highestTurbulence));

  const capWeight = 0.40;
  const sevWeight = 0.35;
  const turbWeight = 0.25;

  const capContrib = capClamped * capWeight * 100;
  const sevContrib = sevClamped * sevWeight * 100;
  const turbContrib = turbClamped * turbWeight * 100;

  const rawScore = capContrib + sevContrib + turbContrib;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  let band: RiskScoreBand = 'safe';
  if (score >= 70) {
    band = 'critical';
  } else if (score >= 36) {
    band = 'elevated';
  } else {
    band = 'safe';
  }

  // Top contributing factor identification
  let topContributor = 'Nominal crowd baseline';
  if (capContrib >= sevContrib && capContrib >= turbContrib && capContrib > 5) {
    const zoneStr = maxCapacityZoneName ? `${maxCapacityZoneName} ` : '';
    topContributor = `Driven by: ${zoneStr}capacity ${(capClamped * 100).toFixed(1)}%`;
  } else if (sevContrib >= capContrib && sevContrib >= turbContrib && sevContrib > 5) {
    topContributor = `Driven by: Unresolved incident (Severity ${highestUnresolvedSeverity}/5)`;
  } else if (turbContrib > 5) {
    topContributor = `Driven by: High flow turbulence (${turbClamped.toFixed(2)})`;
  }

  return {
    score,
    band,
    topContributor,
    components: {
      capacityContribution: Math.round(capContrib),
      severityContribution: Math.round(sevContrib),
      turbulenceContribution: Math.round(turbContrib),
    },
  };
}
