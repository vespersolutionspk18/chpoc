import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

# Simple in-memory connection manager
connected_clients: list[WebSocket] = []


async def broadcast_alert(alert_data: dict) -> None:
    """Broadcast an alert to all connected WebSocket clients."""
    message = json.dumps(alert_data, default=str)
    disconnected = []
    for ws in connected_clients:
        try:
            await ws.send_text(message)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        connected_clients.remove(ws)


@router.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    """Real-time alert streaming to the frontend dashboard."""
    await websocket.accept()
    connected_clients.append(websocket)
    logger.info("WebSocket client connected. Total: %d", len(connected_clients))
    try:
        while True:
            # Keep connection alive; clients can also send filter preferences
            data = await websocket.receive_text()
            # Client can send filter config like {"severity": ["high", "critical"]}
            # For now, just acknowledge
            try:
                msg = json.loads(data)
                await websocket.send_text(json.dumps({"type": "ack", "filters": msg}))
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "detail": "invalid JSON"}))
    except WebSocketDisconnect:
        connected_clients.remove(websocket)
        logger.info("WebSocket client disconnected. Total: %d", len(connected_clients))
