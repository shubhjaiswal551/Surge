# Tech Stack — Surge

| Layer | Technology | Notes / Rationale |
|---|---|---|
| Frontend | ReactJS + TypeScript + TailwindCSS | Dashboard, alert feed, zone heatmaps. TS for type safety on alert/event payloads shared with the backend. |
| Backend API | Python (FastAPI) + WebSockets | FastAPI for REST (auth, camera/user config, incident history queries); native WebSocket support for pushing real-time alerts to the dashboard with minimal latency. |
| Vision / ML | Python, YOLOv8 (base) / YOLOv10 (optional upgrade), OpenCV, ByteTrack | YOLOv8 fine-tuned on CrowdHuman for dense-crowd person detection (see `ml/detection/`). ByteTrack (via `ultralytics`'s built-in tracker support) for cross-frame identity tracking (see `ml/tracking/`). |
| Database | PostgreSQL | Incident history, camera/zone config, users/roles. Relational — incidents need structured querying (by camera, time range, severity) for the dashboard's history view. |
| Queue / Cache | Redis | Live alert queue between the ML pipeline and the WebSocket broadcaster; also usable for rate-limiting and short-lived session state. |
| Deployment | Docker, GPU-enabled edge/server hardware | Containerized services (ml-worker, backend, frontend) so the same stack runs on a dev GPU box or an NVIDIA Jetson edge deployment. |

## Pinned / recommended versions

Keep these consistent across the repo so the coding agent doesn't drift
between incompatible versions mid-build:

- Python: 3.10 or 3.11
- `ultralytics`: >=8.3.0
- Node.js: 20 LTS
- React: 18.x
- FastAPI: latest 0.11x
- PostgreSQL: 15+
- Redis: 7+

## Module → tech mapping

| Repo folder | Primary tech |
|---|---|
| `ml/detection/` | ultralytics (YOLOv8), OpenCV |
| `ml/tracking/` | ultralytics's ByteTrack integration |
| `ml/analytics/` | NumPy/Pandas for density & velocity math |
| `backend/` | FastAPI, WebSockets, SQLAlchemy (Postgres), redis-py |
| `frontend/` | React, TypeScript, TailwindCSS, a WebSocket client |
| `docker/` | Dockerfiles per service + a single `docker-compose.yml` |
