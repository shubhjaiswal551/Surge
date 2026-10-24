import { useEffect, useRef, useState, useCallback } from 'react';
import type { CrowdEvent } from '../types/crowdEvent';
import { WS_BASE_URL } from '../config/api';

interface UseCrowdSocketReturn {
  isConnected: boolean;
  lastEvent: CrowdEvent | null;
  connect: () => void;
  disconnect: () => void;
}

export function useCrowdStream(
  onEvent?: (event: CrowdEvent) => void,
  url: string = WS_BASE_URL
): UseCrowdSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<CrowdEvent | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('[Surge WS] Connected to live backend stream');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastEvent(data);
          if (onEvent) {
            onEvent(data);
          }
        } catch (err) {
          console.error('[Surge WS] Failed to parse message:', err);
        }
      };

      ws.onclose = () => {
        console.log('[Surge WS] Disconnected. Reconnecting in 3s...');
        setIsConnected(false);
        socketRef.current = null;
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.warn('[Surge WS] Socket error:', err);
        ws.close();
      };
    } catch (e) {
      console.error('[Surge WS] Connection failed:', e);
    }
  }, [url, onEvent]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { isConnected, lastEvent, connect, disconnect };
}
