import { CatalogEntry, PokedexType, UserSettings } from '@go-gather/shared';
import { isReleased } from './catalog-release.util';
import { compileExcludedPatterns, isExcludedByName } from './excluded-name.util';

/** What the app shows for a catalog entry on a given date. */
export type AvailabilityState = 'released' | 'announced' | 'hidden';

export type AvailabilityChangeKind = 'available' | 'announced' | 'unavailable';

/** One catalog entry whose availability changed, as stored until the user
 * has seen it. */
export interface AvailabilityChange {
  id: string;
  name: string;
  pokedexType: PokedexType;
  isShiny: boolean;
  order: number;
  kind: AvailabilityChangeKind;
  /** The entry's new `releasedOn`: its release (or announced) date, or null
   * once it's no longer available. */
  releasedOn: string | null;
  /** What the user last saw for the entry, before this change and any
   * earlier one not yet seen — so a change that's undone before it's shown
   * can be dropped (see mergeAvailabilityChanges). */
  seenState: AvailabilityState;
  seenReleasedOn: string | null;
}

export interface AvailabilityItem {
  name: string;
  isShiny: boolean;
  releasedOn: string | null;
}

export interface AvailabilityGroup {
  pokedexType: PokedexType;
  items: AvailabilityItem[];
}

export interface AvailabilitySection {
  kind: AvailabilityChangeKind;
  groups: AvailabilityGroup[];
}

const SECTION_ORDER: readonly AvailabilityChangeKind[] = ['available', 'announced', 'unavailable'];

/** XXL/XXS mirror the Regular pokedex entry for entry, so they're folded into
 * it rather than listing every name three times. */
const DISPLAY_POKEDEX_ORDER: readonly PokedexType[] = ['regular', 'mega', 'max', 'dmax', 'costume'];

function displayPokedex(pokedexType: PokedexType): PokedexType {
  return pokedexType === 'xxl' || pokedexType === 'xxs' ? 'regular' : pokedexType;
}

/** An entry missing from the catalog counts as hidden. */
export function availabilityState(
  entry: CatalogEntry | undefined,
  date: string
): AvailabilityState {
  if (!entry) {
    return 'hidden';
  }
  if (isReleased(entry, date)) {
    return 'released';
  }
  return entry.releasedOn === null ? 'hidden' : 'announced';
}

const STATE_AFTER: Record<AvailabilityChangeKind, AvailabilityState> = {
  available: 'released',
  announced: 'announced',
  unavailable: 'hidden',
};

function toChange(
  entry: CatalogEntry,
  kind: AvailabilityChangeKind,
  releasedOn: string | null,
  before: CatalogEntry | undefined,
  seenState: AvailabilityState
): AvailabilityChange {
  const { id, name, pokedexType, isShiny, order } = entry;
  return {
    id,
    name,
    pokedexType,
    isShiny,
    order,
    kind,
    releasedOn,
    seenState,
    seenReleasedOn: before?.releasedOn ?? null,
  };
}

/**
 * The entries whose availability differs between `previous` as of
 * `previousDate` and `next` as of `nextDate`, matched by id. Passing the same
 * catalog for both finds the changes from dates alone (an announced release
 * whose day arrived).
 */
export function diffAvailability(
  previous: readonly CatalogEntry[],
  previousDate: string,
  next: readonly CatalogEntry[],
  nextDate: string
): AvailabilityChange[] {
  const previousById = new Map(previous.map((entry) => [entry.id, entry]));
  const nextIds = new Set(next.map((entry) => entry.id));
  const changes: AvailabilityChange[] = [];

  for (const entry of next) {
    const before = previousById.get(entry.id);
    const was = availabilityState(before, previousDate);
    const now = availabilityState(entry, nextDate);
    if (now === 'released' && was !== 'released') {
      changes.push(toChange(entry, 'available', entry.releasedOn, before, was));
    } else if (
      now === 'announced' &&
      (was !== 'announced' || before?.releasedOn !== entry.releasedOn)
    ) {
      changes.push(toChange(entry, 'announced', entry.releasedOn, before, was));
    } else if (now === 'hidden' && was !== 'hidden') {
      changes.push(toChange(entry, 'unavailable', null, before, was));
    }
  }

  for (const entry of previous) {
    const was = availabilityState(entry, previousDate);
    if (!nextIds.has(entry.id) && was !== 'hidden') {
      changes.push(toChange(entry, 'unavailable', null, entry, was));
    }
  }
  return changes;
}

/** Identifies one specific change, so acknowledging what was shown never
 * drops a newer change to the same entry. */
export function availabilityChangeKey({ id, kind, releasedOn }: AvailabilityChange): string {
  return `${id}|${kind}|${releasedOn ?? ''}`;
}

/** Whether a change leaves the entry as the user last saw it. */
function isBackToSeen(change: AvailabilityChange): boolean {
  return (
    STATE_AFTER[change.kind] === change.seenState &&
    (change.kind !== 'announced' || change.releasedOn === change.seenReleasedOn)
  );
}

/** What the user last saw for the entry once `change` has been shown. */
function seenAfter(
  change: AvailabilityChange
): Pick<AvailabilityChange, 'seenState' | 'seenReleasedOn'> {
  return { seenState: STATE_AFTER[change.kind], seenReleasedOn: change.releasedOn };
}

/**
 * Adds `incoming` to the changes not yet seen, keeping one per entry: the
 * newer one, since it's what the app now shows, but measured from what the
 * user last saw — including a change in `shown`, the snapshot currently (or
 * last) on screen. A change that only undoes an unseen one (Bulbapedia hid an
 * entry for one sync, then restored it) is dropped rather than shown; one
 * that undoes a shown change is kept, so the sheet's notice gets corrected.
 */
export function mergeAvailabilityChanges(
  existing: readonly AvailabilityChange[],
  incoming: readonly AvailabilityChange[],
  shown: readonly AvailabilityChange[] = []
): AvailabilityChange[] {
  const byId = new Map(existing.map((change) => [change.id, change]));
  const shownById = new Map(shown.map((change) => [change.id, change]));
  for (const change of incoming) {
    const earlier = byId.get(change.id);
    const displayed = shownById.get(change.id);
    byId.delete(change.id);
    const merged = earlier
      ? { ...change, seenState: earlier.seenState, seenReleasedOn: earlier.seenReleasedOn }
      : displayed
        ? { ...change, ...seenAfter(displayed) }
        : change;
    if (!isBackToSeen(merged)) {
      byId.set(change.id, merged);
    }
  }
  return [...byId.values()];
}

/** Kind first, so the comparator stays consistent when announced entries
 * (ordered by date) are sorted alongside the others (ordered by catalog). */
function compareChanges(a: AvailabilityChange, b: AvailabilityChange): number {
  const byKind = SECTION_ORDER.indexOf(a.kind) - SECTION_ORDER.indexOf(b.kind);
  if (byKind !== 0) {
    return byKind;
  }
  if (a.kind === 'announced') {
    const byDate = (a.releasedOn ?? '').localeCompare(b.releasedOn ?? '');
    if (byDate !== 0) {
      return byDate;
    }
  }
  return a.order - b.order || Number(a.isShiny) - Number(b.isShiny) || a.name.localeCompare(b.name);
}

/**
 * Changes as the popup lists them: sections in a fixed order (now available,
 * announced, no longer available), each grouped by pokedex, without entries
 * the user's name-exclusion patterns hide from Gather. Entries that only
 * differ by size or gender list once. Empty sections and groups are left out.
 */
export function groupAvailabilityChanges(
  changes: readonly AvailabilityChange[],
  settings: Pick<UserSettings, 'excludedNamePatterns' | 'excludedShinyNamePatterns'>
): AvailabilitySection[] {
  const excluded = compileExcludedPatterns(settings.excludedNamePatterns);
  const excludedShiny = compileExcludedPatterns(settings.excludedShinyNamePatterns);
  const shown = changes
    .filter(
      (change) =>
        !isExcludedByName(change.name, excluded) &&
        !(change.isShiny && isExcludedByName(change.name, excludedShiny))
    )
    .sort(compareChanges);

  return SECTION_ORDER.flatMap((kind) => {
    const groups = DISPLAY_POKEDEX_ORDER.flatMap((pokedexType) => {
      const seen = new Set<string>();
      const items = shown
        .filter(
          (change) => change.kind === kind && displayPokedex(change.pokedexType) === pokedexType
        )
        .filter(({ name, isShiny }) => {
          const key = `${name}|${String(isShiny)}`;
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        })
        .map(({ name, isShiny, releasedOn }) => ({ name, isShiny, releasedOn }));
      return items.length > 0 ? [{ pokedexType, items }] : [];
    });
    return groups.length > 0 ? [{ kind, groups }] : [];
  });
}
