# Progress Tracker — SafeCrowd

Keep this file updated as work lands. Check items off as they're completed;
don't start a phase's items until the previous phase's required items are
checked off (see `implementationPlan.md` for why the ordering matters).

## Phase 1 — Person Detection ✅

- [x] Select dataset (CrowdHuman via Roboflow)
- [x] Convert / verify YOLO-format annotations
- [x] Train YOLOv8 detector (demo config: yolov8n, 416px, ~1200 img subset)
- [x] Validate (mAP50 / mAP50-95 / precision / recall)
- [x] Export weights (`best.pt`, `best.onnx`)
- [x] Retrain on full dataset at higher imgsz/epochs (YOLOv8s, 640px, full 19.3k CrowdHuman, 71.0% mAP50)

## Phase 2 — Tracking ✅

- [x] Integrate `ultralytics` ByteTrack (`model.track(..., tracker="bytetrack.yaml")`)
- [x] Write `extract_trajectories()` → outputs track_id, frame, timestamp, bbox, center, size, confidence
- [x] Acquire test video (crowd walking footage) for tracking validation
- [x] Integrate modular `ByteTrackPipeline` in `ml/tracking/tracker.py`
- [x] Sanity-check: track IDs stay stable across frames (no excessive ID switching)

## Phase 3 — Density, Flow & Anomaly Rules ✅

- [x] Define camera zones (spatial regions per frame)
- [x] Implement density calculation (people / calibrated zone area in m²)
- [x] Implement 2D flow-direction vector calculation
- [x] Implement velocity variance calculation ($\sigma_v^2$)
- [x] Implement directional turbulence / chaos calculation
- [x] Define PRD-compliant anomaly thresholds (prevents false alarms on static dense queues)
- [x] Unit test against normal dense-queue, surge, and dispersal footage (`ml/analytics/test_analytics.py`)

## Phase 4 — Backend & Alerts ✅

- [x] FastAPI modular scaffold with resource routers (`cameras.py`, `zones.py`, `incidents.py`, `auth.py`, `websocket.py`)
- [x] Pydantic schemas mirroring `docs/schema.md` field-for-field
- [x] WebSocket broadcast endpoints (`/ws/crowd-feed`, `/ws/alerts`)
- [x] REST endpoints: cameras CRUD, zones CRUD, incident triage & resolution, JWT auth & RBAC
- [x] Persistent database models (SQLAlchemy 2.0 async engine + SQLite/Postgres schemas)
- [x] Redis alert queue wiring (live pub/sub queue with resilient fallback)

## Phase 5 — Dashboard ✅

- [x] React + TypeScript + Tailwind project scaffold with clean enterprise light theme
- [x] WebSocket client (`useCrowdStream`) + live alert feed UI with offline simulation fallback
- [x] Camera grid view with real-time vector bounding box visualization
- [x] 5×5 Zone concentration heatmap view
- [x] Incident history / event log view with filtering & CSV export
- [x] Operator triage workflow: acknowledge, physical dispatch, false-positive flagging, resolution notes

## Phase 6 — Integration & Deployment ✅

- [x] Dockerfiles per service (`backend`, `frontend` multi-stage build + Nginx proxy)
- [x] `docker-compose.yml` wiring all services with GPU device pass-through
- [x] Real RTSP camera stream ingestion (dynamic URL configuration via PATCH /cameras/{id})
- [x] Latency benchmark against 2–3s target (P95: 90.75 ms across 60 frames, 95.5% margin below SLA)
- [x] Multi-camera concurrency test (cam-001 & cam-002 parallel streams active)
- [x] Security hardening pass (Environment-aware CORS, JWT/WebSocket upgrade token validation, production .env.example)
