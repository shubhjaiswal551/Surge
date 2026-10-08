"""
SafeCrowd - FastAPI Backend Application
Modular resource routers, Pydantic validation, and real-time WebSocket broadcaster.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import auth, cameras, zones, incidents, websocket, operations
from .services.stream_worker import stream_worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("safecrowd.backend")

from .core.database import engine, Base
from .core.redis_broker import alert_broker

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure database schema is initialized
    logger.info("Initializing database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Startup: Initialize Redis broker connection
    await alert_broker.connect()

    # Startup: Launch video inference pipeline in background
    logger.info("Starting SafeCrowd analytics background worker...")
    task = asyncio.create_task(stream_worker.run_pipeline_loop())
    yield
    # Shutdown: Stop worker gracefully
    logger.info("Shutting down SafeCrowd analytics background worker...")
    stream_worker.is_running = False
    task.cancel()
    await alert_broker.close()

import os

# Environment-aware CORS configuration
environment = os.getenv("ENVIRONMENT", "development")
if environment == "production":
    raw_origins = os.getenv("ALLOWED_ORIGINS", "")
    allowed_origins = [o.strip() for o in raw_origins.split(",") if o.strip()] or [
        "http://localhost:5173",
        "http://localhost:3000",
    ]
else:
    allowed_origins = ["*"]

app = FastAPI(
    title="SafeCrowd Analytics & Alerting API",
    description="Real-Time Crowd Anomaly Detection, Triage, and Video Intelligence Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins != ["*"] else ["*"],
    allow_origin_regex=r"^https://.*\.vercel\.app$" if environment == "production" else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register resource routers
app.include_router(auth.router)
app.include_router(cameras.router)
app.include_router(zones.router)
app.include_router(incidents.router)
app.include_router(websocket.router)
app.include_router(operations.router)

from fastapi.staticfiles import StaticFiles
snapshots_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "snapshots")
os.makedirs(snapshots_dir, exist_ok=True)
app.mount("/snapshots", StaticFiles(directory=snapshots_dir), name="snapshots")

@app.get("/health")
async def health_check():
    return {
        "status": "online",
        "service": "safecrowd-backend",
        "redis_connected": alert_broker.is_connected,
        "clients_connected": len(stream_worker.connected_clients),
    }
