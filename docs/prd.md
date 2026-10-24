# Product Requirements Document — Surge

## 1. Objective

Build a computer-vision pipeline that watches live CCTV feeds in high-footfall
public venues and proactively alerts security staff to developing crowd
emergencies (surges, bottlenecks, sudden mass dispersal) *before* they become
incidents — rather than the traditional model of CCTV as a forensic
after-the-fact review tool.

## 2. Problem / Research Gaps

| ID | Gap | How Surge addresses it |
|---|---|---|
| RG1 | Standard CCTV is reactive — footage is reviewed after an incident, not during it | Real-time detection + alerting loop, not just recording |
| RG2 | Detection research rarely integrates with an operational dashboard operators actually use | Dashboard is a first-class deliverable, not an afterthought |
| RG3 | Static headcount thresholds misclassify normal dense queues as emergencies → alarm fatigue | Anomaly rules use directional flow + velocity variance, not raw headcount alone |
| RG4 | Multi-stage CV pipelines often can't hit sub-second latency across multiple feeds | Lightweight YOLO + motion-vector analysis chosen specifically for speed over complexity |

## 3. Functional Requirements

- Ingest multi-channel video from IP cameras via RTSP.
- Detect people per frame and estimate real-time headcount (YOLO).
- Track individual trajectories across frames to derive velocity and
  directional flow (ByteTrack).
- Compute localized crowd density per camera zone to flag bottlenecks.
- Dispatch alerts automatically via WebSocket to the dashboard, log incident
  history, and fire external notifications (SMS/email/siren) on confirmed
  anomalies.
- Provide an operator control panel: camera grid, zone heatmaps, event log.
- Enforce role-based access control (admin vs. operator).

## 4. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Latency | Frame processed → alert pushed within 2–3 seconds |
| Reliability | Continuous uptime for 24/7 surveillance use |
| Scalability | Multiple concurrent camera streams, no dropped frames |
| Usability | Dashboard usable by non-technical security staff with minimal training |

## 5. Success Criteria

- Detector achieves acceptable mAP50 on held-out CrowdHuman validation data
  (target ≥0.5 for the demo model, higher once scaled up).
- End-to-end pipeline (frame in → alert out) runs within the 2–3s latency
  budget on target hardware.
- False-alarm rate on normal dense-queue footage is measurably lower than a
  naive headcount-threshold baseline.
- Operator can go from "alert received" to "incident acknowledged" in the UI
  in a small number of clicks.

## 6. Out of Scope (for now)

- Facial recognition / individual identification of people in the crowd.
- Multi-camera re-identification (tracking the same person across *different*
  camera feeds) — single-camera tracking only in the current scope.
- Mobile app for operators (web dashboard only for now).

## 7. Primary Users

- **Security operators** — monitor the live dashboard, acknowledge/dispatch
  on alerts.
- **Security administrators** — manage camera config, users/roles, review
  incident history and analytics.
