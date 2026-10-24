"""
Surge - WebSocket Broadcaster Router
Handles real-time metric & alert streaming to connected frontend clients with token authentication support.
"""

import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from ..services.stream_worker import stream_worker
from .auth import USERS_DB

logger = logging.getLogger("surge.websocket")
router = APIRouter(tags=["WebSocket"])

def verify_ws_token(token: Optional[str]) -> bool:
    """Verifies token if provided. In dev mode without token, defaults to permissive."""
    if not token:
        return True
    clean_token = token.replace("Bearer ", "").replace("token-", "").strip()
    return clean_token in USERS_DB or token.startswith("token-")

@router.websocket("/ws/crowd-feed")
async def websocket_crowd_feed(websocket: WebSocket, token: Optional[str] = Query(None)):
    if not verify_ws_token(token):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    stream_worker.add_client(websocket)
    try:
        while True:
            # Keep connection open and listen for client heartbeats/pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        stream_worker.remove_client(websocket)
    except Exception:
        stream_worker.remove_client(websocket)

@router.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket, token: Optional[str] = Query(None)):
    if not verify_ws_token(token):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    stream_worker.add_client(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        stream_worker.remove_client(websocket)
    except Exception:
        stream_worker.remove_client(websocket)

