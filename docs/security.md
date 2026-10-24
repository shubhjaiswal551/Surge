# Security — Surge

## Authentication

- JWT-based auth for both the REST API and the WebSocket connection (pass the
  token as a query param or subprotocol header on WebSocket upgrade, since
  browsers can't set custom headers on `new WebSocket(...)`).
- Passwords: hashed with bcrypt/argon2, never stored or logged in plaintext.
- Token expiry: short-lived access tokens + refresh token flow.

## Role-Based Access Control (RBAC)

| Role | Permissions |
|---|---|
| `admin` | Manage cameras/zones, manage users/roles, view all incident history, configure anomaly thresholds |
| `operator` | View live dashboard, acknowledge/resolve alerts, view incident history (read-only on config) |

Enforce role checks server-side (FastAPI dependency/middleware) — never rely
on the frontend hiding UI elements as the actual access control.

## Data Protection

- CCTV footage/snapshots may contain identifiable people — treat
  `snapshot_url` content as sensitive. Store it with restricted access
  (signed URLs with short expiry, not public buckets).
- Define a retention policy for raw footage and snapshots (e.g. auto-delete
  after N days unless attached to an unresolved incident) — don't keep
  indefinitely by default.
- No facial recognition or individual identification is in scope (see
  `prd.md` → Out of Scope) — don't add per-person biometric identity features
  without a separate privacy/legal review, since this is deployed in public
  spaces.
- If deployed in India, be mindful of the Digital Personal Data Protection
  (DPDP) Act's requirements around collection and storage of personal data
  captured via CCTV; flag this for legal review before a real deployment
  beyond the academic/demo scope.

## API & Network Security

- All API and WebSocket traffic over TLS (HTTPS/WSS) in anything beyond local
  dev.
- Rate-limit REST endpoints (especially auth endpoints) to mitigate brute
  force.
- Validate and sanitize all zone-polygon / config inputs server-side — don't
  trust frontend-computed values for anything written to the database.

## Secrets Management

- Database credentials, JWT signing keys, and any third-party API keys go in
  environment variables / a `.env` file that is **git-ignored** — never commit
  secrets to the repo.
- Separate secrets per environment (dev/staging/prod); don't reuse a dev
  signing key in anything resembling production.

## Edge Device Considerations

- If the `ml-worker` runs on an edge device (e.g. Jetson) in a semi-public
  location, treat physical access to that device as a real threat model —
  disk encryption and disabling unused services/ports matters more there than
  on a locked-down cloud server.
