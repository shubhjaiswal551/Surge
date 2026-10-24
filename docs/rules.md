# Coding Rules — Surge

These are the conventions any contributor (human or coding agent) should
follow when adding to this repo. Read this before generating new code.

## General

- Follow the phase order in `implementationPlan.md`. Don't build Phase N+1
  against mocked/assumed output from Phase N if Phase N's real code already
  exists in the repo — import and use the real thing.
- Keep ML logic, backend logic, and frontend logic in their own top-level
  folders (`ml/`, `backend/`, `frontend/`) — no cross-importing between them
  except through a defined interface (a file format, an API call, a queue
  message), never a direct Python import from `backend/` into `ml/` or
  vice versa.
- Every new pipeline stage under `ml/` should expose its core logic as a
  plain, testable function (e.g. `extract_trajectories()`,
  `compute_density()`, `detect_anomaly()`) separate from any I/O (video
  reading/writing, file saving) — so later stages can import just the logic.

## Python (ml/, backend/)

- Python 3.10+, type hints on function signatures.
- Formatting: `black` + `isort`, default settings.
- One function, one responsibility — if a function both computes a metric
  and writes a file, split it.
- No hardcoded file paths or magic numbers in function bodies — put them in a
  `CONFIG` dict or environment variable at the top of the module.
- Log with Python's `logging` module, not bare `print()`, in anything under
  `backend/` (dev notebooks under `ml/` can still use `print()` for
  quick iteration).

## FastAPI (backend/)

- Group routes by resource (`cameras.py`, `zones.py`, `incidents.py`,
  `auth.py`) under a `routers/` folder — don't put everything in one `main.py`.
- Pydantic models for every request/response body — no raw dicts in/out of
  endpoints.
- Enforce RBAC via a FastAPI dependency, applied per-route, not scattered
  ad-hoc checks inside handler bodies.

## React / TypeScript (frontend/)

- Functional components + hooks only, no class components.
- Shared types (alert payload shape, incident shape) go in a `types/` folder
  and should mirror the backend's Pydantic models field-for-field — if the
  backend schema changes, update the TS types in the same change.
- TailwindCSS utility classes for styling — avoid introducing a second
  styling system (no CSS-in-JS library, no separate SCSS setup).

## Database

- Any schema change goes through a migration (e.g. Alembic for Postgres), not
  a manual `ALTER TABLE` — keep `schema.md` in sync with actual migrations.

## Commits & Push Frequency

- Prefix commits with the phase/area: `[detection] ...`, `[tracking] ...`,
  `[backend] ...`, `[frontend] ...`, `[docs] ...`.
- Batch pushes: Do NOT push to remote after every single micro-step. Batch and push after every 2–3 related changes (unless making a major standalone feature/phase milestone push).
- One logical change per commit — don't bundle a new feature with an
  unrelated refactor.

## Testing

- Every `ml/analytics/` function (density, flow, anomaly threshold logic)
  needs at least one unit test with hand-computed expected values — this is
  the layer most likely to have silent math bugs that don't crash, just
  produce wrong alerts.
- Backend endpoints: at minimum, a happy-path test + an auth-rejection test
  per protected route.

## What NOT to do

- Don't add facial recognition or per-person biometric identification — out
  of scope per `prd.md`, and a privacy liability.
- Don't commit real camera RTSP URLs, API keys, or DB credentials — use
  `.env` + `.env.example` with placeholder values.
- Don't skip the Phase 2/3 order to jump straight to the dashboard with fake
  data "to show something" — wire against real pipeline output, even a basic
  version of it, before building UI around it.
