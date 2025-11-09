# Simple SRCDS runner image for SteamCMD-based servers (e.g., Garry's Mod)
# Usage:
#   docker build -t velva/srds-runner:latest .
#   docker run --rm -it \
#     -v /data/servers/26:/home/steam/server \
#     --cap-add=SYS_NICE \
#     -e APP_ID=4020 -e BRANCH=x86-64 -e PORT=27015 \
#     -e SRCDS_ARGS="-game garrysmod -console +map gm_construct" \
#     velva/srds-runner:latest
FROM debian:bullseye-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl tar lib32gcc-s1 lib32stdc++6 libc6-i386 \
    && mkdir -p /opt/steamcmd \
    && cd /opt/steamcmd \
    && curl -sqL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz -o steamcmd_linux.tar.gz \
    && tar -xzf steamcmd_linux.tar.gz \
    && rm -f steamcmd_linux.tar.gz \
    && chmod +x /opt/steamcmd/steamcmd.sh \
    && /opt/steamcmd/steamcmd.sh +quit || true \
    && ln -sf /opt/steamcmd/steamcmd.sh /usr/bin/steamcmd \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -d /home/steam -s /bin/bash steam \
    && mkdir -p /home/steam \
    && chown -R steam:steam /home/steam \
    && chown -R steam:steam /opt/steamcmd

USER steam
WORKDIR /home/steam

# Server directory
ENV SERVER_DIR=/home/steam/server
RUN mkdir -p ${SERVER_DIR}

# Ensure SteamCMD is in PATH
ENV PATH="/opt/steamcmd:/usr/bin:${PATH}"

# Copy entrypoint
COPY --chown=steam:steam entrypoint.sh /home/steam/entrypoint.sh
RUN chmod +x /home/steam/entrypoint.sh

# Defaults
ENV APP_ID="" \
    BRANCH="public" \
    PORT="27015" \
    SRCDS_ARGS="-console" \
    GSLT=""

EXPOSE 27015/udp

ENTRYPOINT ["/home/steam/entrypoint.sh"]