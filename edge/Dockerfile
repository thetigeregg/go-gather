# --- Stage 1: web builder ---
FROM node:24.19.0-slim AS builder
WORKDIR /app
ENV HUSKY=0

COPY package.json package-lock.json ./
COPY shared ./shared
COPY server/package.json ./server/package.json
RUN npm ci --ignore-scripts

COPY angular.json tsconfig.json tsconfig.app.json tsconfig.spec.json ionic.config.json capacitor.config.ts ./
COPY src ./src
RUN npm run build

# --- Stage 2: runtime ---
FROM caddy:2.11-alpine
ENV TZ=UTC

COPY edge/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/www /srv

EXPOSE 8080
