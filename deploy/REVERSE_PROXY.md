Reverse Proxy Setup for panel.velvacloud.com
============================================

Use your existing web server (currently serving velvacloud.com) to proxy the subdomain panel.velvacloud.com to the containers.

Assumptions
- Docker Compose exposes:
  - Frontend: localhost:3000
  - Backend API: localhost:4000
- DNS: panel.velvacloud.com A-record points to this server
- SSL: handled by your existing reverse proxy (recommended) or via certbot

Nginx (example)
server {
  listen 80;
  listen 443 ssl http2;
  server_name panel.velvacloud.com;

  # SSL certs (example - replace paths)
  ssl_certificate     /etc/letsencrypt/live/panel.velvacloud.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/panel.velvacloud.com/privkey.pem;

  # Frontend
  location / {
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_pass http://127.0.0.1:3000;
  }

  # API (preserve /api prefix for Nest globalPrefix)
  location /api/ {
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_pass http://127.0.0.1:4000/api/;
  }
}

Caddy (example)
panel.velvacloud.com {
  encode gzip

  @api path /api* /api/*
  handle @api {
    reverse_proxy 127.0.0.1:4000
  }

  handle {
    reverse_proxy 127.0.0.1:3000
  }
}

Apache (example)
<VirtualHost *:443>
  ServerName panel.velvacloud.com
  SSLEngine on
  SSLCertificateFile /etc/letsencrypt/live/panel.velvacloud.com/fullchain.pem
  SSLCertificateKeyFile /etc/letsencrypt/live/panel.velvacloud.com/privkey.pem

  ProxyPreserveHost On
  # Keep /api prefix when proxying
  ProxyPass        /api/ http://127.0.0.1:4000/api/
  ProxyPassReverse /api/ http://127.0.0.1:4000/api/

  ProxyPass        / http://127.0.0.1:3000/
  ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>

Backend environment variables
- In backend/.env (or docker-compose):
  FRONTEND_URL=https://panel.velvacloud.com
  GOOGLE_CALLBACK_URL=https://panel.velvacloud.com/api/auth/google/callback
  DISCORD_CALLBACK_URL=https://panel.velvacloud.com/api/auth/discord/callback

Then:
1) Update DNS for panel.velvacloud.com
2) Reload your reverse proxy
3) Restart the stack:
   docker compose up -d --build