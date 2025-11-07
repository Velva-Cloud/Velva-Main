#!/usr/bin/env bash
set -euo pipefail

# Re-register the daemon node to issue a new TLS certificate with updated SANs.
# This script:
#  - Ensures docker compose is available
#  - Stops the daemon service
#  - Clears existing TLS artifacts in CERTS_DIR (/data/certs by default)
#  - Starts the daemon so it performs registration and fetches a new cert
#  - Verifies health endpoint from inside the daemon container
#  - Automatically uses the PANEL_API_KEY from the container env if set

# Use the Docker Compose service name (not container_name)
DAEMON_SERVICE="${DAEMON_SERVICE:-daemon}"
CERTS_DIR_IN_CONTAINER="${CERTS_DIR_IN_CONTAINER:-/data/certs}"

echo "Re-registering daemon node for fresh TLS cert..."
echo "Service: ${DAEMON_SERVICE}"
echo "Certs dir (container path): ${CERTS_DIR_IN_CONTAINER}"
echo

# Stop daemon service
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

# Start daemon service
echo "Starting ${DAEMON_SERVICE}..."
docker compose up -d "${DAEMON_SERVICE}"

# Poll for health inside the daemon container (localhost:9443), using API key if available
echo "Waiting for daemon to start and register..."
RETRIES=20
SLEEP_SECS=2

# Try to read PANEL_API_KEY from the running container
CONTAINER_API_KEY="$(docker compose exec -T "${DAEMON_SERVICE}" sh -lc 'echo -n "${PANEL_API_KEY:-}"' || true)"

for i in $(seq 1 "${RETRIES}"); do
  if [ -n "${CONTAINER_API_KEY}" ]; then
    if docker compose exec -T "${DAEMON_SERVICE}" sh -lc "wget -qO- --no-check-certificate --header='x-panel-api-key: ${CONTAINER_API_KEY}' https://localhost:9443/health" > /dev/null 2>&1; then
      echo "Daemon health OK (API key)."
      break
    fi
  else
    if docker compose exec -T "${DAEMON_SERVICE}" sh -lc "wget -qO- --no-check-certificate https://localhost:9443/health" > /dev/null 2>&1; then
      echo "Daemon health OK."
      break
    fi
  fi
  echo "Health not ready yet... (${i}/${RETRIES})"
  sleep "${SLEEP_SECS}"
done

if [ "${i}" -ge "${RETRIES}" ]; then
  echo "Health check failed after ${RETRIES} attempts."
  exit 1
fi

echo "Re-registration complete. If the backend uses mTLS, ensure DAEMON_URL points to the public DNS name and that the CA/client certs are configured."