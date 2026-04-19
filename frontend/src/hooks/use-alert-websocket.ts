"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAlertStore } from "@/lib/stores/use-alert-store";
import { useAppStore } from "@/lib/stores/use-app-store";
import type { Alert } from "@/lib/types";

const DEFAULT_WS_URL = "ws://localhost:8000/ws/alerts";
const MAX_BACKOFF_MS = 30_000;

export function useAlertWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const addAlert = useAlertStore((s) => s.addAlert);
  const setWsConnected = useAppStore((s) => s.setWsConnected);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const url =
      (typeof process !== "undefined" &&
        process.env?.NEXT_PUBLIC_WS_ALERTS_URL) ||
      DEFAULT_WS_URL;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      backoffRef.current = 1000;
      setIsConnected(true);
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const alert = JSON.parse(event.data) as Alert;
        addAlert(alert);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      setWsConnected(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror, so reconnect is handled there
      ws.close();
    };
  }, [addAlert, setWsConnected]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;

    const delay = backoffRef.current;
    backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);

    reconnectTimerRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      setWsConnected(false);
    };
  }, [connect, setWsConnected]);

  return { isConnected };
}
