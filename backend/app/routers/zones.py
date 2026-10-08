"""
SafeCrowd - Zones Router
Handles zone polygon definitions and calibrated square meters per camera.
"""

import uuid
from typing import Dict, List
from fastapi import APIRouter, Depends, HTTPException, status
from ..models.schemas import ZoneCreate, ZoneResponse
from .auth import get_current_user, require_admin

router = APIRouter(prefix="/zones", tags=["Zones"])

ZONES_DB: Dict[str, Dict] = {
    "zone-001": {
        "id": "zone-001",
        "camera_id": "cam-001",
        "name": "North Transit Corridor (Chokepoint)",
        "polygon_coords": [(50.0, 50.0), (900.0, 50.0), (900.0, 500.0), (50.0, 500.0)],
        "area_sq_m": 45.0,
        "thresholds": {
            "density_high": 2.5,
            "density_critical": 4.5,
            "variance_surge": 3.5,
            "bottleneck_speed_max": 0.8,
        },
    },
    "zone-002": {
        "id": "zone-002",
        "camera_id": "cam-002",
        "name": "Central Concourse (Multi-Directional)",
        "polygon_coords": [(30.0, 30.0), (800.0, 30.0), (800.0, 480.0), (30.0, 480.0)],
        "area_sq_m": 60.0,
        "thresholds": {
            "density_high": 2.5,
            "density_critical": 4.5,
            "variance_surge": 3.0,
            "bottleneck_speed_max": 0.9,
        },
    },
    "zone-003": {
        "id": "zone-003",
        "camera_id": "cam-003",
        "name": "Main Terminal Gate (Dense Scramble)",
        "polygon_coords": [(50.0, 50.0), (900.0, 50.0), (900.0, 500.0), (50.0, 500.0)],
        "area_sq_m": 50.0,
        "thresholds": {
            "density_high": 3.0,
            "density_critical": 5.0,
            "variance_surge": 3.5,
            "bottleneck_speed_max": 0.8,
        },
    },
    "zone-004": {
        "id": "zone-004",
        "camera_id": "cam-004",
        "name": "Central Plaza Courtyard",
        "polygon_coords": [(30.0, 30.0), (800.0, 30.0), (800.0, 480.0), (30.0, 480.0)],
        "area_sq_m": 70.0,
        "thresholds": {
            "density_high": 2.8,
            "density_critical": 4.5,
            "variance_surge": 3.0,
            "bottleneck_speed_max": 0.9,
        },
    },
}

@router.get("", response_model=List[ZoneResponse])
async def list_zones(camera_id: str = None, user: Dict = Depends(get_current_user)):
    if camera_id:
        return [z for z in ZONES_DB.values() if z["camera_id"] == camera_id]
    return list(ZONES_DB.values())

@router.post("", response_model=ZoneResponse, status_code=status.HTTP_201_CREATED)
async def create_zone(
    zone_in: ZoneCreate,
    admin_user: Dict = Depends(require_admin),
):
    zid = f"zone-{uuid.uuid4().hex[:6]}"
    zone = {
        "id": zid,
        "camera_id": zone_in.camera_id,
        "name": zone_in.name,
        "polygon_coords": zone_in.polygon_coords,
        "area_sq_m": zone_in.area_sq_m,
        "thresholds": zone_in.thresholds,
    }
    ZONES_DB[zid] = zone
    return zone

@router.delete("/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_zone(
    zone_id: str,
    admin_user: Dict = Depends(require_admin),
):
    if zone_id not in ZONES_DB:
        raise HTTPException(status_code=404, detail="Zone not found")
    del ZONES_DB[zone_id]
