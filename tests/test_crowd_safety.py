"""
Unit test for pure crowd safety formula: zone capacity, single-rule zone status, and explainable risk score.
Fulfills docs/rules.md: 'Every analytics function needs at least one unit test with hand-computed expected values.'
"""

import unittest

SAFE_DENSITY = 4.0

def derive_zone_capacity(area_sq_m):
    if area_sq_m is None or area_sq_m <= 0:
        return None
    return round(area_sq_m * SAFE_DENSITY)

def derive_zone_status(headcount, capacity, has_severe_incident=False):
    if capacity is None or capacity <= 0:
        return "high" if has_severe_incident else "low"
    ratio = (headcount / capacity) * 100.0
    if ratio >= 85:
        base = "critical"
    elif ratio >= 70:
        base = "high"
    elif ratio >= 50:
        base = "moderate"
    else:
        base = "low"
    if has_severe_incident and base in ("low", "moderate"):
        return "high"
    return base

def compute_risk_score(max_capacity_ratio, highest_unresolved_severity, highest_turbulence):
    cap = max(0.0, min(1.0, max_capacity_ratio))
    sev = max(0.0, min(1.0, highest_unresolved_severity / 5.0))
    turb = max(0.0, min(1.0, highest_turbulence))
    raw = (0.40 * cap + 0.35 * sev + 0.25 * turb) * 100.0
    score = max(0, min(100, int(raw + 0.5)))
    if score >= 70:
        band = "critical"
    elif score >= 36:
        band = "elevated"
    else:
        band = "safe"
    return score, band

class TestCrowdSafety(unittest.TestCase):
    def test_zone_capacity_derivation(self):
        self.assertEqual(derive_zone_capacity(45.0), 180)
        self.assertEqual(derive_zone_capacity(60.0), 240)
        self.assertEqual(derive_zone_capacity(50.0), 200)
        self.assertEqual(derive_zone_capacity(70.0), 280)
        self.assertIsNone(derive_zone_capacity(None))
        self.assertIsNone(derive_zone_capacity(0))

    def test_zone_status_thresholds(self):
        # 40% -> low
        self.assertEqual(derive_zone_status(40, 100), "low")
        # 55% -> moderate
        self.assertEqual(derive_zone_status(55, 100), "moderate")
        # 75% -> high
        self.assertEqual(derive_zone_status(75, 100), "high")
        # 90% -> critical
        self.assertEqual(derive_zone_status(90, 100), "critical")
        # Severe incident override (severity >= 4 forces at least high)
        self.assertEqual(derive_zone_status(40, 100, has_severe_incident=True), "high")
        self.assertEqual(derive_zone_status(55, 100, has_severe_incident=True), "high")
        self.assertEqual(derive_zone_status(90, 100, has_severe_incident=True), "critical")

    def test_risk_score_hand_computed_cases(self):
        # Case 1: Nominal
        # 0.40*0.25 + 0.35*(0/5) + 0.25*0.10 = 0.10 + 0 + 0.025 = 0.125 -> 13
        score, band = compute_risk_score(0.25, 0, 0.10)
        self.assertEqual(score, 13)
        self.assertEqual(band, "safe")

        # Case 2: Elevated Bottleneck
        # 0.40*0.61 + 0.35*(3/5) + 0.25*0.20 = 0.244 + 0.210 + 0.050 = 0.504 -> 50
        score, band = compute_risk_score(0.61, 3, 0.20)
        self.assertEqual(score, 50)
        self.assertEqual(band, "elevated")

        # Case 3: Critical Surge
        # 0.40*0.925 + 0.35*(4/5) + 0.25*0.52 = 0.370 + 0.280 + 0.130 = 0.780 -> 78
        score, band = compute_risk_score(0.925, 4, 0.52)
        self.assertEqual(score, 78)
        self.assertEqual(band, "critical")

if __name__ == "__main__":
    unittest.main()
