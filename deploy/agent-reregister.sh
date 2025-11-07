#!/usr/bin/env bash
set -euo pipefail

# Re-register the daemon node to issue a new TLS certificate with updated SANs.
# This script:
#  - Ensures docker compose is available
#  - Stops the daemon container
#  - Clears existing TLS artifacts in CERTS_DIR (/data/certs by default)
#  - Starts the daemon so it performs registration and fetches a new cert
#  - Verifies health endpoint

DAEMON_SERVICE="${DAEMON_SERVICE:-hosting_daemon}"
CERTS_DIR_IN_CONTAINER="${CERTS_DIR_IN_CONTAINER:-/data/certs}"
HEALTH_URL="${HEALTH_URL:-https://localhost:9443/health}"
PANEL_API_KEY="${PANEL_API_KEY:-}"

echo "Re-registering daemon node for fresh TLS cert..."
echo "Service: ${DAEMON_SERVICE}"
echo "Certs dir (container path): ${CERTS_DIR_IN_CONTAINER}"
echo

# Stop daemon container
echo "Stopping ${DAEMON_SERVICE}..."
docker compose stop "${DAEMON_SERVICE}"

# Remove TLS artifacts inside the container's mounted certs dir
# We use a temporary one-off container with the same mount to avoid needing the daemon running.
echo "Clearing TLS artifacts from ${CERTS_DIR_IN_CONTAINER} ..."
docker compose run --rm -T "${DAEMON_SERVICE}" sh -lc "
  set -e
  mkdir -p '${CERTS_DIR_IN_CONTAINER}'
  rm -f '${CERTS_DIR_IN_CONTAINER}/agent.crt' \
        '${CERTS_DIR_IN_CONTAINER}/agent.key' \
        '${CERTS_DIR_IN_CONTAINER}/ca.crt' \
        '${CERTS_DIR_IN_CONTAINER}/nonce' \
        '${CERTS_DIR_IN_CONTAINER}/nodeId'
"

# Start daemon container
echo "Starting ${DAEMON_SERVICE}..."
docker compose up -d "${DAEMON_SERVICE}"

# Wait a bit for registration and HTTPS server startup
echo "Waiting for daemon to start and register..."
sleep 5

# Verify health; allow API key header if provided
echo "Verifying daemon health at ${HEALTH_URL} ..."
if [ -n "${PANEL_API_KEY}" ]; then
  wget -qO- --no-check-certificate --header="x-panel-api-key: ${PANEL_API_KEY}" "${HEALTH_URL}" > /dev/null 2>&1 || {
    echo "Health check failed (with API key)."
    exit 1
  }
else
  wget -qO- --no-check-certificate "${HEALTH_URL}" > /dev/null 2>&1 || {
    echo "Health check failed."
    exit 1
  }
fi

echo "Re-registration complete. If the backend uses mTLS, ensure DAEMON_URL points to the public DNS name and that the CA/client certs are configured."