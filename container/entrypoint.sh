#!/bin/bash
set -e

# Start chisel client if server URL is provided
if [ -n "$CHISEL_SERVER_URL" ]; then
    chisel client "$CHISEL_SERVER_URL" R:socks &
    echo "Chisel tunnel started"
fi

# Mount NFS if configured
if [ -n "$NFS_SERVER" ] && [ -n "$NFS_PATH" ]; then
    mkdir -p /home/user/workspace
    mount -t nfs "$NFS_SERVER:$NFS_PATH" /home/user/workspace -o nolock,soft,timeo=10 || \
        echo "NFS mount failed, continuing without it"
fi

# Switch to user and start PTY bridge
exec su -c "exec /usr/local/bin/pty-bridge" user
