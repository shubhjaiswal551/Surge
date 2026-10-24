# App Flow — Surge

## Operator journey (normal operation)

1. Operator logs into the dashboard (role: `operator`).
2. Lands on the camera grid view — live feeds (or recent frames) from all
   active cameras, with a small density indicator per feed.
3. No anomalies: dashboard sits quiet, zone heatmaps update periodically,
   incident log shows past resolved events.
4. An anomaly is detected by the pipeline → a WebSocket push lands in the
   dashboard in real time:
   - Alert banner appears with camera name, zone, severity, and a snapshot.
   - The relevant camera tile highlights on the grid.
5. Operator clicks into the alert → sees the snapshot, the metrics that
   triggered it (density/flow/velocity), and the live feed for that camera.
6. Operator acknowledges the alert (logged with their user ID + timestamp) and
   either dispatches a physical response or marks it as a false positive.
7. Once resolved, operator adds a short note and marks the incident resolved
   → it moves from "live alerts" into the historical incident log.

## Admin journey (configuration)

1. Admin logs in (role: `admin`).
2. Manages camera list: add/remove camera, set RTSP URL, define zones as
   polygons on a reference frame from that camera.
3. Sets or tunes anomaly thresholds (density, velocity variance) — either
   globally or per zone, since a temple entrance and a stadium concourse have
   different "normal" baselines.
4. Manages operator accounts and roles.
5. Reviews aggregate incident history/analytics across all cameras (not just
   their own shift).

## Data flow (system perspective)

```
RTSP Camera Feed
      │
      ▼
ml-worker: Perception Tier (YOLO detection, per frame)
      │
      ▼
ml-worker: Analytics Tier (ByteTrack tracking → density/flow/velocity)
      │
      ▼
ml-worker: Alerting Tier (threshold check)
      │
      ├── No anomaly → log normal activity (optional, for density history)
      │
      └── Anomaly → push to Redis alert queue
                       │
                       ▼
              FastAPI backend: WebSocket broadcaster
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
  React Dashboard               PostgreSQL
  (operator sees it             (incident
   in real time)                 logged)
          │
          ▼
  Operator acknowledges / resolves
          │
          ▼
  PostgreSQL updated (acknowledged_by, resolved, notes)
```

## First-run / cold-start flow (for development)

Since real RTSP cameras aren't available during development, the pipeline
should accept a file-based video source as a drop-in replacement for the RTSP
input at the top of this flow — same downstream logic, different source. This
is what Phase 1–3 development and testing should use before Phase 6 wires in
real RTSP ingestion.
