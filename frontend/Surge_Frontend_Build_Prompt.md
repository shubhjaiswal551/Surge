# Surge — Frontend Build Prompt (Phase 1: UI + Auth + Demo Dashboard)

Use this as a direct prompt for an AI coding assistant (Claude Code, Cursor, v0, etc.) to scaffold the Surge frontend. The ML/YOLO backend is NOT ready yet — this phase is UI + Firebase Auth + a mocked dashboard with 2 simulated camera feeds so stakeholders can see the product before the model is trained.

---

## Project Context

Build the frontend for **Surge**, a real-time crowd anomaly detection and security alert platform. It monitors CCTV feeds in public spaces (transit hubs, temples, stadiums, malls), detects crowd surges/bottlenecks/erratic dispersal, and pushes alerts to a security dashboard.

This phase covers only the **frontend experience**, using **mock/simulated data** in place of the real YOLO + ByteTrack pipeline. The UI must be built so real WebSocket data can be dropped in later without restructuring.

---

## Tech Stack

- **Framework:** React + TypeScript (Vite)
- **Styling:** TailwindCSS
- **Auth:** Firebase Authentication — Google Sign-In (OAuth), plus Email/Password signup flow
- **State:** React Context or Zustand for auth/session state
- **Routing:** React Router
- **Charts/Heatmap:** Recharts or a lightweight custom SVG heatmap (no need for a heavy GIS lib)
- **Realtime (mocked for now):** simulate WebSocket-like updates with `setInterval` pushing fake events, structured so swapping in a real WebSocket client later is a one-file change

---

## Page 1 — Landing / Login Page (entry point)

This is the **first screen** a visitor sees. It should feel like a serious security-tech product, not a generic SaaS template — dark theme, high contrast, a sense of vigilance/control-room precision.

**Structure:**
- Hero section: Surge name/logo, one-line value prop ("Real-time crowd anomaly detection for public safety"), subtle animated background (e.g. faint moving dot-grid or pulse lines suggesting live monitoring — no stock crowd photos)
- Primary CTA: **"Continue with Google"** button (Firebase Google OAuth)
- Secondary option: Email/password **Sign Up** / **Log In** toggle form
- Footer: minimal — product name, "Built for control rooms," no fake links

**Auth flow requirements:**
1. New user clicks "Continue with Google" → Firebase Google popup/redirect → on first-time login, create a Firestore user profile doc (`uid`, `email`, `displayName`, `photoURL`, `role: "operator"`, `createdAt`)
2. Returning user → same button logs them straight into the dashboard, no duplicate profile created
3. Email/password path: signup form (name, email, password, confirm password) → Firebase `createUserWithEmailAndPassword` → same Firestore profile creation
4. Route guarding: unauthenticated users hitting `/dashboard` get redirected to `/` (login); authenticated users hitting `/` get redirected to `/dashboard`
5. Show a loading state while Firebase resolves auth state on refresh (avoid login-page flash)

**Firebase setup to scaffold:**
- `src/lib/firebase.ts` — initialize app with config from `.env` variables (`VITE_FIREBASE_API_KEY`, etc. — never hardcode)
- `src/context/AuthContext.tsx` — expose `user`, `loading`, `signInWithGoogle()`, `signUpWithEmail()`, `signInWithEmail()`, `logout()`
- `.env.example` file listing required Firebase env vars

---

## Page 2 — Dashboard (post-login, inner functionality)

Once logged in, the operator lands on the main control-room dashboard.

**Layout:**
- Left sidebar: Surge logo, nav (Dashboard, Camera Feeds, Alerts, Incident Log, Settings), user avatar + name (from Firebase) + logout at bottom
- Top bar: system status pill ("All systems nominal" / "2 active alerts"), current date/time, notification bell with live alert count

**Main content — Camera Grid (2 demo cameras):**
- Two camera panels side by side, each representing a different monitored zone, e.g.:
  - **Camera 1 — "Main Entrance Gate"**
  - **Camera 2 — "Central Courtyard"**
- Each panel shows:
  - A looping placeholder video or animated mock feed (since no live RTSP yet — use a static background image per zone with an overlay of animated moving dots representing tracked people, OR a short looping stock-free demo clip if available)
  - Live-updating **headcount** number
  - A **density badge** (Low / Moderate / High / Critical) that changes color (green → yellow → orange → red)
  - A small **flow direction arrow indicator** showing dominant crowd movement direction
  - Timestamp "Last updated: Xs ago"

**Zone Heatmap panel:**
- Simple grid heatmap (5x5 or so) per camera showing density concentration, color-coded, updating on the same mock interval

**Alert Feed panel (right side or below grid):**
- Scrollable list of alert cards, each with: severity icon, zone name, alert type (e.g. "Rapid Converging Flow Detected", "Bottleneck Forming"), timestamp, "View Snapshot" button (can be a placeholder frame)
- New alerts should animate in (slide/fade) when the mock generator fires one

**Incident Log page:**
- Table view: timestamp, camera/zone, alert type, severity, status (Open/Resolved), operator who acknowledged it
- Filter by date/severity/zone

**Mock data engine (`src/mocks/crowdSimulator.ts`):**
- A simple module that every few seconds emits a fake event object matching the shape the real backend will eventually send, e.g.:
```ts
type CrowdEvent = {
  cameraId: string;
  zoneName: string;
  headcount: number;
  density: "low" | "moderate" | "high" | "critical";
  flowDirection: number; // degrees
  anomaly: boolean;
  anomalyType?: string;
  timestamp: string;
};
```
- Randomly walk headcount/density values for both cameras; occasionally (e.g. every 20–40s) flip `anomaly: true` with a random `anomalyType` to demonstrate the alert pipeline end-to-end
- This module should be the ONLY place mock logic lives, so it can be deleted and replaced with a real WebSocket hook later without touching UI components

---

## Design Direction

- Dark theme by default (control-room feel): deep charcoal/near-black background, not pure black
- One accent color for "normal/safe" (e.g. teal or green) and a clear red/amber system for alerts — alert color language should be immediately legible, this is a safety tool
- Avoid generic dashboard-template look (no default shadcn card grids with no personality) — give it a slightly technical, instrumented feel: monospace font for numbers/timestamps, thin borders, subtle grid backgrounds
- Motion should be purposeful: live numbers tick, alerts slide in — nothing decorative or bouncy, this is a monitoring tool, not a marketing site

---

## Folder Structure to Scaffold

```
src/
  components/
    auth/           (LoginForm, SignupForm, GoogleButton)
    dashboard/      (CameraPanel, HeatmapGrid, AlertFeed, AlertCard, StatusBar, Sidebar)
    incidents/      (IncidentTable, IncidentFilters)
  context/
    AuthContext.tsx
  lib/
    firebase.ts
  mocks/
    crowdSimulator.ts
  pages/
    Landing.tsx
    Dashboard.tsx
    IncidentLog.tsx
    Settings.tsx
  routes/
    ProtectedRoute.tsx
  types/
    crowdEvent.ts
  App.tsx
  main.tsx
```

---

## Explicit Non-Goals for This Phase

- No real RTSP/video ingestion
- No real YOLO/ByteTrack inference
- No real WebSocket server — mock generator only
- No SMS/email/siren integration — just UI representation of "Auto-Notify Security Team"

---

## Deliverable

A working React app where:
1. A new visitor lands on the login page and can sign up via Google or email
2. After auth, they land on a dashboard showing 2 live-simulated camera zones with headcount, density, and flow indicators
3. Mock anomalies periodically trigger alerts that appear in the alert feed and get logged in the incident table
4. The mock data layer is isolated so it can be swapped for the real backend later with minimal refactor
