import { CatalogEntry, DEFAULT_SETTINGS } from '@go-gather/shared';
import { makeContractCatalogEntry } from '../data/storage-engine.contract';
import {
  AvailabilityChange,
  availabilityChangeKey,
  availabilityState,
  diffAvailability,
  groupAvailabilityChanges,
  mergeAvailabilityChanges,
} from './availability-changes.util';

const YESTERDAY = '2026-10-14';
const TODAY = '2026-10-15';

function entry(id: string, releasedOn: string | null, overrides: Partial<CatalogEntry> = {}) {
  return makeContractCatalogEntry({ id, name: id, releasedOn, ...overrides });
}

function change(id: string, overrides: Partial<AvailabilityChange> = {}): AvailabilityChange {
  return {
    id,
    name: id,
    pokedexType: 'regular',
    isShiny: false,
    order: 0,
    kind: 'available',
    releasedOn: '2016-07-06',
    ...overrides,
  };
}

describe('availabilityState', () => {
  it('is released on or after its date, announced before it, hidden without one', () => {
    expect(availabilityState(entry('a', TODAY), TODAY)).toBe('released');
    expect(availabilityState(entry('a', '2026-11-06'), TODAY)).toBe('announced');
    expect(availabilityState(entry('a', null), TODAY)).toBe('hidden');
  });

  it('treats an entry missing from the catalog as hidden', () => {
    expect(availabilityState(undefined, TODAY)).toBe('hidden');
  });
});

describe('diffAvailability', () => {
  const kinds = (changes: AvailabilityChange[]) =>
    changes.map(({ id, kind, releasedOn }) => ({ id, kind, releasedOn }));

  it('reports a hidden entry that got a past date as available', () => {
    const changes = diffAvailability(
      [entry('a', null)],
      YESTERDAY,
      [entry('a', '2026-01-01')],
      TODAY
    );

    expect(kinds(changes)).toEqual([{ id: 'a', kind: 'available', releasedOn: '2026-01-01' }]);
  });

  it('reports a new catalog entry with a past date as available', () => {
    const changes = diffAvailability(
      [entry('a', '2016-07-06')],
      YESTERDAY,
      [entry('a', '2016-07-06'), entry('b', '2020-01-01')],
      TODAY
    );

    expect(kinds(changes)).toEqual([{ id: 'b', kind: 'available', releasedOn: '2020-01-01' }]);
  });

  it('reports an announced entry whose date arrived as available', () => {
    const catalog = [entry('a', TODAY)];

    expect(kinds(diffAvailability(catalog, YESTERDAY, catalog, TODAY))).toEqual([
      { id: 'a', kind: 'available', releasedOn: TODAY },
    ]);
  });

  it('reports a newly dated future release, or a moved date, as announced', () => {
    const changes = diffAvailability(
      [entry('a', null), entry('b', '2026-11-01'), entry('c', '2016-07-06')],
      YESTERDAY,
      [entry('a', '2026-11-06'), entry('b', '2026-11-08'), entry('c', '2026-12-01')],
      TODAY
    );

    expect(kinds(changes)).toEqual([
      { id: 'a', kind: 'announced', releasedOn: '2026-11-06' },
      { id: 'b', kind: 'announced', releasedOn: '2026-11-08' },
      { id: 'c', kind: 'announced', releasedOn: '2026-12-01' },
    ]);
  });

  it('reports a released or announced entry that lost its date, or was removed, as unavailable', () => {
    const changes = diffAvailability(
      [
        entry('a', '2016-07-06'),
        entry('b', '2026-11-06'),
        entry('c', '2016-07-06', { name: 'Removed' }),
      ],
      YESTERDAY,
      [entry('a', null), entry('b', null)],
      TODAY
    );

    expect(kinds(changes)).toEqual([
      { id: 'a', kind: 'unavailable', releasedOn: null },
      { id: 'b', kind: 'unavailable', releasedOn: null },
      { id: 'c', kind: 'unavailable', releasedOn: null },
    ]);
    expect(changes[2].name).toBe('Removed');
  });

  it('reports nothing when what the app shows is unchanged', () => {
    const previous = [entry('a', '2016-07-06'), entry('b', '2026-11-06'), entry('c', null)];
    const next = [entry('a', '2020-01-01'), entry('b', '2026-11-06'), entry('c', null)];

    expect(diffAvailability(previous, YESTERDAY, next, TODAY)).toEqual([]);
    expect(diffAvailability([entry('d', null)], YESTERDAY, [], TODAY)).toEqual([]);
  });

  it('keeps the fields the popup needs', () => {
    const [found] = diffAvailability(
      [],
      YESTERDAY,
      [
        entry('a', '2016-07-06', {
          name: 'Weavile (Dynamax)',
          pokedexType: 'dmax',
          isShiny: true,
          order: 7,
        }),
      ],
      TODAY
    );

    expect(found).toEqual({
      id: 'a',
      name: 'Weavile (Dynamax)',
      pokedexType: 'dmax',
      isShiny: true,
      order: 7,
      kind: 'available',
      releasedOn: '2016-07-06',
    });
  });
});

describe('mergeAvailabilityChanges', () => {
  it('keeps one change per entry, the newer one', () => {
    const merged = mergeAvailabilityChanges(
      [change('a', { kind: 'announced', releasedOn: TODAY }), change('b')],
      [change('a', { kind: 'available', releasedOn: TODAY }), change('c')]
    );

    expect(merged.map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: 'b', kind: 'available' },
      { id: 'a', kind: 'available' },
      { id: 'c', kind: 'available' },
    ]);
  });
});

describe('availabilityChangeKey', () => {
  it('tells apart changes to the same entry', () => {
    expect(availabilityChangeKey(change('a'))).not.toBe(
      availabilityChangeKey(change('a', { kind: 'unavailable', releasedOn: null }))
    );
  });
});

describe('groupAvailabilityChanges', () => {
  const settings = {
    excludedNamePatterns: [],
    excludedShinyNamePatterns: [],
  };

  it('orders sections available, announced, unavailable, and pokedexes regular first', () => {
    const sections = groupAvailabilityChanges(
      [
        change('gone', { kind: 'unavailable', releasedOn: null }),
        change('dmax', { pokedexType: 'dmax' }),
        change('soon', { kind: 'announced', releasedOn: '2026-11-06' }),
        change('mega', { pokedexType: 'mega' }),
        change('plain'),
      ],
      settings
    );

    expect(
      sections.map(({ kind, groups }) => ({
        kind,
        groups: groups.map(({ pokedexType, items }) => ({
          pokedexType,
          names: items.map((item) => item.name),
        })),
      }))
    ).toEqual([
      {
        kind: 'available',
        groups: [
          { pokedexType: 'regular', names: ['plain'] },
          { pokedexType: 'mega', names: ['mega'] },
          { pokedexType: 'dmax', names: ['dmax'] },
        ],
      },
      { kind: 'announced', groups: [{ pokedexType: 'regular', names: ['soon'] }] },
      { kind: 'unavailable', groups: [{ pokedexType: 'regular', names: ['gone'] }] },
    ]);
  });

  it('folds XXL/XXS into Regular and lists a name once per shininess', () => {
    const [section] = groupAvailabilityChanges(
      [
        change('a-m', { name: 'Applin' }),
        change('a-f', { name: 'Applin' }),
        change('a-xxl', { name: 'Applin', pokedexType: 'xxl' }),
        change('a-xxs', { name: 'Applin', pokedexType: 'xxs' }),
        change('a-shiny', { name: 'Applin', isShiny: true }),
        change('a-xxl-shiny', { name: 'Applin', pokedexType: 'xxl', isShiny: true }),
      ],
      settings
    );

    expect(section.groups).toEqual([
      {
        pokedexType: 'regular',
        items: [
          { name: 'Applin', isShiny: false, releasedOn: '2016-07-06' },
          { name: 'Applin', isShiny: true, releasedOn: '2016-07-06' },
        ],
      },
    ]);
  });

  it('sorts by catalog order, and announced entries by date first', () => {
    const sections = groupAvailabilityChanges(
      [
        change('b', { order: 2 }),
        change('a', { order: 1 }),
        change('late', { kind: 'announced', releasedOn: '2026-11-09', order: 1 }),
        change('early', { kind: 'announced', releasedOn: '2026-10-19', order: 9 }),
        change('same-day', { kind: 'announced', releasedOn: '2026-10-19', order: 3 }),
      ],
      settings
    );

    expect(sections.map((section) => section.groups[0].items.map((item) => item.name))).toEqual([
      ['a', 'b'],
      ['same-day', 'early', 'late'],
    ]);
  });

  it("leaves out entries the user's exclusion patterns hide", () => {
    const sections = groupAvailabilityChanges(
      [
        change('copy', { name: 'Pikachu (Copy 2019)' }),
        change('costume-shiny', { name: 'Pikachu (Party Hat)', isShiny: true }),
        change('costume', { name: 'Pikachu (Party Hat)' }),
      ],
      {
        ...DEFAULT_SETTINGS,
        excludedShinyNamePatterns: ['party hat', '(invalid'],
      }
    );

    expect(sections[0].groups[0].items.map(({ name, isShiny }) => ({ name, isShiny }))).toEqual([
      { name: 'Pikachu (Party Hat)', isShiny: false },
    ]);
  });

  it('returns no sections when nothing is left to show', () => {
    expect(groupAvailabilityChanges([], settings)).toEqual([]);
    expect(
      groupAvailabilityChanges([change('a', { name: 'Hidden' })], {
        excludedNamePatterns: ['hidden'],
        excludedShinyNamePatterns: [],
      })
    ).toEqual([]);
  });
});
