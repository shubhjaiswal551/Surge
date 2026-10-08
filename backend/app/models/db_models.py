"""
SafeCrowd - SQLAlchemy Database Models
Exact implementation of docs/schema.md for incidents, cameras, zones, and users.
"""

import uuid
from datetime import datetime
from sqlalchemy import (
    Column,
    String,
    Integer,
    Boolean,
    Float,
    DateTime,
    JSON,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import relationship
from app.core.database import Base

class CameraModel(Base):
    __tablename__ = "cameras"

    id = Column(String(36), primary_key=True, default=lambda: f"cam-{uuid.uuid4().hex[:6]}")
    name = Column(String(128), nullable=False)
    rtsp_url = Column(Text, nullable=False)
    location = Column(String(256), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    zones = relationship("ZoneModel", back_populates="camera", cascade="all, delete-orphan")
    incidents = relationship("IncidentModel", back_populates="camera")

class ZoneModel(Base):
    __tablename__ = "zones"

    id = Column(String(36), primary_key=True, default=lambda: f"zone-{uuid.uuid4().hex[:6]}")
    camera_id = Column(String(36), ForeignKey("cameras.id"), nullable=False)
    name = Column(String(128), nullable=False)
    polygon_coords = Column(JSON, default=list, nullable=False)
    area_sq_m = Column(Float, nullable=True)

    camera = relationship("CameraModel", back_populates="zones")
    incidents = relationship("IncidentModel", back_populates="zone")

class IncidentModel(Base):
    __tablename__ = "incidents"

    id = Column(String(36), primary_key=True, default=lambda: f"inc-{uuid.uuid4().hex[:8]}")
    camera_id = Column(String(36), ForeignKey("cameras.id"), nullable=False)
    zone_id = Column(String(36), ForeignKey("zones.id"), nullable=True)
    event_type = Column(String(64), nullable=False)
    severity = Column(Integer, nullable=False)  # 1-5 scale
    detected_at = Column(String(64), default=lambda: datetime.utcnow().isoformat() + "Z")
    snapshot_url = Column(Text, nullable=True)
    metrics_json = Column(JSON, nullable=False)
    acknowledged_by = Column(String(128), nullable=True)
    acknowledged_at = Column(String(64), nullable=True)
    resolved = Column(Boolean, default=False, nullable=False)
    resolved_at = Column(String(64), nullable=True)
    notes = Column(Text, nullable=True)

    camera = relationship("CameraModel", back_populates="incidents")
    zone = relationship("ZoneModel", back_populates="incidents")

class UserModel(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: f"usr-{uuid.uuid4().hex[:6]}")
    email = Column(String(256), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    role = Column(String(32), default="operator", nullable=False)
    created_at = Column(String(64), default=lambda: datetime.utcnow().isoformat() + "Z")

class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: f"aud-{uuid.uuid4().hex[:8]}")
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    action = Column(String(64), nullable=False)
    target_zone_id = Column(String(36), ForeignKey("zones.id"), nullable=True)
    timestamp = Column(String(64), default=lambda: datetime.utcnow().isoformat() + "Z")
    simulated = Column(Boolean, default=True, nullable=False)
    details_json = Column(JSON, nullable=True)
