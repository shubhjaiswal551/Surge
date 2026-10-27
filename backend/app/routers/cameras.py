"""
Surge - Cameras Router
Handles camera list and admin configuration per AppFlow.md and schema.md.
"""

import uuid
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from ..models.schemas import CameraCreate, CameraUpdate, CameraResponse, TelemetryPointResponse
from .auth import get_current_user, require_admin

router = APIRouter(prefix="/cameras", tags=["Cameras"])

CAMERAS_DB: Dict[str, Dict] = {
    "cam-001": {
        "id": "cam-001",
        "name": "North Transit Corridor (Chokepoint)",
        "rtsp_url": "/corridor_chokepoint.webm",
        "location": "North Transit Corridor Gate A",
        "is_active": True,
    },
    "cam-002": {
        "id": "cam-002",
        "name": "Central Concourse (Multi-Directional)",
        "rtsp_url": "/concourse_crossing.webm",
        "location": "Central Concourse Scramble Zone",
        "is_active": True,
    },
    "cam-003": {
        "id": "cam-003",
        "name": "Main Terminal Gate (Dense Scramble)",
        "rtsp_url": "/12269404_2320_1080_30fps.mp4",
        "location": "North Terminal Gate 1",
        "is_active": True,
    },
    "cam-004": {
        "id": "cam-004",
        "name": "Stadium Concourse (Dispersal Hallway)",
        "rtsp_url": "/stadium_hallway_dispersal.mp4",
        "location": "South Stadium Concourse · Turnstile Gate 18",
        "is_active": True,
    },
}

@router.get("", response_model=List[CameraResponse])
async def list_cameras(user: Dict = Depends(get_current_user)):
    return list(CAMERAS_DB.values())

@router.post("", response_model=CameraResponse, status_code=status.HTTP_201_CREATED)
async def create_camera(
    camera_in: CameraCreate,
    admin_user: Dict = Depends(require_admin),
):
    cid = f"cam-{uuid.uuid4().hex[:6]}"
    camera = {
        "id": cid,
        "name": camera_in.name,
        "rtsp_url": camera_in.rtsp_url,
        "location": camera_in.location,
        "is_active": camera_in.is_active,
    }
    CAMERAS_DB[cid] = camera
    return camera

@router.get("/{camera_id}", response_model=CameraResponse)
async def get_camera(camera_id: str, user: Dict = Depends(get_current_user)):
    if camera_id not in CAMERAS_DB:
        raise HTTPException(status_code=404, detail="Camera not found")
    return CAMERAS_DB[camera_id]

@router.patch("/{camera_id}", response_model=CameraResponse)
async def update_camera(
    camera_id: str,
    camera_in: CameraUpdate,
    admin_user: Dict = Depends(require_admin),
):
    if camera_id not in CAMERAS_DB:
        raise HTTPException(status_code=404, detail="Camera not found")
    cam = CAMERAS_DB[camera_id]
    if camera_in.name is not None:
        cam["name"] = camera_in.name
    if camera_in.rtsp_url is not None:
        cam["rtsp_url"] = camera_in.rtsp_url
    if camera_in.location is not None:
        cam["location"] = camera_in.location
    if camera_in.is_active is not None:
        cam["is_active"] = camera_in.is_active
    return cam

@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_camera(
    camera_id: str,
    admin_user: Dict = Depends(require_admin),
):
    if camera_id not in CAMERAS_DB:
        raise HTTPException(status_code=404, detail="Camera not found")
    del CAMERAS_DB[camera_id]

@router.get("/{camera_id}/telemetry-history", response_model=List[TelemetryPointResponse])
async def get_camera_telemetry_history(
    camera_id: str,
    window: str = Query("15m", pattern="^(5m|15m|1h)$"),
    user: Dict = Depends(get_current_user),
):
    if camera_id not in CAMERAS_DB:
        raise HTTPException(status_code=404, detail="Camera not found")

    window_sec_map = {
        "5m": 300,
        "15m": 900,
        "1h": 3600,
    }
    from ..services.stream_worker import stream_worker
    sec = window_sec_map.get(window, 900)
    history = stream_worker.get_telemetry_history(camera_id, window_seconds=sec)
    return history

@router.get("/{camera_id}/telemetry")
async def get_camera_telemetry(
    camera_id: str,
):
    """Returns AI crowd tracking telemetry timeline (bounding boxes, trajectories) for the requested camera."""
    if camera_id not in CAMERAS_DB:
        raise HTTPException(status_code=404, detail="Camera not found")

    import os, json
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    pub_dir = os.path.join(repo_root, "frontend", "public")

    mapping = {
        "cam-001": ["telemetry_corridor.json"],
        "cam-002": ["telemetry_concourse.json"],
        "cam-003": ["telemetry_terminal.json", "telemetry_cam001.json"],
        "cam-004": ["telemetry_stadium.json", "telemetry_plaza.json", "telemetry_cam002.json"],
    }
    candidates = mapping.get(camera_id, [])

    cam = CAMERAS_DB[camera_id]
    rtsp = cam.get("rtsp_url", "")
    if "corridor" in rtsp:
        candidates.insert(0, "telemetry_corridor.json")
    elif "concourse" in rtsp:
        candidates.insert(0, "telemetry_concourse.json")
    elif "12269404" in rtsp:
        candidates.insert(0, "telemetry_terminal.json")
    elif "stadium" in rtsp:
        candidates.insert(0, "telemetry_stadium.json")
        candidates.insert(1, "telemetry_plaza.json")
    elif "5287069" in rtsp:
        candidates.insert(0, "telemetry_plaza.json")

    for c in candidates:
        fp = os.path.join(pub_dir, c)
        if os.path.exists(fp):
            try:
                with open(fp, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

    return {"cameraId": camera_id, "duration": 15.0, "timeline": []}
