import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { db, initSchema } from './db.js';

// See src/app/core/services/pokemon-stats.service.ts — this used to be
// fetched directly by the client from this same URL on every cold app
// start. Proxying it through go-gather's own server instead mirrors the
// sync-season.ts precedent: the client never depends on the third-party
// feed directly, and gets one syncedAt-enveloped snapshot instead.
const POKEMON_STATS_URL =
  'https://raw.githubusercontent.com/mgrann03/pokemon-resources/refs/heads/main/pogo_pkm.min.json';

interface PokemonStatsEntry {
  name: string;
}

async function fetchPokemonStats(): Promise<PokemonStatsEntry[]> {
  const response = await fetch(POKEMON_STATS_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch pogo_pkm.min.json: ${String(response.status)} ${response.statusText}`
    );
  }
  return (await response.json()) as PokemonStatsEntry[];
}

function upsertPokemonStats(entries: readonly PokemonStatsEntry[]): void {
  db.prepare(
    `INSERT INTO pokemon_stats (id, payload) VALUES (1, @payload)
     ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`
  ).run({ payload: JSON.stringify(entries) });
}

function markPokemonStatsSynced(): void {
  db.prepare(
    `INSERT INTO sync_meta (key, value) VALUES ('pokemonStatsSyncedAt', @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run({ value: new Date().toISOString() });
}

export async function main(): Promise<void> {
  initSchema();

  console.log('Fetching pogo_pkm.min.json from pokemon-resources...');
  const entries = await fetchPokemonStats();
  console.log(`Fetched ${String(entries.length)} Pokemon stats entries.`);

  upsertPokemonStats(entries);
  markPokemonStatsSynced();

  console.log(`Synced ${String(entries.length)} Pokemon stats entries.`);
}

// Guarded so this module can be imported (e.g. by scheduled-sync.ts) without
// triggering a sync run as an import side effect — only runs when invoked
// directly, e.g. `tsx src/sync-pokemon-stats.ts` / `npm run sync:pokemon-stats`.
const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  main().catch((err: unknown) => {
    console.error('Pokemon stats sync failed:', err);
    process.exitCode = 1;
  });
}
