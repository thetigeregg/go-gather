import { createInterface } from 'node:readline/promises';
import { buildAndWriteBackupFile } from './backup.js';
import { db, initSchema } from './db.js';

interface CaughtRow {
  catalog_entry_id: string;
}

function countCaught(): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM user_progress WHERE caught = 1`).get() as {
    count: number;
  };
  return row.count;
}

/**
 * Clears all caught progress and emits matching `caught: false` upsert
 * `sync_events` (same shape `applyOperation` in api.ts inserts for a normal
 * push) so connected clients converge to the cleared state on their next
 * sync pull without any client-side changes.
 */
function clearProgress(): number {
  const caughtRows = db
    .prepare(`SELECT catalog_entry_id FROM user_progress WHERE caught = 1`)
    .all() as CaughtRow[];

  const clear = db.transaction((rows: CaughtRow[]) => {
    const now = new Date().toISOString();
    const insertEvent = db.prepare(
      `INSERT INTO sync_events (entity_type, entity_key, operation, payload, server_timestamp)
       VALUES ('progress', @entityKey, 'upsert', @payload, @serverTimestamp)`
    );
    const clearRow = db.prepare(
      `UPDATE user_progress SET caught = 0, updated_at = @updatedAt WHERE catalog_entry_id = @entityKey`
    );
    for (const row of rows) {
      insertEvent.run({
        entityKey: row.catalog_entry_id,
        payload: JSON.stringify({
          catalogEntryId: row.catalog_entry_id,
          caught: false,
          updatedAt: now,
        }),
        serverTimestamp: now,
      });
      clearRow.run({ entityKey: row.catalog_entry_id, updatedAt: now });
    }
  });
  clear(caughtRows);

  return caughtRows.length;
}

async function main(): Promise<void> {
  initSchema();

  const caughtCount = countCaught();
  if (caughtCount === 0) {
    console.log('Nothing to clear — no caught progress found.');
    return;
  }

  if (!process.stdin.isTTY) {
    console.error(
      'Refusing to run: stdin is not a TTY, so the confirmation prompt cannot be answered.'
    );
    process.exitCode = 1;
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let answer: string;
  try {
    answer = await rl.question(
      `This will permanently clear ${String(caughtCount)} caught Pokémon (progress only — ` +
        `settings/exclusions/tags are untouched). A backup will be written first.\n` +
        `Type CLEAR to continue: `
    );
  } finally {
    rl.close();
  }

  if (answer.trim() !== 'CLEAR') {
    console.log('Aborted — nothing was changed.');
    return;
  }

  const { path, bundle } = buildAndWriteBackupFile();
  console.log(`Backed up ${String(bundle.progress.length)} progress entries to ${path}`);

  const clearedCount = clearProgress();
  console.log(
    `Cleared ${String(clearedCount)} caught Pokémon. Devices with no pending offline changes will ` +
      `pick this up on their next sync; a device with a pending push can re-apply caught progress and ` +
      `override the clear.`
  );
}

main().catch((err: unknown) => {
  console.error('Failed to clear progress:', err);
  process.exitCode = 1;
});
