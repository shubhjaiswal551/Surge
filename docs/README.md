# Surge

**Real-Time Crowd Anomaly Detection and Automated Security Alert System**

An AI-driven early warning system that monitors live CCTV feeds in high-density
public spaces (transit hubs, temples, stadiums, commercial centers) and
automatically alerts security personnel when crowd behavior turns dangerous —
surges, bottlenecks, or sudden erratic dispersal.

> This repo is being built incrementally, stage by stage. See
> [implementationPlan.md](./implementationPlan.md) for the roadmap and
> [Tracker.md](./Tracker.md) for live progress.

## How it works (one paragraph)

Live camera frames are run through a YOLO detector fine-tuned for dense crowds,
ByteTrack assigns each person a persistent ID across frames, and from those
trajectories we compute zone-wise density, flow direction, and velocity
variance. When those metrics cross anomaly thresholds, an alert fires over
WebSocket to a ReactJS dashboard with camera coordinates, a snapshot, and a
severity score.

## Architecture (3-tier)

```
Perception Tier   → YOLOv8 person detection
Analytics Tier    → ByteTrack trajectory tracking + density/flow/velocity math
Alerting Tier     → Threshold rules → WebSocket push → Dashboard + SMS/Email/Siren
```

Full detail: [design.md](./design.md)

## Repo structure

```
surge/
├── ml/
│   ├── detection/        # Stage 1 — YOLO training + inference
│   ├── tracking/         # Stage 2 — ByteTrack integration
│   └── analytics/        # Stage 3 — density/flow/velocity + anomaly rules
├── backend/              # FastAPI + WebSocket server, PostgreSQL + Redis
├── frontend/             # ReactJS + TypeScript + TailwindCSS dashboard
├── docker/               # Dockerfiles + compose for deployment
└── docs/                 # this folder
```

## Docs index

| File | What it covers |
|---|---|
| [prd.md](./prd.md) | Product requirements, research gaps, success criteria |
| [tech_stack.md](./tech_stack.md) | Full stack with versions and rationale |
| [design.md](./design.md) | Architecture + system flowchart |
| [implementationPlan.md](./implementationPlan.md) | Phased build plan |
| [Tracker.md](./Tracker.md) | Live task checklist |
| [schema.md](./schema.md) | Database and queue schema |
| [security.md](./security.md) | Auth, RBAC, data handling |
| [rules.md](./rules.md) | Coding conventions for contributors / coding agents |
| [AppFlow.md](./AppFlow.md) | End-to-end user and data flow |

## Current status

Stage 1 (person detection) is trained and exported. Stage 2 (tracking) is next.
See [Tracker.md](./Tracker.md) for exact status.

## Authors

Tarun Kumar Agnihotri, Shubh Jaiswal, Arnav Singh — Department of Computer
Science and Engineering.
