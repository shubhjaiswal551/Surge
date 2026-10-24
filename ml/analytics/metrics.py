"""
Surge - Phase 3: Analytics Tier Mathematical Metrics
Computes density, 2D flow vectors, velocity variance, and spatial heatmaps.
"""

import math
from typing import Dict, List, Optional, Tuple
import numpy as np

def compute_density(headcount: int, area_sq_m: Optional[float] = None) -> float:
    """
    Computes spatial crowd density in people per square meter.
    If area_sq_m is not calibrated or None, returns raw count as float.
    """
    if headcount <= 0:
        return 0.0
    if area_sq_m is not None and area_sq_m > 0:
        return round(float(headcount / area_sq_m), 2)
    return float(headcount)

def compute_spatial_heatmap(
    bboxes: List[Tuple[float, float, float, float]],
    frame_width: int,
    frame_height: int,
    grid_size: int = 5,
) -> List[List[float]]:
    """
    Computes a normalized grid_size x grid_size spatial density matrix (0.0 to 1.0).
    """
    grid = np.zeros((grid_size, grid_size), dtype=np.float32)
    if not bboxes or frame_width <= 0 or frame_height <= 0:
        return grid.tolist()

    for box in bboxes:
        x1, y1, x2, y2 = box
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0

        col = int(min(grid_size - 1, max(0, (cx / frame_width) * grid_size)))
        row = int(min(grid_size - 1, max(0, (cy / frame_height) * grid_size)))
        grid[row, col] += 1.0

    max_val = float(np.max(grid))
    if max_val > 0.0:
        grid = grid / max_val

    return np.round(grid, 2).tolist()

def compute_flow_vector(velocities: List[Tuple[float, float]]) -> Tuple[float, float]:
    """
    Computes dominant mean 2D flow vector [mean_vx, mean_vy].
    Returns (0.0, 0.0) if no active tracks with motion history.
    """
    if not velocities:
        return (0.0, 0.0)

    vx_arr = [v[0] for v in velocities]
    vy_arr = [v[1] for v in velocities]
    mean_vx = float(np.mean(vx_arr))
    mean_vy = float(np.mean(vy_arr))
    return (round(mean_vx, 2), round(mean_vy, 2))

def compute_velocity_variance(velocities: List[Tuple[float, float]]) -> float:
    """
    Computes the statistical variance of individual speed magnitudes.
    speed_i = sqrt(vx_i^2 + vy_i^2)
    variance = (1/N) * sum((speed_i - mean_speed)^2)
    """
    if len(velocities) < 2:
        return 0.0

    speeds = [math.sqrt(v[0] ** 2 + v[1] ** 2) for v in velocities]
    variance = float(np.var(speeds))
    return round(variance, 2)

def compute_flow_turbulence(velocities: List[Tuple[float, float]]) -> float:
    """
    Measures directional entropy/turbulence (0.0 = uniform unidirectional flow, 1.0 = total chaos/opposing flows).
    Calculated as 1.0 - (magnitude of mean vector / mean of individual magnitudes).
    """
    if len(velocities) < 2:
        return 0.0

    speeds = [math.sqrt(v[0] ** 2 + v[1] ** 2) for v in velocities]
    mean_speed = float(np.mean(speeds))
    if mean_speed < 1e-4:
        return 0.0

    mean_vx = float(np.mean([v[0] for v in velocities]))
    mean_vy = float(np.mean([v[1] for v in velocities]))
    vector_magnitude = math.sqrt(mean_vx ** 2 + mean_vy ** 2)

    turbulence = max(0.0, min(1.0, 1.0 - (vector_magnitude / mean_speed)))
    return round(turbulence, 2)
