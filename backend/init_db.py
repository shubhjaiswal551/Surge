"""
Surge - Database Initializer
Creates database tables and seeds default cameras and zones if not present.
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import engine, Base, AsyncSessionLocal
from app.models.db_models import CameraModel, ZoneModel, IncidentModel, UserModel
from sqlalchemy import select

async def init_db():
    print("[Surge DB] Initializing database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[Surge DB] Tables verified/created successfully.")

    # Seed default cameras and zones if empty
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(CameraModel))
        existing_cams = result.scalars().all()
        if not existing_cams:
            print("[Surge DB] Seeding initial cameras and zones...")
            cam1 = CameraModel(
                id="cam-001",
                name="Main Entrance Gate",
                rtsp_url="frontend/public/12269404_2320_1080_30fps.mp4",
                location="North Terminal Gate 1",
                is_active=True,
            )
            cam2 = CameraModel(
                id="cam-002",
                name="Stadium Concourse (Dispersal Hallway)",
                rtsp_url="frontend/public/stadium_hallway_dispersal.mp4",
                location="South Stadium Concourse · Turnstile Gate 18",
                is_active=True,
            )
            session.add_all([cam1, cam2])
            await session.commit()

            zone1 = ZoneModel(
                id="zone-001",
                camera_id="cam-001",
                name="Turnstile Inflow Corridor",
                polygon_coords=[[100, 200], [800, 200], [800, 500], [100, 500]],
                area_sq_m=50.0,
            )
            zone2 = ZoneModel(
                id="zone-002",
                camera_id="cam-002",
                name="Plaza Assembly Zone",
                polygon_coords=[[50, 100], [900, 100], [900, 500], [50, 500]],
                area_sq_m=70.0,
            )
            session.add_all([zone1, zone2])
            await session.commit()
            print("[Surge DB] Seed data populated.")
        else:
            print(f"[Surge DB] Found {len(existing_cams)} existing cameras.")

if __name__ == "__main__":
    asyncio.run(init_db())
