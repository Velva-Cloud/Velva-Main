Hosting Platform (MVP) — Pterodactyl-Style Panel
================================================

This is an MVP for a hosting platform similar to Pterodactyl, built in phases. Phase 1 is implemented here with a NestJS backend (Prisma + MySQL), JWT auth, role-based access, and a Next.js frontend connected to the API. Google and Discord OAuth are prepared—just add your credentials.

Stack
- Backend: Node.js + NestJS (TypeScript), Prisma ORM, Swagger, JWT
- Database: MySQL 8
- Frontend: Next.js (React) + TailwindCSS
- Containerization: Docker + Docker Compose

Monorepo layout
- backend/ — NestJS API
- frontend/ — Next.js web app

Quick start (Docker)
1) Copy environment file
   cp backend/.env.example backend/.env
   # Fill in JWT_SECRET and OAuth values later (optional for now)

2) Start everything
   docker compose up -d --build

3) Run database migrations inside the backend container (first time only)
   docker compose exec backend npx prisma migrate deploy

4) Seed some data (Plans, Nodes)
   docker compose exec backend npx prisma studio
   # In the UI, add:
   # Plans (name, pricePerMonth, resources JSON, isActive: true)
   # Nodes (name, location, ip, status: online, capacity: 100)

5) Open the app
   - Frontend: http://localhost:3000
   - API:      http://localhost:4000/api
   - Swagger:  http://localhost:4000/api/docs

Local development (without Docker)
1) Start MySQL
   docker compose up -d mysql

2) Backend
   cp backend/.env.example backend/.env
   # Keep DATABASE_URL pointing to localhost
   cd backend
   npm i
   npm run prisma:generate
   npm run prisma:migrate -- --name init
   npm run dev
   # API at http://localhost:4000/api

3) Frontend
   cd frontend
   npm i
   # To have the Next server proxy /api to your local backend:
   #   export API_PROXY_TARGET=http://localhost:4000
   # Then:
   npm run dev
   # Frontend at http://localhost:3000

Environment variables (backend/.env)
- DATABASE_URL
  - For Docker, docker-compose sets DATABASE_URL to mysql://panel:panel@mysql:3306/panel at runtime
  - For local dev, use mysql://panel:panel@localhost:3306/panel
- JWT_SECRET, JWT_EXPIRES_IN
- FRONTEND_URL (default http://localhost:3000)
- Google OAuth:
  - GOOGLE_CLIENT_ID
  - GOOGLE_CLIENT_SECRET
  - GOOGLE_CALLBACK_URL (default http://localhost:4000/api/auth/google/callback)
- Discord OAuth:
  - DISCORD_CLIENT_ID
  - DISCORD_CLIENT_SECRET
  - DISCORD_CALLBACK_URL (default http://localhost:4000/api/auth/discord/callback)

Environment variables (frontend)
- NEXT_PUBLIC_API_BASE_URL
  - Default is /api (suitable when behind a reverse proxy or when using the rewrite below)
- API_PROXY_TARGET
  - If set (e.g., http://backend:4000 in Docker or http://localhost:4000 locally), Next.js will proxy /api to this target via next.config.js rewrites

OAuth setup (Google & Discord)
- Configure OAuth apps in Google Cloud Console and Discord Developer Portal.
- Use these callback URLs (defaults):
  - Google:  http://localhost:4000/api/auth/google/callback
  - Discord: http://localhost:4000/api/auth/discord/callback
- After successful OAuth, the backend issues a JWT and redirects to:
  - {FRONTEND_URL}/auth/callback?token=... (defaults to http://localhost:3000/auth/callback)

API endpoints (Phase 1)
- POST   /api/auth/register
- POST   /api/auth/login
- GET    /api/auth/google
- GET    /api/auth/google/callback
- GET    /api/auth/discord
- GET    /api/auth/discord/callback
- GET    /api/plans
- POST   /api/subscriptions               (auth)
- GET    /api/servers                     (auth; admin can use ?all=1)
- POST   /api/servers                     (auth)
- GET    /api/nodes                       (auth)
- GET    /api/logs                        (auth; ADMIN/OWNER)
- GET    /api/users                       (auth; ADMIN/OWNER)
- PATCH  /api/users/:id/role              (auth; ADMIN/OWNER)

Role & Permission highlights
- Roles: OWNER, ADMIN, SUPPORT, USER
- First registered user becomes OWNER (bootstrap)
- OWNER has access to all resources
- ADMIN can view users/logs and edit roles

Frontend pages
- /               Landing (fetches plans)
- /login          Email/password + OAuth buttons
- /register       Email/password + OAuth buttons
- /auth/callback  Stores the JWT after OAuth and redirects
- /dashboard      Lists your servers, mock create

Docker services
- mysql      MySQL 8 with default creds for local dev
- backend    NestJS API (port 4000)
- frontend   Next.js app (port 3000)
- redis      (commented; reserved for future phases)

Next phases
- Phase 2: Admin plan CRUD, mock subscriptions & transactions, credits table
- Phase 3: Mock server provisioning controls, plan limits, server details page
- Phase 4: Stripe/PayPal, provisioning daemon (Docker/LXC), Redis queues, hardened security

Troubleshooting
- If backend can’t connect to DB in Docker:
  - Ensure DATABASE_URL is set to mysql://panel:panel@mysql:3306/panel (compose sets this by default)
- If OAuth fails:
  - Check your Client IDs/Secrets and callback URLs in backend/.env
  - Ensure the app origins/redirects configured in provider dashboards match localhost ports
- Prisma Studio not opening:
  - Use: docker compose exec backend npx prisma studio