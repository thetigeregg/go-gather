import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CalendarPage } from './calendar.page';
import { PreferenceStorageService } from '../core/storage/preference-storage.service';

describe('CalendarPage', () => {
  let fixture: ComponentFixture<CalendarPage>;
  let component: CalendarPage;
  let storedValue: string | null;
  let getItemImpl: () => Promise<string | null>;
  let setItemSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    storedValue = null;
    getItemImpl = () => Promise.resolve(storedValue);
    setItemSpy = vi.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: PreferenceStorageService,
          useValue: {
            getItem: () => getItemImpl(),
            setItem: setItemSpy,
          },
        },
      ],
    });
    TestBed.overrideComponent(CalendarPage, {
      set: { template: '<div></div>', styleUrls: [], imports: [] },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(CalendarPage);
    component = fixture.componentInstance;
  });

  it('defaults selectedView to calendar', () => {
    expect(component.selectedView).toBe('calendar');
  });

  it('applies a persisted timeline value on init', async () => {
    storedValue = 'timeline';

    component.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.selectedView).toBe('timeline');
  });

  it('falls back to the default when the stored value is missing', async () => {
    storedValue = null;

    component.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.selectedView).toBe('calendar');
  });

  it('falls back to the default when the stored value is corrupt/unrecognized', async () => {
    storedValue = 'not-a-real-view';

    component.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.selectedView).toBe('calendar');
  });

  it('logs an error when loading the selected view fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getItemImpl = () => Promise.reject(new Error('disk full'));

    component.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to load selected calendar view',
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it('updates selectedView and persists it on a valid view change', () => {
    component.onViewChange('timeline');

    expect(component.selectedView).toBe('timeline');
    expect(setItemSpy).toHaveBeenCalledWith('calendarSelectedView', 'timeline');
  });

  it('ignores an invalid onViewChange value', () => {
    component.onViewChange('bogus');

    expect(component.selectedView).toBe('calendar');
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('logs an error when persisting the selected view fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setItemSpy.mockRejectedValueOnce(new Error('disk full'));

    component.onViewChange('timeline');
    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to save selected calendar view',
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });
});
