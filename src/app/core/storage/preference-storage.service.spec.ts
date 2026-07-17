import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PreferenceStorageService } from './preference-storage.service';

const preferencesGet = vi.hoisted(() => vi.fn());
const preferencesSet = vi.hoisted(() => vi.fn());
const preferencesRemove = vi.hoisted(() => vi.fn());

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: preferencesGet,
    set: preferencesSet,
    remove: preferencesRemove,
  },
}));

describe('PreferenceStorageService', () => {
  let service: PreferenceStorageService;

  beforeEach(() => {
    preferencesGet.mockReset();
    preferencesSet.mockReset();
    preferencesRemove.mockReset();
    TestBed.configureTestingModule({});
    service = TestBed.inject(PreferenceStorageService);
  });

  it('getItem delegates to Preferences.get and returns its value', async () => {
    preferencesGet.mockResolvedValue({ value: 'stored' });

    const result = await service.getItem('sidebarAccordionState');

    expect(preferencesGet).toHaveBeenCalledWith({ key: 'sidebarAccordionState' });
    expect(result).toBe('stored');
  });

  it('setItem delegates to Preferences.set', async () => {
    preferencesSet.mockResolvedValue(undefined);

    await service.setItem('sidebarAccordionState', 'expanded');

    expect(preferencesSet).toHaveBeenCalledWith({
      key: 'sidebarAccordionState',
      value: 'expanded',
    });
  });

  it('removeItem delegates to Preferences.remove', async () => {
    preferencesRemove.mockResolvedValue(undefined);

    await service.removeItem('sidebarAccordionState');

    expect(preferencesRemove).toHaveBeenCalledWith({ key: 'sidebarAccordionState' });
  });
});
