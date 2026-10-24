"""
Surge - Emergency Notification & External Dispatch Service
Dispatches high-severity crowd emergency notifications to:
  1. Generic Webhooks (Slack, Discord, custom security SOC receivers)
  2. Telegram Bot Broadcasts
Logs all dispatch attempts with resilient error handling.
"""

import os
import json
import logging
import urllib.request
import urllib.error
import asyncio
from typing import Dict, Any, Optional

logger = logging.getLogger("surge.notifier")

DISPATCH_WEBHOOK_URL = os.getenv("DISPATCH_WEBHOOK_URL", "")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

class NotifierService:
    def __init__(self):
        self.webhook_url = DISPATCH_WEBHOOK_URL
        self.telegram_token = TELEGRAM_BOT_TOKEN
        self.telegram_chat_id = TELEGRAM_CHAT_ID

    async def dispatch_emergency_notification(self, incident: Dict[str, Any], custom_note: Optional[str] = None) -> bool:
        """
        Dispatches high-priority alert payload asynchronously without blocking the video pipeline.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._send_sync_dispatch, incident, custom_note)

    def _send_sync_dispatch(self, incident: Dict[str, Any], custom_note: Optional[str] = None) -> bool:
        event_type = incident.get("event_type", "surge").upper()
        severity = incident.get("severity", 4)
        cam_id = incident.get("camera_id", "Unknown")
        zone_id = incident.get("zone_id", "Unknown")
        detected_at = incident.get("detected_at", "")
        metrics = incident.get("metrics_json") or incident.get("metrics", {})
        density = metrics.get("density", "N/A")
        headcount = metrics.get("headcount", "N/A")
        snapshot_url = incident.get("snapshot_url", "")

        message_text = (
            f"🚨 [Surge EMERGENCY DISPATCH]\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• Anomaly: {event_type} (Severity Level: {severity}/5)\n"
            f"• Camera: {cam_id} | Zone: {zone_id}\n"
            f"• Headcount: {headcount} | Density: {density} p/m²\n"
            f"• Time: {detected_at}\n"
        )
        if snapshot_url:
            message_text += f"• Snapshot URL: {snapshot_url}\n"
        if custom_note:
            message_text += f"• Operator Note: {custom_note}\n"
        message_text += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nImmediate physical security review advised."

        logger.info(f"📢 [Emergency Dispatcher] Preparing dispatch for {cam_id} ({event_type})...")

        dispatched = False

        # 1. Dispatch via Webhook if configured
        if self.webhook_url:
            try:
                payload = {
                    "text": message_text,
                    "event_type": event_type,
                    "severity": severity,
                    "camera_id": cam_id,
                    "zone_id": zone_id,
                    "incident_id": incident.get("id"),
                    "snapshot_url": snapshot_url,
                }
                req = urllib.request.Request(
                    self.webhook_url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=4) as response:
                    if 200 <= response.status < 300:
                        logger.info(f"✅ [Notifier] Webhook dispatched successfully to {self.webhook_url[:30]}...")
                        dispatched = True
            except Exception as e:
                logger.warning(f"⚠️ [Notifier] Webhook dispatch failed: {e}")

        # 2. Dispatch via Telegram Bot API if configured
        if self.telegram_token and self.telegram_chat_id:
            try:
                telegram_url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
                tg_payload = {
                    "chat_id": self.telegram_chat_id,
                    "text": message_text,
                    "parse_mode": "Markdown",
                }
                req = urllib.request.Request(
                    telegram_url,
                    data=json.dumps(tg_payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=4) as response:
                    if 200 <= response.status < 300:
                        logger.info("✅ [Notifier] Telegram emergency message broadcast successfully.")
                        dispatched = True
            except Exception as e:
                logger.warning(f"⚠️ [Notifier] Telegram dispatch failed: {e}")

        if not self.webhook_url and not (self.telegram_token and self.telegram_chat_id):
            logger.info(
                f"ℹ️ [Notifier] Simulated dispatch (no external webhook/telegram configured in .env):\n{message_text}"
            )
            dispatched = True

        return dispatched

notifier = NotifierService()
