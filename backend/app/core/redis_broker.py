"""
Surge - Redis Alert Queue & Event Broker
Implements the live alert queue specified in docs/schema.md:
  Key pattern: alerts:live:{camera_id} (TTL: 30s)
  Channel: alerts:broadcast (Pub/Sub for distributed workers)
Gracefully degrades to an in-memory queue if Redis is not running locally.
"""

import asyncio
import json
import logging
import os
from typing import Dict, Optional, Callable, List
try:
    import redis.asyncio as aioredis
except ImportError:
    aioredis = None

logger = logging.getLogger("surge.redis_broker")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

class AlertBroker:
    def __init__(self, url: str = REDIS_URL):
        self.url = url
        self.client = None
        self.is_connected = False
        self._fallback_memory_store: Dict[str, dict] = {}
        self._subscribers: List[Callable[[dict], None]] = []

    async def connect(self):
        """Attempts to connect to Redis. Falls back to in-memory mode if unavailable."""
        if aioredis is None:
            self.is_connected = False
            self.client = None
            logger.info("ℹ️ [Redis Broker] Redis client library not installed. Operating in resilient In-Memory Broker mode.")
            return

        try:
            self.client = aioredis.from_url(
                self.url,
                decode_responses=True,
                socket_connect_timeout=1.5,
            )
            await self.client.ping()
            self.is_connected = True
            logger.info(f"✅ [Redis Broker] Connected to live Redis instance at {self.url}")
        except Exception as e:
            self.is_connected = False
            self.client = None
            logger.warning(
                f"⚠️ [Redis Broker] Redis not reachable ({e}). Operating in resilient In-Memory Broker mode."
            )

    async def push_alert(self, camera_id: str, alert_payload: dict, ttl_seconds: int = 30):
        """
        Pushes a confirmed anomaly payload per docs/schema.md:
        Key pattern: alerts:live:{camera_id} with short TTL.
        Also publishes to the alerts:broadcast channel.
        """
        payload_json = json.dumps(alert_payload)

        if self.is_connected and self.client:
            try:
                key = f"alerts:live:{camera_id}"
                # Store with TTL (transient hand-off)
                await self.client.set(key, payload_json, ex=ttl_seconds)
                # Publish to pub/sub channel for any external worker/listeners
                await self.client.publish("alerts:broadcast", payload_json)
                return
            except Exception as e:
                logger.error(f"[Redis Broker] Error writing to Redis: {e}. Falling back to memory.")

        # Fallback in-memory handoff
        self._fallback_memory_store[camera_id] = alert_payload

    async def get_latest_alert(self, camera_id: str) -> Optional[dict]:
        """Fetches the latest live alert for a camera if active within TTL."""
        if self.is_connected and self.client:
            try:
                data = await self.client.get(f"alerts:live:{camera_id}")
                return json.loads(data) if data else None
            except Exception:
                pass
        return self._fallback_memory_store.get(camera_id)

    async def close(self):
        if self.client:
            await self.client.close()
            logger.info("[Redis Broker] Closed Redis connection.")

alert_broker = AlertBroker()
