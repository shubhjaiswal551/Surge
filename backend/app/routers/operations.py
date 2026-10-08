"""
SafeCrowd - Operations Router
Handles rapid response SOP dispatch, audit logging, and external webhooks per AppFlow.md and schema.md.
"""

import os
import uuid
import logging
from datetime import datetime
from typing import Dict, List, Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from ..models.schemas import DispatchActionRequest, AuditLogResponse
from ..models.db_models import AuditLogModel
from ..core.database import AsyncSessionLocal
from .auth import get_current_user

logger = logging.getLogger("safecrowd.operations")

router = APIRouter(prefix="/operations", tags=["Operations"])

# In-memory audit log fallback store
AUDIT_LOGS_DB: List[Dict] = []

@router.post("/dispatch", response_model=AuditLogResponse, status_code=status.HTTP_201_CREATED)
async def execute_dispatch_action(
    req: DispatchActionRequest,
    user: Dict = Depends(get_current_user),
):
    audit_id = f"aud-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.utcnow().isoformat() + "Z"
    user_id = user.get("id") or user.get("uid")

    webhook_url = os.getenv("DISPATCH_WEBHOOK_URL")
    telegram_bot = os.getenv("TELEGRAM_BOT_TOKEN")
    telegram_chat = os.getenv("TELEGRAM_CHAT_ID")

    is_real_dispatch = False

    # Check if real webhook / Telegram is configured
    if webhook_url:
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.post(
                    webhook_url,
                    json={
                        "event": "SAFECROWD_OPERATIONAL_DISPATCH",
                        "action": req.action,
                        "target_zone": req.target_zone_id,
                        "operator": user_id,
                        "timestamp": now_iso,
                        "notes": req.notes,
                    },
                )
                if res.is_success:
                    is_real_dispatch = True
                    logger.info(f"Webhook dispatch triggered successfully to {webhook_url}")
        except Exception as err:
            logger.warning(f"Failed to post to DISPATCH_WEBHOOK_URL: {err}")

    if not is_real_dispatch and telegram_bot and telegram_chat:
        try:
            tg_url = f"https://api.telegram.org/bot{telegram_bot}/sendMessage"
            tg_text = (
                f"🚨 *SAFECROWD SOP DISPATCH*\n"
                f"*Action:* {req.action}\n"
                f"*Target:* {req.target_zone_id or 'General Area'}\n"
                f"*Operator:* {user_id}\n"
                f"*Time:* {now_iso}"
            )
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.post(
                    tg_url,
                    json={
                        "chat_id": telegram_chat,
                        "text": tg_text,
                        "parse_mode": "Markdown",
                    },
                )
                if res.is_success:
                    is_real_dispatch = True
                    logger.info("Telegram dispatch message sent successfully")
        except Exception as err:
            logger.warning(f"Failed to post to Telegram bot: {err}")

    simulated = not is_real_dispatch

    audit_entry = {
        "id": audit_id,
        "user_id": user_id,
        "action": req.action,
        "target_zone_id": req.target_zone_id,
        "timestamp": now_iso,
        "simulated": simulated,
        "details_json": {
            "notes": req.notes,
            "target_camera_id": req.target_camera_id,
        },
    }

    AUDIT_LOGS_DB.append(audit_entry)

    # Persist to database if table exists
    try:
        async with AsyncSessionLocal() as session:
            db_record = AuditLogModel(
                id=audit_id,
                user_id=user_id,
                action=req.action,
                target_zone_id=req.target_zone_id,
                timestamp=now_iso,
                simulated=simulated,
                details_json=audit_entry["details_json"],
            )
            session.add(db_record)
            await session.commit()
    except Exception as db_err:
        logger.debug(f"Audit log stored in memory (DB persist fallback): {db_err}")

    logger.info(f"Audit log recorded: {audit_id} - action: {req.action} (simulated: {simulated})")
    return audit_entry

@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def list_audit_logs(user: Dict = Depends(get_current_user)):
    return AUDIT_LOGS_DB[::-1]
