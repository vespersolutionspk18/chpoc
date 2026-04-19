#!/bin/bash
# Persistent SSH tunnel to vast.ai with auto-restart
while true; do
    echo "[$(date)] Starting tunnel to vast.ai..."
    ssh -i ~/.ssh/id_vast -p 19024 \
        -L 8001:localhost:8001 \
        -o StrictHostKeyChecking=no \
        -o ServerAliveInterval=10 \
        -o ServerAliveCountMax=3 \
        -o TCPKeepAlive=yes \
        -o ExitOnForwardFailure=yes \
        -N root@ssh8.vast.ai
    echo "[$(date)] Tunnel dropped. Restarting in 3 seconds..."
    sleep 3
done
