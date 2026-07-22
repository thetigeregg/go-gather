import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PreferenceStorageService } from '../storage/preference-storage.service';
import { CalendarFilterService, CalendarFilterState } from './calendar-filter.service';

describe('CalendarFilterService', () => {
  let store: Record<string, string>;
  let setItemCalls: { key: string; value: string }[];
  let service: CalendarFilterService;

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

    service = TestBed.inject(CalendarFilterService);
  });

  it('defaults to the ported denylist (go-pass, season disabled) with no hidden events', () => {
    const state = service.getFilterState();
    expect(state.disabledEventTypes).toEqual(['go-pass', 'season']);
    expect(state.hiddenEventIds).toEqual([]);
    expect(state.filtersApplyToTimeline).toBe(false);
  });

  it('loadFilterState hydrates from PreferenceStorageService when a valid value is stored', async () => {
    store['calendarFilterState'] = JSON.stringify({
      disabledEventTypes: ['raid-hour'],
      hiddenEventIds: ['event-1'],
      filtersApplyToTimeline: true,
    });

    const result = await new Promise<CalendarFilterState>((resolve) => {
      service.loadFilterState().subscribe(resolve);
    });

    expect(result.disabledEventTypes).toEqual(['raid-hour']);
    expect(service.getFilterState().hiddenEventIds).toEqual(['event-1']);
    expect(service.getFilterState().filtersApplyToTimeline).toBe(true);
  });

  it('loadFilterState falls back to defaults when nothing is stored yet', async () => {
    const result = await new Promise<CalendarFilterState>((resolve) => {
      service.loadFilterState().subscribe(resolve);
    });

    expect(result.disabledEventTypes).toEqual(['go-pass', 'season']);
  });

  it('loadFilterState falls back to defaults when the stored value is valid JSON but not an object', async () => {
    store['calendarFilterState'] = JSON.stringify('just a string');

    const result = await new Promise<CalendarFilterState>((resolve) => {
      service.loadFilterState().subscribe(resolve);
    });

    expect(result.disabledEventTypes).toEqual(['go-pass', 'season']);
  });

  it('loadFilterState falls back to defaults when stored JSON is corrupt', async () => {
    store['calendarFilterState'] = 'not valid json{{{';

    const result = await new Promise<CalendarFilterState>((resolve) => {
      service.loadFilterState().subscribe(resolve);
    });

    expect(result.disabledEventTypes).toEqual(['go-pass', 'season']);
  });

  it('loadFilterState falls back to defaults when stored value is missing required fields', async () => {
    store['calendarFilterState'] = JSON.stringify({ disabledEventTypes: ['x'] });

    const result = await new Promise<CalendarFilterState>((resolve) => {
      service.loadFilterState().subscribe(resolve);
    });

    expect(result).toEqual({
      disabledEventTypes: ['go-pass', 'season'],
      hiddenEventIds: [],
      filtersApplyToTimeline: false,
    });
  });

  it('isEventTypeEnabled/isEventVisible reflect the denylist, including unrecognized types', () => {
    expect(service.isEventTypeEnabled('go-pass')).toBe(false);
    expect(service.isEventTypeEnabled('community-day')).toBe(true);
    // An event type this app doesn't recognize at all is still visible unless
    // explicitly denylisted or individually hidden — matches the Phase 0/1
    // unrecognized-type fallback contract.
    expect(service.isEventTypeEnabled('some-brand-new-event-type')).toBe(true);
    expect(service.isEventVisible('community-day', 'event-1')).toBe(true);
    expect(service.isEventVisible('go-pass', 'event-1')).toBe(false);
  });

  it('toggleEventType flips membership in the denylist and persists', () => {
    service.toggleEventType('community-day');
    expect(service.isEventTypeEnabled('community-day')).toBe(false);
    expect(setItemCalls).toHaveLength(1);

    service.toggleEventType('community-day');
    expect(service.isEventTypeEnabled('community-day')).toBe(true);
    expect(setItemCalls).toHaveLength(2);
  });

  it('enableEventType/disableEventType are idempotent', () => {
    service.disableEventType('community-day');
    service.disableEventType('community-day');
    expect(
      service.getFilterState().disabledEventTypes.filter((t) => t === 'community-day')
    ).toHaveLength(1);

    service.enableEventType('community-day');
    service.enableEventType('community-day');
    expect(service.isEventTypeEnabled('community-day')).toBe(true);
  });

  it('enableAllEventTypes clears the denylist; disableAllEventTypes denylists every known type', () => {
    service.enableAllEventTypes();
    expect(service.getFilterState().disabledEventTypes).toEqual([]);

    service.disableAllEventTypes();
    expect(service.getFilterState().disabledEventTypes.length).toBeGreaterThan(30);
    expect(service.isEventTypeEnabled('community-day')).toBe(false);
  });

  it('hideEventById/showEventById are idempotent and combine with the type denylist', () => {
    service.hideEventById('event-1');
    service.hideEventById('event-1');
    expect(service.getFilterState().hiddenEventIds).toEqual(['event-1']);
    expect(service.isEventVisible('community-day', 'event-1')).toBe(false);

    service.showEventById('event-1');
    expect(service.getFilterState().hiddenEventIds).toEqual([]);
    expect(service.isEventVisible('community-day', 'event-1')).toBe(true);
  });

  it('showAllHiddenEvents clears the hidden list', () => {
    service.hideEventById('event-1');
    service.hideEventById('event-2');
    service.showAllHiddenEvents();
    expect(service.getFilterState().hiddenEventIds).toEqual([]);
  });

  it('setFiltersApplyToTimeline updates the flag', () => {
    service.setFiltersApplyToTimeline(true);
    expect(service.getFilterState().filtersApplyToTimeline).toBe(true);
  });

  it('emits on listenForFilterChanges for every mutation', () => {
    const emitted: CalendarFilterState[] = [];
    service.listenForFilterChanges().subscribe((state) => emitted.push(state));

    service.toggleEventType('community-day');
    service.hideEventById('event-1');
    service.setFiltersApplyToTimeline(true);

    expect(emitted).toHaveLength(3);
    expect(emitted[2].filtersApplyToTimeline).toBe(true);
  });

  it('persists every mutation via PreferenceStorageService.setItem', () => {
    service.toggleEventType('community-day');
    expect(setItemCalls[0].key).toBe('calendarFilterState');
    expect(JSON.parse(setItemCalls[0].value)).toEqual({
      disabledEventTypes: ['go-pass', 'season', 'community-day'],
      hiddenEventIds: [],
      filtersApplyToTimeline: false,
    });
  });

  it('applies the mutation in-memory even if persistence fails, and logs the error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PreferenceStorageService,
          useValue: {
            getItem: () => Promise.resolve(null),
            setItem: () => Promise.reject(new Error('disk full')),
          },
        },
      ],
    });
    const failingService = TestBed.inject(CalendarFilterService);

    failingService.toggleEventType('community-day');
    expect(failingService.isEventTypeEnabled('community-day')).toBe(false);

    await Promise.resolve();
    await Promise.resolve();
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to save calendar filter state',
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });
});
