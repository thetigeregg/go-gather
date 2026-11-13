# --- Stage 1: web builder ---
FROM node:24.22.2-slim AS builder
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
# Fail the image build (PR CI builds this image without pushing) rather than
# ship a Caddyfile that crash-loops the container on the NAS.
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
COPY --from=builder /app/www /srv

EXPOSE 8080
