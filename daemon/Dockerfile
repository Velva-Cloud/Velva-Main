FROM node:20-bullseye

# Install SteamCMD dependencies and SteamCMD itself
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates tar lib32gcc-s1 && \
    mkdir -p /opt/steamcmd && \
    cd /opt/steamcmd && \
    curl -sqL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz -o steamcmd_linux.tar.gz && \
    tar -xzf steamcmd_linux.tar.gz && \
    rm -f steamcmd_linux.tar.gz && \
    /opt/steamcmd/steamcmd.sh +quit && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

ENV STEAMCMD_PATH=/opt/steamcmd/steamcmd.sh

WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
# Install all dependencies including dev for build step
RUN npm install
COPY src ./src
# Build TypeScript -> dist
RUN npm run build
# Remove devDependencies to minimize image size
RUN npm prune --production

# Expose TLS port
EXPOSE 9443

ENV DAEMON_PORT=9443

CMD ["node", "dist/index.js"]