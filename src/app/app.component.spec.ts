import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular/standalone';
import { Subject } from 'rxjs';
import { AppComponent } from './app.component';
import { SideMenuComponent } from './features/side-menu/side-menu.component';
import { NavMenuComponent } from './features/nav-menu/nav-menu.component';
import { LiveUpdateService } from './core/services/live-update.service';
import { UserDataService } from './core/services/user-data.service';
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
          provide: LiveUpdateService,
          useValue: {
            markReady: () => Promise.resolve(),
            staged$: new Subject<{ semver: string }>(),
          },
        },
        { provide: AlertController, useValue: { create: () => Promise.resolve() } },
      ],
    });
    TestBed.overrideComponent(AppComponent, { set: { template: '<div></div>' } });
    TestBed.overrideComponent(SideMenuComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(NavMenuComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
