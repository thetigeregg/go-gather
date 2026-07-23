export const environment = {
  production: true,
  // This file only feeds Angular's generic web `production` build config —
  // it is NOT used by the shipped iOS app. The real iOS prod backend origin
  // comes from environment.ios.prod.ts, generated at build time by
  // scripts/write-environment-ios.mjs from the IOS_BACKEND_ORIGIN_PROD
  // secret (see angular.json's `ios-prod` fileReplacements), and is already
  // deployed (see docs/nas-deployment.md). localhost:3000 here is just a
  // placeholder since no web build target is currently shipped.
  apiUrl: 'http://localhost:3000',
};
