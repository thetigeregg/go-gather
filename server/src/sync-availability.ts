import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncAvailability } from './availability-store.js';
import { db, initSchema } from './db.js';

/**
 * Refreshes the saved Bulbapedia availability data on its own. The catalog
 * sync (sync.ts) already does this before every run; this script exists
 * for checking a Bulbapedia change by hand without a full catalog sync.
 */
export async function main(): Promise<void> {
  initSchema();
  await syncAvailability(db);
}

// Guarded so this module can be imported without triggering a sync as an
// import side effect — only runs when invoked directly, e.g.
// `tsx src/sync-availability.ts` / `npm run sync:availability`.
const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  main().catch((err: unknown) => {
    console.error('Availability sync failed:', err);
    process.exitCode = 1;
  });
}
