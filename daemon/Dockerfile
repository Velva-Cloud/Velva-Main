# ---- Builder: install dev deps and compile TypeScript ----
FROM node:20-bullseye AS builder

WORKDIR /app
COPY package.json tsconfig.json ./
# Install dev dependencies (no lockfile available), skip audits/fund prompts
RUN npm install --no-audit --no-fund
COPY src ./src
RUN npm run build

# ---- Runtime: install only production deps + SteamCMD runtime ----
FROM node:20-bullseye

# Install SteamCMD dependencies and SteamCMD itself
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      curl ca-certificates tar \
      lib32gcc-s1 lib32stdc++6 libc6-i386 && \
    mkdir -p /opt/steamcmd && \
    cd /opt/steamcmd && \
    curl -sqL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz -o steamcmd_linux.tar.gz && \
    tar -xzf steamcmd_linux.tar.gz && \
    rm -f steamcmd_linux.tar.gz && \
    /opt/steamcmd/steamcmd.sh +quit && \
    # Provide PATH access while preserving steamcmd.sh relative linux32 path
    ln -sf /opt/steamcmd/steamcmd.sh /usr/bin/steamcmd && \
    ln -sf /opt/steamcmd/linux32 /usr/bin/linux32 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Provide PATH-based SteamCMD by default; daemon can also work with /opt/steamcmd/steamcmd.sh
ENV STEAMCMD_PATH=steamcmd

# Reduce npm noise/logging
ENV NPM_CONFIG_LOGLEVEL=warn

WORKDIR /app
COPY package.json ./
# Install only production dependencies (no lockfile), skip audits/fund prompts
RUN npm install --omit=dev --no-audit --no-fund
# Copy compiled app from builder
COPY --from=builder /app/dist ./dist

# Expose TLS port
EXPOSE 9443

ENV DAEMON_PORT=9443

CMD ["node", "dist/index.js"]