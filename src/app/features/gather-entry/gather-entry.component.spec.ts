import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CatalogEntry } from '@go-gather/shared';
import { GatherEntryComponent } from './gather-entry.component';
import { UserDataService } from '../../core/services/user-data.service';
import { ImageCacheService } from '../../core/services/image-cache.service';

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('GatherEntryComponent', () => {
  let fixture: ComponentFixture<GatherEntryComponent>;
  let component: GatherEntryComponent;
  let caughtIds: Set<string>;
  let setEntryState: (id: string, caught: boolean) => void;
  let calls: [string, boolean][];
  let resolveImageUrlMock: ReturnType<typeof vi.fn>;

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
    resolveImageUrlMock = vi.fn().mockResolvedValue('/cached/sprite.png');

    TestBed.configureTestingModule({
      providers: [
        {
          provide: UserDataService,
          useValue: {
            getItemState: (id: string) => caughtIds.has(id),
            setEntryState,
          },
        },
        {
          provide: ImageCacheService,
          useValue: { resolveImageUrl: resolveImageUrlMock },
        },
      ],
    });
    TestBed.overrideComponent(GatherEntryComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(GatherEntryComponent);
    component = fixture.componentInstance;
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

  it('picks the caught-button icon based on shiny/default', () => {
    component.entry = makeEntry({ isShiny: true });
    expect(component.caughtButtonIcon).toBe('sparkles');

    component.entry = makeEntry({ isShiny: false });
    expect(component.caughtButtonIcon).toBe('checkmark-circle');
  });

  it('entryCardClicked toggles caught state and persists it', () => {
    component.entry = makeEntry();
    expect(component.caught).toBe(false);

    component.entryCardClicked();

    expect(component.caught).toBe(true);
    expect(calls).toEqual([['bulbasaur-regular', true]]);
  });

  describe('sprite caching', () => {
    it('shows the placeholder immediately, then swaps to the resolved cached URL', async () => {
      const deferred = createDeferred<string>();
      resolveImageUrlMock.mockReturnValue(deferred.promise);

      component.entry = makeEntry();

      expect(component.spriteSrc).toBe('/assets/sprite-placeholder.png');
      expect(resolveImageUrlMock).toHaveBeenCalledWith(
        'bulbasaur-regular',
        '/images/bulbasaur.png'
      );

      deferred.resolve('/cached/bulbasaur.png');
      await flushMicrotasks();

      expect(component.spriteSrc).toBe('/cached/bulbasaur.png');
    });

    it('keeps the placeholder when resolution fails (e.g. offline, never cached)', async () => {
      resolveImageUrlMock.mockRejectedValue(new Error('offline'));

      component.entry = makeEntry();
      await flushMicrotasks();

      expect(component.spriteSrc).toBe('/assets/sprite-placeholder.png');
    });

    it('does not apply a stale resolution when the entry changes before it settles', async () => {
      const first = createDeferred<string>();
      const second = createDeferred<string>();
      resolveImageUrlMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

      component.entry = makeEntry({ id: 'a', imgUrl: '/images/a.png' });
      component.entry = makeEntry({ id: 'b', imgUrl: '/images/b.png' });

      second.resolve('/cached/b.png');
      await flushMicrotasks();
      expect(component.spriteSrc).toBe('/cached/b.png');

      first.resolve('/cached/a.png');
      await flushMicrotasks();
      expect(component.spriteSrc).toBe('/cached/b.png');
    });

    it('skips resolution when imgUrl is empty', () => {
      component.entry = makeEntry({ imgUrl: '' });

      expect(resolveImageUrlMock).not.toHaveBeenCalled();
    });
  });
});
