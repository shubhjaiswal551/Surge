"""
SafeCrowd - Server Entrypoint
Runs the modular FastAPI application with Uvicorn.
"""

import os
import sys
from pathlib import Path

# Ensure repo root and backend directory are in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
for p in [str(ROOT_DIR), str(BACKEND_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

import uvicorn
from app.main import app

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    is_dev = os.getenv("ENVIRONMENT", "development") != "production"
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)

