import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { SideMenuComponent } from './features/side-menu/side-menu.component';
import { UserDataService } from './core/services/user-data.service';
import { PreferenceStorageService } from './core/storage/preference-storage.service';
import { DEFAULT_SETTINGS } from '@go-gather/shared';

describe('AppComponent', () => {
  it('should create the app', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: UserDataService,
          useValue: {
            getUserSettings: () => ({ ...DEFAULT_SETTINGS }),
            updateUserSettings: () => undefined,
          },
        },
        {
          provide: PreferenceStorageService,
          useValue: { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() },
        },
      ],
    });
    TestBed.overrideComponent(AppComponent, { set: { template: '<div></div>' } });
    TestBed.overrideComponent(SideMenuComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
