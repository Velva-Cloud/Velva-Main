Hosting Platform Backend (MVP)
================================

Stack
- Node.js + NestJS (TS)
- Prisma ORM + MySQL
- JWT Auth (email/password) + OAuth (Google/Discord)
- Swagger (OpenAPI) at /api/docs

Getting Started (Local)
1) Start MySQL with Docker Compose
   docker compose up -d mysql

2) Create .env
   cp .env.example .env
   # Update DATABASE_URL/JWT_SECRET if needed

3) Install dependencies
   cd backend
   npm i

4) Generate Prisma client and run migrations
   npm run prisma:generate
   npm run prisma:migrate -- --name init

5) (Optional) Seed some data
   Use Prisma Studio:
   npm run prisma:studio
   - Add a few Plans (name, pricePerMonth, resources JSON, isActive) and Nodes
   # A basic seed is also available via `node prisma/seed.js`

6) Start the API
   npm run dev
   # API:  http://localhost:4000/api
   # Docs: http://localhost:4000/api/docs

Core Endpoints (Phase 1)
- POST   /api/auth/register
- POST   /api/auth/login
- GET    /api/plans
- POST   /api/subscriptions           (auth)
- GET    /api/servers                 (auth; admin can use ?all=1)
- POST   /api/servers                 (auth)
- GET    /api/nodes                   (auth)
- GET    /api/logs                    (auth; ADMIN/OWNER)
- GET    /api/users                   (auth; ADMIN/OWNER)
- PATCH  /api/users/:id/role          (auth; ADMIN/OWNER)

Notes
- OAuth (Google/Discord) is implemented: /api/auth/google and /api/auth/discord (configure env vars in .env)
- Logging is implemented for key actions (register/login via metadata, plan_change, server_create).
- Roles supported: OWNER, ADMIN, SUPPORT, USER. Use PATCH /users/:id/role to set roles (ADMIN/OWNER only).
- For MySQL in Docker, default creds are in docker-compose.yml (DB: panel / user: panel / pass: panel).

Next Steps
- Frontend (Next.js + Tailwind) wiring to these endpoints
- Admin Plan management (Phase 2)
- Mock provisioning extensions (Phase 3)
- Real billing + provisioning daemon (Phase 4)