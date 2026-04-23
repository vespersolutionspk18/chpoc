# Safe City NVR API Documentation

## Overview

This API provides access to Hikvision NVR cameras for listing, snapshots, and live streaming.

## Connection Details

| Environment | Base URL |
|-------------|----------|
| Local | `http://localhost:8080` |
| Local Network | `http://192.168.0.10:8080` |
| Remote/Public | `http://chscinspoc.duckdns.org:8080` |

## Authentication

All API endpoints (except `/health`) require an API key passed via header:

```
X-API-Key: e08e71be5a1cac6babe9664cfee3393d2caeba6843d6554bb67ea0dcc2ce5b84
```

For WebSocket connections, pass the API key as a query parameter:
```
?apiKey=e08e71be5a1cac6babe9664cfee3393d2caeba6843d6554bb67ea0dcc2ce5b84
```

---

## REST API Endpoints

### Health Check

Check if the server is running.

```
GET /health
```

**Authentication:** None required

**Example:**
```bash
curl http://chscinspoc.duckdns.org:8080/health
```

**Response:**
```json
{
  "status": "ok",
  "activeStreams": 0,
  "timestamp": "2026-02-02T14:35:20.268Z"
}
```

---

### List All Cameras

Get a list of all cameras connected to the NVR.

```
GET /api/cameras
```

**Example:**
```bash
curl -H "X-API-Key: e08e71be5a1cac6babe9664cfee3393d2caeba6843d6554bb67ea0dcc2ce5b84" \
  http://chscinspoc.duckdns.org:8080/api/cameras
```

**Response:**
```json
{
  "success": true,
  "count": 12,
  "cameras": [
    {
      "id": 2,
      "name": "Front Entrance",
      "ip": "192.168.0.51",
      "online": true,
      "streams": {
        "main": {
          "id": 201,
          "resolution": "3840x2160",
          "codec": "H.265",
          "fps": 25
        },
        "sub": {
          "id": 202,
          "resolution": "704x576",
          "codec": "H.265",
          "fps": 25
        }
      }
    },
    {
      "id": 3,
      "name": "Parking Lot",
      "ip": "192.168.0.52",
      "online": true,
      "streams": {
        "main": { "id": 301, "resolution": "2560x1440", "codec": "H.265", "fps": 25 },
        "sub": { "id": 302, "resolution": "704x576", "codec": "H.265", "fps": 25 }
      }
    }
  ]
}
```

---

### Get Single Camera

Get details for a specific camera.

```
GET /api/cameras/:id
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Camera/channel number (e.g., 2, 3, 4) |

**Example:**
```bash
curl -H "X-API-Key: e08e71be5a1cac6babe9664cfee3393d2caeba6843d6554bb67ea0dcc2ce5b84" \
  http://chscinspoc.duckdns.org:8080/api/cameras/2
```

**Response:**
```json
{
  "success": true,
  "camera": {
    "id": 2,
    "name": "Front Entrance",
    "ip": "192.168.0.51",
    "online": true,
    "streams": {
      "main": { "id": 201, "resolution": "3840x2160", "codec": "H.265", "fps": 25 },
      "sub": { "id": 202, "resolution": "704x576", "codec": "H.265", "fps": 25 }
    }
  }
}
```

---

### Get Camera Snapshot

Get a JPEG snapshot from a camera.

```
GET /api/cameras/:id/snapshot
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Camera/channel number |

**Example:**
```bash
# Save to file
curl -H "X-API-Key: e08e71be5a1cac6babe9664cfee3393d2caeba6843d6554bb67ea0dcc2ce5b84" \
  http://chscinspoc.duckdns.org:8080/api/cameras/2/snapshot \
  --output snapshot.jpg

# Open directly (macOS)
curl -H "X-API-Key: e08e71be5a1cac6babe9664cfee3393d2caeba6843d6554bb67ea0dcc2ce5b84" \
  http://chscinspoc.duckdns.org:8080/api/cameras/2/snapshot \
  -o /tmp/snap.jpg && open /tmp/snap.jpg
```

**Response:** Binary JPEG image

**Content-Type:** `image/jpeg`

---

## WebSocket Live Streaming

### Connect to Live Stream

Stream live MJPEG video from a camera via WebSocket.

```
WS /stream/:channelId?apiKey=YOUR_API_KEY
```

**Channel ID Format:**

The channel ID combines the camera number with the stream type:

| Camera | Main Stream (4K/HD) | Sub Stream (SD) |
|--------|---------------------|-----------------|
| Camera 2 | 201 | 202 |
| Camera 3 | 301 | 302 |
| Camera 4 | 401 | 402 |
| Camera N | N01 | N02 |

- **Main stream (X01):** Full resolution, higher bandwidth
- **Sub stream (X02):** Lower resolution, less bandwidth (recommended for remote viewing)

**Example URLs:**
```
ws://chscinspoc.duckdns.org:8080/stream/202?apiKey=e08e71be5a1cac6babe9664cfee3393d2caeba6843d6554bb67ea0dcc2ce5b84
ws://localhost:8080/stream/301?apiKey=e08e71be5a1cac6babe9664cfee3393d2caeba6843d6554bb67ea0dcc2ce5b84
```

### JavaScript Client Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>Camera Stream</title>
</head>
<body>
  <h1>Camera 2 - Live Feed</h1>
  <img id="video" style="width: 100%; max-width: 800px; border: 2px solid #333;">
  <p>Status: <span id="status">Connecting...</span></p>

  <script>
    const API_KEY = 'e08e71be5a1cac6babe9664cfee3393d2caeba6843d6554bb67ea0dcc2ce5b84';
    const CHANNEL_ID = 202; // Camera 2, sub-stream
    const SERVER = 'chscinspoc.duckdns.org:8080';

    const img = document.getElementById('video');
    const status = document.getElementById('status');

    let ws;
    let prevUrl = null;

    function connect() {
      ws = new WebSocket(`ws://${SERVER}/stream/${CHANNEL_ID}?apiKey=${API_KEY}`);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        status.textContent = 'Connected';
        status.style.color = 'green';
      };

      ws.onmessage = (event) => {
        // Revoke previous blob URL to prevent memory leak
        if (prevUrl) URL.revokeObjectURL(prevUrl);

        const blob = new Blob([event.data], { type: 'image/jpeg' });
        prevUrl = URL.createObjectURL(blob);
        img.src = prevUrl;
      };

      ws.onclose = () => {
        status.textContent = 'Disconnected - Reconnecting...';
        status.style.color = 'red';
        setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
      };
    }

    connect();
  </script>
</body>
</html>
```

### React Component Example

```jsx
import React, { useEffect, useRef, useState } from 'react';

const CameraStream = ({ channelId, apiKey, server = 'chscinspoc.duckdns.org:8080' }) => {
  const imgRef = useRef(null);
  const wsRef = useRef(null);
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    let prevUrl = null;

    const connect = () => {
      const ws = new WebSocket(`ws://${server}/stream/${channelId}?apiKey=${apiKey}`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => setStatus('connected');

      ws.onmessage = (event) => {
        if (prevUrl) URL.revokeObjectURL(prevUrl);
        const blob = new Blob([event.data], { type: 'image/jpeg' });
        prevUrl = URL.createObjectURL(blob);
        if (imgRef.current) imgRef.current.src = prevUrl;
      };

      ws.onclose = () => {
        setStatus('disconnected');
        setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (prevUrl) URL.revokeObjectURL(prevUrl);
    };
  }, [channelId, apiKey, server]);

  return (
    <div>
      <img ref={imgRef} alt={`Camera ${channelId}`} style={{ width: '100%', maxWidth: 800 }} />
      <p>Status: {status}</p>
    </div>
  );
};

// Usage
<CameraStream
  channelId={202}
  apiKey="e08e71be5a1cac6babe9664cfee3393d2caeba6843d6554bb67ea0dcc2ce5b84"
/>
```

### Python Client Example

```python
import asyncio
import websockets

API_KEY = 'e08e71be5a1cac6babe9664cfee3393d2caeba6843d6554bb67ea0dcc2ce5b84'
CHANNEL_ID = 202
SERVER = 'chscinspoc.duckdns.org:8080'

async def stream_camera():
    uri = f'ws://{SERVER}/stream/{CHANNEL_ID}?apiKey={API_KEY}'

    async with websockets.connect(uri) as ws:
        print(f'Connected to camera {CHANNEL_ID}')
        frame_count = 0

        async for message in ws:
            frame_count += 1
            # Save frame to file
            with open(f'/tmp/frame_{frame_count:05d}.jpg', 'wb') as f:
                f.write(message)
            print(f'Received frame {frame_count} ({len(message)} bytes)')

asyncio.run(stream_camera())
```

---

## NVR Direct Access (ISAPI)

For advanced operations, you can access the NVR directly via Hikvision ISAPI.

**NVR Details:**
- IP: `192.168.0.49`
- Auth: HTTP Digest (`admin` / `hik12045`)
- Model: iDS-9664NXI-M8/X (64-channel)

### Get Device Info

```bash
curl --digest -u admin:hik12045 \
  http://192.168.0.49/ISAPI/System/deviceInfo
```

### Get All Channels

```bash
curl --digest -u admin:hik12045 \
  http://192.168.0.49/ISAPI/ContentMgmt/InputProxy/channels
```

### Get Channel Status

```bash
curl --digest -u admin:hik12045 \
  http://192.168.0.49/ISAPI/ContentMgmt/InputProxy/channels/status
```

### Get Snapshot Directly from NVR

```bash
curl --digest -u admin:hik12045 \
  "http://192.168.0.49/ISAPI/Streaming/channels/201/picture" \
  --output snapshot.jpg
```

---

## Recording & Playback

### Search for Recordings

Find recordings within a time range.

```bash
curl --digest -u admin:hik12045 \
  -X POST "http://192.168.0.49/ISAPI/ContentMgmt/search" \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0" encoding="UTF-8"?>
<CMSearchDescription>
  <searchID>1</searchID>
  <trackList>
    <trackID>201</trackID>
  </trackList>
  <timeSpanList>
    <timeSpan>
      <startTime>2026-02-01T00:00:00Z</startTime>
      <endTime>2026-02-02T23:59:59Z</endTime>
    </timeSpan>
  </timeSpanList>
  <maxResults>100</maxResults>
  <searchResultPostion>0</searchResultPostion>
  <metadataList>
    <metadataDescriptor>//recordType.meta.std-cgi.com</metadataDescriptor>
  </metadataList>
</CMSearchDescription>'
```

**Response contains:**
```xml
<matchList>
  <searchMatchItem>
    <trackID>201</trackID>
    <startTime>2026-02-01T08:00:00Z</startTime>
    <endTime>2026-02-01T08:30:00Z</endTime>
    <playbackURI>rtsp://192.168.0.49/Streaming/tracks/201?starttime=20260201T080000Z&amp;endtime=20260201T083000Z</playbackURI>
  </searchMatchItem>
</matchList>
```

### Download Recording

```bash
# Download a specific time range
curl --digest -u admin:hik12045 \
  "http://192.168.0.49/ISAPI/ContentMgmt/download?playbackURI=rtsp://192.168.0.49/Streaming/tracks/201?starttime=20260201T100000Z%26endtime=20260201T100500Z" \
  --output recording.mp4
```

### Stream Recording via RTSP

Use VLC or FFmpeg to play recordings:

```bash
# VLC
vlc "rtsp://admin:hik12045@192.168.0.49/Streaming/tracks/201?starttime=20260201T100000Z&endtime=20260201T100500Z"

# FFmpeg - save to file
ffmpeg -rtsp_transport tcp \
  -i "rtsp://admin:hik12045@192.168.0.49/Streaming/tracks/201?starttime=20260201T100000Z&endtime=20260201T100500Z" \
  -c copy output.mp4
```

---

## RTSP Direct Streaming

For direct RTSP access (VLC, FFmpeg, etc.):

**URL Format:**
```
rtsp://admin:hik12045@192.168.0.49:554/Streaming/Channels/{channelId}
```

**Examples:**
```bash
# Camera 2 - Main stream (4K)
vlc rtsp://admin:hik12045@192.168.0.49:554/Streaming/Channels/201

# Camera 2 - Sub stream (SD)
vlc rtsp://admin:hik12045@192.168.0.49:554/Streaming/Channels/202

# Camera 3 - Main stream
vlc rtsp://admin:hik12045@192.168.0.49:554/Streaming/Channels/301
```

### Record RTSP to File

```bash
# Record 60 seconds from camera 2
ffmpeg -rtsp_transport tcp \
  -i "rtsp://admin:hik12045@192.168.0.49:554/Streaming/Channels/202" \
  -t 60 -c copy camera2_recording.mp4

# Record continuously until stopped (Ctrl+C)
ffmpeg -rtsp_transport tcp \
  -i "rtsp://admin:hik12045@192.168.0.49:554/Streaming/Channels/202" \
  -c copy -f segment -segment_time 3600 -reset_timestamps 1 \
  camera2_%03d.mp4
```

---

## Error Responses

All API errors return JSON:

```json
{
  "success": false,
  "error": "Error message here"
}
```

**Common HTTP Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad request (invalid parameters) |
| 401 | Unauthorized (missing or invalid API key) |
| 404 | Camera/resource not found |
| 500 | Server error |
| 503 | NVR unavailable |

---

## Quick Reference

### Environment Variables

```bash
export API_KEY="e08e71be5a1cac6babe9664cfee3393d2caeba6843d6554bb67ea0dcc2ce5b84"
export SERVER="chscinspoc.duckdns.org:8080"
```

### Common Commands

```bash
# Health check
curl http://$SERVER/health

# List all cameras
curl -H "X-API-Key: $API_KEY" http://$SERVER/api/cameras

# Get camera 2 info
curl -H "X-API-Key: $API_KEY" http://$SERVER/api/cameras/2

# Snapshot from camera 2
curl -H "X-API-Key: $API_KEY" http://$SERVER/api/cameras/2/snapshot -o snap.jpg

# Stream camera 2 (sub) - use wscat
wscat -c "ws://$SERVER/stream/202?apiKey=$API_KEY" --binary
```

### Camera Quick Reference

| Camera | Main Stream | Sub Stream | Use Case |
|--------|-------------|------------|----------|
| 2 | 201 | 202 | Front Entrance |
| 3 | 301 | 302 | Parking Lot |
| 4 | 401 | 402 | Back Door |
| ... | N01 | N02 | ... |

---

## Support

- **Server App:** Safe City NVR Server (Electron)
- **NVR Model:** Hikvision iDS-9664NXI-M8/X
- **DuckDNS Domain:** chscinspoc.duckdns.org
