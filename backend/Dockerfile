# Build stage (Debian-based to match Prisma OpenSSL expectations)
FROM node:20-bookworm-slim AS builder
WORKDIR /app
# Install OpenSSL for Prisma engines during build
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
# Install all deps required to build, falling back to npm i if lockfile isn't present
RUN npm ci || npm i
COPY . .
# Generate Prisma client with appropriate binaries
RUN npx prisma generate
# Build application
RUN npm run build
# Prune dev and optional deps to minimize node_modules for runtime
RUN npm prune --omit=dev --omit=optional || true

# Runtime stage
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# Force Prisma to use the binary engine to avoid Node-API constructor option mismatches
ENV PRISMA_CLIENT_ENGINE_TYPE=binary
# Install OpenSSL and wget for Prisma engines and healthchecks at runtime
RUN apt-get update && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/*
# Copy only what we need
COPY --from=builder /app/package.json ./
# Copy pruned production node_modules (includes Prisma engines generated in builder)
COPY --from=builder /app/node_modules ./node_modules
# Copy built artifacts
COPY --from=builder /app/dist ./dist
# Ensure email templates are available at runtime
COPY --from=builder /app/src/mail/templates /app/dist/src/mail/templates
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/start.sh ./start.sh
RUN chmod +x /app/start.sh
EXPOSE 4000
CMD ["/app/start.sh"]