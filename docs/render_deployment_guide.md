# Surge — Render Deployment Guide

This guide walks you through deploying the Surge backend to **Render** and linking it with your live **Vercel frontend**, turning your deployment into a live, interactive working model.

---

## 1. Architecture Overview

```
[ Browser / User ]
       │
       ▼
[ Vercel Frontend ] (React + Vite + Tailwind)
   https://surge.vercel.app
       │
       ├── HTTPS REST APIs ──► https://surge-backend.onrender.com/incidents
       │
       └── Secure WebSocket ──► wss://surge-backend.onrender.com/ws/crowd-feed
                                     │
                             [ Render Backend ]
                                FastAPI Service
                                (RAM <60MB in Cloud Mode)
```

---

## 2. Deploying to Render

### Method A: One-Click Blueprint (Recommended)
1. Push your updated code to GitHub:
   ```bash
   git add .
   git commit -m "feat: configure render deployment and cloud resilience mode"
   git push origin main
   ```
2. Go to [Render Dashboard](https://dashboard.render.com).
3. Click **New +** > **Blueprint**.
4. Connect your `Surge` repository.
5. Render will automatically detect `render.yaml` and configure the web service with:
   - **Environment:** Docker
   - **Health Check:** `/health`
   - **Environment Variables:** `ENVIRONMENT=production`, `DEMO_MODE=true`

---

### Method B: Manual Web Service Setup
1. Go to [Render Dashboard](https://dashboard.render.com) and click **New +** > **Web Service**.
2. Select your repository: `shubhjaiswal551/surge`.
3. Fill in the details:
   - **Name:** `surge-backend`
   - **Region:** Any (e.g. `Oregon (US West)` or `Frankfurt (EU)`)
   - **Language / Runtime:** `Docker`
   - **Dockerfile Path:** `backend/Dockerfile`
   - **Docker Context:** `.` (root directory)
   - **Instance Type:** `Free`
4. Under **Environment Variables**, add:
   | Key | Value | Notes |
   | :--- | :--- | :--- |
   | `ENVIRONMENT` | `production` | Enables production CORS and security |
   | `DEMO_MODE` | `true` | Runs lightweight simulation (<60MB RAM) without OOM crashes on free tier |
   | `ALLOWED_ORIGINS` | `https://<your-vercel-app>.vercel.app` | Allow your Vercel deployment domain |
   | `PORT` | `8000` | Port listened to by Uvicorn |
5. Click **Create Web Service**.

---

## 3. Verify Backend is Live
Once Render finishes building:
1. Open `https://<your-backend-name>.onrender.com/health` in your browser.
2. You should see:
   ```json
   {
     "status": "online",
     "service": "surge-backend",
     "redis_connected": false,
     "clients_connected": 0
   }
   ```
3. Open `https://<your-backend-name>.onrender.com/docs` to see the interactive Swagger API documentation.

---

## 4. Link Vercel Frontend to Render

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Select your `Surge` project.
3. Navigate to **Settings** > **Environment Variables**.
4. Add the following variables (for Production & Preview):
   - **`VITE_API_URL`**: `https://<your-backend-name>.onrender.com`
   - **`VITE_WS_URL`**: `wss://<your-backend-name>.onrender.com/ws/crowd-feed`
     *(Note the `wss://` prefix instead of `ws://`)*
5. Go to **Deployments**, click **...** on the latest deployment, and select **Redeploy**.

---

## 5. Free Tier Behavior & Best Practices
* **Cold Starts:** Render free services spin down after 15 minutes of inactivity. When you first visit your Vercel app after a break, it may take ~45 seconds for Render to wake up. Surge's frontend automatically shows mock data during reconnection and switches to the live stream as soon as the backend responds.
* **Upgrading to Full YOLO Inference:**
  If you upgrade to Render's **Starter** plan ($7/mo with 1-2GB RAM), you can set `DEMO_MODE=false` in the Render environment variables to run live CPU YOLO + ByteTrack video inference!
