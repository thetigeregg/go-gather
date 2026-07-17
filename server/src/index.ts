/* eslint-disable @typescript-eslint/restrict-template-expressions,
   @typescript-eslint/use-unknown-in-catch-callback-variable,
   @typescript-eslint/no-floating-promises -- ported verbatim from
   go-gather-next (see docs/progress/phase-4-catalog-pipeline.md);
   go-gather-next's own ESLint config doesn't enforce these strictTypeChecked rules. */
import { buildApp } from './api.js';
import { initSchema } from './db.js';

const PORT = 3000;

initSchema();

const app = buildApp();

app
  .listen({ port: PORT, host: '127.0.0.1' })
  .then(() => {
    console.log(`go-gather API listening on http://localhost:${PORT}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exitCode = 1;
  });

// Without this, `tsx watch` has no graceful way to stop the server on
// restart (e.g. after a source file change) and has to force-kill it after
// a multi-second timeout on every reload.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    app.close().finally(() => process.exit(0));
  });
}
