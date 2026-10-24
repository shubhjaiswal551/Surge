# Surge — Real-Time Crowd Anomaly Detection & Surveillance

Surge is an AI-driven computer vision and real-time security monitoring platform engineered for high-density public venues, transit hubs, and commercial centers. It detects rapid crowd surges, bottlenecks, counter-flow movements, and erratic dispersal before they escalate into stampedes or security incidents.

---

## Repository Structure

```
surge/
├── docs/                     # Product specifications, schemas, rules & roadmaps
│   ├── prd.md               # Product requirements and success criteria
│   ├── design.md            # 3-tier architecture and system flow
│   ├── schema.md            # PostgreSQL and Redis payload data contracts
│   ├── rules.md             # Contributor & agent engineering guidelines
│   ├── security.md          # RBAC, privacy (DPDP), and secrets management
│   └── Tracker.md           # Live progress checklist
│
├── ml/                       # Vision, Tracking & Analytics Tier
│   ├── detection/           # YOLOv8 person detection weights (best.pt, best.onnx)
│   ├── tracking/            # ByteTrack trajectory extraction (extract_trajectories.py)
│   └── analytics/           # Density, 2D flow vectors, velocity variance & unit tests
│
├── backend/                  # Application & Alerting Tier
│   ├── app/
│   │   ├── models/          # Pydantic data schemas mirroring schema.md
│   │   ├── routers/         # auth, cameras, zones, incidents, websocket
│   │   └── services/        # stream_worker bridging ML pipeline & WebSockets
│   └── server.py            # Uvicorn entrypoint (0.0.0.0:8000)
│
└── frontend/                 # Security Operations Center (SOC) Console
    ├── src/                 # React 19 + TypeScript + TailwindCSS (Enterprise Light)
    │   ├── components/      # CameraPanels, HeatmapGrid, AlertFeed, SnapshotModal
    │   ├── hooks/           # useCrowdStream (live WebSocket auto-reconnect)
    │   ├── pages/           # Dashboard, CameraFeeds, Alerts, IncidentLog, Settings
    │   └── types/           # Type contracts matching docs/schema.md
    └── public/              # Reference surveillance video streams
```

---

## Quickstart

### 1. Run Machine Learning Unit Tests
Validate that crowd analytics math (velocity variance, flow vectors, false-alarm mitigation) meets specifications:
```bash
python -m unittest discover -s ml/analytics
```

### 2. Start Backend API & WebSocket Server
```bash
python backend/server.py
```
*Health endpoint:* `http://localhost:8000/health`  
*API Docs (Swagger UI):* `http://localhost:8000/docs`  
*WebSocket Stream:* `ws://localhost:8000/ws/crowd-feed`

### 3. Start Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
*Console URL:* `http://localhost:5173/`

---

## Core Capabilities

- **False-Alarm Mitigation**: High density alone in orderly queues never triggers panic alarms; alerts strictly require high velocity variance ($\sigma_v^2$) or directional turbulence.
- **Dynamic Density Matrix**: Normalized 5×5 spatial concentration heatmap grid per camera zone.
- **Incident Alert Triage**: Audio alert engine with priority levels (1–5 scale), physical dispatch triggers, and false-positive filtering.
- **Evidence Snapshot Inspection**: Forensic frame freeze modal with timestamped metadata and resolution notes.
- **Cryptographic Audit Log**: Searchable incident table with CSV export for compliance reporting.
