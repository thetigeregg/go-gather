export const environment = {
  production: true,
  // This file feeds Angular's generic web `production` build config, which
  // is what the edge container (edge/Dockerfile) ships to browsers — it is
  // NOT used by the native iOS app. The edge container's Caddy serves this
  // build and the backend from the same origin (reverse-proxying /api and
  // /images to the server container), so the API lives at a same-origin
  // relative path rather than an absolute host. The real iOS prod backend
  // origin comes from environment.ios.prod.ts, generated at build time by
  // scripts/write-environment-ios.mjs from the IOS_BACKEND_ORIGIN_PROD
  // secret (see angular.json's `ios-prod` fileReplacements) and is
  // unaffected by this file.
  apiUrl: '',
};
