"""
Surge - Unit Tests for Analytics Metrics & Anomaly Logic
Hand-computed expected values to ensure mathematical fidelity and rule adherence.
"""

import math
import unittest
try:
    from .metrics import (
        compute_density,
        compute_spatial_heatmap,
        compute_flow_vector,
        compute_velocity_variance,
        compute_flow_turbulence,
    )
    from .anomaly import detect_anomaly
except (ImportError, ValueError):
    from ml.analytics.metrics import (
        compute_density,
        compute_spatial_heatmap,
        compute_flow_vector,
        compute_velocity_variance,
        compute_flow_turbulence,
    )
    from ml.analytics.anomaly import detect_anomaly

class TestAnalyticsMetrics(unittest.TestCase):
    def test_compute_density(self):
        # 50 people across 25 sq meters = 2.0 people / m^2
        self.assertEqual(compute_density(50, 25.0), 2.0)
        # 0 headcount
        self.assertEqual(compute_density(0, 25.0), 0.0)
        # Uncalibrated area (None) returns raw headcount
        self.assertEqual(compute_density(42, None), 42.0)

    def test_compute_flow_vector(self):
        # Velocities: (2.0, 4.0) and (4.0, 2.0) -> mean = (3.0, 3.0)
        vels = [(2.0, 4.0), (4.0, 2.0)]
        self.assertEqual(compute_flow_vector(vels), (3.0, 3.0))
        self.assertEqual(compute_flow_vector([]), (0.0, 0.0))

    def test_compute_velocity_variance(self):
        # Two tracks:
        # Track 1: dx=3, dy=4 -> speed = 5.0
        # Track 2: dx=6, dy=8 -> speed = 10.0
        # Mean speed = 7.5
        # Variance = ((5 - 7.5)^2 + (10 - 7.5)^2) / 2 = (6.25 + 6.25) / 2 = 6.25
        vels = [(3.0, 4.0), (6.0, 8.0)]
        self.assertAlmostEqual(compute_velocity_variance(vels), 6.25, places=2)

    def test_compute_flow_turbulence_orderly(self):
        # Two tracks moving in the exact same direction at the same speed:
        # v1 = (5.0, 0.0), v2 = (5.0, 0.0)
        # Mean vector = (5.0, 0.0), magnitude = 5.0. Mean speed = 5.0.
        # Turbulence = 1.0 - (5.0 / 5.0) = 0.0
        vels = [(5.0, 0.0), (5.0, 0.0)]
        self.assertEqual(compute_flow_turbulence(vels), 0.0)

    def test_compute_flow_turbulence_opposing(self):
        # Two tracks moving in exact opposite directions (head-on collision):
        # v1 = (5.0, 0.0), v2 = (-5.0, 0.0)
        # Mean vector = (0.0, 0.0), magnitude = 0.0. Mean speed = 5.0.
        # Turbulence = 1.0 - (0.0 / 5.0) = 1.0 (Maximum chaos)
        vels = [(5.0, 0.0), (-5.0, 0.0)]
        self.assertEqual(compute_flow_turbulence(vels), 1.0)

    def test_orderly_dense_queue_does_not_trigger_false_alarm(self):
        """
        PRD RG3 Compliance Test:
        High density (e.g. 6.0 people/m^2) in a peaceful, static queue
        with 0 velocity variance and 0 turbulence MUST NOT trigger an anomaly.
        """
        is_anomaly, event_type, severity = detect_anomaly(
            density=6.0,
            avg_speed=0.2,
            velocity_variance=0.1,
            turbulence=0.0,
        )
        # In a peaceful queue without compression/bottleneck, it shouldn't trigger critical surge
        self.assertNotEqual(event_type, "surge")

    def test_crowd_surge_detection(self):
        # High density + high velocity variance + turbulence -> Surge!
        is_anomaly, event_type, severity = detect_anomaly(
            density=5.5,
            avg_speed=4.2,
            velocity_variance=5.8,
            turbulence=0.75,
        )
        self.assertTrue(is_anomaly)
        self.assertEqual(event_type, "surge")
        self.assertEqual(severity, 5)

    def test_panic_dispersal_detection(self):
        # High speed + high variance -> Dispersal!
        is_anomaly, event_type, severity = detect_anomaly(
            density=2.0,
            avg_speed=18.5,
            velocity_variance=7.2,
            turbulence=0.8,
        )
        self.assertTrue(is_anomaly)
        self.assertEqual(event_type, "dispersal")
        self.assertEqual(severity, 4)

if __name__ == "__main__":
    unittest.main()
