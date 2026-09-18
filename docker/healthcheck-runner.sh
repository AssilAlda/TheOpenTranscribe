#!/bin/sh
# Phase 8: Docker HEALTHCHECK for the runner container. The runner has no
# HTTP surface (subprocess-only coupling to the transcriber, per the locked
# architecture), so liveness is inferred from a heartbeat file touched on a
# fixed interval by packages/runner/src/index.ts (see heartbeat.ts). The
# staleness threshold here is a fixed multiple of that interval and is
# deliberately independent of RUNNER_POLL_INTERVAL_MS.
set -eu

HEARTBEAT_PATH="${DATA_DIR:?DATA_DIR must be set}/.runner-heartbeat"
STALE_AFTER_SECONDS=60

if [ ! -f "$HEARTBEAT_PATH" ]; then
  echo "runner heartbeat file not found at $HEARTBEAT_PATH" >&2
  exit 1
fi

now=$(date +%s)
mtime=$(stat -c %Y "$HEARTBEAT_PATH")
age=$((now - mtime))

if [ "$age" -gt "$STALE_AFTER_SECONDS" ]; then
  echo "runner heartbeat stale: last touched ${age}s ago (threshold ${STALE_AFTER_SECONDS}s)" >&2
  exit 1
fi

exit 0
