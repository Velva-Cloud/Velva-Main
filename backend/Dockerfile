# Build stage (Debian-based to match Prisma OpenSSL expectations)
FROM node:20-bookworm-slim AS builder
WORKDIR /app
# Install OpenSSL for Prisma engines during build
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci || npm i
COPY . .
# Generate Prisma client with appropriate binaries
RUN npx prisma generate
RUN npm run build

# Runtime stage
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# Install OpenSSL for Prisma engines at runtime
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/start.sh ./start.sh
RUN chmod +x /app/start.sh
EXPOSE 4000
CMD ["/app/start.sh"]