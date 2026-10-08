"""
SafeCrowd - Pydantic Data Models & Schemas
Mirrors docs/schema.md field-for-field.
"""

from datetime import datetime
from typing import List, Optional, Tuple, Any, Dict
from pydantic import BaseModel, Field

class MetricsData(BaseModel):
    density: float = Field(..., description="Calculated crowd density (people/m^2 or calibrated ratio)")
    flow_vector: Tuple[float, float] = Field(default=(0.0, 0.0), description="[mean_vx, mean_vy] displacement")
    velocity_variance: float = Field(default=0.0, description="Speed variance among tracked individuals")
    headcount: int = Field(default=0, description="Total persons detected in frame/zone")
    avg_speed: float = Field(default=0.0, description="Mean speed magnitude in px/frame")
    heatmap: Optional[List[List[float]]] = Field(default=None, description="5x5 normalized spatial density grid")

class AlertPayload(BaseModel):
    camera_id: str
    zone_id: Optional[str] = None
    event_type: str = Field(..., description="surge, bottleneck, dispersal, etc.")
    severity: int = Field(..., ge=1, le=5, description="1-5 integer severity scale")
    detected_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    metrics: MetricsData
    snapshot_url: Optional[str] = None

class IncidentBase(BaseModel):
    camera_id: str
    zone_id: Optional[str] = None
    event_type: str
    severity: int = Field(..., ge=1, le=5)
    snapshot_url: Optional[str] = None
    metrics_json: MetricsData

class IncidentCreate(IncidentBase):
    pass

class IncidentAcknowledge(BaseModel):
    operator_id: str
    operator_name: Optional[str] = None

class IncidentDispatch(BaseModel):
    operator_id: str
    custom_note: Optional[str] = None

class IncidentResolve(BaseModel):
    operator_id: str
    notes: str
    is_false_positive: bool = False

class IncidentResponse(IncidentBase):
    id: str
    detected_at: str
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[str] = None
    resolved: bool = False
    resolved_at: Optional[str] = None
    notes: Optional[str] = None

class CameraBase(BaseModel):
    name: str
    rtsp_url: str
    location: str
    is_active: bool = True

class CameraCreate(CameraBase):
    pass

class CameraUpdate(BaseModel):
    name: Optional[str] = None
    rtsp_url: Optional[str] = None
    location: Optional[str] = None
    is_active: Optional[bool] = None

class CameraResponse(CameraBase):
    id: str

class ZoneBase(BaseModel):
    camera_id: str
    name: str
    polygon_coords: List[Tuple[float, float]] = Field(default_factory=list, description="Pixel space polygon vertices")
    area_sq_m: Optional[float] = None
    thresholds: Optional[Dict[str, float]] = Field(
        default=None,
        description="Optional custom anomaly thresholds: density_high, density_critical, variance_surge, bottleneck_speed_max, dispersal_speed_min",
    )

class ZoneCreate(ZoneBase):
    pass

class ZoneResponse(ZoneBase):
    id: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserCreate(BaseModel):
    email: str
    password: str
    role: str = "operator"

class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class TelemetryPointResponse(BaseModel):
    timestamp: str
    headcount: int
    density: float
    avg_speed: float
    turbulence: float

class DispatchActionRequest(BaseModel):
    action: str  # e.g. dispatch_patrol, crowd_reroute, pa_broadcast, sitrep_export
    target_zone_id: Optional[str] = None
    target_camera_id: Optional[str] = None
    notes: Optional[str] = None

class AuditLogResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    action: str
    target_zone_id: Optional[str] = None
    timestamp: str
    simulated: bool
    details_json: Optional[Dict[str, Any]] = None
