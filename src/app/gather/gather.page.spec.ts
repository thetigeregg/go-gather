import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Subject, of, throwError } from 'rxjs';
import { DEFAULT_SETTINGS, ExportBundle, ProgressEntry, UserSettings } from '@go-gather/shared';
import { ToastController } from '@ionic/angular/standalone';
import { GatherPage } from './gather.page';
import { PokeDataService } from '../core/services/poke-data.service';
import { UserDataService } from '../core/services/user-data.service';
import { FilterService, Generation } from '../core/services/filter.service';
import { SearchConfigService } from '../core/services/search-config.service';
import { PokeGroupComponent } from '../features/poke-group/poke-group.component';
import { GatherPokemonComponent } from '../features/gather-pokemon/gather-pokemon.component';
import { GatherEntryComponent } from '../features/gather-entry/gather-entry.component';
import { presentShareFile } from '../core/utils/share-file.util';
import { pickJsonTextFile } from '../core/utils/pick-file.util';

vi.mock('../core/utils/share-file.util', () => ({
  presentShareFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../core/utils/pick-file.util', () => ({
  pickJsonTextFile: vi.fn(),
}));

describe('GatherPage', () => {
  let fixture: ComponentFixture<GatherPage>;
  let component: GatherPage;
  let userSettings: UserSettings;
  let userSettingsChange$: Subject<UserSettings>;
  let progressChange$: Subject<void>;
  let caughtIds: Set<string>;
  let groupPokemonByGenerationCalls: UserSettings[];
  let generations: Generation[];
  let exportBundleMock: ReturnType<typeof vi.fn>;
  let importBundleMock: ReturnType<typeof vi.fn>;
  let toastCreateSpy: ReturnType<typeof vi.fn>;
  let toastPresentSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    userSettings = { ...DEFAULT_SETTINGS };
    userSettingsChange$ = new Subject<UserSettings>();
    progressChange$ = new Subject<void>();
    caughtIds = new Set();
    groupPokemonByGenerationCalls = [];
    vi.mocked(presentShareFile).mockClear().mockResolvedValue(undefined);
    vi.mocked(pickJsonTextFile).mockReset();
    exportBundleMock = vi.fn();
    importBundleMock = vi.fn();
    toastPresentSpy = vi.fn().mockResolvedValue(undefined);
    toastCreateSpy = vi.fn().mockResolvedValue({ present: toastPresentSpy });
    generations = [
      {
        generationName: 'Generation 1',
        speciesList: [
          {
            dexNr: 1,
            speciesId: 'bulbasaur',
            speciesName: 'Bulbasaur',
            entries: [
              {
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
              },
            ],
          },
        ],
      },
    ];

    TestBed.configureTestingModule({
      providers: [
        {
          provide: PokeDataService,
          useValue: { loadCatalog: () => of([]) },
        },
        {
          provide: UserDataService,
          useValue: {
            getUserSettings: () => userSettings,
            loadProgress: () => of([]),
            getItemState: (id: string) => caughtIds.has(id),
            listenForUserSettingsChanges: () => userSettingsChange$.asObservable(),
            listenForProgressChanges: () => progressChange$.asObservable(),
            exportBundle: exportBundleMock,
            importBundle: importBundleMock,
          },
        },
        { provide: ToastController, useValue: { create: toastCreateSpy } },
        {
          provide: FilterService,
          useValue: {
            groupPokemonByGeneration: (settings: UserSettings) => {
              groupPokemonByGenerationCalls.push(settings);
              return generations;
            },
          },
        },
        {
          provide: SearchConfigService,
          useValue: {
            loadConfig: () => of({ implicitlyExcludedSearchTerms: [], costumeGenderEnabled: true }),
          },
        },
      ],
    });
    TestBed.overrideComponent(GatherPage, { set: { template: '<div></div>', styleUrls: [] } });
    TestBed.overrideComponent(PokeGroupComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(GatherPokemonComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(GatherEntryComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(GatherPage);
    component = fixture.componentInstance;
  });

  it('hydrates the catalog grid and header count on init', () => {
    fixture.detectChanges();

    expect(component.generationToPokemonMap).toEqual(generations);
    expect(component.headerText).toBe('GO Gather (0/1)');
    expect(groupPokemonByGenerationCalls).toHaveLength(1);
  });

  it('re-filters and recomputes the header when user settings change', () => {
    fixture.detectChanges();

    const updatedSettings: UserSettings = { ...userSettings, pokedexType: 'mega' };
    userSettingsChange$.next(updatedSettings);

    expect(component.userSettings).toEqual(updatedSettings);
    expect(groupPokemonByGenerationCalls).toContainEqual(updatedSettings);
  });

  it('re-filters on progress change only when showUncaughtOnly is set', () => {
    fixture.detectChanges();
    const callsBefore = groupPokemonByGenerationCalls.length;

    progressChange$.next();
    expect(groupPokemonByGenerationCalls).toHaveLength(callsBefore);
    expect(component.headerText).toBe('GO Gather (0/1)');

    userSettings = { ...userSettings, showUncaughtOnly: true };
    component.userSettings = userSettings;
    caughtIds.add('bulbasaur-regular');
    progressChange$.next();

    expect(groupPokemonByGenerationCalls).toHaveLength(callsBefore + 1);
    expect(component.headerText).toBe('GO Gather (1/1)');
  });

  describe('exportBundle', () => {
    it('shares the exported bundle as a timestamped JSON file', async () => {
      fixture.detectChanges();
      const bundle: ExportBundle = {
        version: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        progress: [
          {
            catalogEntryId: 'bulbasaur-regular',
            caught: true,
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        excludedNamePatterns: [],
        excludedDexNumbers: [],
        excludedShinyDexNumbers: [],
        excludedShinyNamePatterns: [],
        userTags: [],
        presetQueries: [],
      };
      exportBundleMock.mockReturnValue(bundle);

      await component.exportBundle();

      expect(presentShareFile).toHaveBeenCalledWith(
        expect.objectContaining({
          content: JSON.stringify(bundle, null, 2),
          mimeType: 'application/json',
        })
      );
      const call = vi.mocked(presentShareFile).mock.calls[0][0];
      expect(call.filename).toMatch(/^go-gather-backup-.*\.json$/);
    });
  });

  describe('triggerImport', () => {
    const makeBundle = (): ExportBundle => ({
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      progress: [],
      excludedNamePatterns: [],
      excludedDexNumbers: [],
      excludedShinyDexNumbers: [],
      excludedShinyNamePatterns: [],
      userTags: [],
      presetQueries: [],
    });

    it('does nothing when the file picker is cancelled', async () => {
      fixture.detectChanges();
      vi.mocked(pickJsonTextFile).mockResolvedValue({ status: 'cancelled' });

      await component.triggerImport();

      expect(importBundleMock).not.toHaveBeenCalled();
      expect(toastCreateSpy).not.toHaveBeenCalled();
    });

    it('imports a full ExportBundle and shows a success toast', async () => {
      fixture.detectChanges();
      const bundle = makeBundle();
      vi.mocked(pickJsonTextFile).mockResolvedValue({
        status: 'picked',
        text: JSON.stringify(bundle),
        name: 'backup.json',
      });
      importBundleMock.mockReturnValue(of<ProgressEntry[]>([]));

      await component.triggerImport();
      // showToast() is fire-and-forget from inside the subscribe callback
      // (RxJS doesn't await async next/error handlers) — flush the
      // microtask queue so its own internal awaits settle before asserting.
      await Promise.resolve();
      await Promise.resolve();

      expect(importBundleMock).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
      expect(toastCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Import complete.' })
      );
      expect(toastPresentSpy).toHaveBeenCalled();
    });

    it('back-compat parses a legacy bare progress-entry array', async () => {
      fixture.detectChanges();
      const legacyProgress: ProgressEntry[] = [
        {
          catalogEntryId: 'bulbasaur-regular',
          caught: true,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      vi.mocked(pickJsonTextFile).mockResolvedValue({
        status: 'picked',
        text: JSON.stringify(legacyProgress),
        name: 'legacy-backup.json',
      });
      importBundleMock.mockReturnValue(of<ProgressEntry[]>([]));

      await component.triggerImport();

      expect(importBundleMock).toHaveBeenCalledWith(
        expect.objectContaining({ progress: legacyProgress })
      );
    });

    it('shows a failure toast for an unrecognized file format', async () => {
      fixture.detectChanges();
      vi.mocked(pickJsonTextFile).mockResolvedValue({
        status: 'picked',
        text: JSON.stringify({ not: 'a bundle' }),
        name: 'garbage.json',
      });

      await component.triggerImport();

      expect(importBundleMock).not.toHaveBeenCalled();
      expect(toastCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Failed to read import file.' })
      );
    });

    it('shows a failure toast when importBundle errors', async () => {
      fixture.detectChanges();
      const bundle = makeBundle();
      vi.mocked(pickJsonTextFile).mockResolvedValue({
        status: 'picked',
        text: JSON.stringify(bundle),
        name: 'backup.json',
      });
      importBundleMock.mockReturnValue(throwError(() => new Error('write failed')));

      await component.triggerImport();

      expect(toastCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Failed to import data.' })
      );
    });
  });
});
