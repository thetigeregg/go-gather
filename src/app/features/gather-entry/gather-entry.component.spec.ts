import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CatalogEntry, DEFAULT_SETTINGS, UserSettings } from '@go-gather/shared';
import { GatherEntryComponent } from './gather-entry.component';
import { UserDataService } from '../../core/services/user-data.service';

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

describe('GatherEntryComponent', () => {
  let fixture: ComponentFixture<GatherEntryComponent>;
  let component: GatherEntryComponent;
  let caughtIds: Set<string>;
  let setEntryState: (id: string, caught: boolean) => void;
  let calls: [string, boolean][];

  beforeEach(async () => {
    caughtIds = new Set();
    calls = [];
    setEntryState = (id: string, caught: boolean) => {
      calls.push([id, caught]);
      if (caught) {
        caughtIds.add(id);
      } else {
        caughtIds.delete(id);
      }
    };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: UserDataService,
          useValue: {
            getItemState: (id: string) => caughtIds.has(id),
            setEntryState,
          },
        },
      ],
    });
    TestBed.overrideComponent(GatherEntryComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(GatherEntryComponent);
    component = fixture.componentInstance;
    component.userSettings = { ...DEFAULT_SETTINGS } satisfies UserSettings;
    component.speciesName = 'Bulbasaur';
  });

  it('reads initial caught state from UserDataService when the entry is set', () => {
    caughtIds.add('bulbasaur-regular');
    component.entry = makeEntry();

    expect(component.caught).toBe(true);
  });

  it('falls back to the placeholder sprite when imgUrl is empty', () => {
    component.entry = makeEntry({ imgUrl: '' });

    expect(component.spriteSrc).toBe('/assets/sprite-placeholder.png');
  });

  it('onSpriteError resets the sprite to the placeholder', () => {
    component.entry = makeEntry();
    component.onSpriteError();

    expect(component.spriteSrc).toBe('/assets/sprite-placeholder.png');
  });

  it('picks the caught-button icon based on shiny/female/default', () => {
    component.entry = makeEntry({ isShiny: true });
    expect(component.caughtButtonIcon).toBe('sparkles');

    component.entry = makeEntry({ isShiny: false, isFemale: true });
    expect(component.caughtButtonIcon).toBe('female');

    component.entry = makeEntry({ isShiny: false, isFemale: false });
    expect(component.caughtButtonIcon).toBe('checkmark-circle');
  });

  it('entryCardClicked toggles caught state and persists it', () => {
    component.entry = makeEntry();
    expect(component.caught).toBe(false);

    component.entryCardClicked();

    expect(component.caught).toBe(true);
    expect(calls).toEqual([['bulbasaur-regular', true]]);
  });

  it('onCaughtButtonClick toggles caught state and stops propagation', () => {
    component.entry = makeEntry();
    const event = new Event('click');
    const stopSpy = vi.spyOn(event, 'stopPropagation');

    component.onCaughtButtonClick(event);

    expect(stopSpy).toHaveBeenCalled();
    expect(component.caught).toBe(true);
    expect(calls).toEqual([['bulbasaur-regular', true]]);
  });
});
