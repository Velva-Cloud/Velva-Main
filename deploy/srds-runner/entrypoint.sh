#!/bin/bash
set -euo pipefail

SERVER_DIR="${SERVER_DIR:-/home/steam/server}"
APP_ID="${APP_ID:-}"
BRANCH="${BRANCH:-public}"
PORT="${PORT:-27015}"
SRCDS_ARGS="${SRCDS_ARGS:-"-console"}"
GSLT="${GSLT:-}"

mkdir -p "$SERVER_DIR"
cd "$SERVER_DIR"

echo "[runner] server dir: $SERVER_DIR"
echo "[runner] appId=$APP_ID branch=$BRANCH port=$PORT"
echo "[runner] args=$SRCDS_ARGS"

if [[ -z "$APP_ID" ]]; then
  echo "[runner] APP_ID is required"
  exit 2
fi

# Preflight steamcmd
steamcmd +quit || true

retry_install() {
  local attempt=1
  local max=5
  while (( attempt <= max )); do
    echo "[runner] steamcmd install attempt $attempt/$max ..."
    # Cleanup caches between attempts
    rm -rf "$SERVER_DIR/steamapps/depotcache" || true
    rm -f "$SERVER_DIR/steamapps/appmanifest_${APP_ID}.acf" || true
    rm -rf /opt/steamcmd/package/* || true

    if [[ "$BRANCH" == "public" || -z "$BRANCH" ]]; then
      CMD=(+@sSteamCmdForcePlatformType linux +@ShutdownOnFailedCommand 1 +@NoPromptForPassword 1 +force_install_dir "$SERVER_DIR" +login anonymous +app_update "$APP_ID" validate +quit)
    else
      CMD=(+@sSteamCmdForcePlatformType linux +@ShutdownOnFailedCommand 1 +@NoPromptForPassword 1 +force_install_dir "$SERVER_DIR" +login anonymous +app_update "$APP_ID" -beta "$BRANCH" validate +quit)
    fi

    set +e
    OUT="$(steamcmd "${CMD[@]}" 2>&1)"
    CODE=$?
    set -e
    echo "$OUT"

    if echo "$OUT" | grep -qi "Success! App '${APP_ID}' fully installed"; then
      echo "[runner] install success via Success! marker"
      return 0
    fi
    if [[ "$CODE" -eq 0 ]]; then
      echo "[runner] install exited 0"
      return 0
    fi
    if echo "$OUT" | grep -qi "state is 0x602"; then
      echo "[runner] transient 0x602; retrying..."
      sleep 2
      attempt=$((attempt+1))
      continue
    fi
    echo "[runner] install failed code=$CODE; retrying..."
    sleep 2
    attempt=$((attempt+1))
  done
  echo "[runner] install failed after $max attempts"
  return 1
}

retry_install

# Prepare runtime
echo "$APP_ID" > "$SERVER_DIR/steam_appid.txt" || true
mkdir -p "$SERVER_DIR/.steam/sdk32" "$SERVER_DIR/.steam/sdk64" || true
if [[ -f "$SERVER_DIR/bin/steamclient.so" ]]; then
  ln -sf "$SERVER_DIR/bin/steamclient.so" "$SERVER_DIR/.steam/sdk32/steamclient.so" || true
fi
if [[ -f "$SERVER_DIR/bin/linux64/steamclient.so" ]]; then
  ln -sf "$SERVER_DIR/bin/linux64/steamclient.so" "$SERVER_DIR/.steam/sdk64/steamclient.so" || true
fi

# Pick binary
ENGINE=""
if [[ -f "$SERVER_DIR/srcds_linux64" && "$BRANCH" =~ x86-64 ]]; then
  ENGINE="$SERVER_DIR/srcds_linux64"
elif [[ -f "$SERVER_DIR/srcds_linux" ]]; then
  ENGINE="$SERVER_DIR/srcds_linux"
elif [[ -f "$SERVER_DIR/bin/srcds_linux64" && "$BRANCH" =~ x86-64 ]]; then
  ENGINE="$SERVER_DIR/bin/srcds_linux64"
elif [[ -f "$SERVER_DIR/bin/srcds_linux" ]]; then
  ENGINE="$SERVER_DIR/bin/srcds_linux"
elif [[ -f "$SERVER_DIR/srcds_run" ]]; then
  ENGINE="$SERVER_DIR/srcds_run -binary srcds_linux"
else
  echo "[runner] no SRCDS binary found in $SERVER_DIR"
  exit 3
fi

# Ensure logs/cfg exist
mkdir -p "$SERVER_DIR/garrysmod/logs" "$SERVER_DIR/garrysmod/cfg" || true

# Build final args
ARGS=(-game garrysmod -console -ip 0.0.0.0 -port "$PORT" -strictportbind -norestart)
# Append user arg string (keep word splitting intentionally)
# shellcheck disable=SC2086
ARGS+=($SRCDS_ARGS)
if [[ -n "$GSLT" ]]; then
  ARGS+=(+sv_setsteamaccount "$GSLT")
fi

echo "[runner] launching: $ENGINE ${ARGS[*]}"
export LD_LIBRARY_PATH="$SERVER_DIR:$SERVER_DIR/bin:$SERVER_DIR/bin/linux64:${LD_LIBRARY_PATH:-}"
exec bash -lc "$ENGINE ${ARGS[*]}"