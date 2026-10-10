"""
SafeCrowd - Gemini AI Tactical Incident Debrief Service
Connects to Google AI Studio Free Tier (Gemini 1.5 Flash / 2.0 Flash)
Provides automated operational debriefs, root-cause diagnostics, and security action protocols.
"""

import os
import json
import logging
from typing import Dict, Any, Optional
import httpx

logger = logging.getLogger("safecrowd.gemini")

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"

async def generate_tactical_debrief(
    incident_id: str,
    camera_id: str,
    zone_name: str,
    event_type: str,
    severity: int,
    metrics: Optional[Dict[str, Any]] = None,
    image_base64: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generates an automated operational debrief using Google Gemini Flash Free Tier.
    Falls back gracefully to the local rule engine if no API key is provided.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    metrics = metrics or {}
    density = metrics.get("density", 3.8)
    headcount = metrics.get("headcount", 75)
    velocity_variance = metrics.get("velocity_variance", 2.5)
    avg_speed = metrics.get("avg_speed", 1.2)
    flow_vector = metrics.get("flow_vector", [0.0, 0.0])

    if api_key:
        try:
            logger.info(f"Calling Google Gemini API for incident {incident_id}...")
            prompt_text = f"""
You are SafeCrowd Tactical AI, an expert emergency crowd management and physical security specialist.
Analyze this crowd incident and produce a professional operational triage debrief for on-duty security staff.

Incident Context:
- Incident ID: {incident_id}
- Camera / Angle: {camera_id}
- Monitored Zone: {zone_name}
- Event Type: {event_type}
- Severity Score: {severity} / 5
- Spatial Density: {density} people per square meter
- Estimated Headcount: {headcount} individuals
- Motion Velocity Variance: {velocity_variance}
- Average Flow Speed: {avg_speed} m/s
- Flow Direction Vector: {flow_vector}

Provide your response in valid JSON matching this exact structure:
{{
  "summary": "Concise 1-2 sentence operational description of what is happening in the crowd.",
  "root_cause": "Primary physical trigger (e.g. counter-directional blockage, sudden obstruction, bottleneck compression).",
  "threat_level": "CRITICAL" | "HIGH" | "MODERATE" | "LOW",
  "stampede_risk_percent": number (0 to 100),
  "recommended_actions": [
    "Action item 1 for ground marshals",
    "Action item 2 for control room",
    "Action item 3 for physical barriers/PA"
  ],
  "operator_notes_draft": "Ready-to-use incident log summary for operator resolution records."
}}
"""
            contents = [{"parts": [{"text": prompt_text}]}]

            # If image base64 is attached, add it to multimodal payload
            if image_base64:
                # Strip data URL prefix if present
                clean_b64 = image_base64.split(",")[-1] if "," in image_base64 else image_base64
                contents[0]["parts"].append({
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": clean_b64
                    }
                })

            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{GEMINI_API_URL}?key={api_key}",
                    json={
                        "contents": contents,
                        "generationConfig": {
                            "responseMimeType": "application/json",
                            "temperature": 0.2,
                        }
                    }
                )

                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        raw_json_str = candidates[0]["content"]["parts"][0]["text"]
                        parsed = json.loads(raw_json_str)
                        parsed["source"] = "Google Gemini 1.5 Flash (Cloud AI)"
                        parsed["has_api_key"] = True
                        return parsed
                else:
                    logger.warning(f"Gemini API returned status {res.status_code}: {res.text}")
        except Exception as e:
            logger.error(f"Error during Gemini API call: {e}")

    # Fallback: High-precision deterministic forensic rule generator
    return _generate_fallback_debrief(
        incident_id=incident_id,
        camera_id=camera_id,
        zone_name=zone_name,
        event_type=event_type,
        severity=severity,
        density=density,
        headcount=headcount,
        velocity_variance=velocity_variance,
    )

def _generate_fallback_debrief(
    incident_id: str,
    camera_id: str,
    zone_name: str,
    event_type: str,
    severity: int,
    density: float,
    headcount: int,
    velocity_variance: float,
) -> Dict[str, Any]:
    threat_level = "CRITICAL" if severity >= 4 or density >= 4.0 else "HIGH" if severity >= 3 else "MODERATE"
    stampede_risk = min(96, int(max(20, (density * 18.5) + (velocity_variance * 6))))

    if "surge" in event_type.lower() or "dispersal" in event_type.lower():
        summary = f"Sudden directional surge detected at {zone_name}. Accelerated velocity dispersion indicates localized crowd panic or evasive movement."
        root_cause = "Rapid kinetic divergence; pedestrians scattering from focal chokepoint."
        actions = [
            "Dispatch rapid-response marshals to secure perimeter exits.",
            "Verify egress routes are unblocked and clear of physical barriers.",
            "Broadcast standard calm-down guidance via Public Address."
        ]
        notes = f"Surge response: Ground security mobilized to {zone_name}. Ingress throttled and perimeter cleared. Density stabilized at safe threshold."
    elif "bottleneck" in event_type.lower() or density >= 3.5:
        summary = f"High-density compression accumulating at {zone_name}. Inflow exceeds egress throughput, causing stationary compression."
        root_cause = "Physical chokepoint obstruction combined with sustained directional foot traffic."
        actions = [
            "Open auxiliary bypass turnstiles to relieve directional pressure.",
            "Position stewards at entry gates to stagger incoming pedestrian waves.",
            "Monitor localized pressure threshold to prevent crushing."
        ]
        notes = f"Bottleneck triage: Auxiliary bypass gates activated for {zone_name}. Entry metering enacted. Flow normalized."
    else:
        summary = f"Elevated crowd anomaly registered in {zone_name} exceeding standard flow tolerances."
        root_cause = "Localized velocity turbulence and spatial density accumulation."
        actions = [
            "Conduct visual sweep via auxiliary cameras to verify obstruction.",
            "Place floor marshals on standby at adjacent corridors.",
            "Log event in security log and continue active tracking."
        ]
        notes = f"Standard anomaly verification: Monitored {zone_name} continuously. Flow resolved naturally without escalation."

    return {
        "summary": summary,
        "root_cause": root_cause,
        "threat_level": threat_level,
        "stampede_risk_percent": stampede_risk,
        "recommended_actions": actions,
        "operator_notes_draft": notes,
        "source": "SafeCrowd Forensic Rule Engine (Gemini Free Tier Ready)",
        "has_api_key": bool(os.getenv("GEMINI_API_KEY", "").strip()),
    }
