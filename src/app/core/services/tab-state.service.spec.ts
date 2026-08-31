import { TestBed } from '@angular/core/testing';
import { PreferenceStorageService } from '../storage/preference-storage.service';
import { TabId, TabStateService } from './tab-state.service';

describe('TabStateService', () => {
  let store: Record<string, string>;
  let setItemCalls: { key: string; value: string }[];
  let service: TabStateService;

  beforeEach(() => {
    store = {};
    setItemCalls = [];

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PreferenceStorageService,
          useValue: {
            getItem: (key: string) => Promise.resolve(store[key] ?? null),
            setItem: (key: string, value: string) => {
              setItemCalls.push({ key, value });
              store[key] = value;
              return Promise.resolve();
            },
          },
        },
      ],
    });

    service = TestBed.inject(TabStateService);
  });

  it('defaults to gather before anything is loaded', () => {
    expect(service.getLastActiveTab()).toBe('gather');
  });

  it('loadLastActiveTab hydrates a valid stored tab', async () => {
    store['lastActiveTab'] = 'calendar';

    const result = await new Promise<TabId>((resolve) => {
      service.loadLastActiveTab().subscribe(resolve);
    });

    expect(result).toBe('calendar');
    expect(service.getLastActiveTab()).toBe('calendar');
  });

  it('loadLastActiveTab falls back to gather when nothing is stored', async () => {
    const result = await new Promise<TabId>((resolve) => {
      service.loadLastActiveTab().subscribe(resolve);
    });

    expect(result).toBe('gather');
  });

  it('loadLastActiveTab falls back to gather for a corrupt/unknown stored value', async () => {
    store['lastActiveTab'] = 'some-removed-tab';

    const result = await new Promise<TabId>((resolve) => {
      service.loadLastActiveTab().subscribe(resolve);
    });

    expect(result).toBe('gather');
  });

  it('setLastActiveTab updates the in-memory value immediately and persists it', () => {
    service.setLastActiveTab('calendar');

    expect(service.getLastActiveTab()).toBe('calendar');
    expect(setItemCalls).toEqual([{ key: 'lastActiveTab', value: 'calendar' }]);
  });
});
