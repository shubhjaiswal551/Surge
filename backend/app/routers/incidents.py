"""
Surge - Incidents Router
Handles logging, operator acknowledgement, resolution, and emergency dispatch workflows.
"""

import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, status
from ..models.schemas import (
    IncidentCreate,
    IncidentResponse,
    IncidentAcknowledge,
    IncidentDispatch,
    IncidentResolve,
    MetricsData,
)
from .auth import get_current_user

router = APIRouter(prefix="/incidents", tags=["Incidents"])

# In-memory incident store seeded with realistic initial records
INCIDENTS_DB: Dict[str, Dict] = {
    "inc-001": {
        "id": "inc-001",
        "camera_id": "cam-001",
        "zone_id": "zone-001",
        "event_type": "surge",
        "severity": 4,
        "detected_at": "2026-10-01T08:15:20Z",
        "snapshot_url": "/corridor_chokepoint.webm",
        "metrics_json": {
            "density": 4.2,
            "flow_vector": [0.8, -0.2],
            "velocity_variance": 4.1,
            "headcount": 78,
            "avg_speed": 4.5,
            "heatmap": None,
        },
        "acknowledged_by": "usr-op-001",
        "acknowledged_at": "2026-10-01T08:16:05Z",
        "resolved": True,
        "resolved_at": "2026-10-01T08:25:00Z",
        "notes": "Security dispatched to open overflow turnstiles. Flow normalized.",
    },
    "inc-002": {
        "id": "inc-002",
        "camera_id": "cam-002",
        "zone_id": "zone-002",
        "event_type": "bottleneck",
        "severity": 3,
        "detected_at": "2026-10-01T09:40:12Z",
        "snapshot_url": "/concourse_crossing.webm",
        "metrics_json": {
            "density": 3.8,
            "flow_vector": [0.1, 0.0],
            "velocity_variance": 0.3,
            "headcount": 65,
            "avg_speed": 0.4,
            "heatmap": None,
        },
        "acknowledged_by": "usr-op-001",
        "acknowledged_at": "2026-10-01T09:41:00Z",
        "resolved": False,
        "resolved_at": None,
        "notes": None,
    },
}

class BatchAcknowledge(BaseModel):
    incident_ids: Optional[List[str]] = None
    operator_id: Optional[str] = None
    operator_name: Optional[str] = None

@router.get("", response_model=List[IncidentResponse])
async def list_incidents(
    camera_id: Optional[str] = Query(None),
    severity: Optional[int] = Query(None, ge=1, le=5),
    resolved: Optional[bool] = Query(None),
    user: Dict = Depends(get_current_user),
):
    results = list(INCIDENTS_DB.values())
    if camera_id is not None and not hasattr(camera_id, "default"):
        results = [i for i in results if i["camera_id"] == camera_id]
    if severity is not None and not hasattr(severity, "default"):
        results = [i for i in results if i["severity"] == severity]
    if resolved is not None and not hasattr(resolved, "default"):
        results = [i for i in results if i["resolved"] == resolved]

    # Return descending by detected_at
    results.sort(key=lambda x: x["detected_at"], reverse=True)
    return results

@router.post("", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident(
    incident_in: IncidentCreate,
    user: Dict = Depends(get_current_user),
):
    iid = f"inc-{uuid.uuid4().hex[:6]}"
    now = datetime.utcnow().isoformat() + "Z"
    incident = {
        "id": iid,
        "camera_id": incident_in.camera_id,
        "zone_id": incident_in.zone_id,
        "event_type": incident_in.event_type,
        "severity": incident_in.severity,
        "detected_at": now,
        "snapshot_url": incident_in.snapshot_url,
        "metrics_json": incident_in.metrics_json.dict(),
        "acknowledged_by": None,
        "acknowledged_at": None,
        "resolved": False,
        "resolved_at": None,
        "notes": None,
    }
    INCIDENTS_DB[iid] = incident
    return incident

@router.post("/{incident_id}/acknowledge", response_model=IncidentResponse)
async def acknowledge_incident(
    incident_id: str,
    ack: IncidentAcknowledge,
    user: Dict = Depends(get_current_user),
):
    now = datetime.utcnow().isoformat() + "Z"
    op_name = ack.operator_name or ack.operator_id or user.get("email") or "Operator"
    if incident_id not in INCIDENTS_DB:
        # Graceful auto-creation for dynamically reported incidents
        INCIDENTS_DB[incident_id] = {
            "id": incident_id,
            "camera_id": "cam-003",
            "zone_id": "zone-003",
            "event_type": "surge",
            "severity": 4,
            "detected_at": now,
            "snapshot_url": "/12269404_2320_1080_30fps.mp4",
            "metrics_json": {
                "density": 3.7,
                "flow_vector": [0.1, 0.9],
                "velocity_variance": 2.8,
                "headcount": 185,
                "avg_speed": 0.9,
                "heatmap": None,
            },
            "acknowledged_by": op_name,
            "acknowledged_at": now,
            "resolved": False,
            "resolved_at": None,
            "notes": None,
        }
        return INCIDENTS_DB[incident_id]

    incident = INCIDENTS_DB[incident_id]
    incident["acknowledged_by"] = op_name
    incident["acknowledged_at"] = now
    return incident

@router.post("/batch-acknowledge")
async def batch_acknowledge_incidents(
    batch: BatchAcknowledge,
    user: Dict = Depends(get_current_user),
):
    now = datetime.utcnow().isoformat() + "Z"
    op_name = batch.operator_name or batch.operator_id or user.get("email") or "Operator"
    target_ids = set(batch.incident_ids) if batch.incident_ids else set(INCIDENTS_DB.keys())
    count = 0
    for iid in target_ids:
        if iid in INCIDENTS_DB:
            INCIDENTS_DB[iid]["acknowledged_by"] = op_name
            INCIDENTS_DB[iid]["acknowledged_at"] = now
            count += 1
    return {"status": "ok", "acknowledged_count": count}

@router.post("/{incident_id}/resolve", response_model=IncidentResponse)
async def resolve_incident(
    incident_id: str,
    res: IncidentResolve,
    user: Dict = Depends(get_current_user),
):
    now = datetime.utcnow().isoformat() + "Z"
    op_name = res.operator_id or user.get("email") or "Operator"
    note_prefix = "[FALSE POSITIVE] " if res.is_false_positive else ""
    full_notes = f"{note_prefix}{res.notes.strip()}"

    if incident_id not in INCIDENTS_DB:
        INCIDENTS_DB[incident_id] = {
            "id": incident_id,
            "camera_id": "cam-003",
            "zone_id": "zone-003",
            "event_type": "surge",
            "severity": 4,
            "detected_at": now,
            "snapshot_url": "/12269404_2320_1080_30fps.mp4",
            "metrics_json": {
                "density": 3.7,
                "flow_vector": [0.1, 0.9],
                "velocity_variance": 2.8,
                "headcount": 185,
                "avg_speed": 0.9,
                "heatmap": None,
            },
            "acknowledged_by": op_name,
            "acknowledged_at": now,
            "resolved": True,
            "resolved_at": now,
            "notes": full_notes,
        }
        return INCIDENTS_DB[incident_id]

    incident = INCIDENTS_DB[incident_id]
    incident["resolved"] = True
    incident["resolved_at"] = now
    if not incident.get("acknowledged_at"):
        incident["acknowledged_by"] = op_name
        incident["acknowledged_at"] = now
    incident["notes"] = full_notes
    return incident

@router.post("/{incident_id}/dispatch")
async def dispatch_incident(
    incident_id: str,
    dispatch_in: IncidentDispatch,
    user: Dict = Depends(get_current_user),
):
    incident = INCIDENTS_DB.get(incident_id)
    if not incident:
        incident = {
            "id": incident_id,
            "camera_id": "cam-003",
            "zone_id": "zone-003",
            "event_type": "surge",
            "severity": 4,
            "detected_at": datetime.utcnow().isoformat() + "Z",
            "snapshot_url": "/12269404_2320_1080_30fps.mp4",
            "metrics_json": {"density": 3.8, "headcount": 185},
        }
    from ..services.notifier import notifier
    dispatched = await notifier.dispatch_emergency_notification(incident, custom_note=dispatch_in.custom_note)
    return {
        "status": "dispatched" if dispatched else "failed",
        "incident_id": incident_id,
        "operator": dispatch_in.operator_id or user.get("email"),
    }

class DebriefRequest(BaseModel):
    camera_id: Optional[str] = "cam-002"
    zone_name: Optional[str] = "Central Concourse"
    event_type: Optional[str] = "bottleneck"
    severity: Optional[int] = 3
    metrics: Optional[Dict[str, Any]] = None
    image_base64: Optional[str] = None

@router.post("/{incident_id}/ai-debrief")
async def get_incident_debrief(
    incident_id: str,
    payload: Optional[DebriefRequest] = None,
):
    from ..services.gemini_service import generate_tactical_debrief
    incident = INCIDENTS_DB.get(incident_id, {})
    cam_id = (payload and payload.camera_id) or incident.get("camera_id") or "cam-002"
    zone = (payload and payload.zone_name) or incident.get("zone_id") or "Central Concourse"
    event = (payload and payload.event_type) or incident.get("event_type") or "bottleneck"
    sev = (payload and payload.severity) or incident.get("severity") or 3
    metrics = (payload and payload.metrics) or incident.get("metrics_json") or {}
    image_b64 = payload.image_base64 if payload else None

    debrief = await generate_tactical_debrief(
        incident_id=incident_id,
        camera_id=cam_id,
        zone_name=zone,
        event_type=event,
        severity=sev,
        metrics=metrics,
        image_base64=image_b64,
    )
    return debrief

@router.post("/ai-debrief")
async def get_adhoc_debrief(payload: DebriefRequest):
    from ..services.gemini_service import generate_tactical_debrief
    return await generate_tactical_debrief(
        incident_id="adhoc-preview",
        camera_id=payload.camera_id or "cam-002",
        zone_name=payload.zone_name or "Central Concourse",
        event_type=payload.event_type or "bottleneck",
        severity=payload.severity or 3,
        metrics=payload.metrics or {},
        image_base64=payload.image_base64,
    )

@router.get("/{incident_id}/telemetry")
async def get_incident_telemetry(incident_id: str):
    """Returns AI crowd tracking telemetry timeline (bounding boxes, trajectories) for the incident."""
    inc = INCIDENTS_DB.get(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    cam_id = inc.get("camera_id", "cam-001")
    from .cameras import get_camera_telemetry
    return await get_camera_telemetry(cam_id)
