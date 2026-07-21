import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CatalogEntry } from '@go-gather/shared';
import { GatherEntryRowComponent } from './gather-entry-row.component';
import { GatherRow } from '../../gather/gather-row.model';
import { UserDataService } from '../../core/services/user-data.service';
import { ImageCacheService } from '../../core/services/image-cache.service';
import { GatherEntryComponent } from '../gather-entry/gather-entry.component';

function makeEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: 'bulbasaur-regular',
    dexNr: 1,
    generation: 1,
    speciesId: 'bulbasaur',
    formId: 'bulbasaur-normal',
    name: 'Bulbasaur',
    speciesName: 'Bulbasaur',
    imgUrl: '/images/bulbasaur.png',
    isShiny: false,
    isFemale: false,
    form: null,
    costume: null,
    region: null,
    primaryType: 'grass',
    secondaryType: 'poison',
    pokemonClass: null,
    isBaseForm: true,
    pokedexType: 'regular',
    order: 1,
    ...overrides,
  };
}

function makeRow(overrides: Partial<Extract<GatherRow, { kind: 'entry' }>> = {}) {
  const entry = makeEntry();

  return {
    kind: 'entry' as const,
    key: entry.id,
    entry,
    speciesGroup: {
      dexNr: entry.dexNr,
      speciesId: entry.speciesId,
      speciesName: entry.speciesName,
      entries: [entry],
    },
    isFirstInSpecies: true,
    isLastInSpecies: true,
    ...overrides,
  };
}

describe('GatherEntryRowComponent', () => {
  let fixture: ComponentFixture<GatherEntryRowComponent>;
  let component: GatherEntryRowComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: UserDataService, useValue: { getItemState: () => false } },
        { provide: ImageCacheService, useValue: { resolveImageUrl: () => Promise.resolve('') } },
      ],
    });
    TestBed.overrideComponent(GatherEntryRowComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(GatherEntryComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(GatherEntryRowComponent);
    component = fixture.componentInstance;
  });

  it('exposes the assigned row', () => {
    const row = makeRow();
    component.row = row;
    fixture.detectChanges();

    expect(component.row).toBe(row);
  });
});
