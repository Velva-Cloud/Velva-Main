VelvaCloud Daemon (Agent)
=========================

Purpose
- Runs on each node (Docker host) and manages containers for servers.
- Accepts API requests from the panel over mTLS and executes:
  - POST /provision
  - POST /start/:id
  - POST /stop/:id
  - POST /restart/:id
  - DELETE /delete/:id
  - GET /metrics, GET /health

Security
- mTLS is required. The daemon validates the client certificate against a CA you provide.
- The panel must present a valid client certificate signed by that CA.
- Recommended: one CA per environment, and a unique client cert per panel deployment.

Quick start (local)
1) Generate a CA and certs (example with openssl)
   # CA
   openssl genrsa -out ca.key 4096
   openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt -subj "/CN=VelvaCloud-CA"
   # Server cert
   openssl genrsa -out daemon.key 2048
   openssl req -new -key daemon.key -out daemon.csr -subj "/CN=daemon.local"
   openssl x509 -req -in daemon.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out daemon.crt -days 825 -sha256
   # Client cert for panel
   openssl genrsa -out panel.key 2048
   openssl req -new -key panel.key -out panel.csr -subj "/CN=panel"
   openssl x509 -req -in panel.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out panel.crt -days 825 -sha256

2) Start daemon
   export DAEMON_PORT=9443
   export DAEMON_TLS_CERT=/path/to/daemon.crt
   export DAEMON_TLS_KEY=/path/to/daemon.key
   export DAEMON_TLS_CA=/path/to/ca.crt
   npm i
   npm run build
   node dist/index.js

3) Configure the panel (backend .env)
   DAEMON_URL=https://daemon.local:9443
   DAEMON_CA=/path/to/ca.crt
   DAEMON_CLIENT_CERT=/path/to/panel.crt
   DAEMON_CLIENT_KEY=/path/to/panel.key

4) Test
   - Create a plan + subscription in the panel
   - Create a server; the panel will call /provision on the daemon
   - Start/Stop/Restart from the server page will call respective endpoints

Notes
- Docker socket must be available to the daemon process (default /var/run/docker.sock).
- Provision does not start the container; use /start to run it.
- Resource limits are applied if cpu (units) and ramMB are provided.