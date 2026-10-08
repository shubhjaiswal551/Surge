# Data Schema — SafeCrowd

## PostgreSQL — Incident History & Configuration

### `incidents`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| camera_id | UUID (FK → cameras.id) | |
| zone_id | UUID (FK → zones.id, nullable) | null if incident isn't zone-scoped |
| event_type | TEXT | e.g. `surge`, `bottleneck`, `dispersal` |
| severity | SMALLINT | 1–5 scale |
| detected_at | TIMESTAMPTZ | when the anomaly was detected |
| snapshot_url | TEXT | path/URL to the saved frame snapshot |
| metrics_json | JSONB | raw density/flow/velocity values at detection time |
| acknowledged_by | UUID (FK → users.id, nullable) | |
| acknowledged_at | TIMESTAMPTZ (nullable) | |
| resolved | BOOLEAN | default false |
| notes | TEXT (nullable) | operator notes on resolution |

### `cameras`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| name | TEXT | |
| rtsp_url | TEXT | |
| location | TEXT | |
| is_active | BOOLEAN | |

### `zones`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| camera_id | UUID (FK → cameras.id) | |
| name | TEXT | e.g. "Main Entrance", "Zone B" |
| polygon_coords | JSONB | pixel-space polygon defining the zone in-frame |
| area_sq_m | FLOAT (nullable) | real-world area, if calibrated, for true density |

### `users`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| email | TEXT (unique) | |
| password_hash | TEXT | |
| role | TEXT | `admin` or `operator` (see `security.md`) |
| created_at | TIMESTAMPTZ | |

### `audit_logs`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users.id, nullable) | operator who executed action |
| action | TEXT | e.g. `dispatch_patrol`, `crowd_reroute`, `pa_broadcast`, `sitrep_export` |
| target_zone_id | UUID (FK → zones.id, nullable) | target zone for SOP action |
| timestamp | TIMESTAMPTZ | when action was recorded |
| simulated | BOOLEAN | true if webhook not fired / simulated demo |
| details_json | JSONB (nullable) | extra parameters |

## Redis — Live Alert Queue

Key pattern: `alerts:live:{camera_id}`

Value: JSON payload pushed by the ML pipeline when an anomaly is confirmed,
consumed by the backend's WebSocket broadcaster:

```json
{
  "camera_id": "uuid",
  "zone_id": "uuid",
  "event_type": "surge",
  "severity": 4,
  "detected_at": "2026-10-01T12:34:56Z",
  "metrics": {
    "density": 4.2,
    "flow_vector": [0.8, -0.2],
    "velocity_variance": 1.7
  },
  "snapshot_url": "..."
}
```

Use a short TTL (e.g. 30s) on live queue keys — this is a transient hand-off
to the WebSocket layer, not the system of record (PostgreSQL is).

## Notes for implementation

- All timestamps: UTC, ISO 8601.
- `metrics_json` on `incidents` should store the same shape as the Redis
  payload's `metrics` field, so the dashboard's history view and live view can
  share one rendering component.
