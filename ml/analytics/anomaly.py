"""
Surge - Phase 3: Anomaly & Risk Rule Engine
Distinguishes static/orderly high density from dynamic risk (surges, bottlenecks, erratic dispersal).
"""

from typing import Dict, Optional, Tuple

DEFAULT_THRESHOLDS = {
    "density_high": 3.0,          # people / m^2 (or count equivalent)
    "density_critical": 5.0,      # people / m^2 (or count equivalent)
    "variance_surge": 3.5,        # speed variance threshold for surge
    "turbulence_panic": 0.65,     # opposing vectors / chaotic counter-flow
    "bottleneck_speed_max": 0.8,  # slow crawl threshold for bottleneck
    "dispersal_speed_min": 15.0,  # sudden rush/panic running threshold
}

def detect_anomaly(
    density: float,
    avg_speed: float,
    velocity_variance: float,
    turbulence: float,
    thresholds: Optional[Dict[str, float]] = None,
) -> Tuple[bool, Optional[str], Optional[int]]:
    """
    Evaluates crowd metrics against dynamic risk thresholds.

    Core Principle (per PRD):
    High density alone (e.g. static temple queue) is NOT an anomaly.
    Alerts require velocity variance or vector turbulence.

    Returns:
        (is_anomaly: bool, event_type: Optional[str], severity_1_to_5: Optional[int])
    """
    cfg = {**DEFAULT_THRESHOLDS, **(thresholds or {})}

    is_high_density = density >= cfg["density_high"]
    is_critical_density = density >= cfg["density_critical"]

    # 1. Sudden Panic Dispersal / Stampede Flight: High speed + High turbulence/variance
    if avg_speed >= cfg["dispersal_speed_min"] and velocity_variance >= cfg["variance_surge"]:
        severity = 5 if is_high_density else 4
        return True, "dispersal", severity

    # 2. Surge / Crush: High density combined with violent speed fluctuations or high turbulence
    if is_critical_density and (velocity_variance >= cfg["variance_surge"] or turbulence >= cfg["turbulence_panic"]):
        return True, "surge", 5

    if is_high_density and velocity_variance >= cfg["variance_surge"] and turbulence >= 0.4:
        return True, "surge", 4

    # 3. Dangerous Bottleneck: High density with near-zero forward progress and high compression
    if is_critical_density and avg_speed <= cfg["bottleneck_speed_max"]:
        return True, "bottleneck", 4

    if is_high_density and avg_speed <= cfg["bottleneck_speed_max"] and turbulence >= 0.5:
        return True, "bottleneck", 3

    # Normal activity (including dense, orderly queues where variance and turbulence are low)
    return False, None, None
