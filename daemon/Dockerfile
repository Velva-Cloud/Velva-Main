FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
RUN npm install --production
COPY src ./src
RUN npm run build

# Expose TLS port
EXPOSE 9443

ENV DAEMON_PORT=9443

CMD ["node", "dist/index.js"]