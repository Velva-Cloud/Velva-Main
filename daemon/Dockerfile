FROM node:20-alpine

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