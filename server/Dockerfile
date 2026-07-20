# --- Stage 1: web + OTA artifact builder (needs Angular/Ionic devDependencies) ---
FROM node:24.18.0-slim AS builder
WORKDIR /app
ENV HUSKY=0
RUN apt-get update && apt-get install -y --no-install-recommends zip && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY shared ./shared
COPY server/package.json ./server/package.json
RUN npm ci --ignore-scripts

COPY angular.json tsconfig.json tsconfig.app.json tsconfig.spec.json ionic.config.json capacitor.config.ts ./
COPY config ./config
COPY scripts ./scripts
COPY src ./src
RUN npm run build

ARG BUILD_IOS_LIVE_UPDATE=false
ARG IOS_OTA_NATIVE_BUILD_NUMBER
RUN --mount=type=secret,id=IOS_LIVE_UPDATE_PRIVATE_KEY,required=false \
    --mount=type=secret,id=IOS_BACKEND_ORIGIN_PROD,required=false \
  if [ "$BUILD_IOS_LIVE_UPDATE" = "true" ]; then \
    test -n "$IOS_OTA_NATIVE_BUILD_NUMBER" || { echo "IOS_OTA_NATIVE_BUILD_NUMBER required" >&2; exit 1; }; \
    test -s /run/secrets/IOS_LIVE_UPDATE_PRIVATE_KEY || { echo "IOS_LIVE_UPDATE_PRIVATE_KEY required" >&2; exit 1; }; \
    test -s /run/secrets/IOS_BACKEND_ORIGIN_PROD || { echo "IOS_BACKEND_ORIGIN_PROD required" >&2; exit 1; }; \
    export IOS_BACKEND_ORIGIN_PROD="$(tr -d '\r\n' < /run/secrets/IOS_BACKEND_ORIGIN_PROD)"; \
    export IOS_LIVE_UPDATE_PRIVATE_KEY_PATH="/run/secrets/IOS_LIVE_UPDATE_PRIVATE_KEY"; \
    node scripts/build-ios-live-update-artifacts.mjs; \
  else \
    mkdir -p ota/ios; \
  fi

# --- Stage 2: runtime ---
FROM node:24.18.0-slim
WORKDIR /app
ENV TZ=UTC HUSKY=0

COPY package.json package-lock.json ./
COPY shared ./shared
COPY server/package.json ./server/package.json
# --ignore-scripts skips the root's husky "prepare" script (which would
# otherwise fail: husky itself is a devDependency, omitted here, so the
# `husky` binary doesn't exist to run) — but that also skips better-sqlite3's
# own install script that fetches/builds its native binding, so rebuild it
# explicitly afterward.
RUN npm ci --ignore-scripts --omit=dev && npm rebuild better-sqlite3

COPY server/src ./server/src
COPY --from=builder /app/ota ./server/ota

WORKDIR /app/server
EXPOSE 3000
CMD ["npm", "run", "start"]
