# Implementation Plan — Surge

Build order follows the pipeline's natural dependency chain: you can't track
people you haven't detected, can't compute density/flow without trajectories,
and can't alert without anomaly metrics. Build strictly in this order.

## Phase 1 — Person Detection (Perception Tier) ✅ Done

- Fine-tune YOLOv8 on CrowdHuman for dense/occluded crowd detection.
- Deliverable: `best.pt` weights + ONNX export.
- Location: `ml/detection/`

## Phase 2 — Multi-Object Tracking (Analytics Tier, part 1) ← Current

- Integrate ByteTrack (via `ultralytics`'s `model.track()`) on top of the
  Phase 1 detector.
- Extract per-frame trajectories: track_id, frame, timestamp, bbox center,
  bbox size.
- Deliverable: `track_people.py`, a reusable `extract_trajectories()`
  function, sample `trajectories.csv`, and an annotated demo video.
- Location: `ml/tracking/`

## Phase 3 — Density, Flow & Anomaly Rules (Analytics + Alerting Tiers)

- Consume trajectories from Phase 2.
- Compute: zone-wise density (people/area), flow direction vectors, velocity
  variance over a sliding time window.
- Define and implement threshold rules for what counts as an anomaly (rapid
  converging flow, sudden mass movement, sustained high density) — tune these
  to minimize false positives on normal dense-queue footage (RG3).
- Deliverable: `compute_metrics()` and `detect_anomaly()` functions, unit
  tests against known normal/abnormal clips.
- Location: `ml/analytics/`

## Phase 4 — Backend & Alert Delivery

- FastAPI service exposing:
  - REST endpoints: camera/zone config, user/role management, incident
    history queries.
  - WebSocket endpoint: pushes alert events to connected dashboard clients.
- Redis as the live alert queue between the ML pipeline and the WebSocket
  broadcaster.
- PostgreSQL schema for incident logging (see `schema.md`).
- Deliverable: `backend/` service, runnable via `docker-compose up backend`.

## Phase 5 — Dashboard (ReactJS)

- Camera grid view, zone heatmaps, live alert feed, incident history/log view.
- WebSocket client subscribing to the backend's alert stream.
- Role-based UI (admin vs. operator views).
- Deliverable: `frontend/` app.

## Phase 6 — Integration, Deployment & Hardening

- Docker Compose wiring all services together.
- RTSP ingestion wired into Phase 1–3 pipeline (replacing file-based test
  video input used during development).
- Latency testing against the 2–3 second target (NFR).
- Multi-camera concurrency testing.
- Security hardening pass (see `security.md`).

## Dependencies between phases

```
Phase 1 (Detection) ──▶ Phase 2 (Tracking) ──▶ Phase 3 (Analytics/Anomaly)
                                                        │
                                                        ▼
                                              Phase 4 (Backend/Alerts)
                                                        │
                                                        ▼
                                              Phase 5 (Dashboard)
                                                        │
                                                        ▼
                                          Phase 6 (Integration/Deployment)
```

Each phase's output is a hard input to the next — don't start Phase N+1 code
against mocked data if Phase N's real output format is already defined;
always wire against the actual output of the previous phase.
